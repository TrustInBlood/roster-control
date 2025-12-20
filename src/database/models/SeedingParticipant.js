const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const SeedingParticipant = sequelize.define('SeedingParticipant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  session_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Foreign key to seeding_sessions table',
    references: {
      model: 'seeding_sessions',
      key: 'id'
    }
  },

  player_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Foreign key to players table (null if player not in DB)',
    references: {
      model: 'players',
      key: 'id'
    }
  },

  steam_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Steam ID denormalized for quick lookup'
  },

  username: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Player username at time of participation'
  },

  participant_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Participant type: switcher (from source) or seeder (already on target)'
  },

  source_server_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Source server ID (null for seeders)'
  },

  source_join_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When player was first seen on source server'
  },

  source_leave_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When player left source server'
  },

  target_join_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When player joined target server'
  },

  target_leave_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When player left target server (for tracking)'
  },

  target_playtime_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Cumulative playtime on target server in minutes'
  },

  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'on_source',
    comment: 'Status: on_source, seeder, switched, playtime_met, completed'
  },

  confirmation_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether in-game confirmation was sent'
  },

  switch_rewarded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When switch reward was granted'
  },

  playtime_rewarded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When playtime reward was granted'
  },

  completion_rewarded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When completion reward was granted'
  },

  total_reward_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total whitelist reward time earned in minutes'
  },

  is_on_target: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether player is currently on target server'
  },

  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional participant data (extensible)'
  }
}, {
  tableName: 'seeding_participants',
  timestamps: true,
  indexes: [
    { name: 'idx_seeding_participants_session', fields: ['session_id'] },
    { name: 'idx_seeding_participants_steam_id', fields: ['steam_id'] },
    { name: 'idx_seeding_participants_player_id', fields: ['player_id'] },
    { name: 'idx_seeding_participants_status', fields: ['status'] },
    { name: 'idx_seeding_participants_type', fields: ['participant_type'] },
    { name: 'idx_seeding_participants_session_steam', fields: ['session_id', 'steam_id'], unique: true },
    { name: 'idx_seeding_participants_session_on_target', fields: ['session_id', 'is_on_target'] }
  ],
  comment: 'Participants in seeding sessions for reward tracking'
});

// ============ Static Methods ============

/**
 * Create a seeder participant (already on target when session started)
 * @param {Object} data - Participant data
 * @returns {Promise<SeedingParticipant>}
 */
SeedingParticipant.createSeeder = async function(data) {
  const { sessionId, playerId, steamId, username } = data;

  return await this.create({
    session_id: sessionId,
    player_id: playerId,
    steam_id: steamId,
    username: username,
    participant_type: 'seeder',
    source_server_id: null,
    target_join_time: new Date(),
    status: 'seeder',
    is_on_target: true
  });
};

/**
 * Create a potential switcher (detected on source server)
 * @param {Object} data - Participant data
 * @returns {Promise<SeedingParticipant>}
 */
SeedingParticipant.createPotentialSwitcher = async function(data) {
  const { sessionId, playerId, steamId, username, sourceServerId } = data;

  return await this.create({
    session_id: sessionId,
    player_id: playerId,
    steam_id: steamId,
    username: username,
    participant_type: 'switcher',
    source_server_id: sourceServerId,
    source_join_time: new Date(),
    status: 'on_source',
    is_on_target: false
  });
};

/**
 * Find participant by session and steam ID
 * @param {number} sessionId - Session ID
 * @param {string} steamId - Steam ID
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.findBySessionAndSteamId = async function(sessionId, steamId) {
  return await this.findOne({
    where: { session_id: sessionId, steam_id: steamId }
  });
};

/**
 * Get all participants for a session
 * @param {number} sessionId - Session ID
 * @param {Object} options - Query options
 * @returns {Promise<{rows: SeedingParticipant[], count: number}>}
 */
