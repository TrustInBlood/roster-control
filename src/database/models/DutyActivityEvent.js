'use strict';

const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * DutyActivityEvent Model
 *
 * Records individual activity events with timestamps for both on-duty and off-duty activity.
 * Used for period-based filtering (week/month) of staff activity.
 */
const DutyActivityEvent = sequelize.define('DutyActivityEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'session_id',
    comment: 'Reference to duty session (NULL for off-duty events)'
  },
  discordUserId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'discord_user_id'
  },
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'guild_id',
    comment: 'Discord guild ID (required for off-duty events)'
  },
  isOnDuty: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_on_duty'
  },
  eventType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'event_type',
    comment: 'Type: voice_session, ticket_response, admin_cam, ingame_chat'
  },
  eventTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'event_timestamp'
  },
  channelId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'channel_id'
  },
  serverId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'server_id'
  },
  pointsAwarded: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'points_awarded'
  },
  durationMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_minutes',
    comment: 'Duration for voice sessions'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'duty_activity_events',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false // No updatedAt for event log
});

// ============================================
// Static Methods
// ============================================

/**
 * Record an activity event
 */
DutyActivityEvent.recordEvent = async function(data) {
  const {
    sessionId = null,
    discordUserId,
    guildId,
    isOnDuty = true,
    eventType,
    channelId = null,
    serverId = null,
    pointsAwarded = 0,
    durationMinutes = null,
    metadata = null
  } = data;

  return DutyActivityEvent.create({
    sessionId,
    discordUserId,
    guildId,
    isOnDuty,
    eventType,
    eventTimestamp: new Date(),
    channelId,
    serverId,
    pointsAwarded,
    durationMinutes,
    metadata
  });
};

/**
 * Record a voice session event
 */
DutyActivityEvent.recordVoiceSession = async function(discordUserId, guildId, sessionId, durationMinutes, channelId, isOnDuty) {
  return DutyActivityEvent.recordEvent({
    sessionId: isOnDuty ? sessionId : null,
    discordUserId,
    guildId,
    isOnDuty,
    eventType: 'voice_session',
    channelId,
    durationMinutes,
    metadata: { channelId }
  });
};

/**
 * Record a ticket response event
 */
DutyActivityEvent.recordTicketResponse = async function(discordUserId, guildId, sessionId, channelId, isOnDuty) {
  return DutyActivityEvent.recordEvent({
    sessionId: isOnDuty ? sessionId : null,
    discordUserId,
    guildId,
    isOnDuty,
    eventType: 'ticket_response',
    channelId,
    metadata: { channelId }
  });
};

/**
 * Get aggregated activity stats for a user within a date range
 */
DutyActivityEvent.getActivityForPeriod = async function(discordUserId, guildId, startDate, endDate) {
  const events = await DutyActivityEvent.findAll({
    where: {
      discordUserId,
      guildId,
      eventTimestamp: {
        [Op.between]: [startDate, endDate]
      }
    },
    raw: true
  });

  // Aggregate by type
  const stats = {
    voiceMinutes: 0,
    onDutyVoiceMinutes: 0,
    offDutyVoiceMinutes: 0,
    ticketResponses: 0,
    onDutyTicketResponses: 0,
    offDutyTicketResponses: 0
  };

  for (const event of events) {
    // With raw: true, Sequelize returns camelCase attribute names, not column names
    if (event.eventType === 'voice_session') {
      const minutes = event.durationMinutes || 0;
      stats.voiceMinutes += minutes;
      if (event.isOnDuty) {
        stats.onDutyVoiceMinutes += minutes;
      } else {
        stats.offDutyVoiceMinutes += minutes;
      }
    } else if (event.eventType === 'ticket_response') {
      stats.ticketResponses += 1;
      if (event.isOnDuty) {
        stats.onDutyTicketResponses += 1;
      } else {
        stats.offDutyTicketResponses += 1;
      }
    }
  }

  return stats;
};

/**
 * Get staff overview aggregated by user for a period
 * Returns all users with activity in the period with their stats
 */
DutyActivityEvent.getStaffOverviewForPeriod = async function(guildId, startDate, endDate) {
  // Get all events in period
  const events = await DutyActivityEvent.findAll({
    where: {
      guildId,
      eventTimestamp: {
        [Op.between]: [startDate, endDate]
      }
    },
    raw: true
  });

  // Aggregate by user
  const userStats = new Map();

  for (const event of events) {
    // With raw: true, Sequelize returns camelCase attribute names, not column names
    const userId = event.discordUserId;

    if (!userStats.has(userId)) {
      userStats.set(userId, {
        discordUserId: userId,
        totalVoiceMinutes: 0,
        onDutyVoiceMinutes: 0,
        offDutyVoiceMinutes: 0,
        totalTicketResponses: 0,
        onDutyTicketResponses: 0,
        offDutyTicketResponses: 0
      });
    }

    const stats = userStats.get(userId);

    if (event.eventType === 'voice_session') {
      const minutes = event.durationMinutes || 0;
      stats.totalVoiceMinutes += minutes;
      if (event.isOnDuty) {
        stats.onDutyVoiceMinutes += minutes;
      } else {
        stats.offDutyVoiceMinutes += minutes;
      }
    } else if (event.eventType === 'ticket_response') {
      stats.totalTicketResponses += 1;
      if (event.isOnDuty) {
        stats.onDutyTicketResponses += 1;
      } else {
        stats.offDutyTicketResponses += 1;
      }
    }
  }

  return Array.from(userStats.values());
};

module.exports = DutyActivityEvent;
