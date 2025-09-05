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

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔍 Finding whitelist entries with associated Discord links...');
      
      // First, get a count of what we're working with
      const [countResults] = await queryInterface.sequelize.query(
        `SELECT COUNT(DISTINCT pdl.id) as total_links
         FROM player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         WHERE w.approved = true AND w.revoked = false`,
        { transaction }
      );
      
      console.log(`Found ${countResults[0].total_links} Discord links associated with active whitelist entries`);
      
      // Update links that were created through whitelist operations
      // These should have confidence 0.5 if they don't already have appropriate scores
      const [whitelistLinksResult] = await queryInterface.sequelize.query(
        `UPDATE player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         SET pdl.confidence_score = 0.5,
             pdl.link_source = 'whitelist'
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.link_source IN ('manual', '')
         AND pdl.confidence_score > 0.5
         AND pdl.confidence_score < 1.0`,
        { transaction }
      );
      
      console.log(`Updated ${whitelistLinksResult.affectedRows || 0} whitelist-created links to 0.5 confidence`);
      
      // For links with 1.0 confidence that are associated with whitelists,
      // we need to be more careful - only downgrade if they weren't self-verified
      const [selfVerifiedCheck] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count
         FROM player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.confidence_score = 1.0
         AND pdl.link_source IN ('manual', 'whitelist')`,
        { transaction }
      );
      
      if (selfVerifiedCheck[0].count > 0) {
        console.log(`Found ${selfVerifiedCheck[0].count} high-confidence links associated with whitelists`);
        
        // Only downgrade links that were clearly not self-verified
        // (those with link_source = 'manual' or 'whitelist', not '' or 'verification')
        const [downgradedResult] = await queryInterface.sequelize.query(
          `UPDATE player_discord_links pdl
           INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
           SET pdl.confidence_score = 0.5,
               pdl.link_source = 'whitelist'
           WHERE w.approved = true 
           AND w.revoked = false
           AND pdl.confidence_score = 1.0
           AND pdl.link_source = 'manual'
           AND pdl.created_at > w.granted_at`,  // Only if link was created after whitelist grant
          { transaction }
        );
        
        console.log(`Downgraded ${downgradedResult.affectedRows || 0} manual links created after whitelist grants`);
      }
      
      // Get final statistics
      const [finalStats] = await queryInterface.sequelize.query(
        `SELECT 
           pdl.confidence_score,
           pdl.link_source,
           COUNT(*) as count
         FROM player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         WHERE w.approved = true AND w.revoked = false
         GROUP BY pdl.confidence_score, pdl.link_source
         ORDER BY pdl.confidence_score DESC, pdl.link_source`,
        { transaction }
      );
      
      console.log('📊 Final confidence distribution for whitelist-associated links:');
      for (const stat of finalStats[0]) {
        console.log(`   Confidence ${stat.confidence_score} (${stat.link_source}): ${stat.count} links`);
      }
      
      await transaction.commit();
      console.log('✅ Migration completed successfully');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Reverting whitelist-linked confidence score changes...');
      
      // This is a conservative rollback - we'll set all whitelist-associated links back to 1.0
      // if they were modified by this migration (confidence 0.5 and link_source 'whitelist')
      const [revertResult] = await queryInterface.sequelize.query(
        `UPDATE player_discord_links pdl
         INNER JOIN whitelists w ON pdl.steamid64 = w.steamid64
         SET pdl.confidence_score = 1.0,
             pdl.link_source = 'manual'
         WHERE w.approved = true 
         AND w.revoked = false
         AND pdl.confidence_score = 0.5
         AND pdl.link_source = 'whitelist'`,
        { transaction }
      );
      
      console.log(`Reverted ${revertResult.affectedRows || 0} links back to 1.0 confidence`);
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};