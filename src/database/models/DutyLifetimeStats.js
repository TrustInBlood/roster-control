'use strict';

const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * DutyLifetimeStats Model
 *
 * Tracks cumulative activity stats for each user, independent of sessions.
 * Activities are credited even when users are not on duty.
 */
const DutyLifetimeStats = sequelize.define('DutyLifetimeStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  discordUserId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'discord_user_id'
  },
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'guild_id'
  },

  // Cumulative time stats (in minutes)
  totalDutyMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_duty_minutes'
  },
  totalVoiceMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_voice_minutes'
  },

  // Cumulative activity counts
  totalTicketResponses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_ticket_responses'
  },
  totalAdminCamEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_admin_cam_events'
  },
  totalIngameChatMessages: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_ingame_chat_messages'
  },

  // Cumulative points
  totalPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_points'
  },

  // Session counts
  totalSessions: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_sessions'
  },

  // Off-duty contributions
  offDutyTicketResponses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'off_duty_ticket_responses'
  },
  offDutyVoiceMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'off_duty_voice_minutes'
  },
  offDutyPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'off_duty_points'
  }
}, {
  tableName: 'duty_lifetime_stats',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// ============================================
// Static Methods
// ============================================

/**
 * Get or create lifetime stats for a user
 */
DutyLifetimeStats.getOrCreate = async function(discordUserId, guildId) {
  const [stats, created] = await DutyLifetimeStats.findOrCreate({
    where: { discordUserId, guildId },
    defaults: { discordUserId, guildId }
  });

  return { stats, created };
};

/**
 * Get lifetime stats for a user
 */
DutyLifetimeStats.getStats = async function(discordUserId, guildId) {
  return DutyLifetimeStats.findOne({
    where: { discordUserId, guildId }
  });
};

/**
 * Add session stats to lifetime totals (called when session ends)
 */
DutyLifetimeStats.addSessionStats = async function(discordUserId, guildId, sessionData) {
  const { stats } = await DutyLifetimeStats.getOrCreate(discordUserId, guildId);

  await stats.increment({
    totalDutyMinutes: sessionData.durationMinutes || 0,
    totalVoiceMinutes: sessionData.voiceMinutes || 0,
    totalTicketResponses: sessionData.ticketResponses || 0,
    totalAdminCamEvents: sessionData.adminCamEvents || 0,
    totalIngameChatMessages: sessionData.ingameChatMessages || 0,
    totalPoints: sessionData.totalPoints || 0,
    totalSessions: 1
  });

  return stats.reload();
};

/**
 * Add off-duty activity (credited without a session)
 */
DutyLifetimeStats.addOffDutyActivity = async function(discordUserId, guildId, activityType, points = 0) {
  const { stats } = await DutyLifetimeStats.getOrCreate(discordUserId, guildId);

  const increments = {
    totalPoints: points,
    offDutyPoints: points
  };

  // Add to specific off-duty counters
  switch (activityType) {
  case 'ticket_response':
    increments.totalTicketResponses = 1;
    increments.offDutyTicketResponses = 1;
    break;
  case 'voice_minutes':
    // For voice, points represents minutes
    increments.totalVoiceMinutes = points;
    increments.offDutyVoiceMinutes = points;
    break;
  }

  await stats.increment(increments);
  return stats.reload();
};

/**
 * Add off-duty voice minutes
 */
DutyLifetimeStats.addOffDutyVoiceMinutes = async function(discordUserId, guildId, minutes, points = 0) {
  const { stats } = await DutyLifetimeStats.getOrCreate(discordUserId, guildId);

  await stats.increment({
    totalVoiceMinutes: minutes,
    offDutyVoiceMinutes: minutes,
    totalPoints: points,
    offDutyPoints: points
  });

  return stats.reload();
};

/**
 * Add off-duty ticket response
 */
DutyLifetimeStats.addOffDutyTicketResponse = async function(discordUserId, guildId, points = 0) {
  const { stats } = await DutyLifetimeStats.getOrCreate(discordUserId, guildId);

  await stats.increment({
    totalTicketResponses: 1,
    offDutyTicketResponses: 1,
    totalPoints: points,
    offDutyPoints: points
  });

  return stats.reload();
};

/**
 * Get lifetime leaderboard
 */
DutyLifetimeStats.getLeaderboard = async function(guildId, sortBy = 'points', limit = 10) {
  const orderField = sortBy === 'time' ? 'total_duty_minutes' : 'total_points';

  return DutyLifetimeStats.findAll({
    where: { guildId },
    order: [[orderField, 'DESC']],
    limit
  });
};

/**
 * Get user rank in leaderboard
 */
DutyLifetimeStats.getUserRank = async function(discordUserId, guildId, sortBy = 'points') {
  const orderField = sortBy === 'time' ? 'totalDutyMinutes' : 'totalPoints';
  const stats = await DutyLifetimeStats.getStats(discordUserId, guildId);

  if (!stats) return null;

  const rank = await DutyLifetimeStats.count({
    where: {
      guildId,
      [orderField]: { [Op.gt]: stats[orderField] }
    }
  });

  return rank + 1;
};

module.exports = DutyLifetimeStats;
