const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const { console: loggerConsole } = require('../../utils/logger');

/**
 * AuditLog Action Types Reference
 *
 * This model supports arbitrary action types via STRING field.
 * Below is a comprehensive list of action types used throughout the system.
 *
 * ROLE & DUTY MANAGEMENT:
 * - ROLE_SYNC - Role changes synced to whitelist
 * - ROLE_SYNC_ERROR - Failed role sync
 * - DUTY_STATUS_CHANGE - Admin/tutor duty status changed
 *
 * WHITELIST OPERATIONS:
 * - WHITELIST_GRANT - Manual whitelist granted
 * - WHITELIST_EXTEND - Whitelist duration extended
 * - WHITELIST_REVOKE - Whitelist manually revoked
 * - WHITELIST_PERIODIC_CLEANUP - Departed members cleanup
 * - SECURITY_UPGRADE - Security-blocked entry auto-upgraded
 *
 * ACCOUNT LINKING:
 * - confidence_change - Link confidence score changed
 * - LINK_CREATED - New Steam-Discord link created
 * - LINK_UPGRADED - Link confidence upgraded
 * - LINK_REMOVED - Link deleted/unlinked
 *
 * MEMBER & STAFF SCRUBBING:
 * - SCRUB_PREVIEW - Admin previewed scrub candidates
 * - SCRUB_EXECUTED - Admin executed scrub operation
 * - MEMBER_SCRUB - Member role removed for unlinked account
 * - STAFF_SCRUB - Staff roles removed for unlinked account
 * - STAFF_ARCHIVE_CREATED - Staff role archive entry created
 * - STAFF_ROLES_RESTORED - Staff roles restored from archive
 * - BATTLEMETRICS_FLAG_REMOVED - BattleMetrics flag removed
 *
 * ADMINISTRATION:
 * - ADMIN_ACTION - Generic admin action
 * - PERMISSION_CHANGE - Permission level changed
 * - CONFIG_UPDATE - System configuration updated
 *
 * ERRORS & SECURITY:
 * - ERROR - General error occurred
 * - SECURITY_EVENT - Security-related event
 * - RATE_LIMIT_HIT - Rate limit exceeded
 */

const AuditLog = sequelize.define('AuditLog', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  
  // Action ID - Unique identifier for the action
  actionId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    defaultValue: DataTypes.UUIDV4,
    comment: 'Unique identifier for this action'
  },
  
  // Action Type - Type of action performed
  actionType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Type of action that was performed'
  },
  
  // Actor Information - Who performed the action
  actorType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'system',
    comment: 'Type of entity that performed the action'
  },
  
  actorId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'ID of the actor (Discord user ID, system process, etc.)'
  },
  
  actorName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Name of the actor for easier identification'
  },
  
  // Target Information - What was acted upon
  targetType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Type of entity that was acted upon'
  },
  
  targetId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'ID of the target entity'
  },
  
  targetName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Name of the target for easier identification'
  },
  
  // Context Information
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Discord guild/server ID where action occurred'
  },
  
  serverId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Squad server ID where action occurred (if applicable)'
  },
  
  channelId: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Discord channel ID where action was triggered (if applicable)'
  },
  
  // Action Details
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable description of the action'
  },
  
  // Before and After states (for modifications)
  beforeState: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'State before the action (JSON format)'
  },
  
  afterState: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'State after the action (JSON format)'
  },
  
  // Additional metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata about the action (JSON format)'
  },
  
  // Result Information
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the action was successful'
  },
  
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if the action failed'
  },
  
  // Severity Level
  severity: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'info',
    comment: 'Severity level of the action'
  },
  
  // IP Address (for security tracking)
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'IP address of the actor (if available)'
  },
  
  // User Agent (for web/API actions)
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User agent string (if applicable)'
  },
  
  // Duration (for performance tracking)
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Action duration in milliseconds'
  },
  
  // Related Action ID (for linking related actions)
  relatedActionId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'ID of related action (for action chains)'
  }
}, {
  // Table name
  tableName: 'audit_logs',
  
  // Timestamps (createdAt, updatedAt)
  timestamps: true,
  
  // Indexes for performance
  indexes: [
    {
      name: 'idx_audit_logs_action_id',
      fields: ['actionId']
    },
    {
      name: 'idx_audit_logs_action_type',
      fields: ['actionType']
    },
    {
      name: 'idx_audit_logs_actor_type',
      fields: ['actorType']
    },
    {
      name: 'idx_audit_logs_actor_id',
      fields: ['actorId']
    },
    {
      name: 'idx_audit_logs_target_type',
      fields: ['targetType']
    },
    {
      name: 'idx_audit_logs_target_id',
      fields: ['targetId']
    },
    {
      name: 'idx_audit_logs_guild_id',
      fields: ['guildId']
    },
    {
      name: 'idx_audit_logs_server_id',
      fields: ['serverId']
    },
    {
      name: 'idx_audit_logs_success',
      fields: ['success']
    },
    {
      name: 'idx_audit_logs_severity',
      fields: ['severity']
    },
    {
      name: 'idx_audit_logs_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_audit_logs_related_action',
      fields: ['relatedActionId']
    },
    {
      // Composite index for actor activity queries
      name: 'idx_audit_logs_actor_date',
      fields: ['actorId', 'createdAt']
    },
    {
      // Composite index for target activity queries
      name: 'idx_audit_logs_target_date',
      fields: ['targetId', 'createdAt']
    },
    {
      // Composite index for guild activity queries
      name: 'idx_audit_logs_guild_date',
      fields: ['guildId', 'createdAt']
    },
    {
      // Composite index for server activity queries
      name: 'idx_audit_logs_server_date',
      fields: ['serverId', 'createdAt']
    },
    {
      // Composite index for error tracking
      name: 'idx_audit_logs_errors',
      fields: ['success', 'severity', 'createdAt']
    }
  ],
  
  // Comment for the table
  comment: 'Comprehensive audit log for all system actions'
});

