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
    await queryInterface.createTable('players', {
      // Auto-increment primary key
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: 'Auto-increment primary key'
      },
      
      // Steam ID - Unique Steam identifier
      steamId: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Steam ID (Steam64 format)'
      },
      
      // EOS ID - Epic Online Services identifier (important for Squad)
      eosId: {
        type: DataTypes.STRING(34),
        allowNull: false,
        unique: true,
        comment: 'Epic Online Services ID (EOS)'
      },
      
      // Username - Current player name
      username: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Current player username'
      },
      
      // Roster Status - Boolean indicating whitelist status
      rosterStatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether player is on the whitelist/roster'
      },
      
      // Last Seen - Timestamp of last activity
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last player activity'
      },
      
      // Last Server - ID of the last server the player was on
      lastServerId: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'ID of the last server the player was on'
      },
      
      // Join Count - Number of times player has joined
      joinCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of times player has joined servers'
      },
      
      // Total Play Time - Cumulative play time in minutes
      totalPlayTime: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total play time in minutes'
      },
      
      // Notes - Admin notes about the player
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Admin notes about the player'
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
      comment: 'Player roster and activity tracking'
    });

    // Create indexes for performance (safely handling existing indexes)
    await safeAddIndex(queryInterface, 'players', ['steamId'], {
      name: 'idx_players_steam_id'
    });
    
    await safeAddIndex(queryInterface, 'players', ['eosId'], {
      name: 'idx_players_eos_id'
    });
    
    await safeAddIndex(queryInterface, 'players', ['username'], {
      name: 'idx_players_username'
    });
    
    await safeAddIndex(queryInterface, 'players', ['rosterStatus'], {
      name: 'idx_players_roster_status'
    });
    
    await safeAddIndex(queryInterface, 'players', ['lastSeen'], {
      name: 'idx_players_last_seen'
    });
    
    await safeAddIndex(queryInterface, 'players', ['lastServerId'], {
      name: 'idx_players_last_server'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('players');
  }
};