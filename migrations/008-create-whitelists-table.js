'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('whitelists', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Either "staff" or "whitelist"'
      },
      steamid64: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      eosID: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      username: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      discord_username: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      group_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      expiration: {
        type: Sequelize.DATE,
        allowNull: true
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Why this entry exists (e.g., "staff", "donor", "event admin")'
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
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes for performance
    await queryInterface.addIndex('whitelists', ['type', 'approved']);
    await queryInterface.addIndex('whitelists', ['steamid64']);
    await queryInterface.addIndex('whitelists', ['eosID']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('whitelists');
  }
};