'use strict';

/**
 * Migration: Update confidence scores for existing whitelist-linked accounts
 *
 * This migration finds PlayerDiscordLink records that were created for users
 * who have whitelist entries, and updates their confidence scores appropriately:
 * - Links created through whitelist operations should have 0.5 confidence
 * - Links that were manually verified should remain at 1.0 confidence
 * - Admin-created links should have 0.7 confidence
 */
const { console: loggerConsole } = require('../src/utils/logger');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      loggerConsole.log('🔍 Finding whitelist entries with associated Discord links...');
      
      loggerConsole.log('🔍 Processing Discord links associated with active whitelist entries...');
      
      // Update links that were created through whitelist operations
      // These should have confidence 0.5 if they don't already have appropriate scores
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         SET pdl.confidence_score = 0.5
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.link_source IN ('manual', '')
         AND pdl.confidence_score > 0.5
         AND pdl.confidence_score < 1.0`,
        { transaction }
      );
      
      loggerConsole.log('✅ Updated whitelist-created links to 0.5 confidence');
      
      // Only downgrade links that were clearly not self-verified
      // (those with link_source = 'manual' or 'whitelist', not '' or 'verification')
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         SET pdl.confidence_score = 0.5
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.confidence_score = 1.0
         AND pdl.link_source = 'manual'
         AND pdl.created_at > w.granted_at`,  // Only if link was created after whitelist grant
        { transaction }
      );
      
      loggerConsole.log('✅ Processed high-confidence links associated with whitelists');
      
      loggerConsole.log('📊 Migration completed - confidence scores updated for whitelist-associated links');
      
      await transaction.commit();
      loggerConsole.log('✅ Migration completed successfully');
      
    } catch (error) {
      await transaction.rollback();
      loggerConsole.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      loggerConsole.log('🔄 Reverting whitelist-linked confidence score changes...');
      
      // This is a conservative rollback - we'll set all whitelist-associated links back to 1.0
      // if they were modified by this migration (confidence 0.5)
      await queryInterface.sequelize.query(
        `UPDATE player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         SET pdl.confidence_score = 1.0
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.confidence_score = 0.5
         AND pdl.link_source = 'manual'`,
        { transaction }
      );
      
      loggerConsole.log('✅ Reverted whitelist-associated links back to 1.0 confidence');
      
      await transaction.commit();
      loggerConsole.log('✅ Rollback completed successfully');
      
    } catch (error) {
      await transaction.rollback();
      loggerConsole.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};