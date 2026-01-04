const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { DutyStatusChange, DutySession, DutyLifetimeStats, DutyActivityEvent, PlayerDiscordLink, Player, PlayerSession } = require('../../database/models');
const { getMemberCacheService } = require('../../services/MemberCacheService');
const { getDutyConfigService } = require('../../services/DutyConfigService');
const { getDutySessionService } = require('../../services/DutySessionService');

const logger = createServiceLogger('DutyAPI');

// Helper function to get date range from period parameter
function getDateRange(period) {
  const now = new Date();
  let startDate = null;
  let endDate = now;

  switch (period) {
  case 'today':
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    break;
  case 'week':
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    break;
  case 'month':
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    break;
  case 'all-time':
  default:
    startDate = null;
    endDate = null;
    break;
  }

  return { startDate, endDate };
}

// Validate period parameter
function isValidPeriod(period) {
  return ['today', 'week', 'month', 'all-time'].includes(period);
}

// Validate duty type parameter
function isValidDutyType(type) {
  return ['admin', 'tutor', 'both'].includes(type);
}

// GET /api/v1/duty/leaderboard - Get duty time leaderboard
router.get('/leaderboard', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const {
      period = 'month',
      type = 'admin',
      limit = 10
    } = req.query;

    // Validate parameters
    if (!isValidPeriod(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: today, week, month, or all-time' });
    }
    if (!isValidDutyType(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be: admin, tutor, or both' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
    const { startDate, endDate } = getDateRange(period);

    // Get guild ID from the authenticated user's session
    const guildId = process.env.DISCORD_GUILD_ID;

    const leaderboard = await DutyStatusChange.getLeaderboard(
      guildId,
      startDate,
      endDate,
      type,
      parsedLimit
    );

    // Fetch Discord member info for avatars and display names
    const discordClient = global.discordClient;
    let memberMap = new Map();

    if (discordClient) {
      try {
        const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const cacheService = getMemberCacheService();
          const userIds = leaderboard.map(e => e.discordUserId);

          // Fetch all members in parallel
          const memberPromises = userIds.map(id =>
            cacheService.getMember(guild, id).catch(() => null)
          );
          const members = await Promise.all(memberPromises);

          members.forEach((member, index) => {
            if (member && member.user) {
              memberMap.set(userIds[index], {
                displayName: member.displayName || member.user.username,
                avatarUrl: member.user.displayAvatarURL({ size: 64 })
              });
            }
          });
        }
      } catch (err) {
        logger.warn('Failed to fetch Discord member info for leaderboard', { error: err.message });
      }
    }

    // Transform to expected format with ranks
    const entries = leaderboard.map((entry, index) => {
      const memberInfo = memberMap.get(entry.discordUserId);
      return {
        rank: index + 1,
        discordUserId: entry.discordUserId,
        discordUsername: entry.discordUsername,
        displayName: memberInfo?.displayName || entry.discordUsername,
        avatarUrl: memberInfo?.avatarUrl || null,
        totalTime: entry.totalMs,
        sessionCount: entry.sessionCount,
        averageSessionTime: entry.averageSessionMs,
        longestSession: entry.longestSessionMs,
        lastActive: entry.sessions?.length > 0 ? entry.sessions[entry.sessions.length - 1].end : null
      };
    });

    res.json({
      success: true,
      data: {
        period,
        dutyType: type,
        entries,
        totalEntries: entries.length
      }
    });
  } catch (error) {
    logger.error('Error getting duty leaderboard', { error: error.message });
    res.status(500).json({ error: 'Failed to get duty leaderboard' });
  }
});