SeedingParticipant.getParticipants = async function(sessionId, options = {}) {
  const {
    page = 1,
    limit = 50,
    status = null,
    participantType = null,
    sortBy = 'createdAt',
    sortOrder = 'DESC',
    includeOnSource = false
  } = options;

  const where = { session_id: sessionId };
  if (status) {
    where.status = status;
  } else if (!includeOnSource) {
    // By default, exclude on_source participants (they haven't joined target yet)
    where.status = { [Op.ne]: 'on_source' };
  }
  if (participantType) where.participant_type = participantType;

  return await this.findAndCountAll({
    where,
    order: [[sortBy, sortOrder]],
    limit,
    offset: (page - 1) * limit
  });
};

/**
 * Get all participants currently on target server
 * @param {number} sessionId - Session ID
 * @returns {Promise<SeedingParticipant[]>}
 */
SeedingParticipant.getParticipantsOnTarget = async function(sessionId) {
  return await this.findAll({
    where: { session_id: sessionId, is_on_target: true }
  });
};

/**
 * Get count of participants on target
 * @param {number} sessionId - Session ID
 * @returns {Promise<number>}
 */
SeedingParticipant.countOnTarget = async function(sessionId) {
  return await this.count({
    where: { session_id: sessionId, is_on_target: true }
  });
};

/**
 * Get participants eligible for playtime reward
 * @param {number} sessionId - Session ID
 * @param {number} thresholdMinutes - Playtime threshold
 * @returns {Promise<SeedingParticipant[]>}
 */
SeedingParticipant.getEligibleForPlaytimeReward = async function(sessionId, thresholdMinutes) {
  return await this.findAll({
    where: {
      session_id: sessionId,
      target_playtime_minutes: { [Op.gte]: thresholdMinutes },
      playtime_rewarded_at: null,
      status: { [Op.in]: ['switched', 'seeder'] }
    }
  });
};

/**
 * Get participants eligible for completion reward
 * @param {number} sessionId - Session ID
 * @returns {Promise<SeedingParticipant[]>}
 */
SeedingParticipant.getEligibleForCompletionReward = async function(sessionId) {
  return await this.findAll({
    where: {
      session_id: sessionId,
      is_on_target: true,
      completion_rewarded_at: null
    }
  });
};

/**
 * Mark participant as switched and on target
 * @param {number} participantId - Participant ID
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.markAsSwitched = async function(participantId) {
  const participant = await this.findByPk(participantId);
  if (!participant) return null;

  participant.source_leave_time = participant.source_leave_time || new Date();
  participant.target_join_time = new Date();
  participant.status = 'switched';
  participant.is_on_target = true;
  await participant.save();
  return participant;
};

/**
 * Mark participant as left target
 * @param {number} participantId - Participant ID
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.markAsLeftTarget = async function(participantId) {
  const participant = await this.findByPk(participantId);
  if (!participant) return null;

  participant.target_leave_time = new Date();
  participant.is_on_target = false;
  await participant.save();
  return participant;
};

/**
 * Update cumulative playtime
 * @param {number} participantId - Participant ID
 * @param {number} additionalMinutes - Minutes to add
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.addPlaytime = async function(participantId, additionalMinutes) {
  const participant = await this.findByPk(participantId);
  if (!participant) return null;

  participant.target_playtime_minutes += additionalMinutes;
  await participant.save();
  return participant;
};

/**
 * Mark switch reward as granted
 * @param {number} participantId - Participant ID
 * @param {number} rewardMinutes - Minutes of whitelist granted
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.grantSwitchReward = async function(participantId, rewardMinutes) {
  const participant = await this.findByPk(participantId);
  if (!participant || participant.switch_rewarded_at) return null;

  participant.switch_rewarded_at = new Date();
  participant.total_reward_minutes += rewardMinutes;
  await participant.save();
  return participant;
};

/**
 * Mark playtime reward as granted
 * @param {number} participantId - Participant ID
 * @param {number} rewardMinutes - Minutes of whitelist granted
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.grantPlaytimeReward = async function(participantId, rewardMinutes) {
  const participant = await this.findByPk(participantId);
  if (!participant || participant.playtime_rewarded_at) return null;

  participant.playtime_rewarded_at = new Date();
  participant.status = 'playtime_met';
  participant.total_reward_minutes += rewardMinutes;
  await participant.save();
  return participant;
};

/**
 * Mark completion reward as granted
 * @param {number} participantId - Participant ID
 * @param {number} rewardMinutes - Minutes of whitelist granted
 * @returns {Promise<SeedingParticipant|null>}
 */
