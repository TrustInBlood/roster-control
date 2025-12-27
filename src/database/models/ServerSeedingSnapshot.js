const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ServerSeedingSnapshot Model
 *
 * Records server state changes (entering/exiting seeding state).
 * Only stores transitions, not continuous polling data.
 */
const ServerSeedingSnapshot = sequelize.define('ServerSeedingSnapshot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  server_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Server identifier'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'When the state change occurred'
  },
  player_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Player count at time of state change'
  },
  was_seeding: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    comment: 'true = entered seeding state, false = exited seeding state'
  },
  seed_threshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Threshold that was crossed'
  }
}, {
  tableName: 'server_seeding_snapshots',
  timestamps: false,
  indexes: [
    {
      fields: ['server_id', 'timestamp'],
      name: 'idx_server_seeding_server_timestamp'
    },
    {
      fields: ['timestamp'],
      name: 'idx_server_seeding_timestamp'
    }
  ]
});

// Static methods

/**
 * Record a seeding state change
 * @param {string} serverId - Server identifier
 * @param {number} playerCount - Current player count
 * @param {boolean} wasSeeding - true if now seeding, false if exited seeding
 * @param {number} seedThreshold - The threshold that was crossed
 * @returns {Promise<ServerSeedingSnapshot>}
 */
ServerSeedingSnapshot.recordStateChange = async function(serverId, playerCount, wasSeeding, seedThreshold) {
  return await this.create({
    server_id: serverId,
    timestamp: new Date(),
    player_count: playerCount,
    was_seeding: wasSeeding,
    seed_threshold: seedThreshold
  });
};

/**
 * Get server seeding history for a time period
 * @param {string} serverId - Server identifier
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
ServerSeedingSnapshot.getServerHistory = async function(serverId, options = {}) {
  const { startDate, endDate, limit = 100 } = options;

  const where = { server_id: serverId };

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = startDate;
    if (endDate) where.timestamp[Op.lte] = endDate;
  }

  return await this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    raw: true
  });
};

/**
 * Calculate total seeding time for a server in a time period
 * @param {string} serverId - Server identifier
 * @param {Date} startDate - Start of period
 * @param {Date} endDate - End of period
 * @returns {Promise<Object>}
 */
ServerSeedingSnapshot.calculateSeedingTime = async function(serverId, startDate, endDate) {
  const snapshots = await this.findAll({
    where: {
      server_id: serverId,
      timestamp: {
        [Op.gte]: startDate,
        [Op.lte]: endDate
      }
    },
    order: [['timestamp', 'ASC']],
    raw: true
  });

  if (snapshots.length === 0) {
    return {
      serverId,
      totalSeedingMinutes: 0,
      totalMinutes: Math.round((endDate - startDate) / 60000),
      stateChanges: 0
    };
  }

  let seedingMinutes = 0;
  let lastSeedingStart = null;

  for (const snapshot of snapshots) {
    if (snapshot.was_seeding) {
      // Entered seeding state
      lastSeedingStart = new Date(snapshot.timestamp);
    } else if (lastSeedingStart) {
      // Exited seeding state
      const exitTime = new Date(snapshot.timestamp);
      seedingMinutes += Math.round((exitTime - lastSeedingStart) / 60000);
      lastSeedingStart = null;
    }
  }

  // If still seeding at end of period
  if (lastSeedingStart) {
    seedingMinutes += Math.round((endDate - lastSeedingStart) / 60000);
  }

  const totalMinutes = Math.round((endDate - startDate) / 60000);

  return {
    serverId,
    totalSeedingMinutes: seedingMinutes,
    totalMinutes,
    seedingPercentage: totalMinutes > 0 ? Math.round((seedingMinutes / totalMinutes) * 100) : 0,
    stateChanges: snapshots.length
  };
};

/**
 * Get daily seeding summary for all servers
 * @param {Date} date - The date to summarize
 * @returns {Promise<Array>}
 */
ServerSeedingSnapshot.getDailySummary = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get unique servers that had activity
  const servers = await this.findAll({
    where: {
      timestamp: {
        [Op.gte]: startOfDay,
        [Op.lte]: endOfDay
      }
    },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('server_id')), 'server_id']],
    raw: true
  });

  const summaries = [];

  for (const { server_id } of servers) {
    const summary = await this.calculateSeedingTime(server_id, startOfDay, endOfDay);
    summaries.push(summary);
  }

  return summaries;
};

/**
 * Get the most recent state for a server
 * @param {string} serverId - Server identifier
 * @returns {Promise<ServerSeedingSnapshot|null>}
 */
ServerSeedingSnapshot.getLatestState = async function(serverId) {
  return await this.findOne({
    where: { server_id: serverId },
    order: [['timestamp', 'DESC']]
  });
};

/**
 * Clean up old snapshots (retention policy)
 * @param {number} daysToKeep - Number of days to retain
 * @returns {Promise<number>} - Number of deleted records
 */
ServerSeedingSnapshot.cleanupOldSnapshots = async function(daysToKeep = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);

  const deleted = await this.destroy({
    where: {
      timestamp: { [Op.lt]: cutoff }
    }
  });

  return deleted;
};

module.exports = ServerSeedingSnapshot;
