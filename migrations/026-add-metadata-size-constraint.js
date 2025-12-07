const { DataTypes } = require('sequelize');

/**
 * Migration: Add Metadata Size Constraint
 *
 * Problem: The metadata JSON field has no size limit, making the system vulnerable
 * to DoS attacks via oversized JSON payloads (malicious actors could store megabytes
 * of data in metadata fields).
 *
 * Solution: Add a generated column that tracks metadata size and enforce a 10KB limit
 * via CHECK constraint. This is MariaDB 10.3+ compatible.
 *
 * Why 10KB:
 * - Current legitimate metadata usage: ~200-500 bytes per entry
 * - 10KB provides 20-50x safety margin
 * - Prevents DoS while allowing comprehensive audit trails
 *
 * SECURITY FIX 1.2 - Phase 3.8: Whitelist Security Hardening
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Adding metadata size constraint (MariaDB 10.3 compatible)');

    try {
      // STEP 1: Add generated column that calculates metadata size
      console.log('🔧 Step 1: Adding metadata_size generated column...');

      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists
          ADD COLUMN metadata_size INT GENERATED ALWAYS AS (
            COALESCE(LENGTH(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$'))), 0)
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

      // STEP 2: Add CHECK constraint limiting metadata to 10KB
      console.log('🔧 Step 2: Adding CHECK constraint (10KB limit)...');

      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists
          ADD CONSTRAINT check_metadata_size
          CHECK (metadata_size <= 10240)
        `);
        console.log('✅ CHECK constraint added (10KB limit)');
      } catch (error) {
        if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
          console.log('⚠️  Constraint already exists, skipping...');
        } else {
          throw error;
        }
      }

      console.log('✅ Successfully added metadata size constraint');
      console.log('✅ Migration complete - metadata is now limited to 10KB');

    } catch (error) {
      console.error('❌ Error adding metadata size constraint:', error.message);

      // Check if error is due to existing oversized metadata
      if (error.message.includes('CHECK constraint') || error.message.includes('check_metadata_size')) {
        console.error('⚠️  OVERSIZED METADATA DETECTED IN DATABASE!');
        console.error('⚠️  Please run the following query to identify oversized entries:');
        console.error('');
        console.error('    SELECT id, discord_user_id, source, role_name,');
        console.error('           LENGTH(JSON_UNQUOTE(JSON_EXTRACT(metadata, \'$\'))) as metadata_size');
        console.error('    FROM whitelists');
        console.error('    WHERE LENGTH(JSON_UNQUOTE(JSON_EXTRACT(metadata, \'$\'))) > 10240');
        console.error('    ORDER BY metadata_size DESC;');
        console.error('');
        console.error('⚠️  Clean up oversized metadata before applying this constraint.');
      }

      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Removing metadata size constraint');

    try {
      // Remove the CHECK constraint
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists DROP CONSTRAINT check_metadata_size
        `);
        console.log('✅ Removed CHECK constraint');
      } catch (error) {
        if (!error.message.includes('Can\'t DROP') && !error.message.includes('does not exist')) {
          throw error;
        }
      }

      // Remove the generated column
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE whitelists DROP COLUMN metadata_size
        `);
        console.log('✅ Removed generated column');
      } catch (error) {
        if (!error.message.includes('Can\'t DROP') && !error.message.includes('does not exist')) {
          throw error;
        }
      }

      console.log('✅ Successfully rolled back metadata size constraint');

    } catch (error) {
      console.error('❌ Error removing metadata size constraint:', error.message);
      throw error;
    }
  }
};
