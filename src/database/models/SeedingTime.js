const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * SeedingTime Model
 *
 * Tracks per-player, per-server, per-day seeding time aggregates.
 * One row per player per server per day (efficient storage).
 */
const SeedingTime = sequelize.define('SeedingTime', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'players',
      key: 'id'
    },
    comment: 'Foreign key to players table'
  },
  server_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Server identifier (e.g., "server1")'
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Calendar date for aggregation'
  },
  seeding_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Minutes spent while server was below seed threshold'
  },
  total_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total minutes played on this server this day'
  },
  seed_threshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Seed threshold used (for historical accuracy)'
  }
}, {
  tableName: 'seeding_time',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['player_id', 'server_id', 'date'],
      name: 'idx_seeding_time_player_server_date'
    },
    {
      fields: ['server_id', 'date'],
      name: 'idx_seeding_time_server_date'
    },
    {
      fields: ['date'],
      name: 'idx_seeding_time_date'
    },
    {
      fields: ['player_id'],
      name: 'idx_seeding_time_player'
    }
  ]
});

// Static methods

/**
 * Add seeding time for a player (upsert - create or increment)
 * @param {number} playerId - Player ID
 * @param {string} serverId - Server identifier
 * @param {number} seedingMinutes - Minutes of seeding time to add
 * @param {number} totalMinutes - Total minutes to add
 * @param {number} seedThreshold - The seed threshold used
 * @returns {Promise<SeedingTime>}
 */
SeedingTime.addSeedingTime = async function(playerId, serverId, seedingMinutes, totalMinutes, seedThreshold) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const [record, created] = await this.findOrCreate({
    where: {
      player_id: playerId,
      server_id: serverId,
      date: today
    },
    defaults: {
      seeding_minutes: seedingMinutes,
      total_minutes: totalMinutes,
      seed_threshold: seedThreshold
    }
  });

  if (!created) {
    // Increment existing record
    await record.increment({
      seeding_minutes: seedingMinutes,
      total_minutes: totalMinutes
    });
    await record.reload();
  }

  return record;
};

/**
 * Get seeding stats for a player
 * @param {number} playerId - Player ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
SeedingTime.getPlayerStats = async function(playerId, options = {}) {
  const { startDate, endDate, serverId } = options;

  const where = { player_id: playerId };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date[Op.gte] = startDate;
    if (endDate) where.date[Op.lte] = endDate;
  }

  if (serverId) {
    where.server_id = serverId;
  }

  const result = await this.findAll({
    where,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('seeding_minutes')), 'totalSeedingMinutes'],
      [sequelize.fn('SUM', sequelize.col('total_minutes')), 'totalPlayMinutes'],
      [sequelize.fn('COUNT', sequelize.literal('DISTINCT date')), 'daysPlayed']
    ],
    raw: true
  });

  const stats = result[0] || {};

  return {
    totalSeedingMinutes: parseInt(stats.totalSeedingMinutes) || 0,
    totalPlayMinutes: parseInt(stats.totalPlayMinutes) || 0,
    daysPlayed: parseInt(stats.daysPlayed) || 0,
    seedingPercentage: stats.totalPlayMinutes > 0
      ? Math.round((stats.totalSeedingMinutes / stats.totalPlayMinutes) * 100)
      : 0
  };
};

/**
 * Get daily breakdown for a player
 * @param {number} playerId - Player ID
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>}
 */
SeedingTime.getPlayerDailyBreakdown = async function(playerId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await this.findAll({
    where: {
      player_id: playerId,
      date: { [Op.gte]: startDate.toISOString().split('T')[0] }
    },
    attributes: ['date', 'server_id', 'seeding_minutes', 'total_minutes', 'seed_threshold'],
    order: [['date', 'DESC'], ['server_id', 'ASC']],
    raw: true
  });
};

/**
 * Get top seeders for a time period
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
SeedingTime.getTopSeeders = async function(options = {}) {
  const { days = 30, serverId, limit = 20 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where = {
    date: { [Op.gte]: startDate.toISOString().split('T')[0] }
  };

  if (serverId) {
    where.server_id = serverId;
  }

  const Player = require('./Player');

  return await this.findAll({
    where,
    attributes: [
      'player_id',
      [sequelize.fn('SUM', sequelize.col('seeding_minutes')), 'totalSeedingMinutes'],
      [sequelize.fn('SUM', sequelize.col('total_minutes')), 'totalPlayMinutes'],
      [sequelize.fn('COUNT', sequelize.literal('DISTINCT date')), 'daysSeeded']
    ],
    include: [{
      model: Player,
      as: 'player',
      attributes: ['steamId', 'username']
    }],
    group: ['player_id'],
    order: [[sequelize.literal('totalSeedingMinutes'), 'DESC']],
    limit,
    raw: false
  });
};

/**
 * Get server seeding summary for a time period
 * @param {string} serverId - Server identifier
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
SeedingTime.getServerSummary = async function(serverId, options = {}) {
  const { days = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await this.findAll({
    where: {
      server_id: serverId,
      date: { [Op.gte]: startDate.toISOString().split('T')[0] }
    },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('seeding_minutes')), 'totalSeedingMinutes'],
      [sequelize.fn('SUM', sequelize.col('total_minutes')), 'totalPlayMinutes'],
      [sequelize.fn('COUNT', sequelize.literal('DISTINCT player_id')), 'uniquePlayers'],
      [sequelize.fn('COUNT', sequelize.literal('DISTINCT date')), 'daysWithActivity']
    ],
    raw: true
  });

  const stats = result[0] || {};

  return {
    serverId,
    totalSeedingMinutes: parseInt(stats.totalSeedingMinutes) || 0,
    totalPlayMinutes: parseInt(stats.totalPlayMinutes) || 0,
    uniquePlayers: parseInt(stats.uniquePlayers) || 0,
    daysWithActivity: parseInt(stats.daysWithActivity) || 0,
    seedingPercentage: stats.totalPlayMinutes > 0
      ? Math.round((stats.totalSeedingMinutes / stats.totalPlayMinutes) * 100)
      : 0
  };
};

module.exports = SeedingTime;
