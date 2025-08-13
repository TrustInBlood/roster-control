const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../index');

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
    type: DataTypes.ENUM('command', 'automatic', 'admin', 'voice_state', 'manual', 'external', 'startup_sync', 'manual_sync'),
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

module.exports = DutyStatusChange;