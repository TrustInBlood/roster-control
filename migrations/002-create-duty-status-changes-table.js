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
    await queryInterface.createTable('duty_status_changes', {
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
      comment: 'Log of all duty status changes for audit and analytics'
    });

    // Create indexes for performance (safely handling existing indexes)
    await safeAddIndex(queryInterface, 'duty_status_changes', ['discordUserId'], {
      name: 'idx_duty_changes_user_id'
    });
    
    await safeAddIndex(queryInterface, 'duty_status_changes', ['status'], {
      name: 'idx_duty_changes_status'
    });
    
    await safeAddIndex(queryInterface, 'duty_status_changes', ['source'], {
      name: 'idx_duty_changes_source'
    });
    
    await safeAddIndex(queryInterface, 'duty_status_changes', ['guildId'], {
      name: 'idx_duty_changes_guild_id'
    });
    
    await safeAddIndex(queryInterface, 'duty_status_changes', ['createdAt'], {
      name: 'idx_duty_changes_created_at'
    });
    
    await safeAddIndex(queryInterface, 'duty_status_changes', ['success'], {
      name: 'idx_duty_changes_success'
    });
    
    // Composite index for user activity queries
    await safeAddIndex(queryInterface, 'duty_status_changes', ['discordUserId', 'createdAt'], {
      name: 'idx_duty_changes_user_date'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('duty_status_changes');
  }
};