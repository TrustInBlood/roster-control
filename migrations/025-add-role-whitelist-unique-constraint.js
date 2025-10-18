const { DataTypes } = require('sequelize');

/**
 * Migration: Add Unique Constraint for Active Role-Based Whitelist Entries
 *
 * Challenge: MariaDB 10.3 doesn't support partial indexes with WHERE clauses
 * Solution: Add a virtual column that is NULL for revoked entries, then create
 * a unique index on (discord_user_id, source, active_role_key) where active_role_key
 * is only non-NULL for active role entries.
 *
 * This allows:
 * - Only ONE active role entry per user (unique constraint)
 * - Multiple revoked entries per user (NULL values don't count toward uniqueness)
 * - Multiple manual/import entries (different source value)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Adding unique constraint for role-based whitelist entries (MariaDB 10.3 compatible)');

    try {
      // STEP 1: Clean up any remaining duplicates
      console.log('🔍 Step 1: Checking for duplicates...');

      const duplicates = await queryInterface.sequelize.query(`
        SELECT w1.id
        FROM whitelists w1
        WHERE w1.source = 'role'
          AND w1.revoked = false
          AND w1.id NOT IN (
            SELECT MAX(w2.id)
            FROM whitelists w2
            WHERE w2.source = 'role'
              AND w2.revoked = false
            GROUP BY w2.discord_user_id
          )
        ORDER BY w1.id
      `, { type: Sequelize.QueryTypes.SELECT });

      if (duplicates.length > 0) {
        console.log(`⚠️  Found ${duplicates.length} duplicates - removing them...`);
        const duplicateIds = duplicates.map(d => d.id);

        await queryInterface.sequelize.query(`
          DELETE FROM whitelists
          WHERE id IN (${duplicateIds.join(',')})
        `, { type: Sequelize.QueryTypes.DELETE });

        console.log(`✅ Removed ${duplicates.length} duplicate entries`);
      } else {
        console.log('✅ No duplicates found');
      }

      // STEP 2: Add a generated column for the unique constraint
      // This column is only populated for active role entries, NULL otherwise
      console.log('🔧 Step 2: Adding generated column for unique constraint...');

      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists
          ADD COLUMN active_role_key VARCHAR(100) GENERATED ALWAYS AS (
            CASE
              WHEN source = 'role' AND revoked = false
              THEN CONCAT(discord_user_id, '-', source)
              ELSE NULL
            END
          ) STORED
        `);
        console.log('✅ Generated column added');
      } catch (error) {
        if (error.message.includes('Duplicate column name')) {
          console.log('⚠️  Column already exists, skipping...');
        } else {
          throw error;
        }
      }

      // STEP 3: Add unique index on the generated column
      console.log('🔧 Step 3: Adding unique index...');

      const indexes = await queryInterface.showIndex('whitelists');
      const indexExists = indexes.some(index =>
        index.name === 'whitelists_unique_active_role_entry'
      );

      if (indexExists) {
        console.log('⚠️  Index already exists, skipping...');
        return;
      }

      await queryInterface.addIndex('whitelists', {
        name: 'whitelists_unique_active_role_entry',
        unique: true,
        fields: ['active_role_key']
      });

      console.log('✅ Successfully added unique constraint for role-based whitelist entries');
      console.log('✅ Migration complete - duplicate role entries are now prevented at database level');

    } catch (error) {
      console.error('❌ Error adding unique constraint:', error.message);

      // Check if error is due to existing duplicates
      if (error.message.includes('Duplicate entry') || error.message.includes('UNIQUE')) {
        console.error('⚠️  DUPLICATE ENTRIES STILL DETECTED IN DATABASE!');
        console.error('⚠️  Please run the following query to identify remaining duplicates:');
        console.error('');
        console.error('    SELECT discord_user_id, COUNT(*) as count');
        console.error('    FROM whitelists');
        console.error("    WHERE source = 'role' AND revoked = false");
        console.error('    GROUP BY discord_user_id');
        console.error('    HAVING count > 1;');
        console.error('');
        console.error('⚠️  Use scripts/manual-cleanup-production-duplicates.sql to clean up');
      }

      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Removing unique constraint for role-based whitelist entries');

    try {
      // Remove the unique index
      const indexes = await queryInterface.showIndex('whitelists');
      const indexExists = indexes.some(index =>
        index.name === 'whitelists_unique_active_role_entry'
      );

      if (indexExists) {
        await queryInterface.removeIndex('whitelists', 'whitelists_unique_active_role_entry');
        console.log('✅ Removed unique index');
      }

      // Remove the generated column
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists DROP COLUMN active_role_key
        `);
        console.log('✅ Removed generated column');
      } catch (error) {
        if (!error.message.includes("Can't DROP")) {
          throw error;
        }
      }

      console.log('✅ Successfully rolled back unique constraint');

    } catch (error) {
      console.error('❌ Error removing unique constraint:', error.message);
      throw error;
    }
  }
};
