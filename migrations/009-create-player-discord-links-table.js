'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('player_discord_links', {
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
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add unique constraint for discord_user_id
    await queryInterface.addIndex('player_discord_links', ['discord_user_id'], { unique: true });
    await queryInterface.addIndex('player_discord_links', ['steamid64']);
    await queryInterface.addIndex('player_discord_links', ['eosID']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('player_discord_links');
  }
};