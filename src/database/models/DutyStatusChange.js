const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const DutyStatusChange = sequelize.define('DutyStatusChange', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  
  // Discord User ID
  discordUserId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Discord user ID who changed duty status'
  },
  
  // Discord Username (for easier identification)
  discordUsername: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Discord username at time of change'
  },
  
  // Status - true for on duty, false for off duty
  status: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    comment: 'Duty status: true = on duty, false = off duty'
  },
  
  // Previous Status
  previousStatus: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    comment: 'Previous duty status before this change'
  },
  
  // Source of the change (command, automatic, admin, etc.)
  source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'command',
    comment: 'Source that triggered the duty status change'
  },
  
  // Reason for the change
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Reason for the duty status change'
  },
  
  // Guild/Server ID where this happened
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Discord guild/server ID where change occurred'
  },
  
  // Channel ID if triggered from a specific channel
  channelId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Discord channel ID where change was triggered (if applicable)'
  },
  
  // Additional metadata as JSON
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata about the change (JSON format)'
  },
  
  // Success status of the change
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the duty status change was successful'
  },
  
  // Error message if the change failed
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if the change failed'
  }
}, {
  // Table name
  tableName: 'duty_status_changes',
  
  // Timestamps (createdAt, updatedAt)
  timestamps: true,
  
  // Indexes for performance
  indexes: [
    {
      name: 'idx_duty_changes_user_id',
      fields: ['discordUserId']
    },
    {
      name: 'idx_duty_changes_status',
      fields: ['status']
    },
    {
      name: 'idx_duty_changes_source',
      fields: ['source']
    },
    {
      name: 'idx_duty_changes_guild_id',
      fields: ['guildId']
    },
    {
      name: 'idx_duty_changes_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_duty_changes_success',
      fields: ['success']
    },
    {
      // Composite index for user activity queries
      name: 'idx_duty_changes_user_date',
      fields: ['discordUserId', 'createdAt']
    }
  ],
  
  // Comment for the table
  comment: 'Log of all duty status changes for audit and analytics'
});

// Instance methods
DutyStatusChange.prototype.getDurationSinceChange = function() {
  return Date.now() - this.createdAt.getTime();
};

// Static methods
DutyStatusChange.getUserHistory = function(discordUserId, limit = 50) {
  return this.findAll({
    where: { discordUserId },
    order: [['createdAt', 'DESC']],
    limit
  });
};

DutyStatusChange.getRecentChanges = function(hours = 24, limit = 100) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.findAll({
    where: {
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']],
    limit
  });
};

DutyStatusChange.getCurrentlyOnDuty = function(guildId) {
  // This would need a more complex query to get the latest status for each user
  // For now, returning a placeholder - would need to implement proper logic
  return this.findAll({
    where: {
      guildId,
      status: true
    },
    order: [['createdAt', 'DESC']]
  });
};

