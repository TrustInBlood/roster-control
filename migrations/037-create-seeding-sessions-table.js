'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('seeding_sessions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      target_server_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Server identifier needing players'
      },
      target_server_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached server name for display'
      },
      player_threshold: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Player count threshold to close seeding'
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Session status: active, completed, cancelled'
      },
      switch_reward_value: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Immediate reward value for switching (null = disabled)'
      },
      switch_reward_unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Reward unit: hours, days, months'
      },
      playtime_reward_value: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Reward value for meeting playtime threshold (null = disabled)'
      },
      playtime_reward_unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Reward unit: hours, days, months'
      },
      playtime_threshold_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Minutes required for playtime reward'
      },
      completion_reward_value: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Reward value for being present at threshold (null = disabled)'
      },
      completion_reward_unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Reward unit: hours, days, months'
      },
      source_server_ids: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of source server IDs'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the seeding session started'
      },
      closed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the session was closed (threshold reached or manual)'
      },
      started_by: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Discord user ID who started the session'
      },
      started_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of who started the session'
      },
      participants_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of participants'
      },
      rewards_granted_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of rewards successfully granted'
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
      comment: 'Cross-server seeding sessions for whitelist rewards'
    });

    // Add indexes for performance
    await queryInterface.addIndex('seeding_sessions', ['status'], {
      name: 'idx_seeding_sessions_status'
    });

    await queryInterface.addIndex('seeding_sessions', ['target_server_id'], {
      name: 'idx_seeding_sessions_target_server'
    });

    await queryInterface.addIndex('seeding_sessions', ['started_at'], {
      name: 'idx_seeding_sessions_started_at'
    });

    // Composite index for finding active sessions
    await queryInterface.addIndex('seeding_sessions', ['status', 'target_server_id'], {
      name: 'idx_seeding_sessions_status_target'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('seeding_sessions');
  }
};