// GET /api/v1/duty/summary - Get guild-wide duty statistics
router.get('/summary', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const {
      period = 'month',
      type = 'admin'
    } = req.query;

    // Validate parameters
    if (!isValidPeriod(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: today, week, month, or all-time' });
    }
    if (!isValidDutyType(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be: admin, tutor, or both' });
    }

    const { startDate, endDate } = getDateRange(period);
    const guildId = process.env.DISCORD_GUILD_ID;

    const stats = await DutyStatusChange.getDutyStats(
      guildId,
      startDate,
      endDate,
      type
    );

    // Get currently on-duty count (users with active sessions)
    const leaderboard = await DutyStatusChange.getLeaderboard(guildId, startDate, endDate, type, 999);
    const currentlyOnDuty = leaderboard.filter(entry =>
      entry.sessions?.some(s => s.isActive)
    ).length;

    // Fetch Discord member info for top performers
    const discordClient = global.discordClient;
    let memberMap = new Map();

    if (discordClient) {
      try {
        const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const cacheService = getMemberCacheService();
          const topUserIds = leaderboard.slice(0, 3).map(e => e.discordUserId);

          const memberPromises = topUserIds.map(id =>
            cacheService.getMember(guild, id).catch(() => null)
          );
          const members = await Promise.all(memberPromises);

          members.forEach((member, index) => {
            if (member && member.user) {
              memberMap.set(topUserIds[index], {
                displayName: member.displayName || member.user.username,
                avatarUrl: member.user.displayAvatarURL({ size: 64 })
              });
            }
          });
        }
      } catch (err) {
        logger.warn('Failed to fetch Discord member info for top performers', { error: err.message });
      }
    }

    // Get top 3 performers with Discord info
    const topPerformers = leaderboard.slice(0, 3).map(entry => {
      const memberInfo = memberMap.get(entry.discordUserId);
      return {
        discordUserId: entry.discordUserId,
        discordUsername: entry.discordUsername,
        displayName: memberInfo?.displayName || entry.discordUsername,
        avatarUrl: memberInfo?.avatarUrl || null,
        totalTime: entry.totalMs
      };
    });

    res.json({
      success: true,
      data: {
        period,
        dutyType: type,
        totalUsers: stats.totalAdmins,
        totalTime: stats.totalMs,
        totalSessions: stats.totalSessions,
        averageTimePerUser: stats.totalAdmins > 0 ? stats.totalMs / stats.totalAdmins : 0,
        averageSessionsPerUser: stats.totalAdmins > 0 ? stats.totalSessions / stats.totalAdmins : 0,
        currentlyOnDuty,
        topPerformers
      }
    });
  } catch (error) {
    logger.error('Error getting duty summary', { error: error.message });
    res.status(500).json({ error: 'Failed to get duty summary' });
  }
});

