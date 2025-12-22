'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('duty_activity_events', {
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
          model: 'duty_sessions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to the duty session'
      },
      discord_user_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord user ID (denormalized for faster queries)'
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Type: voice_join, voice_leave, ticket_response, admin_cam, ingame_chat'
      },
      event_timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the event occurred'
      },
      channel_id: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord channel ID for voice/ticket events'
      },
      server_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Squad server ID for in-game events'
      },
      points_awarded: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Points awarded for this activity'
      },
      duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration for voice sessions (on voice_leave)'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional event data (channel name, message preview, etc)'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Granular activity events for duty sessions'
    });

    // Index for session lookups
    await queryInterface.addIndex('duty_activity_events', ['session_id'], {
      name: 'idx_duty_activity_session'
    });

    // Index for user activity history
    await queryInterface.addIndex('duty_activity_events', ['discord_user_id'], {
      name: 'idx_duty_activity_user'
    });

    // Index for event type queries
    await queryInterface.addIndex('duty_activity_events', ['event_type'], {
      name: 'idx_duty_activity_type'
    });

    // Index for timestamp queries
    await queryInterface.addIndex('duty_activity_events', ['event_timestamp'], {
      name: 'idx_duty_activity_timestamp'
    });

    // Composite for recent activity by type
    await queryInterface.addIndex('duty_activity_events', ['session_id', 'event_type'], {
      name: 'idx_duty_activity_session_type'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('duty_activity_events');
  }
};
