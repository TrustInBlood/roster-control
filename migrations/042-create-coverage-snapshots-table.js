'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('coverage_snapshots', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      snapshot_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When this snapshot was taken'
      },
      guild_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord guild ID'
      },
      admins_on_duty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of admins with on-duty role'
      },
      tutors_on_duty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of tutors with on-duty role'
      },
      admins_in_voice: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of on-duty admins in voice channels'
      },
      admins_in_game: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of on-duty admins playing on servers'
      },
      active_admin_ids: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of Discord user IDs currently on duty (admin)'
      },
      active_tutor_ids: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of Discord user IDs currently on duty (tutor)'
      },
      server_coverage: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Per-server breakdown: [{serverId, adminCount, playerCount}]'
      },
      coverage_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Calculated coverage score for this snapshot'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional snapshot data'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Hourly coverage snapshots for analytics'
    });

    // Index for time-based queries
    await queryInterface.addIndex('coverage_snapshots', ['snapshot_time'], {
      name: 'idx_coverage_snapshots_time'
    });

    // Index for guild queries
    await queryInterface.addIndex('coverage_snapshots', ['guild_id'], {
      name: 'idx_coverage_snapshots_guild'
    });

    // Composite for guild + time range queries
    await queryInterface.addIndex('coverage_snapshots', ['guild_id', 'snapshot_time'], {
      name: 'idx_coverage_snapshots_guild_time'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('coverage_snapshots');
  }
};