// GET /api/v1/duty/staff-overview - Get all staff activity including off-duty contributions
router.get('/staff-overview', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const {
      sortBy = 'points',
      period = 'week',
      limit = 50
    } = req.query;

    // Validate sortBy parameter
    const validSortFields = ['points', 'time', 'tickets', 'voice', 'server'];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ error: 'Invalid sortBy. Must be: points, time, tickets, voice, or server' });
    }

    // Validate period parameter
    const validPeriods = ['week', 'month'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: week or month' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const guildId = process.env.DISCORD_GUILD_ID;

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get point config values for dynamic calculation
    const configService = getDutyConfigService();
    const pointsBasePerMinute = await configService.getValue(guildId, 'points_base_per_minute') || 1;
    const pointsVoicePerMinute = await configService.getValue(guildId, 'points_voice_per_minute') || 0.5;
    const pointsTicketResponse = await configService.getValue(guildId, 'points_ticket_response') || 5;

    // Get activity events for the period (new data with timestamps)
    const activityStats = await DutyActivityEvent.getStaffOverviewForPeriod(guildId, startDate, now);

    // Also get duty sessions for the period for duty time
    const { startDate: periodStart, endDate: periodEnd } = getDateRange(period);
    const dutyTimeByUser = new Map();

    // Query duty sessions in range
    const dutySessions = await DutySession.findAll({
      where: {
        guildId,
        sessionStart: {
          [require('sequelize').Op.between]: [periodStart || new Date(0), periodEnd || new Date()]
        }
      },
      raw: true
    });

    for (const session of dutySessions) {
      // With raw: true, Sequelize returns camelCase attribute names, not column names
      const userId = session.discordUserId;
      const current = dutyTimeByUser.get(userId) || { dutyMinutes: 0, sessionCount: 0 };
      current.dutyMinutes += session.durationMinutes || 0;
      current.sessionCount += 1;
      dutyTimeByUser.set(userId, current);
    }

    // Merge activity stats with duty time
    const userStatsMap = new Map();

    // Add activity event data
    for (const activity of activityStats) {
      userStatsMap.set(activity.discordUserId, {
        ...activity,
        totalDutyMinutes: 0,
        totalSessions: 0
      });
    }

    // Add duty session data
    for (const [userId, dutyData] of dutyTimeByUser) {
      if (userStatsMap.has(userId)) {
        const stats = userStatsMap.get(userId);
        stats.totalDutyMinutes = dutyData.dutyMinutes;
        stats.totalSessions = dutyData.sessionCount;
      } else {
        userStatsMap.set(userId, {
          discordUserId: userId,
          totalVoiceMinutes: 0,
          onDutyVoiceMinutes: 0,
          offDutyVoiceMinutes: 0,
          totalTicketResponses: 0,
          onDutyTicketResponses: 0,
          offDutyTicketResponses: 0,
          totalDutyMinutes: dutyData.dutyMinutes,
          totalSessions: dutyData.sessionCount
        });
      }
    }

    // Fetch ALL staff with linked Steam accounts and their server time
    // This ensures staff appear even if they only have server time (no duty/activity)
    const steamIdMap = new Map();
    const serverTimeMap = new Map();
    try {
      const { Op, fn, col } = require('sequelize');

      // Get all staff Discord links
      const allLinks = await PlayerDiscordLink.findAll({
        where: { is_primary: true },
        raw: true
      });

      // Build steamId -> discordUserId mapping
      const steamToDiscord = new Map();
      for (const link of allLinks) {
        steamIdMap.set(link.discord_user_id, link.steamid64);
        steamToDiscord.set(link.steamid64, link.discord_user_id);
      }

      const allSteamIds = Array.from(steamIdMap.values()).filter(Boolean);

      if (allSteamIds.length > 0) {
        // Get player IDs for these Steam IDs
        const players = await Player.findAll({
          where: { steamId: allSteamIds },
          attributes: ['id', 'steamId'],
          raw: true
        });

        const playerIdToSteamId = new Map();
        const playerIds = [];
        for (const player of players) {
          playerIdToSteamId.set(player.id, player.steamId);
          playerIds.push(player.id);
        }

        if (playerIds.length > 0) {
          // Sum player session time for the period
          const sessionSums = await PlayerSession.findAll({
            where: {
              player_id: playerIds,
              sessionStart: {
                [Op.between]: [periodStart || new Date(0), periodEnd || new Date()]
              }
            },
            attributes: [
              'player_id',
              [fn('SUM', col('durationMinutes')), 'totalMinutes']
            ],
            group: ['player_id'],
            raw: true
          });

          // Build steamId -> serverMinutes map and add staff to userStatsMap
          for (const row of sessionSums) {
            const steamId = playerIdToSteamId.get(row.player_id);
            if (steamId) {
              const minutes = parseInt(row.totalMinutes) || 0;
              const discordUserId = steamToDiscord.get(steamId);

              if (discordUserId && minutes > 0) {
                serverTimeMap.set(discordUserId, minutes);

                // Add to userStatsMap if not already there (staff with only server time)
                if (!userStatsMap.has(discordUserId)) {
                  userStatsMap.set(discordUserId, {
                    discordUserId,
                    totalVoiceMinutes: 0,
                    onDutyVoiceMinutes: 0,
                    offDutyVoiceMinutes: 0,
                    totalTicketResponses: 0,
                    onDutyTicketResponses: 0,
                    offDutyTicketResponses: 0,
                    totalDutyMinutes: 0,
                    totalSessions: 0
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch server time for staff overview', { error: err.message });
    }

    // Calculate dynamic points and convert to array
    let entries = Array.from(userStatsMap.values()).map(stats => {
      // Calculate points dynamically from config
      const dutyPoints = Math.floor(stats.totalDutyMinutes * pointsBasePerMinute);
      const voicePoints = Math.floor(stats.totalVoiceMinutes * pointsVoicePerMinute);
      const ticketPoints = Math.floor(stats.totalTicketResponses * pointsTicketResponse);
      const totalPoints = dutyPoints + voicePoints + ticketPoints;

      // Calculate on-duty points
      const onDutyVoicePoints = Math.floor(stats.onDutyVoiceMinutes * pointsVoicePerMinute);
      const onDutyTicketPoints = Math.floor(stats.onDutyTicketResponses * pointsTicketResponse);
      const onDutyPoints = dutyPoints + onDutyVoicePoints + onDutyTicketPoints;

      // Off-duty points
      const offDutyVoicePoints = Math.floor(stats.offDutyVoiceMinutes * pointsVoicePerMinute);
      const offDutyTicketPoints = Math.floor(stats.offDutyTicketResponses * pointsTicketResponse);
      const offDutyPoints = offDutyVoicePoints + offDutyTicketPoints;

      return {
        discordUserId: stats.discordUserId,
        totalDutyMinutes: stats.totalDutyMinutes,
        totalSessions: stats.totalSessions,
        totalServerMinutes: serverTimeMap.get(stats.discordUserId) || 0,
        totalVoiceMinutes: stats.totalVoiceMinutes,
        onDutyVoiceMinutes: stats.onDutyVoiceMinutes,
        offDutyVoiceMinutes: stats.offDutyVoiceMinutes,
        totalTicketResponses: stats.totalTicketResponses,
        onDutyTicketResponses: stats.onDutyTicketResponses,
        offDutyTicketResponses: stats.offDutyTicketResponses,
        totalPoints,
        onDutyPoints,
        offDutyPoints
      };
    });

    // Sort by requested field
    const sortFunctions = {
      'points': (a, b) => b.totalPoints - a.totalPoints,
      'time': (a, b) => b.totalDutyMinutes - a.totalDutyMinutes,
      'tickets': (a, b) => b.totalTicketResponses - a.totalTicketResponses,
      'voice': (a, b) => b.totalVoiceMinutes - a.totalVoiceMinutes,
      'server': (a, b) => b.totalServerMinutes - a.totalServerMinutes
    };
    entries.sort(sortFunctions[sortBy]);
    entries = entries.slice(0, parsedLimit);

    // Add ranks
    entries = entries.map((entry, index) => ({
      rank: index + 1,
      ...entry
    }));

    // Fetch Discord member info for display names and avatars
    const discordClient = global.discordClient;
    let memberMap = new Map();

    if (discordClient) {
      try {
        const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const cacheService = getMemberCacheService();
          const userIds = entries.map(e => e.discordUserId);

          const memberPromises = userIds.map(id =>
            cacheService.getMember(guild, id).catch(() => null)
          );
          const members = await Promise.all(memberPromises);

          members.forEach((member, index) => {
            if (member && member.user) {
              memberMap.set(userIds[index], {
                displayName: member.displayName || member.user.username,
                avatarUrl: member.user.displayAvatarURL({ size: 64 })
              });
            }
          });
        }
      } catch (err) {
        logger.warn('Failed to fetch Discord member info for staff overview', { error: err.message });
      }
    }

    // Add display names, avatars, and Steam IDs
    entries = entries.map(entry => {
      const memberInfo = memberMap.get(entry.discordUserId);
      return {
        ...entry,
        displayName: memberInfo?.displayName || entry.discordUserId,
        avatarUrl: memberInfo?.avatarUrl || null,
        steamId: steamIdMap.get(entry.discordUserId) || null
      };
    });

    // Get currently on duty count
    const activeSessions = await DutySession.getActiveSessions(guildId);
    const currentlyOnDuty = activeSessions.length;

    res.json({
      success: true,
      data: {
        entries,
        totalEntries: entries.length,
        sortBy,
        period,
        currentlyOnDuty
      }
    });
  } catch (error) {
    logger.error('Error getting staff overview', { error: error.message });
    res.status(500).json({ error: 'Failed to get staff overview' });
  }
});

// GET /api/v1/duty/user/:discordId - Get individual user duty stats
router.get('/user/:discordId', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const { discordId } = req.params;
    const {
      period = 'month',
      type = 'admin'
    } = req.query;

    // Validate Discord ID format (snowflake)
    if (!/^\d{17,19}$/.test(discordId)) {
      return res.status(400).json({ error: 'Invalid Discord ID format' });
    }

    // Validate parameters
    if (!isValidPeriod(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: today, week, month, or all-time' });
    }
    if (!isValidDutyType(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be: admin, tutor, or both' });
    }

    const { startDate, endDate } = getDateRange(period);

    const stats = await DutyStatusChange.calculateDutyTime(
      discordId,
      startDate,
      endDate,
      type
    );

    // Get the user's display name from most recent duty change
    const latestChange = await DutyStatusChange.findOne({
      where: { discordUserId: discordId },
      order: [['createdAt', 'DESC']]
    });

    // Determine if currently on duty
    const currentlyOnDuty = stats.sessions?.some(s => s.isActive) || false;
    const currentSession = stats.sessions?.find(s => s.isActive);

    res.json({
      success: true,
      data: {
        discordUserId: discordId,
        discordUsername: latestChange?.discordUsername || 'Unknown',
        totalTime: stats.totalMs,
        sessionCount: stats.sessionCount,
        averageSessionTime: stats.averageSessionMs,
        longestSession: stats.longestSessionMs,
        lastActive: stats.sessions?.length > 0
          ? stats.sessions[stats.sessions.length - 1].end || stats.sessions[stats.sessions.length - 1].start
          : null,
        currentlyOnDuty,
        currentSessionStart: currentSession?.start || null,
        recentSessions: stats.sessions?.slice(-5).reverse().map(s => ({
          id: s.startId,
          startTime: s.start,
          endTime: s.end,
          duration: s.duration,
          source: 'command',
          dutyType: type === 'both' ? 'admin' : type
        })) || []
      }
    });
  } catch (error) {
    logger.error('Error getting user duty stats', { error: error.message, discordId: req.params.discordId });
    res.status(500).json({ error: 'Failed to get user duty stats' });
  }
});

// ============================================
// Settings Endpoints (Transparency)
// ============================================

// GET /api/v1/duty/settings - Get duty tracking settings (all staff can view)
router.get('/settings', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const configService = getDutyConfigService();

    const { config, categories } = await configService.getConfigForApi(guildId);

    res.json({
      success: true,
      data: {
        config,
        categories
      }
    });
  } catch (error) {
    logger.error('Error getting duty settings', { error: error.message });
    res.status(500).json({ error: 'Failed to get duty settings' });
  }
});

// PUT /api/v1/duty/settings - Update duty tracking settings (super admin only)
router.put('/settings', requireAuth, requirePermission('MANAGE_DUTY_SETTINGS'), async (req, res) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const configService = getDutyConfigService();
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid updates object' });
    }

    const changedBy = req.user.id;
    const changedByName = req.user.username;

    const results = await configService.updateMultiple(guildId, updates, changedBy, changedByName);

    res.json({
      success: true,
      data: {
        results,
        updatedCount: results.filter(r => r.success).length
      }
    });
  } catch (error) {
    logger.error('Error updating duty settings', { error: error.message });
    res.status(500).json({ error: 'Failed to update duty settings' });
  }
});

