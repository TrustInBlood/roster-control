const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const DutySession = sequelize.define('DutySession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  discordUserId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'discord_user_id',
    comment: 'Discord user ID of the staff member'
  },

  discordUsername: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'discord_username',
    comment: 'Cached Discord username at session start'
  },

  dutyType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'admin',
    field: 'duty_type',
    comment: 'Type of duty: admin, tutor'
  },

  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'guild_id',
    comment: 'Discord guild ID'
  },

  sessionStart: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'session_start',
    comment: 'When the duty session started'
  },

  sessionEnd: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'session_end',
    comment: 'When the duty session ended (null if active)'
  },

  durationMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_minutes',
    comment: 'Total duration in minutes (calculated on end)'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
    comment: 'Whether the session is currently active'
  },

  endReason: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'end_reason',
    comment: 'How session ended: manual, auto_timeout, role_removed, server_restart'
  },

  basePoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'base_points',
    comment: 'Points from base time on duty'
  },

  bonusPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'bonus_points',
    comment: 'Points from activities (voice, tickets, etc)'
  },

  totalPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_points',
    comment: 'Total points for this session'
  },

  voiceMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'voice_minutes',
    comment: 'Minutes spent in tracked voice channels'
  },

  ticketResponses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ticket_responses',
    comment: 'Number of ticket channel responses'
  },

  adminCamEvents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'admin_cam_events',
    comment: 'Number of admin cam uses (SquadJS)'
  },

  ingameChatMessages: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ingame_chat_messages',
    comment: 'Number of in-game chat messages (SquadJS)'
  },

  warningSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'warning_sent_at',
    comment: 'When auto-timeout warning was sent'
  },

  timeoutExtendedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'timeout_extended_at',
    comment: 'When timeout was extended due to activity'
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional session data (extensible)'
  }
}, {
  tableName: 'duty_sessions',
  timestamps: true,
  indexes: [
    { name: 'idx_duty_sessions_user', fields: ['discord_user_id'] },
    { name: 'idx_duty_sessions_active', fields: ['is_active'] },
    { name: 'idx_duty_sessions_user_active', fields: ['discord_user_id', 'is_active'] },
    { name: 'idx_duty_sessions_start', fields: ['session_start'] },
    { name: 'idx_duty_sessions_guild', fields: ['guild_id'] },
    { name: 'idx_duty_sessions_type_active', fields: ['duty_type', 'is_active'] }
  ],
  comment: 'Duty sessions with activity tracking and points'
});

// ============================================
// Instance Methods
// ============================================

DutySession.prototype.getDurationMs = function() {
  if (this.sessionEnd) {
    return this.sessionEnd - this.sessionStart;
  }
  return Date.now() - this.sessionStart.getTime();
};

DutySession.prototype.getDurationMinutes = function() {
  return Math.floor(this.getDurationMs() / (1000 * 60));
};

DutySession.prototype.isExpired = function(timeoutHours = 8) {
  const maxDuration = timeoutHours * 60 * 60 * 1000;
  return this.getDurationMs() > maxDuration;
};

DutySession.prototype.needsWarning = function(timeoutHours = 8, warningMinutes = 30) {
  if (this.warningSentAt) return false;
  const warningThreshold = (timeoutHours * 60 - warningMinutes) * 60 * 1000;
  return this.getDurationMs() > warningThreshold;
};

// ============================================
// Static Methods - Session Management
// ============================================

DutySession.startSession = async function(discordUserId, discordUsername, dutyType, guildId, metadata = {}) {
  // Check for existing active session
  const existing = await this.findOne({
    where: {
      discordUserId,
      dutyType,
      isActive: true
    }
  });

  if (existing) {
    return { session: existing, created: false, error: 'Session already active' };
  }

  const session = await this.create({
    discordUserId,
    discordUsername,
    dutyType,
    guildId,
    sessionStart: new Date(),
    isActive: true,
    metadata
  });

  return { session, created: true };
};

