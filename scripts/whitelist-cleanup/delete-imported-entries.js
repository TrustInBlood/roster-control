#!/usr/bin/env node

/**
 * Delete Imported Whitelist Entries
 *
 * This script deletes all whitelist entries that were imported from BattleMetrics.
 * It identifies imported entries by the presence of battlemetricsId in metadata.
 *
 * DESTRUCTIVE: This PERMANENTLY deletes entries from the production database.
 * Make sure you have a database backup before running this script.
 *
 * Usage: node scripts/delete-imported-entries.js
 */

const { Sequelize, QueryTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load production environment variables explicitly
const envPath = path.join(__dirname, '..', '.env.production');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env.production file not found');
  process.exit(1);
}

dotenv.config({ path: envPath });

/**
 * Main execution
 */
async function main() {
  console.log('Delete Imported Whitelist Entries');
  console.log('='.repeat(70));
  console.log('');
  console.log('WARNING: This script PERMANENTLY deletes entries from the database.');
  console.log('Make sure you have a backup before proceeding.');
  console.log('');

  let sequelize;

  try {
    // Connect to database
    console.log('Connecting to production database...');
    console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
    console.log(`Database: ${process.env.DB_NAME}`);
    console.log('');

    sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mariadb',
        dialectOptions: {
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        },
        logging: false
      }
    );

    await sequelize.authenticate();
    console.log('Connected successfully!');
    console.log('');

    // Step 1: Count entries before deletion
    console.log('Step 1: Counting entries before deletion...');
    const [beforeTotal] = await sequelize.query(
      'SELECT COUNT(*) as count FROM whitelists',
      { type: QueryTypes.SELECT }
    );
    const [beforeImported] = await sequelize.query(
      'SELECT COUNT(*) as count FROM whitelists WHERE metadata IS NOT NULL AND metadata LIKE \'%battlemetricsId%\'',
      { type: QueryTypes.SELECT }
    );

    console.log(`  Total entries: ${beforeTotal.count}`);
    console.log(`  Imported entries (with battlemetricsId): ${beforeImported.count}`);
    console.log('');

    // Step 2: Delete imported entries
    console.log('Step 2: Deleting imported entries...');
    console.log('  This may take a moment...');

    const result = await sequelize.query(
      'DELETE FROM whitelists WHERE metadata IS NOT NULL AND metadata LIKE \'%battlemetricsId%\'',
      { type: QueryTypes.DELETE }
    );

    console.log(`  ✓ Deleted ${beforeImported.count} imported entries`);
    console.log('');

    // Step 3: Count entries after deletion
    console.log('Step 3: Verifying deletion...');
    const [afterTotal] = await sequelize.query(
      'SELECT COUNT(*) as count FROM whitelists',
      { type: QueryTypes.SELECT }
    );
    const [afterImported] = await sequelize.query(
      'SELECT COUNT(*) as count FROM whitelists WHERE metadata IS NOT NULL AND metadata LIKE \'%battlemetricsId%\'',
      { type: QueryTypes.SELECT }
    );

    console.log(`  Total entries remaining: ${afterTotal.count}`);
    console.log(`  Imported entries remaining: ${afterImported.count}`);
    console.log('');

    // Step 4: Show breakdown of remaining entries
    console.log('Step 4: Breakdown of remaining entries...');
    const sourceBreakdown = await sequelize.query(
      'SELECT source, COUNT(*) as count FROM whitelists GROUP BY source ORDER BY count DESC',
      { type: QueryTypes.SELECT }
    );

    console.log('  By source:');
    sourceBreakdown.forEach(row => {
      console.log(`    ${row.source || 'NULL'}: ${row.count}`);
    });
    console.log('');

    const statusBreakdown = await sequelize.query(
      `SELECT
        SUM(CASE WHEN approved = 1 AND revoked = 0 AND (expiration IS NULL OR expiration > NOW()) THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN approved = 1 AND revoked = 0 AND expiration IS NOT NULL AND expiration <= NOW() THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN revoked = 1 THEN 1 ELSE 0 END) as revoked,
        SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END) as unapproved
      FROM whitelists`,
      { type: QueryTypes.SELECT }
    );

    console.log('  By status:');
    console.log(`    Active: ${statusBreakdown[0].active}`);
    console.log(`    Expired: ${statusBreakdown[0].expired}`);
    console.log(`    Revoked: ${statusBreakdown[0].revoked}`);
    console.log(`    Unapproved: ${statusBreakdown[0].unapproved}`);
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('Deletion Complete!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`  Entries before deletion: ${beforeTotal.count}`);
    console.log(`  Entries deleted: ${beforeImported.count}`);
    console.log(`  Entries remaining: ${afterTotal.count}`);
    console.log(`  Imported entries remaining: ${afterImported.count} (should be 0)`);
    console.log('');

    if (afterImported.count === 0) {
      console.log('✓ SUCCESS: All imported entries have been removed!');
    } else {
      console.log('⚠ WARNING: Some imported entries may still remain. Review the data.');
    }
    console.log('');

  } catch (error) {
    console.error('\nFATAL ERROR:');
    console.error('Message:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);

  } finally {
    if (sequelize) {
      await sequelize.close();
      console.log('Database connection closed');
      console.log('');
    }
  }
}

// Run the script
main();
