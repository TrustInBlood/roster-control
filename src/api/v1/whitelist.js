const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { AuditLog } = require('../../database/models');

const logger = createServiceLogger('WhitelistAPI');

// Helper to calculate expiration from entry
function calculateExpiration(entry) {
  if (entry.duration_value === null && entry.duration_type === null) {
    return null; // Permanent
  }

  const grantedDate = new Date(entry.granted_at);
  const expiration = new Date(grantedDate);

  if (entry.duration_type === 'days') {
    expiration.setDate(expiration.getDate() + entry.duration_value);
  } else if (entry.duration_type === 'months') {
    expiration.setMonth(expiration.getMonth() + entry.duration_value);
  } else if (entry.duration_type === 'hours') {
    expiration.setTime(grantedDate.getTime() + (entry.duration_value * 60 * 60 * 1000));
  }

  return expiration;
}

// Helper to determine entry status
function getEntryStatus(entry) {
  if (entry.revoked) return 'revoked';

  const expiration = calculateExpiration(entry);
  if (expiration === null) return 'permanent';
  if (expiration > new Date()) return 'active';
  return 'expired';
}

// GET /api/v1/whitelist - List whitelist entries with pagination and filters
router.get('/', requireAuth, requirePermission('VIEW_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');

    const {
      page = 1,
      limit = 25,
      status, // active, expired, revoked, permanent
      source, // role, manual, donation, import
      type, // staff, whitelist
      search, // search by steamid64, username, discord_username
      sortBy = 'granted_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {};

    if (type) {
      where.type = type;
    }

    if (source) {
      where.source = source;
    }

    if (search) {
      where[Op.or] = [
        { steamid64: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { discord_username: { [Op.like]: `%${search}%` } }
      ];
    }

    // Status filtering requires post-processing since it's calculated
    if (status === 'revoked') {
      where.revoked = true;
    } else if (status) {
      where.revoked = false;
      where.approved = true;
    }

    // Validate sort column
    const validSortColumns = ['granted_at', 'steamid64', 'username', 'discord_username', 'source', 'type'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'granted_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Whitelist.findAndCountAll({
      where,
      order: [[safeSortBy, safeSortOrder]],
      limit: parseInt(limit),
      offset,
      include: [{
        model: require('../../database/models').Group,
        as: 'group',
        required: false
      }]
    });

    // Calculate status for each entry and filter if needed
    let entries = rows.map(entry => {
      const entryJson = entry.toJSON();
      const entryStatus = getEntryStatus(entry);
      const expiration = calculateExpiration(entry);

      return {
        ...entryJson,
        status: entryStatus,
        calculatedExpiration: expiration,
        groupName: entry.group?.group_name || null
      };
    });

    // Filter by status if specified (excluding revoked which is filtered in query)
    if (status && status !== 'revoked') {
      entries = entries.filter(e => e.status === status);
    }

    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching whitelist entries', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch whitelist entries' });
  }
});

