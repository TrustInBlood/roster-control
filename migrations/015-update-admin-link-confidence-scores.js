'use strict';

/**
 * Migration: Update confidence scores for existing admin-created links
 * 
 * Changes:
 * - Updates admin-created links from 1.0 to 0.7 confidence
 * - Updates whitelist-created links from 1.0 to 0.5 confidence
 * - Preserves self-verified links at 1.0 confidence
 * - Preserves ticket-extracted links at 0.3 confidence
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Update admin-created links to 0.7 confidence
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 0.7 
         WHERE link_source = 'admin' 
         AND confidence_score > 0.7`,
        { transaction }
      );
      
      // Update whitelist-created links to 0.5 confidence
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 0.5 
         WHERE link_source = 'whitelist' 
         AND confidence_score > 0.5`,
        { transaction }
      );
      
      // Log the changes
      const [adminResults] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM player_discord_links WHERE link_source = 'admin'`,
        { transaction }
      );
      
      const [whitelistResults] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM player_discord_links WHERE link_source = 'whitelist'`,
        { transaction }
      );
      
      console.log(`Updated ${adminResults[0].count} admin-created links to 0.7 confidence`);
      console.log(`Updated ${whitelistResults[0].count} whitelist-created links to 0.5 confidence`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Revert admin-created links back to 1.0 confidence
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 1.0 
         WHERE link_source = 'admin' 
         AND confidence_score = 0.7`,
        { transaction }
      );
      
      // Revert whitelist-created links back to 1.0 confidence
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 1.0 
         WHERE link_source = 'whitelist' 
         AND confidence_score = 0.5`,
        { transaction }
      );
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};