SeedingParticipant.grantCompletionReward = async function(participantId, rewardMinutes) {
  const participant = await this.findByPk(participantId);
  if (!participant || participant.completion_rewarded_at) return null;

  participant.completion_rewarded_at = new Date();
  participant.status = 'completed';
  participant.total_reward_minutes += rewardMinutes;
  await participant.save();
  return participant;
};

/**
 * Mark confirmation as sent
 * @param {number} participantId - Participant ID
 * @returns {Promise<void>}
 */
SeedingParticipant.markConfirmationSent = async function(participantId) {
  await this.update(
    { confirmation_sent: true },
    { where: { id: participantId } }
  );
};

/**
 * Bulk update participants on target to off target
 * @param {number} sessionId - Session ID
 * @param {string[]} steamIdsOnTarget - Steam IDs still on target
 * @returns {Promise<number>} - Number of participants marked as left
 */
SeedingParticipant.updateOnTargetStatus = async function(sessionId, steamIdsOnTarget) {
  // Mark all as off target first
  const [leftCount] = await this.update(
    { is_on_target: false, target_leave_time: new Date() },
    { where: { session_id: sessionId, is_on_target: true, steam_id: { [Op.notIn]: steamIdsOnTarget } } }
  );

  // Mark those still on target
  if (steamIdsOnTarget.length > 0) {
    await this.update(
      { is_on_target: true, target_leave_time: null },
      { where: { session_id: sessionId, steam_id: { [Op.in]: steamIdsOnTarget } } }
    );
  }

  return leftCount;
};

// ============ Instance Methods ============

/**
 * Check if participant has received switch reward
 * @returns {boolean}
 */
SeedingParticipant.prototype.hasReceivedSwitchReward = function() {
  return this.switch_rewarded_at !== null;
};

/**
 * Check if participant has received playtime reward
 * @returns {boolean}
 */
SeedingParticipant.prototype.hasReceivedPlaytimeReward = function() {
  return this.playtime_rewarded_at !== null;
};

/**
 * Check if participant has received completion reward
 * @returns {boolean}
 */
SeedingParticipant.prototype.hasReceivedCompletionReward = function() {
  return this.completion_rewarded_at !== null;
};

/**
 * Check if participant is eligible for switch reward
 * @returns {boolean}
 */
SeedingParticipant.prototype.isEligibleForSwitchReward = function() {
  return this.participant_type === 'switcher' &&
         this.status === 'switched' &&
         !this.hasReceivedSwitchReward();
};

/**
 * Clear all reward timestamps for all participants in a session
 * Used when reversing rewards for an entire session
 * @param {number} sessionId - Session ID
 * @returns {Promise<number>} Number of participants updated
 */
SeedingParticipant.clearRewardsForSession = async function(sessionId) {
  const [updatedCount] = await this.update(
    {
      switch_rewarded_at: null,
      playtime_rewarded_at: null,
      completion_rewarded_at: null,
      total_reward_minutes: 0
    },
    { where: { session_id: sessionId } }
  );
  return updatedCount;
};

/**
 * Clear reward timestamps for a specific participant
 * Used when revoking rewards for a single participant
 * @param {number} participantId - Participant ID
 * @returns {Promise<Object>} Object indicating which rewards were cleared
 */
SeedingParticipant.clearParticipantRewards = async function(participantId) {
  const participant = await this.findByPk(participantId);
  if (!participant) {
    return { cleared: false, rewardsCleared: {} };
  }

  const rewardsCleared = {
    switch: !!participant.switch_rewarded_at,
    playtime: !!participant.playtime_rewarded_at,
    completion: !!participant.completion_rewarded_at
  };

  await participant.update({
    switch_rewarded_at: null,
    playtime_rewarded_at: null,
    completion_rewarded_at: null,
    total_reward_minutes: 0
  });

  return { cleared: true, rewardsCleared };
};

module.exports = SeedingParticipant;
