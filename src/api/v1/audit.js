const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { AuditLog } = require('../../database/models');
const { getMemberCacheService } = require('../../services/MemberCacheService');

const logger = createServiceLogger('AuditAPI');

// Helper to check if a string looks like a Discord snowflake ID
function isDiscordId(str) {
  return str && /^\d{17,19}$/.test(str);
}

// In-memory cache for Discord display names (5 minute TTL)
const displayNameCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCachedDisplayName(id) {
  const cached = displayNameCache.get(id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }
  return null;
}

function setCachedDisplayName(id, name) {
  displayNameCache.set(id, { name, timestamp: Date.now() });
}

// Helper to enrich audit entries with current Discord member names
async function enrichEntriesWithDiscordNames(entries) {
  const discordClient = global.discordClient;
  if (!discordClient) return entries.map(e => e.toJSON ? e.toJSON() : { ...e });

  const guildId = process.env.DISCORD_GUILD_ID;
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) return entries.map(e => e.toJSON ? e.toJSON() : { ...e });

  const cacheService = getMemberCacheService();

  // Collect all unique Discord IDs that aren't already cached
  const discordIds = new Set();
  const memberMap = new Map();

  for (const entry of entries) {
    if (isDiscordId(entry.actorId)) {
      const cached = getCachedDisplayName(entry.actorId);
      if (cached) {
        memberMap.set(entry.actorId, cached);
      } else {
        discordIds.add(entry.actorId);
      }
    }
    if (isDiscordId(entry.targetId)) {
      const cached = getCachedDisplayName(entry.targetId);
      if (cached) {
        memberMap.set(entry.targetId, cached);
      } else {
        discordIds.add(entry.targetId);
      }
    }
  }

  // Fetch uncached members in parallel (limit concurrency to avoid rate limits)
  if (discordIds.size > 0) {
    const idsArray = Array.from(discordIds);
    const BATCH_SIZE = 10;

    for (let i = 0; i < idsArray.length; i += BATCH_SIZE) {
      const batch = idsArray.slice(i, i + BATCH_SIZE);
      const fetchPromises = batch.map(async (id) => {
        try {
          const member = await cacheService.getMember(guild, id);
          if (member) {
            const displayName = member.displayName || member.user.username;
            const username = member.user.username;
            const formatted = displayName !== username
              ? `${displayName} (${username})`
              : displayName;
            memberMap.set(id, formatted);
            setCachedDisplayName(id, formatted);
          }
        } catch {
          // Member not found or left guild - skip
        }
      });
      await Promise.all(fetchPromises);
    }
  }

  // Enrich entries with resolved names
  return entries.map(entry => {
    const enriched = entry.toJSON ? entry.toJSON() : { ...entry };

    if (isDiscordId(enriched.actorId) && memberMap.has(enriched.actorId)) {
      enriched.actorDisplayName = memberMap.get(enriched.actorId);
    }

    if (isDiscordId(enriched.targetId) && memberMap.has(enriched.targetId)) {
      enriched.targetDisplayName = memberMap.get(enriched.targetId);
    }

    return enriched;
  });
}

