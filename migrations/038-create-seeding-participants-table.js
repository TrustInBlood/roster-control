'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('seeding_participants', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'seeding_sessions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Foreign key to seeding_sessions table'
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'players',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Foreign key to players table (null if player not in DB)'
      },
      steam_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Steam ID denormalized for quick lookup'
      },
      username: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Player username at time of participation'
      },
      participant_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Participant type: switcher (from source) or seeder (already on target)'
      },
      source_server_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Source server ID (null for seeders)'
      },
      source_join_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When player was first seen on source server'
      },
      source_leave_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When player left source server'
      },
      target_join_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When player joined target server'
      },
      target_leave_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When player left target server (for tracking)'
      },
      target_playtime_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Cumulative playtime on target server in minutes'
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'on_source',
        comment: 'Status: on_source, seeder, switched, playtime_met, completed'
      },
      confirmation_sent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether in-game confirmation was sent'
      },
      switch_rewarded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When switch reward was granted'
      },
      playtime_rewarded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When playtime reward was granted'
      },
      completion_rewarded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When completion reward was granted'
      },
      total_reward_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total whitelist reward time earned in minutes'
      },
      is_on_target: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether player is currently on target server'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional participant data (extensible)'
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
      comment: 'Participants in seeding sessions for reward tracking'
    });

    // Add indexes for performance
    await queryInterface.addIndex('seeding_participants', ['session_id'], {
      name: 'idx_seeding_participants_session'
    });

    await queryInterface.addIndex('seeding_participants', ['steam_id'], {
      name: 'idx_seeding_participants_steam_id'
    });

    await queryInterface.addIndex('seeding_participants', ['player_id'], {
      name: 'idx_seeding_participants_player_id'
    });

    await queryInterface.addIndex('seeding_participants', ['status'], {
      name: 'idx_seeding_participants_status'
    });

    await queryInterface.addIndex('seeding_participants', ['participant_type'], {
      name: 'idx_seeding_participants_type'
    });

    // Unique constraint: one participant per session per steam ID
    await queryInterface.addIndex('seeding_participants', ['session_id', 'steam_id'], {
      name: 'idx_seeding_participants_session_steam',
      unique: true
    });

    // Composite index for finding active participants on target
    await queryInterface.addIndex('seeding_participants', ['session_id', 'is_on_target'], {
      name: 'idx_seeding_participants_session_on_target'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('seeding_participants');
  }
};