DutySession.endSession = async function(sessionId, endReason = 'manual', pointsData = {}) {
  const session = await this.findByPk(sessionId);

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  if (!session.isActive) {
    return { success: false, error: 'Session already ended' };
  }

  const now = new Date();
  const durationMinutes = Math.floor((now - session.sessionStart) / (1000 * 60));

  await session.update({
    sessionEnd: now,
    durationMinutes,
    isActive: false,
    endReason,
    basePoints: pointsData.basePoints || 0,
    bonusPoints: pointsData.bonusPoints || 0,
    totalPoints: (pointsData.basePoints || 0) + (pointsData.bonusPoints || 0)
  });

  return { success: true, session };
};

DutySession.getActiveSession = async function(discordUserId, dutyType = null) {
  const where = {
    discordUserId,
    isActive: true
  };

  if (dutyType) {
    where.dutyType = dutyType;
  }

  return this.findOne({ where });
};

DutySession.getActiveSessions = async function(guildId, dutyType = null) {
  const where = {
    guildId,
    isActive: true
  };

  if (dutyType && dutyType !== 'both') {
    where.dutyType = dutyType;
  }

  return this.findAll({
    where,
    order: [['sessionStart', 'ASC']]
  });
};

// ============================================
// Static Methods - Auto-timeout
// ============================================

DutySession.getSessionsNeedingWarning = async function(timeoutHours = 8, warningMinutes = 30) {
  const warningThreshold = new Date(Date.now() - (timeoutHours * 60 - warningMinutes) * 60 * 1000);

  return this.findAll({
    where: {
      isActive: true,
      warningSentAt: null,
      sessionStart: { [Op.lt]: warningThreshold }
    }
  });
};

DutySession.getExpiredSessions = async function(timeoutHours = 8, warningMinutes = 30) {
  const expiredThreshold = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);
  const warningThreshold = new Date(Date.now() - warningMinutes * 60 * 1000);

  return this.findAll({
    where: {
      isActive: true,
      sessionStart: { [Op.lt]: expiredThreshold },
      warningSentAt: { [Op.lt]: warningThreshold }
    }
  });
};

DutySession.markWarned = async function(sessionId) {
  return this.update(
    { warningSentAt: new Date() },
    { where: { id: sessionId } }
  );
};

DutySession.extendTimeout = async function(sessionId) {
  return this.update(
    {
      timeoutExtendedAt: new Date(),
      warningSentAt: null // Reset warning so they can get a new one
    },
    { where: { id: sessionId } }
  );
};

// ============================================
// Static Methods - Activity Tracking
// ============================================

DutySession.incrementActivityCounter = async function(sessionId, field, amount = 1) {
  const validFields = ['voiceMinutes', 'ticketResponses', 'adminCamEvents', 'ingameChatMessages'];

  if (!validFields.includes(field)) {
    throw new Error(`Invalid activity field: ${field}`);
  }

  const session = await this.findByPk(sessionId);
  if (!session || !session.isActive) {
    return null;
  }

  await session.increment(field, { by: amount });
  return session.reload();
};

// ============================================
// Static Methods - Queries & Statistics
// ============================================

DutySession.getUserSessions = async function(discordUserId, startDate = null, endDate = null, dutyType = null, limit = 50) {
  const where = { discordUserId };

  if (startDate || endDate) {
    where.sessionStart = {};
    if (startDate) where.sessionStart[Op.gte] = startDate;
    if (endDate) where.sessionStart[Op.lte] = endDate;
  }

  if (dutyType && dutyType !== 'both') {
    where.dutyType = dutyType;
  }

  return this.findAll({
    where,
    order: [['sessionStart', 'DESC']],
    limit
  });
};

