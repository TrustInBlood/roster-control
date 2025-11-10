#!/usr/bin/env node

/**
 * Identify Migration Entries for Removal
 *
 * This script identifies all whitelist entries that were created by the
 * failed /migratewhitelist command so they can be removed before doing
 * a clean migration with correct data.
 *
 * Identification criteria:
 * - reason starts with 'Rewarded Whitelist via Donation:'
 * - OR source = 'donation'
 * - Created during migration window (Nov 6-8, 2025)
 *
 * IMPORTANT: This script does NOT modify the database. It only identifies
 * entries and generates SQL for manual review.
 *
 * Usage: node scripts/identify-migration-entries.js
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

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '..', 'migration-output')
};

// Statistics
const stats = {
  total: 0,
  bySource: {
    donation: 0,
    manual: 0,
    role: 0,
    import: 0
  },
  byType: {
    staff: 0,
    whitelist: 0
  },
  approved: 0,
  revoked: 0,
  active: 0,
  expired: 0,
  permanent: 0,
  temporary: 0
};

// Results
const results = {
  toRemove: [],
  summary: {}
};

/**
 * Connect to production database and identify migration entries
 */
async function identifyMigrationEntries() {
  console.log('Connecting to production database...');
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  console.log(`Database: ${process.env.DB_NAME}`);
  console.log('');

  let sequelize;

  try {
    // Create Sequelize connection
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

    // Query for ALL expired whitelist entries
    console.log('Identifying ALL expired whitelist entries...');
    console.log('Criteria: Entries where expiration < NOW() or duration_value = 0');
    console.log('');

    const query = `
      SELECT *
      FROM whitelists
      WHERE (
        approved = 1
        AND revoked = 0
        AND (
          (expiration IS NOT NULL AND expiration < NOW())
          OR duration_value = 0
        )
      )
      ORDER BY granted_at ASC, id ASC
    `;

    const entries = await sequelize.query(query, {
      type: QueryTypes.SELECT
    });

    console.log(`Found ${entries.length} entries matching migration criteria`);
    console.log('');

    return entries;

  } catch (error) {
    console.error('Database error:');
    console.error('Message:', error.message);
    throw error;

  } finally {
    if (sequelize) {
      await sequelize.close();
      console.log('Database connection closed');
      console.log('');
    }
  }
}

/**
 * Analyze identified entries
 */
function analyzeEntries(entries) {
  console.log('Analyzing identified entries...');

  const now = new Date();

  entries.forEach(entry => {
    stats.total++;

    // Count by source
    const source = entry.source || 'unknown';
    if (stats.bySource[source] !== undefined) {
      stats.bySource[source]++;
    }

    // Count by type
    const type = entry.type || 'unknown';
    if (stats.byType[type] !== undefined) {
      stats.byType[type]++;
    }

    // Approved/revoked status
    if (entry.approved) {
      stats.approved++;
    }
    if (entry.revoked) {
      stats.revoked++;
    }

    // Active/expired/permanent analysis
    let status = 'unknown';
    let isActive = false;

    if (entry.revoked) {
      status = 'revoked';
    } else if (!entry.approved) {
      status = 'unapproved';
    } else if (entry.duration_value === null && entry.duration_type === null) {
      status = 'permanent';
      stats.permanent++;
      stats.active++;
      isActive = true;
    } else if (entry.expiration) {
      const expirationDate = new Date(entry.expiration);
      if (expirationDate > now) {
        status = 'active';
        stats.active++;
        isActive = true;
      } else {
        status = 'expired';
        stats.expired++;
      }
      stats.temporary++;
    } else if (entry.duration_value === 0) {
      status = 'expired';
      stats.expired++;
      stats.temporary++;
    } else {
      status = 'active';
      stats.active++;
      stats.temporary++;
      isActive = true;
    }

    // Store for removal
    results.toRemove.push({
      id: entry.id,
      steamid64: entry.steamid64,
      username: entry.username,
      source: entry.source,
      type: entry.type,
      reason: entry.reason,
      granted_at: entry.granted_at,
      granted_by: entry.granted_by,
      expiration: entry.expiration,
      duration_value: entry.duration_value,
      duration_type: entry.duration_type,
      approved: entry.approved,
      revoked: entry.revoked,
      status: status,
      isActive: isActive
    });
  });

  console.log(`Analyzed ${stats.total} entries`);
  console.log('');
}

/**
 * Generate DELETE SQL statements
 */