// GET /api/v1/duty/settings/audit - Get settings change history
router.get('/settings/audit', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const configService = getDutyConfigService();

    const auditLog = await configService.getAuditLog(guildId, limit);

    res.json({
      success: true,
      data: auditLog.map(entry => ({
        id: entry.id,
        configKey: entry.configKey,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        changedBy: entry.changedBy,
        changedByName: entry.changedByName,
        changeType: entry.changeType,
        createdAt: entry.createdAt
      }))
    });
  } catch (error) {
    logger.error('Error getting settings audit log', { error: error.message });
    res.status(500).json({ error: 'Failed to get settings audit log' });
  }
});

// ============================================
// Sessions Endpoints
// ============================================

// GET /api/v1/duty/sessions - Get active/recent sessions
router.get('/sessions', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const { status = 'all', type, limit = 50 } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

    let sessions;
    if (status === 'active') {
      sessions = await DutySession.getActiveSessions(guildId, type);
    } else {
      // Get recent sessions
      const where = { guildId };
      if (type && type !== 'both') {
        where.dutyType = type;
      }

      sessions = await DutySession.findAll({
        where,
        order: [['sessionStart', 'DESC']],
        limit: parsedLimit
      });
    }

    // Fetch Discord member info
    const discordClient = global.discordClient;
    let memberMap = new Map();

    if (discordClient) {
      try {
        const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          const cacheService = getMemberCacheService();
          const userIds = [...new Set(sessions.map(s => s.discordUserId))];

          const memberPromises = userIds.map(id =>
            cacheService.getMember(guild, id).catch(() => null)
          );
          const members = await Promise.all(memberPromises);

          members.forEach((member, index) => {
            if (member && member.user) {
              memberMap.set(userIds[index], {
                displayName: member.displayName || member.user.username,
                avatarUrl: member.user.displayAvatarURL({ size: 64 })
              });
            }
          });
        }
      } catch (err) {
        logger.warn('Failed to fetch Discord member info for sessions', { error: err.message });
      }
    }

    res.json({
      success: true,
      data: sessions.map(session => {
        const memberInfo = memberMap.get(session.discordUserId);
        return {
          id: session.id,
          discordUserId: session.discordUserId,
          discordUsername: session.discordUsername,
          displayName: memberInfo?.displayName || session.discordUsername,
          avatarUrl: memberInfo?.avatarUrl || null,
          dutyType: session.dutyType,
          sessionStart: session.sessionStart,
          sessionEnd: session.sessionEnd,
          durationMinutes: session.isActive ? session.getDurationMinutes() : session.durationMinutes,
          isActive: session.isActive,
          endReason: session.endReason,
          totalPoints: session.totalPoints,
          voiceMinutes: session.voiceMinutes,
          ticketResponses: session.ticketResponses
        };
      })
    });
  } catch (error) {
    logger.error('Error getting duty sessions', { error: error.message });
    res.status(500).json({ error: 'Failed to get duty sessions' });
  }
});

