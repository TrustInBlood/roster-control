'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('player_sessions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'players',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Foreign key to players table'
      },
      serverId: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Server identifier where session occurred'
      },
      sessionStart: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Timestamp when player joined'
      },
      sessionEnd: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Timestamp when player left (null if still active)'
      },
      durationMinutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Session duration in minutes (calculated on end)'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether session is currently active'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional session data (extensible)'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Player session tracking for playtime calculation'
    });

    // Add indexes for performance
    await queryInterface.addIndex('player_sessions', ['player_id'], {
      name: 'idx_player_sessions_player_id'
    });

    await queryInterface.addIndex('player_sessions', ['serverId'], {
      name: 'idx_player_sessions_server_id'
    });

    await queryInterface.addIndex('player_sessions', ['sessionStart'], {
      name: 'idx_player_sessions_start'
    });

    await queryInterface.addIndex('player_sessions', ['isActive'], {
      name: 'idx_player_sessions_active'
    });

    // Composite indexes for common queries
    await queryInterface.addIndex('player_sessions', ['player_id', 'isActive'], {
      name: 'idx_player_sessions_player_active'
    });

    await queryInterface.addIndex('player_sessions', ['serverId', 'isActive'], {
      name: 'idx_player_sessions_server_active'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('player_sessions');
  }
};
