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

// Helper to normalize status from model to consistent lowercase format
function normalizeStatus(status) {
  if (!status) return 'expired';
  const lower = status.toLowerCase();
  if (lower.includes('permanent')) return 'permanent';
  if (lower.includes('active')) return 'active';
  if (lower.includes('expired')) return 'expired';
  if (lower.includes('revoked')) return 'revoked';
  if (lower.includes('no whitelist')) return 'expired';
  return lower;
}

// GET /api/v1/whitelist - List whitelisted players (grouped by Steam ID)
router.get('/', requireAuth, requirePermission('VIEW_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const sequelize = require('sequelize');

    const {
      page = 1,
      limit = 25,
      status, // active, expired, revoked, permanent
      source, // role, manual, donation, import
      search, // search by steamid64, username, discord_username
      sortBy = 'granted_at',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Build base where clause for filtering
    const baseWhere = { approved: true };

    if (source) {
      baseWhere.source = source;
    }

    if (search) {
      baseWhere[Op.or] = [
        { steamid64: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { discord_username: { [Op.like]: `%${search}%` } }
      ];
    }

    // Get all unique Steam IDs first, then fetch their data
    // This approach ensures accurate pagination by player
    const allEntries = await Whitelist.findAll({
      where: baseWhere,
      order: [['steamid64', 'ASC'], ['granted_at', 'DESC']],
      include: [{
        model: require('../../database/models').Group,
        as: 'group',
        required: false
      }]
    });

    // Group entries by steamid64 and calculate player status
    const playerMap = new Map();

    for (const entry of allEntries) {
      const steamid64 = entry.steamid64;

      if (!playerMap.has(steamid64)) {
        playerMap.set(steamid64, {
          entries: [],
          latestEntry: null
        });
      }

      const playerData = playerMap.get(steamid64);
      playerData.entries.push(entry);

      // Track latest entry for display info
      if (!playerData.latestEntry || new Date(entry.granted_at) > new Date(playerData.latestEntry.granted_at)) {
        playerData.latestEntry = entry;
      }
    }

    // Calculate status for each player
    let players = [];

    for (const [steamid64, playerData] of playerMap) {
      const { entries, latestEntry } = playerData;

      // Check if player has any non-revoked entries
      const activeEntries = entries.filter(e => !e.revoked);
      const allRevoked = activeEntries.length === 0;

      let playerStatus;
      let expiration = null;

      if (allRevoked) {
        playerStatus = 'revoked';
      } else {
        // Check for permanent
        const hasPermanent = activeEntries.some(e =>
          e.duration_value === null && e.duration_type === null
        );

        if (hasPermanent) {
          playerStatus = 'permanent';
        } else {
          // Calculate stacked expiration
          const now = new Date();
          const validEntries = activeEntries.filter(e => {
            if (e.duration_value === 0) return false;
            const exp = calculateExpiration(e);
            return exp && exp > now;
          });

          if (validEntries.length === 0) {
            playerStatus = 'expired';
            // Find most recent expiration for display
            for (const e of activeEntries) {
              const exp = calculateExpiration(e);
              if (exp && (!expiration || exp > expiration)) {
                expiration = exp;
              }
            }
          } else {
            playerStatus = 'active';
            // Calculate stacked expiration
            const earliest = validEntries.sort((a, b) =>
              new Date(a.granted_at) - new Date(b.granted_at)
            )[0];
            let stackedExp = new Date(earliest.granted_at);

            let totalMonths = 0, totalDays = 0, totalHours = 0;
            for (const e of validEntries) {
              if (e.duration_type === 'months') totalMonths += e.duration_value;
              else if (e.duration_type === 'days') totalDays += e.duration_value;
              else if (e.duration_type === 'hours') totalHours += e.duration_value;
            }

            if (totalMonths > 0) stackedExp.setMonth(stackedExp.getMonth() + totalMonths);
            if (totalDays > 0) stackedExp.setDate(stackedExp.getDate() + totalDays);
            if (totalHours > 0) stackedExp.setTime(stackedExp.getTime() + (totalHours * 60 * 60 * 1000));

            expiration = stackedExp;
          }
        }
      }

      // Determine primary source (prefer non-revoked entries)
      const primaryEntry = activeEntries.length > 0 ? activeEntries[0] : entries[0];

      players.push({
        steamid64,
        username: latestEntry.username,
        discord_username: latestEntry.discord_username,
        discord_user_id: latestEntry.discord_user_id,
        eosID: latestEntry.eosID,
        status: playerStatus,
        expiration: expiration ? expiration.toISOString() : null,
        source: primaryEntry.source,
        entryCount: entries.length,
        latestGrantedAt: latestEntry.granted_at,
        groupName: latestEntry.group?.group_name || null
      });
    }

    // Filter by status if specified
    if (status) {
      players = players.filter(p => p.status === status);
    }

    // Sort players
    const validSortColumns = ['latestGrantedAt', 'steamid64', 'username', 'discord_username', 'source', 'status'];
    const sortField = sortBy === 'granted_at' ? 'latestGrantedAt' : sortBy;
    const safeSortBy = validSortColumns.includes(sortField) ? sortField : 'latestGrantedAt';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;

    players.sort((a, b) => {
      const aVal = a[safeSortBy];
      const bVal = b[safeSortBy];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (aVal < bVal) return -1 * safeSortOrder;
      if (aVal > bVal) return 1 * safeSortOrder;
      return 0;
    });

    // Paginate
    const total = players.length;
    const totalPages = Math.ceil(total / limitNum);
    const offset = (pageNum - 1) * limitNum;
    const paginatedPlayers = players.slice(offset, offset + limitNum);

    res.json({
      entries: paginatedPlayers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('Error fetching whitelist players', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch whitelist players' });
  }
});

// GET /api/v1/whitelist/stats - Dashboard statistics
router.get('/stats', requireAuth, requirePermission('VIEW_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const sequelize = require('sequelize');

    // Count unique players instead of entries
    const [totalPlayers, activePlayers, revokedPlayers, sourceBreakdown] = await Promise.all([
      // Total unique players who have ever had a whitelist
      Whitelist.count({
        where: { approved: true },
        distinct: true,
        col: 'steamid64'
      }),
      // Unique players with active (non-revoked) whitelist entries
      Whitelist.count({
        where: { approved: true, revoked: false },
        distinct: true,
        col: 'steamid64'
      }),
      // Unique players who only have revoked entries (no active ones)
      Whitelist.count({
        where: {
          steamid64: {
            [Op.notIn]: sequelize.literal(
              '(SELECT DISTINCT steamid64 FROM whitelists WHERE approved = 1 AND revoked = 0)'
            )
          },
          approved: true,
          revoked: true
        },
        distinct: true,
        col: 'steamid64'
      }),
      // Source breakdown by unique players
      Whitelist.findAll({
        attributes: [
          'source',
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('steamid64'))), 'count']
        ],
        where: { approved: true, revoked: false },
        group: ['source']
      })
    ]);

    res.json({
      total: totalPlayers,
      active: activePlayers,
      revoked: revokedPlayers,
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
        status: normalizeStatus(currentStatus.status),
        expiration: currentStatus.expiration,
        isPermanent: currentStatus.status === 'Active (permanent)',
        totalDuration: currentStatus.totalDuration
      } : {
        isActive: false,
        status: normalizeStatus(currentStatus?.status),
        expiration: currentStatus?.expiration || null,
        isPermanent: false
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

// POST /api/v1/whitelist/entry/:id/revoke - Revoke a single whitelist entry
router.post('/entry/:id/revoke', requireAuth, requirePermission('REVOKE_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const { id } = req.params;
    const { reason } = req.body;

    const entry = await Whitelist.findByPk(id);

    if (!entry) {
      return res.status(404).json({ error: 'Whitelist entry not found' });
    }

    // Don't allow revoking role-based entries
    if (entry.source === 'role') {
      return res.status(400).json({ error: 'Cannot revoke role-based whitelist entries' });
    }

    // Don't allow revoking already revoked entries
    if (entry.revoked) {
      return res.status(400).json({ error: 'Entry is already revoked' });
    }

    const revoked_by = `${req.user.username} (${req.user.id})`;

    // Store entry data for audit before update
    const beforeState = entry.toJSON();

    // Revoke the entry
    await entry.update({
      revoked: true,
      revoked_at: new Date(),
      revoked_by: revoked_by,
      revoked_reason: reason || null
    });

    // Log to audit
    await AuditLog.logAction({
      actionType: 'whitelist_revoke',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'player',
      targetId: entry.steamid64,
      targetName: entry.username || entry.steamid64,
      description: `Revoked whitelist entry via dashboard${reason ? `: ${reason}` : ''}`,
      beforeState: beforeState,
      afterState: entry.toJSON(),
      metadata: { source: 'dashboard', reason: reason || null }
    });

    logger.info('Whitelist entry revoked via dashboard', {
      entryId: id,
      steamid64: entry.steamid64,
      revokedBy: revoked_by
    });

    res.json({
      success: true,
      message: 'Whitelist entry revoked successfully',
      entry: entry.toJSON()
    });
  } catch (error) {
    logger.error('Error revoking whitelist entry', { error: error.message });
    res.status(500).json({ error: 'Failed to revoke whitelist entry' });
  }
});

// PUT /api/v1/whitelist/entry/:id - Edit a whitelist entry
router.put('/entry/:id', requireAuth, requirePermission('GRANT_WHITELIST'), async (req, res) => {
  try {
    const { Whitelist } = require('../../database/models');
    const { id } = req.params;
    const { reason, duration_value, duration_type, note } = req.body;

    const entry = await Whitelist.findByPk(id);

    if (!entry) {
      return res.status(404).json({ error: 'Whitelist entry not found' });
    }

    // Don't allow editing role-based entries
    if (entry.source === 'role') {
      return res.status(400).json({ error: 'Cannot edit role-based whitelist entries' });
    }

    // Validate duration if provided
    if (duration_value !== undefined && duration_value !== null) {
      if (!['days', 'months', 'hours'].includes(duration_type)) {
        return res.status(400).json({ error: 'Invalid duration type. Must be days, months, or hours' });
      }
      if (typeof duration_value !== 'number' || duration_value < 0) {
        return res.status(400).json({ error: 'Duration value must be a non-negative number' });
      }
    }

    const edited_by = `${req.user.username} (${req.user.id})`;
    const beforeState = entry.toJSON();

    // Build update object
    const updates = {};
    if (reason !== undefined) updates.reason = reason;
    if (duration_value !== undefined) {
      updates.duration_value = duration_value === 0 ? null : duration_value;
      updates.duration_type = duration_value === 0 ? null : duration_type;
    }
    if (note !== undefined) {
      // Append note to metadata
      const metadata = entry.metadata || {};
      metadata.edit_note = note;
      metadata.edited_by = edited_by;
      metadata.edited_at = new Date().toISOString();
      updates.metadata = metadata;
    }

    await entry.update(updates);
    await entry.reload();

    // Log to audit
    await AuditLog.logAction({
      actionType: 'whitelist_edit',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'player',
      targetId: entry.steamid64,
      targetName: entry.username || entry.steamid64,
      description: `Edited whitelist entry via dashboard`,
      beforeState,
      afterState: entry.toJSON(),
      metadata: { source: 'dashboard', note: note || null }
    });

    logger.info('Whitelist entry edited via dashboard', {
      entryId: id,
      steamid64: entry.steamid64,
      editedBy: edited_by
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
    logger.error('Error editing whitelist entry', { error: error.message });
    res.status(500).json({ error: 'Failed to edit whitelist entry' });
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
