const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const SeedingSession = sequelize.define('SeedingSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  target_server_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Server identifier needing players'
  },

  target_server_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Cached server name for display'
  },

  player_threshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Player count threshold to close seeding'
  },

  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    comment: 'Session status: active, completed, cancelled'
  },

  switch_reward_value: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Immediate reward value for switching (null = disabled)'
  },

  switch_reward_unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Reward unit: days, months'
  },

  playtime_reward_value: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reward value for meeting playtime threshold (null = disabled)'
  },

  playtime_reward_unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Reward unit: days, months'
  },

  playtime_threshold_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Minutes required for playtime reward'
  },

  completion_reward_value: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reward value for being present at threshold (null = disabled)'
  },

  completion_reward_unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Reward unit: days, months'
  },

  source_server_ids: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of source server IDs'
  },

  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'When the seeding session started'
  },

  closed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the session was closed (threshold reached or manual)'
  },

  started_by: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Discord user ID who started the session'
  },

  started_by_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Cached username of who started the session'
  },

  participants_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total number of participants'
  },

  rewards_granted_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of rewards successfully granted'
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional session data (extensible)'
  },

  custom_broadcast_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Custom broadcast message template for seeding call'
  }
}, {
  tableName: 'seeding_sessions',
  timestamps: true,
  indexes: [
    { name: 'idx_seeding_sessions_status', fields: ['status'] },
    { name: 'idx_seeding_sessions_target_server', fields: ['target_server_id'] },
    { name: 'idx_seeding_sessions_started_at', fields: ['started_at'] },
    { name: 'idx_seeding_sessions_status_target', fields: ['status', 'target_server_id'] }
  ],
  comment: 'Cross-server seeding sessions for whitelist rewards'
});

// ============ Static Methods ============

/**
 * Get the currently active seeding session (only one allowed at a time)
 * @returns {Promise<SeedingSession|null>}
 */
SeedingSession.getActiveSession = async function() {
  return await this.findOne({
    where: { status: 'active' }
  });
};

/**
 * Check if there's an active session
 * @returns {Promise<boolean>}
 */
SeedingSession.hasActiveSession = async function() {
  const count = await this.count({
    where: { status: 'active' }
  });
  return count > 0;
};

/**
 * Create a new seeding session
 * @param {Object} config - Session configuration
 * @returns {Promise<SeedingSession>}
 */
SeedingSession.createSession = async function(config) {
  const {
    targetServerId,
    targetServerName,
    playerThreshold,
    rewards,
    sourceServerIds,
    startedBy,
    startedByName,
    customBroadcastMessage
  } = config;

  return await this.create({
    target_server_id: targetServerId,
    target_server_name: targetServerName,
    player_threshold: playerThreshold,
    status: 'active',
    switch_reward_value: rewards?.switch?.value || null,
    switch_reward_unit: rewards?.switch?.unit || null,
    playtime_reward_value: rewards?.playtime?.value || null,
    playtime_reward_unit: rewards?.playtime?.unit || null,
    playtime_threshold_minutes: rewards?.playtime?.thresholdMinutes || null,
    completion_reward_value: rewards?.completion?.value || null,
    completion_reward_unit: rewards?.completion?.unit || null,
    source_server_ids: sourceServerIds,
    started_at: new Date(),
    started_by: startedBy,
    started_by_name: startedByName,
    participants_count: 0,
    rewards_granted_count: 0,
    custom_broadcast_message: customBroadcastMessage || null
  });
};

/**
 * Close a session (threshold reached)
 * @param {number} sessionId - Session ID
 * @returns {Promise<SeedingSession|null>}
 */
SeedingSession.closeSession = async function(sessionId) {
  const session = await this.findByPk(sessionId);
  if (!session || session.status !== 'active') {
    return null;
  }

  session.status = 'completed';
  session.closed_at = new Date();
  await session.save();
  return session;
};

/**
 * Cancel a session
 * @param {number} sessionId - Session ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<SeedingSession|null>}
 */
