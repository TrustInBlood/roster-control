const { DataTypes } = require('sequelize');

/**
 * Migration: Add 'donation' Source Type
 *
 * Purpose: Add 'donation' as a valid source type for whitelist entries to properly
 * track whitelist access granted through donation processing webhooks.
 *
 * Background: The whitelist system currently supports:
 * - 'role': Discord role-based automatic entries
 * - 'manual': Admin-granted via commands
 * - 'import': BattleMetrics imports
 *
 * This migration adds 'donation' to track webhook-based donation processing.
 * The source field is a STRING(20) in the database, with validation in the Sequelize model.
 *
 * Note: This migration doesn't modify the database schema itself (STRING remains STRING),
 * but updates the comment to document the new valid value. The actual validation
 * change happens in the Whitelist model.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Adding support for \'donation\' source type');

    try {
      // Update the column comment to reflect the new source type
      console.log('🔧 Updating source field comment...');

      await queryInterface.changeColumn('whitelists', 'source', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
        comment: 'Source of the whitelist: "role", "manual", "import", "donation"'
      });

      console.log('✅ Successfully added \'donation\' source type support');
      console.log('ℹ️  The Whitelist model validation must also be updated to accept \'donation\'');

    } catch (error) {
      console.error('❌ Error adding donation source type:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Removing \'donation\' source type support');

    try {
      // First, check if any entries use 'donation' source
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM whitelists WHERE source = \'donation\''
      );

      const donationCount = results[0].count;
      if (donationCount > 0) {
        console.warn(`⚠️  Warning: ${donationCount} whitelist entries use 'donation' source`);
        console.warn('⚠️  These entries will need to be migrated before rollback');
        throw new Error(`Cannot rollback: ${donationCount} entries still use 'donation' source. Migrate them first.`);
      }

      // Revert the column comment to the original
      await queryInterface.changeColumn('whitelists', 'source', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
        comment: 'Source of the whitelist: "role", "manual", "import"'
      });

      console.log('✅ Successfully removed \'donation\' source type support');
      console.log('ℹ️  The Whitelist model validation must also be reverted');

    } catch (error) {
      console.error('❌ Error removing donation source type:', error.message);
      throw error;
    }
  }
};
