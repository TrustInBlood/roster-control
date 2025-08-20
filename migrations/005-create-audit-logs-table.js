const { DataTypes } = require('sequelize');

// Helper function to safely create indexes
async function safeAddIndex(queryInterface, tableName, fields, options) {
  try {
    await queryInterface.addIndex(tableName, fields, options);
  } catch (error) {
    if (error.original?.code === 'ER_DUP_KEYNAME') {
      console.log(`  ℹ️ Index ${options.name} already exists on ${tableName}`);
    } else {
      throw error;
    }
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
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
        type: DataTypes.ENUM(
          'roster_add', 'roster_remove', 'roster_modify',
          'admin_duty_on', 'admin_duty_off', 'admin_create', 'admin_modify', 'admin_deactivate',
          'server_add', 'server_modify', 'server_status_change', 'server_health_check',
          'player_join', 'player_leave', 'player_activity', 'player_modify',
          'whitelist_sync', 'database_migration', 'system_startup', 'system_error',
          'command_executed', 'permission_denied', 'authentication_failure',
          'config_change', 'backup_created', 'data_pruned', 'manual_intervention'
        ),
        allowNull: false,
        comment: 'Type of action that was performed'
      },
      
      // Actor Information - Who performed the action
      actorType: {
        type: DataTypes.ENUM('user', 'admin', 'system', 'external', 'scheduled', 'webhook'),
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
        type: DataTypes.ENUM('player', 'admin', 'server', 'whitelist', 'role', 'channel', 'config', 'system'),
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
        type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
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
      },
      
      // Timestamps
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Comprehensive audit log for all system actions'
    });

    // Create indexes for performance (safely handling existing indexes)
    await safeAddIndex(queryInterface, 'audit_logs', ['actionId'], {
      name: 'idx_audit_logs_action_id'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['actionType'], {
      name: 'idx_audit_logs_action_type'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['actorType'], {
      name: 'idx_audit_logs_actor_type'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['actorId'], {
      name: 'idx_audit_logs_actor_id'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['targetType'], {
      name: 'idx_audit_logs_target_type'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['targetId'], {
      name: 'idx_audit_logs_target_id'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['guildId'], {
      name: 'idx_audit_logs_guild_id'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['serverId'], {
      name: 'idx_audit_logs_server_id'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['success'], {
      name: 'idx_audit_logs_success'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['severity'], {
      name: 'idx_audit_logs_severity'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['createdAt'], {
      name: 'idx_audit_logs_created_at'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['relatedActionId'], {
      name: 'idx_audit_logs_related_action'
    });
    
    // Composite indexes for common query patterns
    await safeAddIndex(queryInterface, 'audit_logs', ['actorId', 'createdAt'], {
      name: 'idx_audit_logs_actor_date'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['targetId', 'createdAt'], {
      name: 'idx_audit_logs_target_date'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['guildId', 'createdAt'], {
      name: 'idx_audit_logs_guild_date'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['serverId', 'createdAt'], {
      name: 'idx_audit_logs_server_date'
    });
    
    await safeAddIndex(queryInterface, 'audit_logs', ['success', 'severity', 'createdAt'], {
      name: 'idx_audit_logs_errors'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('audit_logs');
  }
};