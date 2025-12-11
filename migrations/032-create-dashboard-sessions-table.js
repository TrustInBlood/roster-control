'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('dashboard_sessions', {
      sid: {
        type: Sequelize.STRING(36),
        primaryKey: true
      },
      expires: {
        type: Sequelize.DATE,
        allowNull: true
      },
      data: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add index for session expiration cleanup
    await queryInterface.addIndex('dashboard_sessions', ['expires'], {
      name: 'idx_dashboard_sessions_expires'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('dashboard_sessions');
  }
};
