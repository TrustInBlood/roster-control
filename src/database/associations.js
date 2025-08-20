const { Player, DutyStatusChange, Admin, Server, AuditLog } = require('./models');

// Define model associations/relationships
function defineAssociations() {
  // Player relationships
  Player.belongsTo(Server, {
    foreignKey: 'lastServerId',
    targetKey: 'serverId',
    as: 'lastServer',
    constraints: false // Since lastServerId is optional and might not always reference a server in our DB
  });
  
  Player.hasMany(AuditLog, {
    foreignKey: 'targetId',
    constraints: false,
    scope: {
      targetType: 'player'
    },
    as: 'auditLogs'
  });

  // Admin relationships
  Admin.hasMany(DutyStatusChange, {
    foreignKey: 'discordUserId',
    sourceKey: 'discordUserId',
    as: 'dutyChanges'
  });

  Admin.hasMany(AuditLog, {
    foreignKey: 'actorId',
    sourceKey: 'discordUserId',
    constraints: false,
    as: 'performedActions'
  });

  Admin.hasMany(AuditLog, {
    foreignKey: 'targetId',
    sourceKey: 'discordUserId',
    constraints: false,
    scope: {
      targetType: 'admin'
    },
    as: 'auditLogs'
  });

  // Server relationships
  Server.hasMany(Player, {
    foreignKey: 'lastServerId',
    sourceKey: 'serverId',
    as: 'players',
    constraints: false
  });

  Server.hasMany(AuditLog, {
    foreignKey: 'serverId',
    sourceKey: 'serverId',
    as: 'auditLogs',
    constraints: false
  });

  // DutyStatusChange relationships
  DutyStatusChange.belongsTo(Admin, {
    foreignKey: 'discordUserId',
    targetKey: 'discordUserId',
    as: 'admin',
    constraints: false // Admin might not exist in our Admin table yet
  });

  DutyStatusChange.hasMany(AuditLog, {
    foreignKey: 'relatedActionId',
    sourceKey: 'id',
    constraints: false,
    as: 'relatedAuditLogs'
  });

  // AuditLog relationships
  AuditLog.belongsTo(AuditLog, {
    foreignKey: 'relatedActionId',
    targetKey: 'actionId',
    as: 'relatedAction',
    constraints: false
  });

  AuditLog.hasMany(AuditLog, {
    foreignKey: 'relatedActionId',
    sourceKey: 'actionId',
    as: 'childActions',
    constraints: false
  });

  // Polymorphic relationships for AuditLog
  // Note: These are handled through constraints: false and scopes above
  // since Sequelize doesn't have native polymorphic support

  console.log('✅ Database model associations defined successfully');
}

module.exports = {
  defineAssociations
};