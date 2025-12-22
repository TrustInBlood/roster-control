'use strict';

/**
 * Migration: Create duty_lifetime_stats table
 *
 * This table tracks cumulative activity stats for each user, independent of sessions.
 * Activities are credited even when users are not on duty (e.g., responding to tickets).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('duty_lifetime_stats', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      discord_user_id: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      guild_id: {
        type: Sequelize.STRING(20),
        allowNull: false
      },

      // Cumulative time stats (in minutes)
      total_duty_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_voice_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      // Cumulative activity counts
      total_ticket_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_admin_cam_events: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_ingame_chat_messages: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      // Cumulative points
      total_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      // Session counts
      total_sessions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      // Off-duty contributions (activities credited without a session)
      off_duty_ticket_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      off_duty_voice_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      off_duty_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Add unique constraint for user per guild
    await queryInterface.addIndex('duty_lifetime_stats', ['discord_user_id', 'guild_id'], {
      unique: true,
      name: 'idx_lifetime_stats_user_guild'
    });

    // Add index for leaderboard queries
    await queryInterface.addIndex('duty_lifetime_stats', ['guild_id', 'total_points'], {
      name: 'idx_lifetime_stats_leaderboard'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('duty_lifetime_stats');
  }
};
