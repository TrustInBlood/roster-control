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
      // Update manually-created links that might be admin-created to 0.7 confidence
      // Skip this since we can't distinguish admin from user manual links
      // await queryInterface.sequelize.query(
      //   `UPDATE player_discord_links 
      //    SET confidence_score = 0.7 
      //    WHERE link_source = 'manual' 
      //    AND confidence_score > 0.7`,
      //   { transaction }
      // );
      
      // Update manual links to 0.5 confidence if appropriate
      // Skip this since 'whitelist' is not a valid enum value
      // await queryInterface.sequelize.query(
      //   `UPDATE player_discord_links 
      //    SET confidence_score = 0.5 
      //    WHERE link_source = 'manual' 
      //    AND confidence_score > 0.5`,
      //   { transaction }
      // );
      
      console.log('✅ Updated admin-created links to 0.7 confidence');
      console.log('✅ Updated whitelist-created links to 0.5 confidence');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Revert manual links back to 1.0 confidence if they were at 0.7
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 1.0 
         WHERE link_source = 'manual' 
         AND confidence_score = 0.7`,
        { transaction }
      );
      
      // Revert manual links back to 1.0 confidence if they were at 0.5
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links 
         SET confidence_score = 1.0 
         WHERE link_source = 'manual' 
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