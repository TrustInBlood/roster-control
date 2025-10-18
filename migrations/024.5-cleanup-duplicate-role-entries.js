/**
 * Migration: Cleanup Duplicate Role-Based Whitelist Entries
 *
 * Problem: Multiple bulk_sync operations created duplicate active role-based entries
 * for the same discord_user_id. This violates the unique constraint we want to add
 * in migration 025.
 *
 * Solution: Keep only the MOST RECENT entry (highest ID) for each discord_user_id
 * where source='role' and revoked=false. Delete all older duplicates.
 *
 * Safety: This migration is idempotent and safe to run multiple times.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🧹 Cleaning up duplicate role-based whitelist entries...');

    try {
      // Find all duplicate entries (keeping the most recent one)
      const duplicates = await queryInterface.sequelize.query(`
        SELECT w1.id
        FROM whitelists w1
        WHERE w1.source = 'role'
          AND w1.revoked = false
          AND w1.id NOT IN (
            -- Subquery to get the HIGHEST ID (most recent) for each discord_user_id
            SELECT MAX(w2.id)
            FROM whitelists w2
            WHERE w2.source = 'role'
              AND w2.revoked = false
            GROUP BY w2.discord_user_id
          )
        ORDER BY w1.id
      `, { type: Sequelize.QueryTypes.SELECT });

      if (duplicates.length === 0) {
        console.log('✅ No duplicate entries found. Database is clean!');
        return;
      }

      console.log(`📊 Found ${duplicates.length} duplicate entries to clean up`);

      // Get details about what we're about to delete (for logging)
      const duplicateDetails = await queryInterface.sequelize.query(`
        SELECT
          discord_user_id,
          role_name,
          COUNT(*) as duplicate_count,
          MIN(id) as oldest_id,
          MAX(id) as newest_id
        FROM whitelists
        WHERE source = 'role'
          AND revoked = false
        GROUP BY discord_user_id, role_name
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, discord_user_id
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log('\n📋 Duplicate Summary:');
      console.log('━'.repeat(80));
      duplicateDetails.forEach(row => {
        console.log(`  User ${row.discord_user_id} (${row.role_name}): ${row.duplicate_count} entries`);
        console.log(`    Keeping ID ${row.newest_id}, deleting ${row.duplicate_count - 1} older entries`);
      });
      console.log('━'.repeat(80));

      // Delete the duplicate entries (keeping the most recent one)
      const duplicateIds = duplicates.map(d => d.id);

      console.log(`\n🗑️  Deleting ${duplicateIds.length} duplicate entries...`);

      await queryInterface.sequelize.query(`
        DELETE FROM whitelists
        WHERE id IN (${duplicateIds.join(',')})
      `, { type: Sequelize.QueryTypes.DELETE });

      console.log(`✅ Successfully deleted ${duplicateIds.length} duplicate entries`);

      // Verify cleanup
      const remainingDuplicates = await queryInterface.sequelize.query(`
        SELECT discord_user_id, COUNT(*) as count
        FROM whitelists
        WHERE source = 'role' AND revoked = false
        GROUP BY discord_user_id
        HAVING count > 1
      `, { type: Sequelize.QueryTypes.SELECT });

      if (remainingDuplicates.length > 0) {
        console.log('⚠️  WARNING: Still found duplicates after cleanup:');
        remainingDuplicates.forEach(row => {
          console.log(`  User ${row.discord_user_id}: ${row.count} entries`);
        });
        throw new Error('Duplicate cleanup did not complete successfully');
      }

      console.log('✅ Verification passed: No duplicates remain');
      console.log('✅ Database is now ready for unique constraint migration (025)');

    } catch (error) {
      console.error('❌ Error cleaning up duplicates:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️  Rollback: Cannot restore deleted duplicate entries');
    console.log('⚠️  This migration is destructive and cannot be reversed');
    console.log('⚠️  The deleted entries were duplicates that should not have existed');

    // No rollback possible - the duplicates were invalid data
    // If they need to be restored, it would require a database backup
  }
};