// GET /api/v1/whitelist/stats - Dashboard statistics
router.get('/stats', requireAuth, requirePermission('VIEW_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');

    const [totalEntries, activeEntries, revokedEntries, sourceBreakdown] = await Promise.all([
      Whitelist.count({ where: { approved: true } }),
      Whitelist.count({ where: { approved: true, revoked: false } }),
      Whitelist.count({ where: { revoked: true } }),
      Whitelist.findAll({
        attributes: [
          'source',
          [require('sequelize').fn('COUNT', '*'), 'count']
        ],
        where: { approved: true, revoked: false },
        group: ['source']
      })
    ]);

    res.json({
      total: totalEntries,
      active: activeEntries,
      revoked: revokedEntries,
      bySource: sourceBreakdown.reduce((acc, row) => {
        acc[row.source || 'unknown'] = parseInt(row.getDataValue('count'));
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Error fetching whitelist stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/v1/whitelist/:steamid64 - Get user whitelist details and history
router.get('/:steamid64', requireAuth, requirePermission('VIEW_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist, PlayerDiscordLink } = require('../../database/models');
    const { steamid64 } = req.params;

    // Get all entries for this user
    const history = await Whitelist.getUserHistory(steamid64);

    if (history.length === 0) {
      return res.status(404).json({ error: 'No whitelist entries found for this Steam ID' });
    }

    // Get current whitelist status using existing method
    const currentStatus = await Whitelist.getActiveWhitelistForUser(steamid64, 'whitelist');

    // Get account link info
    const accountLink = await PlayerDiscordLink.findOne({
      where: { steamid64, is_primary: true }
    });

    // Build response with calculated fields
    const historyWithStatus = history.map(entry => {
      const entryJson = entry.toJSON();
      return {
        ...entryJson,
        status: getEntryStatus(entry),
        calculatedExpiration: calculateExpiration(entry),
        groupName: entry.group?.group_name || null
      };
    });

    // Get the most recent entry for user info
    const latestEntry = history[0];

    res.json({
      user: {
        steamid64,
        eosID: latestEntry.eosID,
        username: latestEntry.username,
        discord_username: latestEntry.discord_username,
        discord_user_id: latestEntry.discord_user_id
      },
      currentStatus: currentStatus?.hasWhitelist ? {
        isActive: true,
        status: currentStatus.status,
        expiration: currentStatus.expiration,
        isPermanent: currentStatus.status === 'Active (permanent)',
        totalDuration: currentStatus.totalDuration
      } : {
        isActive: false,
        status: currentStatus?.status || 'expired'
      },
      accountLink: accountLink ? {
        discord_user_id: accountLink.discord_user_id,
        confidence_score: accountLink.confidence_score,
        link_source: accountLink.link_source,
        is_primary: accountLink.is_primary
      } : null,
      history: historyWithStatus,
      entryCount: history.length
    });
  } catch (error) {
    logger.error('Error fetching whitelist details', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to fetch whitelist details' });
  }
});

// POST /api/v1/whitelist - Grant new whitelist
router.post('/', requireAuth, requirePermission('GRANT_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');

    const {
      steamid64,
      eosID,
      username,
      discord_username,
      discord_user_id,
      reason,
      duration_value,
      duration_type,
      note
    } = req.body;

    // Validate required fields
    if (!steamid64) {
      return res.status(400).json({ error: 'Steam ID is required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    // Validate Steam64 format (17 digits starting with 7656)
    if (!/^7656\d{13}$/.test(steamid64)) {
      return res.status(400).json({ error: 'Invalid Steam64 ID format' });
    }

    // Duration validation (null for permanent)
    if (duration_value !== null && duration_value !== undefined) {
      if (!['days', 'months', 'hours'].includes(duration_type)) {
        return res.status(400).json({ error: 'Invalid duration type. Must be days, months, or hours' });
      }
      if (typeof duration_value !== 'number' || duration_value <= 0) {
        return res.status(400).json({ error: 'Duration value must be a positive number' });
      }
    }

    const granted_by = `${req.user.username} (${req.user.id})`;

    const entry = await Whitelist.grantWhitelist({
      steamid64,
      eosID: eosID || null,
      username: username || null,
      discord_username: discord_username || null,
      reason,
      duration_value: duration_value || null,
      duration_type: duration_type || null,
      granted_by,
      note: note || null,
      metadata: {
        granted_via: 'dashboard',
        discord_user_id: discord_user_id || null
      }
    });

    // Log to audit
    await AuditLog.logAction({
      actionType: 'whitelist_grant',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'player',
      targetId: steamid64,
      targetName: username || steamid64,
      description: `Granted whitelist via dashboard: ${reason}`,
      afterState: { entry_id: entry.id, duration_value, duration_type, reason },
      metadata: { source: 'dashboard' }
    });

    logger.info('Whitelist granted via dashboard', {
      steamid64,
      reason,
      duration: duration_value ? `${duration_value} ${duration_type}` : 'permanent',
      grantedBy: granted_by
    });

    res.status(201).json({
      success: true,
      entry: {
        ...entry.toJSON(),
        status: getEntryStatus(entry),
        calculatedExpiration: calculateExpiration(entry)
      }
    });
  } catch (error) {
    logger.error('Error granting whitelist', { error: error.message });
    res.status(500).json({ error: 'Failed to grant whitelist' });
  }
});

// PUT /api/v1/whitelist/:id/extend - Extend existing whitelist
router.put('/:id/extend', requireAuth, requirePermission('GRANT_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const { id } = req.params;
    const { duration_value, duration_type, note } = req.body;

    // Find the entry to extend
    const existingEntry = await Whitelist.findByPk(id);

    if (!existingEntry) {
      return res.status(404).json({ error: 'Whitelist entry not found' });
    }

    // Validate duration
    if (!duration_value || !duration_type) {
      return res.status(400).json({ error: 'Duration value and type are required' });
    }

    if (!['days', 'months', 'hours'].includes(duration_type)) {
      return res.status(400).json({ error: 'Invalid duration type' });
    }

    const granted_by = `${req.user.username} (${req.user.id})`;

    // Create new stacking entry
    const entry = await Whitelist.grantWhitelist({
      steamid64: existingEntry.steamid64,
      eosID: existingEntry.eosID,
      username: existingEntry.username,
      discord_username: existingEntry.discord_username,
      reason: note ? `extension: ${note}` : 'extension',
      duration_value,
      duration_type,
      granted_by,
      metadata: {
        extended_from: id,
        granted_via: 'dashboard'
      }
    });

    // Log to audit
    await AuditLog.logAction({
      actionType: 'whitelist_extend',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'player',
      targetId: existingEntry.steamid64,
      targetName: existingEntry.username || existingEntry.steamid64,
      description: `Extended whitelist via dashboard: ${duration_value} ${duration_type}`,
      beforeState: { original_entry_id: id },
      afterState: { new_entry_id: entry.id, duration_value, duration_type },
      metadata: { source: 'dashboard' }
    });

    logger.info('Whitelist extended via dashboard', {
      steamid64: existingEntry.steamid64,
      duration: `${duration_value} ${duration_type}`,
      grantedBy: granted_by
    });

    res.json({
      success: true,
      entry: {
        ...entry.toJSON(),
        status: getEntryStatus(entry),
        calculatedExpiration: calculateExpiration(entry)
      }
    });
  } catch (error) {
    logger.error('Error extending whitelist', { error: error.message });
    res.status(500).json({ error: 'Failed to extend whitelist' });
  }
});

// POST /api/v1/whitelist/:steamid64/revoke - Revoke whitelist entries
router.post('/:steamid64/revoke', requireAuth, requirePermission('REVOKE_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const { steamid64 } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required for revocation' });
    }

    const revoked_by = `${req.user.username} (${req.user.id})`;

    // Get entries before revocation for audit
    const entriesBefore = await Whitelist.findAll({
      where: {
        steamid64,
        approved: true,
        revoked: false,
        source: { [Op.ne]: 'role' }
      }
    });

    if (entriesBefore.length === 0) {
      return res.status(404).json({ error: 'No active whitelist entries found to revoke' });
    }

    const revokedCount = await Whitelist.revokeWhitelist(steamid64, reason, revoked_by);

    // Log to audit
    await AuditLog.logAction({
      actionType: 'whitelist_revoke',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'player',
      targetId: steamid64,
      targetName: entriesBefore[0]?.username || steamid64,
      description: `Revoked ${revokedCount} whitelist entries via dashboard: ${reason}`,
      beforeState: { entry_count: entriesBefore.length, entries: entriesBefore.map(e => e.id) },
      afterState: { revoked_count: revokedCount },
      metadata: { source: 'dashboard', reason }
    });

    logger.info('Whitelist revoked via dashboard', {
      steamid64,
      revokedCount,
      reason,
      revokedBy: revoked_by
    });

    res.json({
      success: true,
      revokedCount,
      message: `Successfully revoked ${revokedCount} whitelist entries`
    });
  } catch (error) {
    logger.error('Error revoking whitelist', { error: error.message });
    res.status(500).json({ error: 'Failed to revoke whitelist' });
  }
});

module.exports = router;