// Instance methods
AuditLog.prototype.getFormattedAction = function() {
  const actor = this.actorName || this.actorId || 'System';
  const target = this.targetName || this.targetId || 'Unknown';
  return `${actor} ${this.actionType.replace('_', ' ')} ${target}`;
};

AuditLog.prototype.getDuration = function() {
  return this.duration ? `${this.duration}ms` : null;
};

AuditLog.prototype.isError = function() {
  return !this.success || this.severity === 'error' || this.severity === 'critical';
};

// Static methods
AuditLog.logAction = async function(actionData) {
  try {
    const log = await this.create({
      ...actionData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return log;
  } catch (error) {
    loggerConsole.error('Failed to create audit log entry:', error);
    throw error;
  }
};

AuditLog.getActionsByActor = function(actorId, limit = 100) {
  return this.findAll({
    where: { actorId },
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getActionsByTarget = function(targetId, targetType = null, limit = 100) {
  const where = { targetId };
  if (targetType) where.targetType = targetType;
  
  return this.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getActionsByType = function(actionType, hours = 24, limit = 100) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.findAll({
    where: {
      actionType,
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getRecentActions = function(hours = 24, guildId = null, limit = 100) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { createdAt: { [Op.gte]: cutoff } };
  
  if (guildId) where.guildId = guildId;
  
  return this.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getFailedActions = function(hours = 24, limit = 100) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.findAll({
    where: {
      success: false,
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getActionsBySeverity = function(severity, hours = 24, limit = 100) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.findAll({
    where: {
      severity,
      createdAt: { [Op.gte]: cutoff }
    },
    order: [['createdAt', 'DESC']],
    limit
  });
};

AuditLog.getRelatedActions = function(actionId) {
  return this.findAll({
    where: {
      [Op.or]: [
        { relatedActionId: actionId },
        { actionId: actionId }
      ]
    },
    order: [['createdAt', 'ASC']]
  });
};

AuditLog.getActionStatistics = async function(hours = 24, guildId = null) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { createdAt: { [Op.gte]: cutoff } };
  
  if (guildId) where.guildId = guildId;
  
  const [total, successful, failed] = await Promise.all([
    this.count({ where }),
    this.count({ where: { ...where, success: true } }),
    this.count({ where: { ...where, success: false } })
  ]);
  
  return { total, successful, failed, successRate: total > 0 ? (successful / total) * 100 : 0 };
};

module.exports = AuditLog;