// GET /api/v1/audit - List audit logs with filters and pagination
router.get('/', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      actionType,
      actorId,
      targetId,
      severity,
      success,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100); // Cap at 100

    // Build where clause
    const where = {};

    if (actionType) {
      where.actionType = actionType;
    }

    if (actorId) {
      where.actorId = actorId;
    }

    if (targetId) {
      where.targetId = targetId;
    }

    if (severity) {
      where.severity = severity;
    }

    if (success !== undefined) {
      where.success = success === 'true';
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    if (search) {
      where[Op.or] = [
        { actorName: { [Op.like]: `%${search}%` } },
        { targetName: { [Op.like]: `%${search}%` } },
        { targetId: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Validate sort column
    const validSortColumns = ['createdAt', 'actionType', 'actorName', 'targetName', 'severity'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [[safeSortBy, safeSortOrder]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      attributes: [
        'id', 'actionId', 'actionType', 'actorType', 'actorId', 'actorName',
        'targetType', 'targetId', 'targetName', 'description',
        'success', 'errorMessage', 'severity', 'createdAt'
      ]
    });

    // Enrich entries with current Discord member names
    const enrichedEntries = await enrichEntriesWithDiscordNames(rows);

    res.json({
      entries: enrichedEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/v1/audit/stats - Audit log statistics
router.get('/stats', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const { hours = 168 } = req.query; // Default to 7 days
    const hoursNum = Math.min(parseInt(hours), 720); // Cap at 30 days

    const stats = await AuditLog.getActionStatistics(hoursNum);

    // Get action type breakdown
    const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
    const actionTypes = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        'actionType',
        [require('sequelize').fn('COUNT', require('sequelize').col('actionType')), 'count']
      ],
      group: ['actionType'],
      order: [[require('sequelize').literal('count'), 'DESC']],
      raw: true
    });

    // Get severity breakdown
    const severities = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        'severity',
        [require('sequelize').fn('COUNT', require('sequelize').col('severity')), 'count']
      ],
      group: ['severity'],
      raw: true
    });

    // Get recent activity by hour (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: last24h }
      },
      attributes: ['createdAt'],
      order: [['createdAt', 'ASC']],
      raw: true
    });

    // Group by hour
    const activityByHour = {};
    recentActivity.forEach(log => {
      const hour = new Date(log.createdAt).toISOString().slice(0, 13);
      activityByHour[hour] = (activityByHour[hour] || 0) + 1;
    });

    res.json({
      summary: stats,
      byActionType: actionTypes.reduce((acc, item) => {
        acc[item.actionType] = parseInt(item.count);
        return acc;
      }, {}),
      bySeverity: severities.reduce((acc, item) => {
        acc[item.severity] = parseInt(item.count);
        return acc;
      }, {}),
      activityByHour,
      timeRange: {
        hours: hoursNum,
        since: since.toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching audit stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

// GET /api/v1/audit/action-types - Get list of distinct action types
router.get('/action-types', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const actionTypes = await AuditLog.findAll({
      attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('actionType')), 'actionType']],
      order: [['actionType', 'ASC']],
      raw: true
    });

    res.json({
      actionTypes: actionTypes.map(row => row.actionType).filter(Boolean)
    });
  } catch (error) {
    logger.error('Error fetching action types', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch action types' });
  }
});

// GET /api/v1/audit/actors - Get list of distinct actors
router.get('/actors', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const actors = await AuditLog.findAll({
      attributes: [
        [require('sequelize').fn('DISTINCT', require('sequelize').col('actorId')), 'actorId'],
        'actorName'
      ],
      where: {
        actorId: { [Op.ne]: null }
      },
      order: [['actorName', 'ASC']],
      raw: true
    });

    // Get unique actors (there might be duplicates if same actor has different names over time)
    const actorMap = new Map();
    for (const actor of actors) {
      if (actor.actorId && !actorMap.has(actor.actorId)) {
        actorMap.set(actor.actorId, actor.actorName || actor.actorId);
      }
    }

    // Enrich with current Discord names
    const discordClient = global.discordClient;
    const guildId = process.env.DISCORD_GUILD_ID;
    const enrichedActors = [];

    if (discordClient) {
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
      const cacheService = getMemberCacheService();

      for (const [actorId, actorName] of actorMap) {
        let displayName = actorName;

        // Check cache first
        const cached = getCachedDisplayName(actorId);
        if (cached) {
          displayName = cached;
        } else if (guild && isDiscordId(actorId)) {
          try {
            const member = await cacheService.getMember(guild, actorId);
            if (member) {
              const memberDisplayName = member.displayName || member.user.username;
              const username = member.user.username;
              displayName = memberDisplayName !== username
                ? `${memberDisplayName} (${username})`
                : memberDisplayName;
              setCachedDisplayName(actorId, displayName);
            }
          } catch {
            // Member not found
          }
        }

        enrichedActors.push({
          actorId,
          displayName
        });
      }
    } else {
      for (const [actorId, actorName] of actorMap) {
        enrichedActors.push({
          actorId,
          displayName: actorName
        });
      }
    }

    // Sort by display name
    enrichedActors.sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({ actors: enrichedActors });
  } catch (error) {
    logger.error('Error fetching actors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch actors' });
  }
});

// GET /api/v1/audit/:actionId - Get single audit log with full details
router.get('/:actionId', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const { actionId } = req.params;

    const entry = await AuditLog.findOne({
      where: { actionId }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Audit log entry not found' });
    }

    // Get related actions if any
    const relatedActions = await AuditLog.getRelatedActions(actionId);

    res.json({
      entry,
      relatedActions
    });
  } catch (error) {
    logger.error('Error fetching audit log detail', { error: error.message, actionId: req.params.actionId });
    res.status(500).json({ error: 'Failed to fetch audit log details' });
  }
});

module.exports = router;