// GET /api/v1/duty/sessions/:id - Get session details
router.get('/sessions/:id', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const { id } = req.params;
    const session = await DutySession.findByPk(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        discordUserId: session.discordUserId,
        discordUsername: session.discordUsername,
        dutyType: session.dutyType,
        guildId: session.guildId,
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
        durationMinutes: session.isActive ? session.getDurationMinutes() : session.durationMinutes,
        isActive: session.isActive,
        endReason: session.endReason,
        basePoints: session.basePoints,
        bonusPoints: session.bonusPoints,
        totalPoints: session.totalPoints,
        voiceMinutes: session.voiceMinutes,
        ticketResponses: session.ticketResponses,
        adminCamEvents: session.adminCamEvents,
        ingameChatMessages: session.ingameChatMessages,
        warningSentAt: session.warningSentAt,
        timeoutExtendedAt: session.timeoutExtendedAt,
        metadata: session.metadata,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
  } catch (error) {
    logger.error('Error getting session details', { error: error.message, sessionId: req.params.id });
    res.status(500).json({ error: 'Failed to get session details' });
  }
});

// POST /api/v1/duty/sessions/:id/extend - Extend session timeout
router.post('/sessions/:id/extend', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const { id } = req.params;
    const sessionService = getDutySessionService();

    if (!sessionService) {
      return res.status(503).json({ error: 'Session service not available' });
    }

    const result = await sessionService.extendSession(parseInt(id));

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Session timeout extended'
    });
  } catch (error) {
    logger.error('Error extending session', { error: error.message, sessionId: req.params.id });
    res.status(500).json({ error: 'Failed to extend session' });
  }
});

module.exports = router;
