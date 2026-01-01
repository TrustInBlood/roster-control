'use strict';

/**
 * Migration: Create user_preferences table
 * Stores user dashboard customization preferences with JSON column
 * Supports cross-device sync via discord_user_id
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_preferences', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      discord_user_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Discord user ID for cross-device sync'
      },
      preferences: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
        comment: 'User preferences JSON (dashboard sections, etc.)'
      },
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
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add index on discord_user_id for fast lookups
    await queryInterface.addIndex('user_preferences', ['discord_user_id'], {
      unique: true,
      name: 'idx_user_preferences_discord_user_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_preferences');
  }
};