DutyStatusChange.getFailedChanges = function(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.findAll({
    where: {
      success: false,
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']]
  });
};

DutyStatusChange.getChangesBySource = function(source, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.findAll({
    where: {
      source,
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']]
  });
};

// Calculate total duty time for a user
DutyStatusChange.calculateDutyTime = async function(discordUserId, startDate = null, endDate = null, dutyType = 'admin') {
  const where = {
    discordUserId,
    success: true
  };

  // Add date range filtering
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = startDate;
    if (endDate) where.createdAt[Op.lte] = endDate;
  }

  // Fetch all duty status changes for this user
  const changes = await this.findAll({
    where,
    order: [['createdAt', 'ASC']]
  });

  // Filter by duty type from metadata
  const filteredChanges = changes.filter(change => {
    const changeDutyType = change.metadata?.dutyType || 'admin';
    return dutyType === 'both' || changeDutyType === dutyType;
  });

  // Deduplicate entries - remove external entries that have a matching command entry within 5 seconds
  const deduplicatedChanges = [];
  for (let i = 0; i < filteredChanges.length; i++) {
    const change = filteredChanges[i];

    // If this is an external change, check if there's a command change nearby
    if (change.source === 'external') {
      // Look for a command entry within 5 seconds with the same status
      const hasDuplicate = filteredChanges.some((other, j) => {
        if (i === j || other.source !== 'command') return false;
        const timeDiff = Math.abs(change.createdAt - other.createdAt);
        return timeDiff < 5000 && change.status === other.status;
      });

      // Skip this external entry if we found a duplicate command entry
      if (hasDuplicate) continue;
    }

    deduplicatedChanges.push(change);
  }

  let totalMs = 0;
  let sessions = [];
  let currentOnPeriod = null;

  for (const change of deduplicatedChanges) {
    if (change.status === true) {
      // ON duty event - start new session (only if not already on duty)
      if (!currentOnPeriod) {
        currentOnPeriod = {
          start: change.createdAt,
          startId: change.id
        };
      }
    } else if (change.status === false && currentOnPeriod) {
      // OFF duty event - calculate session duration
      const duration = change.createdAt - currentOnPeriod.start;
      totalMs += duration;
      sessions.push({
        start: currentOnPeriod.start,
        end: change.createdAt,
        duration: duration,
        startId: currentOnPeriod.startId,
        endId: change.id
      });
      currentOnPeriod = null;
    }
  }

  // Handle currently on duty (no OFF event yet)
  if (currentOnPeriod) {
    const now = endDate || new Date();
    const duration = now - currentOnPeriod.start;
    totalMs += duration;
    sessions.push({
      start: currentOnPeriod.start,
      end: null, // Still on duty
      duration: duration,
      startId: currentOnPeriod.startId,
      endId: null,
      isActive: true
    });
  }

  return {
    totalMs,
    totalHours: totalMs / (1000 * 60 * 60),
    sessions,
    sessionCount: sessions.length,
    averageSessionMs: sessions.length > 0 ? totalMs / sessions.length : 0,
    longestSessionMs: sessions.length > 0 ? Math.max(...sessions.map(s => s.duration)) : 0
  };
};

// Get duty time leaderboard for a guild
DutyStatusChange.getLeaderboard = async function(guildId, startDate = null, endDate = null, dutyType = 'admin', limit = 10) {
  const where = {
    guildId,
    success: true
  };

  // Add date range filtering
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = startDate;
    if (endDate) where.createdAt[Op.lte] = endDate;
  }

  // Get all unique users who have duty changes
  const changes = await this.findAll({
    where,
    attributes: ['discordUserId', 'discordUsername'],
    group: ['discordUserId', 'discordUsername']
  });

  // Calculate duty time for each user
  const leaderboard = [];
  for (const change of changes) {
    const stats = await this.calculateDutyTime(change.discordUserId, startDate, endDate, dutyType);
    if (stats.totalMs > 0) {
      leaderboard.push({
        discordUserId: change.discordUserId,
        discordUsername: change.discordUsername,
        ...stats
      });
    }
  }

  // Sort by total time descending
  leaderboard.sort((a, b) => b.totalMs - a.totalMs);

  // Limit results
  return leaderboard.slice(0, limit);
};

// Get guild-wide duty statistics
DutyStatusChange.getDutyStats = async function(guildId, startDate = null, endDate = null, dutyType = 'admin') {
  const leaderboard = await this.getLeaderboard(guildId, startDate, endDate, dutyType, 999999);

  const totalAdmins = leaderboard.length;
  const totalMs = leaderboard.reduce((sum, admin) => sum + admin.totalMs, 0);
  const totalSessions = leaderboard.reduce((sum, admin) => sum + admin.sessionCount, 0);

  return {
    totalAdmins,
    totalMs,
    totalHours: totalMs / (1000 * 60 * 60),
    totalSessions,
    averageHoursPerAdmin: totalAdmins > 0 ? (totalMs / (1000 * 60 * 60)) / totalAdmins : 0,
    averageSessionMs: totalSessions > 0 ? totalMs / totalSessions : 0,
    topAdmin: leaderboard[0] || null
  };
};

module.exports = DutyStatusChange;