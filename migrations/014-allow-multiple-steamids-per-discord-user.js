'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Remove the unique constraint on discord_user_id to allow multiple Steam IDs per Discord user
    await queryInterface.removeIndex('player_discord_links', ['discord_user_id']);
    
    // Add a new unique constraint on the combination of discord_user_id + steamid64
    await queryInterface.addIndex('player_discord_links', ['discord_user_id', 'steamid64'], { 
      unique: true,
      name: 'player_discord_links_user_steamid_unique'
    });
    
    // Add regular index on discord_user_id for efficient queries
    await queryInterface.addIndex('player_discord_links', ['discord_user_id'], {
      name: 'player_discord_links_discord_user_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the composite unique constraint
    await queryInterface.removeIndex('player_discord_links', 'player_discord_links_user_steamid_unique');
    
    // Remove the discord_user_id index
    await queryInterface.removeIndex('player_discord_links', 'player_discord_links_discord_user_id');
    
    // Restore the original unique constraint on discord_user_id
    // Note: This will fail if there are multiple records per discord_user_id
    await queryInterface.addIndex('player_discord_links', ['discord_user_id'], { unique: true });
  }
};