'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('unlink_history', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      discord_user_id: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      steamid64: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      eosID: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      username: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      unlinked_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional audit note, e.g., user request or admin action'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes for audit queries
    await queryInterface.addIndex('unlink_history', ['discord_user_id']);
    await queryInterface.addIndex('unlink_history', ['unlinked_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('unlink_history');
  }
};