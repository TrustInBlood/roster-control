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
    await queryInterface.createTable('servers', {
      // Auto-increment primary key
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: 'Auto-increment primary key'
      },
      
      // Server ID - Unique identifier for the Squad server
      serverId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Unique server identifier (e.g., server1, squad-main, etc.)'
      },
      
      // Server Name - Human-readable name
      serverName: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Human-readable server name'
      },
      
      // Server Description
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Server description or notes'
      },
      
      // SquadJS Connection Details
      squadjsHost: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'SquadJS host/IP address'
      },
      
      squadjsPort: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'SquadJS port number'
      },
      
      squadjsPassword: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'SquadJS authentication password (encrypted)'
      },
      
      // BattleMetrics Integration
      battlemetricsServerId: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'BattleMetrics server ID for API calls'
      },
      
      // RCON Connection Details
      rconHost: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'RCON host/IP address'
      },
      
      rconPort: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'RCON port number'
      },
      
      rconPassword: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'RCON password (encrypted)'
      },
      
      // Server Status
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this server is currently active'
      },
      
      isOnline: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Current server online status'
      },
      
      lastOnline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when server was last online'
      },
      
      // Server Configuration
      maxPlayers: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Maximum player capacity'
      },
      
      currentPlayers: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Current player count'
      },
      
      // Discord Integration
      guildId: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Discord guild/server ID this server belongs to'
      },
      
      // Roster/Whitelist Settings
      whitelistEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether whitelist is enabled on this server'
      },
      
      autoWhitelistSync: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether to automatically sync whitelist changes'
      },
      
      // Server Priority/Ordering
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Server priority for ordering (higher = more important)'
      },
      
      // Connection Health
      lastHealthCheck: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last health check'
      },
      
      healthStatus: {
        type: DataTypes.ENUM('healthy', 'warning', 'critical', 'offline'),
        allowNull: false,
        defaultValue: 'offline',
        comment: 'Current health status of the server'
      },
      
      // Statistics
      totalConnections: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of player connections to this server'
      },
      
      totalPlaytime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total playtime across all players (in minutes)'
      },
      
      // Configuration metadata
      config: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional server configuration (JSON format)'
      },
      
      // Notes
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Admin notes about this server'
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
      comment: 'Squad server configuration and status tracking'
    });

    // Create indexes for performance (safely handling existing indexes)
    await safeAddIndex(queryInterface, 'servers', ['serverId'], {
      name: 'idx_servers_server_id'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['guildId'], {
      name: 'idx_servers_guild_id'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['isActive'], {
      name: 'idx_servers_active'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['isOnline'], {
      name: 'idx_servers_online'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['healthStatus'], {
      name: 'idx_servers_health'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['priority'], {
      name: 'idx_servers_priority'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['battlemetricsServerId'], {
      name: 'idx_servers_battlemetrics'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['lastOnline'], {
      name: 'idx_servers_last_online'
    });
    
    await safeAddIndex(queryInterface, 'servers', ['whitelistEnabled'], {
      name: 'idx_servers_whitelist'
    });
    
    // Composite index for guild server queries
    await safeAddIndex(queryInterface, 'servers', ['guildId', 'isActive'], {
      name: 'idx_servers_guild_active'
    });
    
    // Composite index for priority ordering
    await safeAddIndex(queryInterface, 'servers', ['guildId', 'priority', 'isActive'], {
      name: 'idx_servers_guild_priority'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('servers');
  }
};