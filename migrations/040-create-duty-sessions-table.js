'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('duty_sessions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      discord_user_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord user ID of the staff member'
      },
      discord_username: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Cached Discord username at session start'
      },
      duty_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'admin',
        comment: 'Type of duty: admin, tutor'
      },
      guild_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord guild ID'
      },
      session_start: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the duty session started'
      },
      session_end: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the duty session ended (null if active)'
      },
      duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Total duration in minutes (calculated on end)'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether the session is currently active'
      },
      end_reason: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'How session ended: manual, auto_timeout, role_removed, server_restart'
      },
      base_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Points from base time on duty'
      },
      bonus_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Points from activities (voice, tickets, etc)'
      },
      total_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total points for this session'
      },
      voice_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Minutes spent in tracked voice channels'
      },
      ticket_responses: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of ticket channel responses'
      },
      admin_cam_events: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of admin cam uses (SquadJS)'
      },
      ingame_chat_messages: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of in-game chat messages (SquadJS)'
      },
      warning_sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When auto-timeout warning was sent'
      },
      timeout_extended_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When timeout was extended due to activity'
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
      comment: 'Duty sessions with activity tracking and points'
    });

    // Index for finding user sessions
    await queryInterface.addIndex('duty_sessions', ['discord_user_id'], {
      name: 'idx_duty_sessions_user'
    });

    // Index for finding active sessions
    await queryInterface.addIndex('duty_sessions', ['is_active'], {
      name: 'idx_duty_sessions_active'
    });

    // Composite index for finding active sessions by user
    await queryInterface.addIndex('duty_sessions', ['discord_user_id', 'is_active'], {
      name: 'idx_duty_sessions_user_active'
    });

    // Index for session start time (for period queries)
    await queryInterface.addIndex('duty_sessions', ['session_start'], {
      name: 'idx_duty_sessions_start'
    });

    // Index for guild queries
    await queryInterface.addIndex('duty_sessions', ['guild_id'], {
      name: 'idx_duty_sessions_guild'
    });

    // Composite for duty type queries
    await queryInterface.addIndex('duty_sessions', ['duty_type', 'is_active'], {
      name: 'idx_duty_sessions_type_active'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('duty_sessions');
  }
};
