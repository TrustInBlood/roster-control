const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const PlayerSession = sequelize.define('PlayerSession', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  // Foreign key to Player
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Foreign key to players table',
    references: {
      model: 'players',
      key: 'id'
    }
  },

  // Server identifier
  serverId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Server identifier where session occurred'
  },

  // Session start time
  sessionStart: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Timestamp when player joined'
  },

  // Session end time
  sessionEnd: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when player left (null if still active)'
  },

  // Session duration in minutes
  durationMinutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Session duration in minutes (calculated on end)'
  },

  // Active flag
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether session is currently active'
  },

  // Metadata for extensibility
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional session data (extensible)'
  }
}, {
  // Table name
  tableName: 'player_sessions',

  // Timestamps
  timestamps: true,

  // Indexes
  indexes: [
    {
      name: 'idx_player_sessions_player_id',
      fields: ['player_id']
    },
    {
      name: 'idx_player_sessions_server_id',
      fields: ['serverId']
    },
    {
      name: 'idx_player_sessions_start',
      fields: ['sessionStart']
    },
    {
      name: 'idx_player_sessions_active',
      fields: ['isActive']
    },
    {
      name: 'idx_player_sessions_player_active',
      fields: ['player_id', 'isActive']
    },
    {
      name: 'idx_player_sessions_server_active',
      fields: ['serverId', 'isActive']
    }
  ],

  // Comment
  comment: 'Player session tracking for playtime calculation'
});

// Static methods

/**
 * Create a new active session for a player
 * @param {number} playerId - Player ID from players table
 * @param {string} serverId - Server identifier
 * @returns {Promise<PlayerSession>} - Created session
 */
PlayerSession.createSession = async function(playerId, serverId) {
  return await this.create({
    player_id: playerId,
    serverId: serverId,
    sessionStart: new Date(),
    isActive: true
  });
};

/**
 * End an active session and calculate duration
 * @param {number} sessionId - Session ID to end
 * @returns {Promise<PlayerSession|null>} - Updated session or null if not found
 */
PlayerSession.endSession = async function(sessionId) {
  const session = await this.findByPk(sessionId);

  if (!session || !session.isActive) {
    return null;
  }

  const endTime = new Date();
  const durationMs = endTime - new Date(session.sessionStart);
  const durationMinutes = Math.floor(durationMs / (1000 * 60));

  session.sessionEnd = endTime;
  session.durationMinutes = durationMinutes;
  session.isActive = false;

  await session.save();
  return session;
};

/**
 * Find active session for a player on a specific server
 * @param {number} playerId - Player ID
 * @param {string} serverId - Server identifier
 * @returns {Promise<PlayerSession|null>} - Active session or null
 */
PlayerSession.findActiveSessionByPlayer = async function(playerId, serverId) {
  return await this.findOne({
    where: {
      player_id: playerId,
      serverId: serverId,
      isActive: true
    }
  });
};

/**
 * Find all active sessions for a specific server
 * @param {string} serverId - Server identifier
 * @returns {Promise<PlayerSession[]>} - Array of active sessions
 */
PlayerSession.findAllActiveSessions = async function(serverId) {
  const Player = require('./Player');

  return await this.findAll({
    where: {
      serverId: serverId,
      isActive: true
    },
    include: [{
      model: Player,
      as: 'player',
      attributes: ['id', 'steamId', 'eosId', 'username']
    }]
  });
};

/**
 * Close all active sessions (for bot shutdown)
 * @returns {Promise<number>} - Number of sessions closed
 */
PlayerSession.closeAllActiveSessions = async function() {
  const activeSessions = await this.findAll({
    where: { isActive: true }
  });

  const endTime = new Date();
  let closedCount = 0;

  for (const session of activeSessions) {
    const durationMs = endTime - new Date(session.sessionStart);
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    session.sessionEnd = endTime;
    session.durationMinutes = durationMinutes;
    session.isActive = false;

    await session.save();
    closedCount++;
  }

  return closedCount;
};

/**
 * Get total playtime for a player across all sessions
 * @param {number} playerId - Player ID
 * @returns {Promise<number>} - Total playtime in minutes
 */
PlayerSession.getPlayerTotalPlaytime = async function(playerId) {
  const result = await this.findAll({
    where: {
      player_id: playerId,
      isActive: false,
      durationMinutes: { [Op.not]: null }
    },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('durationMinutes')), 'totalMinutes']
    ],
    raw: true
  });

  return result[0]?.totalMinutes || 0;
};

module.exports = PlayerSession;
