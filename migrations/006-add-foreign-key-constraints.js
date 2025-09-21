const { DataTypes } = require('sequelize');
const { console: loggerConsole } = require('../src/utils/logger');

// Helper function to safely create indexes
async function safeAddIndex(queryInterface, tableName, fields, options) {
  try {
    await queryInterface.addIndex(tableName, fields, options);
  } catch (error) {
    if (error.original?.code === 'ER_DUP_KEYNAME') {
      loggerConsole.log(`  ℹ️ Index ${options.name} already exists on ${tableName}`);
    } else {
      throw error;
    }
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add foreign key constraint for DutyStatusChange -> Admin
    // Note: We use constraint: false in the model, but we can add indexes for performance
    
    // Add index for DutyStatusChange.discordUserId referencing Admin.discordUserId
    await safeAddIndex(queryInterface, 'duty_status_changes', ['discordUserId'], {
      name: 'idx_duty_changes_admin_reference'
    });
    
    // Add index for Player.lastServerId referencing Server.serverId  
    await safeAddIndex(queryInterface, 'players', ['lastServerId'], {
      name: 'idx_players_server_reference'
    });
    
    // Add index for AuditLog.actorId (can reference Admin.discordUserId)
    await safeAddIndex(queryInterface, 'audit_logs', ['actorId'], {
      name: 'idx_audit_logs_actor_reference'
    });
    
    // Add index for AuditLog.serverId referencing Server.serverId
    await safeAddIndex(queryInterface, 'audit_logs', ['serverId'], {
      name: 'idx_audit_logs_server_reference'
    });
    
    // Add compound indexes for polymorphic relationships
    await safeAddIndex(queryInterface, 'audit_logs', ['targetType', 'targetId'], {
      name: 'idx_audit_logs_polymorphic_target'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['actorType', 'actorId'], {
      name: 'idx_audit_logs_polymorphic_actor'
    });
    
    // Add index for related actions
    await safeAddIndex(queryInterface, 'audit_logs', ['relatedActionId', 'actionId'], {
      name: 'idx_audit_logs_action_chain'
    });
    
    loggerConsole.log('✅ Foreign key indexes and constraints added successfully');
  },

  async down(queryInterface, Sequelize) {
    // Remove the indexes we added
    await queryInterface.removeIndex('duty_status_changes', 'idx_duty_changes_admin_reference');
    await queryInterface.removeIndex('players', 'idx_players_server_reference');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_actor_reference');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_server_reference');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_polymorphic_target');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_polymorphic_actor');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_action_chain');
  }
};