SeedingSession.cancelSession = async function(sessionId, reason = null) {
  const session = await this.findByPk(sessionId);
  if (!session || session.status !== 'active') {
    return null;
  }

  session.status = 'cancelled';
  session.closed_at = new Date();
  if (reason) {
    session.metadata = { ...session.metadata, cancellation_reason: reason };
    session.changed('metadata', true);
  }
  await session.save();
  return session;
};

/**
 * Update participant count
 * @param {number} sessionId - Session ID
 * @param {number} count - New count
 * @returns {Promise<void>}
 */
SeedingSession.updateParticipantCount = async function(sessionId, count) {
  await this.update(
    { participants_count: count },
    { where: { id: sessionId } }
  );
};

/**
 * Increment rewards granted count
 * @param {number} sessionId - Session ID
 * @returns {Promise<void>}
 */
SeedingSession.incrementRewardsGranted = async function(sessionId) {
  await this.increment('rewards_granted_count', {
    where: { id: sessionId }
  });
};

/**
 * Get all sessions with pagination
 * @param {Object} options - Query options
 * @returns {Promise<{rows: SeedingSession[], count: number}>}
 */
SeedingSession.getSessions = async function(options = {}) {
  const {
    page = 1,
    limit = 20,
    status = null,
    sortBy = 'started_at',
    sortOrder = 'DESC'
  } = options;

  const where = {};
  if (status) {
    where.status = status;
  }

  return await this.findAndCountAll({
    where,
    order: [[sortBy, sortOrder]],
    limit,
    offset: (page - 1) * limit
  });
};

/**
 * Get session with full details including participant stats
 * @param {number} sessionId - Session ID
 * @returns {Promise<Object|null>}
 */
SeedingSession.getSessionWithStats = async function(sessionId) {
  const session = await this.findByPk(sessionId);
  if (!session) return null;

  const SeedingParticipant = require('./SeedingParticipant');

  const stats = await SeedingParticipant.findAll({
    where: { session_id: sessionId },
    attributes: [
      'participant_type',
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['participant_type', 'status'],
    raw: true
  });

  const onTargetCount = await SeedingParticipant.count({
    where: { session_id: sessionId, is_on_target: true }
  });

  return {
    ...session.toJSON(),
    stats: {
      byTypeAndStatus: stats,
      currentlyOnTarget: onTargetCount
    }
  };
};

/**
 * Check if switch reward is enabled
 * @returns {boolean}
 */
SeedingSession.prototype.hasSwitchReward = function() {
  return this.switch_reward_value !== null && this.switch_reward_unit !== null;
};

/**
 * Check if playtime reward is enabled
 * @returns {boolean}
 */
SeedingSession.prototype.hasPlaytimeReward = function() {
  return this.playtime_reward_value !== null &&
         this.playtime_reward_unit !== null &&
         this.playtime_threshold_minutes !== null;
};

/**
 * Check if completion reward is enabled
 * @returns {boolean}
 */
SeedingSession.prototype.hasCompletionReward = function() {
  return this.completion_reward_value !== null && this.completion_reward_unit !== null;
};

/**
 * Get total possible reward in minutes for display
 * @returns {number}
 */
SeedingSession.prototype.getTotalPossibleRewardMinutes = function() {
  let total = 0;

  if (this.hasSwitchReward()) {
    total += this.rewardToMinutes(this.switch_reward_value, this.switch_reward_unit);
  }
  if (this.hasPlaytimeReward()) {
    total += this.rewardToMinutes(this.playtime_reward_value, this.playtime_reward_unit);
  }
  if (this.hasCompletionReward()) {
    total += this.rewardToMinutes(this.completion_reward_value, this.completion_reward_unit);
  }

  return total;
};

/**
 * Convert reward value and unit to minutes
 * @param {number} value - Reward value
 * @param {string} unit - Reward unit (days, months)
 * @returns {number}
 */
SeedingSession.prototype.rewardToMinutes = function(value, unit) {
  switch (unit) {
    case 'days':
      return value * 60 * 24;
    case 'months':
      return value * 60 * 24 * 30;
    default:
      return 0;
  }
};

module.exports = SeedingSession;