function generateDeleteSQL() {
  const lines = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  lines.push('-- Remove ALL Expired Whitelist Entries');
  lines.push(`-- Generated: ${timestamp}`);
  lines.push(`-- Total entries to remove: ${stats.total}`);
  lines.push('-- Criteria: Approved, non-revoked entries where expiration < NOW() or duration_value = 0');
  lines.push('');
  lines.push('-- CRITICAL: Review this SQL carefully before executing!');
  lines.push('-- This will PERMANENTLY DELETE ALL EXPIRED WHITELIST ENTRIES.');
  lines.push('-- Active whitelists will NOT be affected.');
  lines.push('-- Make sure you have a database backup.');
  lines.push('');
  lines.push('-- Statistics of entries to be deleted:');
  lines.push(`--   Total: ${stats.total}`);
  lines.push(`--   Active: ${stats.active}`);
  lines.push(`--   Expired: ${stats.expired}`);
  lines.push(`--   Revoked: ${stats.revoked}`);
  lines.push(`--   By source: donation=${stats.bySource.donation}, manual=${stats.bySource.manual}, role=${stats.bySource.role}, import=${stats.bySource.import}`);
  lines.push('');

  if (results.toRemove.length === 0) {
    lines.push('-- No entries to remove!');
    return lines.join('\n');
  }

  // Generate DELETE statement
  const ids = results.toRemove.map(entry => entry.id);

  lines.push('-- Step 1: Verify entries before deletion');
  lines.push('-- Run this query first to see what will be deleted:');
  lines.push('SELECT id, steamid64, username, source, reason, granted_at, expiration, approved, revoked');
  lines.push('FROM whitelists');
  lines.push('WHERE id IN (');

  // Split into chunks of 100 IDs per line for readability
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const isLast = i + 100 >= ids.length;
    lines.push(`  ${chunk.join(', ')}${isLast ? '' : ','}`);
  }

  lines.push(');');
  lines.push('');

  lines.push('-- Step 2: Delete entries (DESTRUCTIVE - CANNOT BE UNDONE)');
  lines.push('-- Uncomment the following line to execute deletion:');
  lines.push('-- DELETE FROM whitelists');
  lines.push('-- WHERE id IN (');

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const isLast = i + 100 >= ids.length;
    lines.push(`--   ${chunk.join(', ')}${isLast ? '' : ','}`);
  }

  lines.push('-- );');
  lines.push('');

  lines.push('-- Step 3: Verification after deletion');
  lines.push('-- Run this after deletion to verify:');
  lines.push('SELECT COUNT(*) as remaining_donations');
  lines.push('FROM whitelists');
  lines.push('WHERE reason LIKE \'Rewarded Whitelist via Donation:%\' OR source = \'donation\';');
  lines.push('-- Expected result: 0');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate summary report
 */
function generateSummary() {
  const lines = [];

  lines.push('Expired Whitelist Entries Identification Report');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
  lines.push('');

  lines.push('Identification Criteria:');
  lines.push('  - approved = 1 (approved entries only)');
  lines.push('  - revoked = 0 (not revoked)');
  lines.push('  - expiration < NOW() OR duration_value = 0 (expired)');
  lines.push('  - Includes ALL expired entries regardless of source');
  lines.push('');

  lines.push('Total Entries Identified:');
  lines.push(`  ${stats.total} entries will be removed`);
  lines.push('');

  lines.push('By Source:');
  lines.push(`  donation: ${stats.bySource.donation}`);
  lines.push(`  manual: ${stats.bySource.manual}`);
  lines.push(`  role: ${stats.bySource.role}`);
  lines.push(`  import: ${stats.bySource.import}`);
  lines.push('');

  lines.push('By Type:');
  lines.push(`  staff: ${stats.byType.staff}`);
  lines.push(`  whitelist: ${stats.byType.whitelist}`);
  lines.push('');

  lines.push('Status:');
  lines.push(`  Approved: ${stats.approved}`);
  lines.push(`  Revoked: ${stats.revoked}`);
  lines.push(`  Active: ${stats.active}`);
  lines.push(`  Expired: ${stats.expired}`);
  lines.push(`  Permanent: ${stats.permanent}`);
  lines.push(`  Temporary: ${stats.temporary}`);
  lines.push('');

  lines.push('IMPORTANT NOTES:');
  lines.push('  - This script does NOT modify the database');
  lines.push('  - Review remove-migration-entries.sql before executing');
  lines.push('  - Make a database backup before deletion');
  lines.push('  - Deletion is PERMANENT and cannot be undone');
  lines.push('');

  lines.push('Output Files:');
  lines.push('  - expired-entries-to-remove.json (full entry details)');
  lines.push('  - remove-expired-entries.sql (DELETE statements)');
  lines.push('  - expired-entries-summary.txt (this file)');
  lines.push('');

  lines.push('Next Steps:');
  lines.push('  1. Review expired-entries-to-remove.json');
  lines.push('  2. Make a full database backup');
  lines.push('  3. Review remove-expired-entries.sql');
  lines.push('  4. Run verification query in SQL file');
  lines.push('  5. Uncomment and execute DELETE statement');
  lines.push('  6. Run post-deletion verification query');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Identify Expired Whitelist Entries for Removal');
    console.log('='.repeat(70));
    console.log('');
    console.log('IMPORTANT: This script does NOT modify the database.');
    console.log('It only identifies EXPIRED whitelist entries and generates SQL for review.');
    console.log('Active whitelists will NOT be affected.');
    console.log('');

    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      console.log(`Created output directory: ${CONFIG.outputDir}`);
      console.log('');
    }

    // Identify expired entries
    const entries = await identifyMigrationEntries();

    if (entries.length === 0) {
      console.log('No expired entries found!');
      console.log('All whitelists in the database are either active or already cleaned up.');
      return;
    }

    // Analyze entries
    analyzeEntries(entries);

    // Generate outputs
    console.log('Generating output files...');

    const outputPath = (filename) => path.join(CONFIG.outputDir, filename);

    // JSON export with full details
    fs.writeFileSync(
      outputPath('expired-entries-to-remove.json'),
      JSON.stringify(results.toRemove, null, 2)
    );
    console.log(`  ✓ expired-entries-to-remove.json (${results.toRemove.length} entries)`);

    // SQL DELETE statements
    const sql = generateDeleteSQL();
    fs.writeFileSync(outputPath('remove-expired-entries.sql'), sql);
    console.log(`  ✓ remove-expired-entries.sql`);

    // Summary report
    const summary = generateSummary();
    fs.writeFileSync(outputPath('expired-entries-summary.txt'), summary);
    console.log(`  ✓ expired-entries-summary.txt`);

    console.log('');
    console.log('='.repeat(70));
    console.log('Identification Complete!');
    console.log('='.repeat(70));
    console.log('');
    console.log(summary);

  } catch (error) {
    console.error('\nFATAL ERROR:');
    console.error(error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main();
