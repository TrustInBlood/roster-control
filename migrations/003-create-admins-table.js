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
    await queryInterface.createTable('admins', {
      // Auto-increment primary key
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: 'Auto-increment primary key'
      },
      
      // Discord User ID - Primary identifier
      discordUserId: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Discord user ID (unique identifier)'
      },
      
      // Discord Username - Current username for display
      discordUsername: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Current Discord username'
      },
      
      // Discord Display Name - Server nickname or global display name
      displayName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Server nickname or display name'
      },
      
      // Guild ID - Which Discord server this admin belongs to
      guildId: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Discord guild/server ID'
      },
      
      // Current Duty Status
      isOnDuty: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Current duty status (true = on duty, false = off duty)'
      },
      
      // Last Duty Change - When their duty status last changed
      lastDutyChange: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last duty status change'
      },
      
      // Total Duty Time - Cumulative time spent on duty (in minutes)
      totalDutyTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total time spent on duty in minutes'
      },
      
      // Admin Level - Role or permission level
      adminLevel: {
        type: DataTypes.ENUM('admin', 'moderator', 'senior_admin', 'super_admin'),
        allowNull: false,
        defaultValue: 'admin',
        comment: 'Admin permission level'
      },
      
      // Active Status - Whether the admin is still active
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this admin is still active'
      },
      
      // Permissions - JSON field for storing specific permissions
      permissions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Specific permissions for this admin (JSON format)'
      },
      
      // Notes - Admin notes about this user
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Administrative notes about this admin'
      },
      
      // Last Seen - When this admin was last active
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last admin activity'
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
      comment: 'Discord admin information and duty status tracking'
    });

    // Create indexes for performance (safely handling existing indexes)
    await safeAddIndex(queryInterface, 'admins', ['discordUserId'], {
      name: 'idx_admins_discord_user_id'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['guildId'], {
      name: 'idx_admins_guild_id'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['isOnDuty'], {
      name: 'idx_admins_duty_status'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['isActive'], {
      name: 'idx_admins_active'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['adminLevel'], {
      name: 'idx_admins_admin_level'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['lastDutyChange'], {
      name: 'idx_admins_last_duty_change'
    });
    
    await safeAddIndex(queryInterface, 'admins', ['lastSeen'], {
      name: 'idx_admins_last_seen'
    });
    
    // Composite index for guild queries
    await safeAddIndex(queryInterface, 'admins', ['guildId', 'isOnDuty'], {
      name: 'idx_admins_guild_duty'
    });
    
    // Composite index for active admins per guild
    await safeAddIndex(queryInterface, 'admins', ['guildId', 'isActive'], {
      name: 'idx_admins_guild_active'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('admins');
  }
};