DutySession.getUserStats = async function(discordUserId, startDate = null, endDate = null, dutyType = null) {
  const sessions = await this.getUserSessions(discordUserId, startDate, endDate, dutyType, null);

  const completedSessions = sessions.filter(s => !s.isActive);
  const activeSessions = sessions.filter(s => s.isActive);

  let totalMinutes = completedSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  let totalPoints = completedSessions.reduce((sum, s) => sum + s.totalPoints, 0);
  let voiceMinutes = sessions.reduce((sum, s) => sum + s.voiceMinutes, 0);
  let ticketResponses = sessions.reduce((sum, s) => sum + s.ticketResponses, 0);

  // Add active session time
  for (const session of activeSessions) {
    totalMinutes += session.getDurationMinutes();
  }

  return {
    totalSessions: sessions.length,
    completedSessions: completedSessions.length,
    activeSessions: activeSessions.length,
    totalMinutes,
    totalMs: totalMinutes * 60 * 1000,
    totalPoints,
    voiceMinutes,
    ticketResponses,
    averageSessionMinutes: sessions.length > 0 ? totalMinutes / sessions.length : 0,
    longestSessionMinutes: sessions.length > 0
      ? Math.max(...sessions.map(s => s.durationMinutes || s.getDurationMinutes()))
      : 0
  };
};

DutySession.getLeaderboard = async function(guildId, startDate = null, endDate = null, dutyType = null, sortBy = 'time', limit = 10) {
  const where = { guildId };

  if (startDate || endDate) {
    where.sessionStart = {};
    if (startDate) where.sessionStart[Op.gte] = startDate;
    if (endDate) where.sessionStart[Op.lte] = endDate;
  }

  if (dutyType && dutyType !== 'both') {
    where.dutyType = dutyType;
  }

  // Get unique users
  const users = await this.findAll({
    where,
    attributes: ['discordUserId', 'discordUsername'],
    group: ['discordUserId', 'discordUsername']
  });

  // Calculate stats for each user
  const leaderboard = [];
  for (const user of users) {
    const stats = await this.getUserStats(user.discordUserId, startDate, endDate, dutyType);
    if (stats.totalMinutes > 0) {
      leaderboard.push({
        discordUserId: user.discordUserId,
        discordUsername: user.discordUsername,
        ...stats
      });
    }
  }

  // Sort by specified field
  if (sortBy === 'points') {
    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
  } else {
    leaderboard.sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  return leaderboard.slice(0, limit);
};

DutySession.getGuildStats = async function(guildId, startDate = null, endDate = null, dutyType = null) {
  const leaderboard = await this.getLeaderboard(guildId, startDate, endDate, dutyType, 'time', 999999);

  const totalUsers = leaderboard.length;
  const totalMinutes = leaderboard.reduce((sum, u) => sum + u.totalMinutes, 0);
  const totalSessions = leaderboard.reduce((sum, u) => sum + u.totalSessions, 0);
  const totalPoints = leaderboard.reduce((sum, u) => sum + u.totalPoints, 0);

  return {
    totalUsers,
    totalMinutes,
    totalMs: totalMinutes * 60 * 1000,
    totalSessions,
    totalPoints,
    averageMinutesPerUser: totalUsers > 0 ? totalMinutes / totalUsers : 0,
    averageSessionMinutes: totalSessions > 0 ? totalMinutes / totalSessions : 0,
    topPerformer: leaderboard[0] || null
  };
};

// Close any sessions that were left open (e.g., after bot restart)
DutySession.closeOrphanedSessions = async function(guildId, reason = 'server_restart') {
  const activeSessions = await this.findAll({
    where: {
      guildId,
      isActive: true
    }
  });

  const closed = [];
  for (const session of activeSessions) {
    const durationMinutes = session.getDurationMinutes();
    await session.update({
      sessionEnd: new Date(),
      durationMinutes,
      isActive: false,
      endReason: reason
    });
    closed.push(session);
  }

  return closed;
};

module.exports = DutySession;
