'use strict';

/**
 * Migration to update duty_activity_events table for off-duty activity tracking
 *
 * Changes:
 * - Make session_id nullable (for off-duty events)
 * - Add guild_id column (required when no session)
 * - Add is_on_duty boolean column for easy filtering
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Make session_id nullable
    await queryInterface.changeColumn('duty_activity_events', 'session_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'duty_sessions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Reference to the duty session (NULL for off-duty events)'
    });

    // 2. Add guild_id column
    await queryInterface.addColumn('duty_activity_events', 'guild_id', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'discord_user_id',
      comment: 'Discord guild ID (required for off-duty events, can be derived from session for on-duty)'
    });

    // 3. Add is_on_duty column
    await queryInterface.addColumn('duty_activity_events', 'is_on_duty', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'guild_id',
      comment: 'Whether this activity occurred during a duty session'
    });

    // 4. Add index for guild_id queries
    await queryInterface.addIndex('duty_activity_events', ['guild_id'], {
      name: 'idx_duty_activity_guild'
    });

    // 5. Add index for on/off duty filtering
    await queryInterface.addIndex('duty_activity_events', ['is_on_duty'], {
      name: 'idx_duty_activity_on_duty'
    });

    // 6. Add composite index for period queries by user
    await queryInterface.addIndex('duty_activity_events', ['discord_user_id', 'event_timestamp'], {
      name: 'idx_duty_activity_user_time'
    });

    // 7. Add composite index for guild period queries
    await queryInterface.addIndex('duty_activity_events', ['guild_id', 'event_timestamp'], {
      name: 'idx_duty_activity_guild_time'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('duty_activity_events', 'idx_duty_activity_guild_time');
    await queryInterface.removeIndex('duty_activity_events', 'idx_duty_activity_user_time');
    await queryInterface.removeIndex('duty_activity_events', 'idx_duty_activity_on_duty');
    await queryInterface.removeIndex('duty_activity_events', 'idx_duty_activity_guild');

    // Remove columns
    await queryInterface.removeColumn('duty_activity_events', 'is_on_duty');
    await queryInterface.removeColumn('duty_activity_events', 'guild_id');

    // Revert session_id to NOT NULL
    await queryInterface.changeColumn('duty_activity_events', 'session_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'duty_sessions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Reference to the duty session'
    });
  }
};
