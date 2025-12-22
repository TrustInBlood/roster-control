const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { DutyStatusChange } = require('../../database/models');

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

    // Transform to expected format with ranks
    const entries = leaderboard.map((entry, index) => ({
      rank: index + 1,
      discordUserId: entry.discordUserId,
      discordUsername: entry.discordUsername,
      totalTime: entry.totalMs,
      sessionCount: entry.sessionCount,
      averageSessionTime: entry.averageSessionMs,
      longestSession: entry.longestSessionMs,
      lastActive: entry.sessions?.length > 0 ? entry.sessions[entry.sessions.length - 1].end : null
    }));

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

    // Get top 3 performers
    const topPerformers = leaderboard.slice(0, 3).map(entry => ({
      discordUserId: entry.discordUserId,
      discordUsername: entry.discordUsername,
      totalTime: entry.totalMs
    }));

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

module.exports = router;
