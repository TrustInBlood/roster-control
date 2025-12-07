#!/usr/bin/env node

/**
 * Analyze Whitelist Entry Origins
 *
 * This script analyzes all whitelist entries to categorize them by origin:
 * - Imported from BattleMetrics (need to remove)
 * - Created by Discord bot (need to keep)
 * - Role-based entries (need to keep)
 *
 * Identification criteria for IMPORTED entries:
 * - metadata field contains 'battlemetricsId'
 * - OR granted_by matches known migration user IDs
 * - OR granted_at during known migration windows
 *
 * IMPORTANT: This script does NOT modify the database.
 *
 * Usage: node scripts/analyze-whitelist-origins.js
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
  outputDir: path.join(__dirname, '..', 'migration-output'),
  // Known migration windows (entries created during these times are likely imported)
  migrationWindows: [
    { start: '2025-09-01', end: '2025-09-30', name: 'September 2025' },
    { start: '2025-11-01', end: '2025-11-15', name: 'November 2025' }
  ]
};

// Statistics
const stats = {
  total: 0,
  imported: {
    total: 0,
    hasMetadata: 0,
    noDates: 0,
    duplicates: 0,
    expired: 0,
    active: 0
  },
  botCreated: {
    total: 0,
    donation: 0,
    manual: 0,
    expired: 0,
    active: 0
  },
  roleBased: {
    total: 0,
    expired: 0,
    active: 0
  },
  other: {
    total: 0
  },
  bySource: {
    donation: 0,
    manual: 0,
    role: 0,
    import: 0,
    unknown: 0
  },
  approved: 0,
  revoked: 0,
  active: 0,
  expired: 0
};

// Results
const results = {
  imported: [],
  botCreated: [],
  roleBased: [],
  other: [],
  duplicateBattlemetricsIds: new Map()
};

/**
 * Connect to production database and fetch all whitelist entries
 */
async function fetchAllWhitelists() {
  console.log('Connecting to production database...');
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  console.log(`Database: ${process.env.DB_NAME}`);
  console.log('');

  let sequelize;

  try {
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

    console.log('Fetching all whitelist entries...');
    const query = 'SELECT * FROM whitelists ORDER BY granted_at ASC, id ASC';
    const entries = await sequelize.query(query, {
      type: QueryTypes.SELECT
    });

    console.log(`Found ${entries.length} total entries`);
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
 * Check if entry was imported from BattleMetrics
 */
function isImportedEntry(entry) {
  // Check 1: Has BattleMetrics metadata
  if (entry.metadata) {
    try {
      const metadata = typeof entry.metadata === 'string'
        ? JSON.parse(entry.metadata)
        : entry.metadata;

      if (metadata.battlemetricsId || metadata.importedAt) {
        return { isImported: true, reason: 'has_metadata', metadata };
      }
    } catch (e) {
      // Invalid JSON, continue checking
    }
  }

  // Check 2: Donation reason format (imported donations have specific format)
  if (entry.reason && entry.reason.startsWith('Rewarded Whitelist via Donation:')) {
    // Bot-created donations should have different format or metadata
    // If no metadata and has this exact format, likely imported
    if (!entry.metadata) {
      return { isImported: true, reason: 'donation_no_metadata', metadata: null };
    }
  }

  return { isImported: false, reason: null, metadata: null };
}

/**
 * Analyze all entries and categorize them
 */
function analyzeEntries(entries) {
  console.log('Analyzing entry origins...');
  console.log('');

  const now = new Date();

  entries.forEach(entry => {
    stats.total++;

    // Count by source
    const source = entry.source || 'unknown';
    if (stats.bySource[source] !== undefined) {
      stats.bySource[source]++;
    } else {
      stats.bySource.unknown++;
    }

    // Count approved/revoked
    if (entry.approved) stats.approved++;
    if (entry.revoked) stats.revoked++;

    // Determine if active or expired
    let isActive = false;
    let status = 'unknown';

    if (entry.revoked) {
      status = 'revoked';
    } else if (!entry.approved) {
      status = 'unapproved';
    } else if (entry.duration_value === null && entry.duration_type === null) {
      status = 'permanent';
      isActive = true;
      stats.active++;
    } else if (entry.expiration) {
      const expirationDate = new Date(entry.expiration);
      if (expirationDate > now) {
        status = 'active';
        isActive = true;
        stats.active++;
      } else {
        status = 'expired';
        stats.expired++;
      }
    } else if (entry.duration_value === 0) {
      status = 'expired';
      stats.expired++;
    } else {
      status = 'active';
      isActive = true;
      stats.active++;
    }

    // Categorize by origin
    if (entry.source === 'role') {
      // Role-based entry
      stats.roleBased.total++;
      if (isActive) stats.roleBased.active++;
      else stats.roleBased.expired++;

      results.roleBased.push({
        id: entry.id,
        steamid64: entry.steamid64,
        username: entry.username,
        source: entry.source,
        role_name: entry.role_name,
        granted_at: entry.granted_at,
        expiration: entry.expiration,
        status: status,
        isActive: isActive
      });
    } else {
      // Check if imported
      const importCheck = isImportedEntry(entry);

      if (importCheck.isImported) {
        // IMPORTED ENTRY - needs to be removed
        stats.imported.total++;
        if (isActive) stats.imported.active++;
        else stats.imported.expired++;
        if (importCheck.reason === 'has_metadata') stats.imported.hasMetadata++;
        if (importCheck.reason === 'donation_no_metadata') stats.imported.noDates++;

        // Track duplicate BattleMetrics IDs
        if (importCheck.metadata && importCheck.metadata.battlemetricsId) {
          const bmId = importCheck.metadata.battlemetricsId;
          if (!results.duplicateBattlemetricsIds.has(bmId)) {
            results.duplicateBattlemetricsIds.set(bmId, []);
          }
          results.duplicateBattlemetricsIds.get(bmId).push({
            id: entry.id,
            steamid64: entry.steamid64,
            username: entry.username,
            granted_at: entry.granted_at
          });
        }

        results.imported.push({
          id: entry.id,
          steamid64: entry.steamid64,
          username: entry.username,
          source: entry.source,
          reason: entry.reason,
          granted_by: entry.granted_by,
          granted_at: entry.granted_at,
          expiration: entry.expiration,
          duration_value: entry.duration_value,
          duration_type: entry.duration_type,
          approved: entry.approved,
          revoked: entry.revoked,
          status: status,
          isActive: isActive,
          importReason: importCheck.reason,
          metadata: importCheck.metadata
        });
      } else {
        // BOT-CREATED ENTRY - keep these
        stats.botCreated.total++;
        if (isActive) stats.botCreated.active++;
        else stats.botCreated.expired++;
        if (entry.source === 'donation') stats.botCreated.donation++;
        else if (entry.source === 'manual') stats.botCreated.manual++;

        results.botCreated.push({
          id: entry.id,
          steamid64: entry.steamid64,
          username: entry.username,
          source: entry.source,
          reason: entry.reason,
          granted_by: entry.granted_by,
          granted_at: entry.granted_at,
          expiration: entry.expiration,
          duration_value: entry.duration_value,
          duration_type: entry.duration_type,
          approved: entry.approved,
          revoked: entry.revoked,
          status: status,
          isActive: isActive
        });
      }
    }
  });

  // Count duplicate imports
  results.duplicateBattlemetricsIds.forEach((entries, bmId) => {
    if (entries.length > 1) {
      stats.imported.duplicates += entries.length;
    }
  });

  console.log(`Analyzed ${stats.total} entries`);
  console.log('');
}

/**
 * Generate DELETE SQL statements for imported entries
 */
function generateDeleteSQL() {
  const lines = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  lines.push('-- Remove ALL Imported Whitelist Entries');
  lines.push(`-- Generated: ${timestamp}`);
  lines.push(`-- Total entries to remove: ${stats.imported.total}`);
  lines.push('-- Criteria: Entries with BattleMetrics metadata (battlemetricsId field)');
  lines.push('');
  lines.push('-- CRITICAL: Review this SQL carefully before executing!');
  lines.push('-- This will PERMANENTLY DELETE ALL IMPORTED ENTRIES.');
  lines.push('-- Bot-created entries will NOT be affected.');
  lines.push('-- Make sure you have a database backup.');
  lines.push('');
  lines.push('-- Statistics of entries to be deleted:');
  lines.push(`--   Total imported: ${stats.imported.total}`);
  lines.push(`--   Active: ${stats.imported.active}`);
  lines.push(`--   Expired: ${stats.imported.expired}`);
  lines.push(`--   Duplicate imports: ${stats.imported.duplicates}`);
  lines.push(`--   With metadata: ${stats.imported.hasMetadata}`);
  lines.push('');
  lines.push('-- Entries that will be KEPT:');
  lines.push(`--   Bot-created: ${stats.botCreated.total}`);
  lines.push(`--   Role-based: ${stats.roleBased.total}`);
  lines.push('');

  if (results.imported.length === 0) {
    lines.push('-- No imported entries to remove!');
    return lines.join('\n');
  }

  // Generate DELETE statement
  const ids = results.imported.map(entry => entry.id);

  lines.push('-- Step 1: Verify entries before deletion');
  lines.push('-- Run this query first to see what will be deleted:');
  lines.push('SELECT id, steamid64, username, source, reason, granted_at, expiration, approved, revoked, metadata');
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
  lines.push('SELECT COUNT(*) as remaining_with_metadata');
  lines.push('FROM whitelists');
  lines.push('WHERE metadata IS NOT NULL AND metadata LIKE \'%battlemetricsId%\';');
  lines.push('-- Expected result: 0');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate summary report
 */
function generateSummary() {
  const lines = [];

  lines.push('Whitelist Entry Origins Analysis Report');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
  lines.push('');

  lines.push('TOTAL ENTRIES: ' + stats.total);
  lines.push('');

  lines.push('ENTRIES TO REMOVE (Imported from BattleMetrics):');
  lines.push(`  Total: ${stats.imported.total}`);
  lines.push(`  Active: ${stats.imported.active}`);
  lines.push(`  Expired: ${stats.imported.expired}`);
  lines.push(`  With metadata: ${stats.imported.hasMetadata}`);
  lines.push(`  Without metadata: ${stats.imported.noDates}`);
  lines.push(`  Duplicate imports: ${stats.imported.duplicates}`);
  lines.push('');

  lines.push('ENTRIES TO KEEP (Bot-created):');
  lines.push(`  Total: ${stats.botCreated.total}`);
  lines.push(`  Active: ${stats.botCreated.active}`);
  lines.push(`  Expired: ${stats.botCreated.expired}`);
  lines.push(`  Donation source: ${stats.botCreated.donation}`);
  lines.push(`  Manual source: ${stats.botCreated.manual}`);
  lines.push('');

  lines.push('ENTRIES TO KEEP (Role-based):');
  lines.push(`  Total: ${stats.roleBased.total}`);
  lines.push(`  Active: ${stats.roleBased.active}`);
  lines.push(`  Expired: ${stats.roleBased.expired}`);
  lines.push('');

  lines.push('By Source Field:');
  lines.push(`  donation: ${stats.bySource.donation}`);
  lines.push(`  manual: ${stats.bySource.manual}`);
  lines.push(`  role: ${stats.bySource.role}`);
  lines.push(`  import: ${stats.bySource.import}`);
  lines.push(`  unknown: ${stats.bySource.unknown}`);
  lines.push('');

  lines.push('Overall Status:');
  lines.push(`  Approved: ${stats.approved}`);
  lines.push(`  Revoked: ${stats.revoked}`);
  lines.push(`  Active: ${stats.active}`);
  lines.push(`  Expired: ${stats.expired}`);
  lines.push('');

  // Duplicate BattleMetrics IDs
  const duplicates = Array.from(results.duplicateBattlemetricsIds.entries())
    .filter(([bmId, entries]) => entries.length > 1);

  if (duplicates.length > 0) {
    lines.push('DUPLICATE BATTLEMETRICS IMPORTS:');
    lines.push(`  ${duplicates.length} BattleMetrics entries imported multiple times`);
    lines.push('');
    duplicates.slice(0, 10).forEach(([bmId, entries]) => {
      lines.push(`  BattleMetrics ID ${bmId}: ${entries.length} imports`);
      entries.forEach(entry => {
        lines.push(`    - DB ID ${entry.id}: ${entry.steamid64} (${entry.username}) on ${entry.granted_at}`);
      });
    });
    if (duplicates.length > 10) {
      lines.push(`  ... and ${duplicates.length - 10} more duplicates`);
    }
    lines.push('');
  }

  lines.push('IMPORTANT NOTES:');
  lines.push('  - This script does NOT modify the database');
  lines.push('  - Review remove-imported-entries.sql before executing');
  lines.push('  - Make a database backup before deletion');
  lines.push('  - Deletion is PERMANENT and cannot be undone');
  lines.push('  - Bot-created and role-based entries will be preserved');
  lines.push('');

  lines.push('Output Files:');
  lines.push('  - imported-entries.json (entries to remove)');
  lines.push('  - bot-created-entries.json (entries to keep)');
  lines.push('  - role-based-entries.json (entries to keep)');
  lines.push('  - duplicate-imports.json (BattleMetrics IDs imported multiple times)');
  lines.push('  - remove-imported-entries.sql (DELETE statements)');
  lines.push('  - whitelist-origins-summary.txt (this file)');
  lines.push('');

  lines.push('Next Steps:');
  lines.push('  1. Review imported-entries.json to verify what will be removed');
  lines.push('  2. Review bot-created-entries.json to verify what will be kept');
  lines.push('  3. Make a full database backup');
  lines.push('  4. Review remove-imported-entries.sql');
  lines.push('  5. Run verification query in SQL file');
  lines.push('  6. Uncomment and execute DELETE statement');
  lines.push('  7. Run post-deletion verification query');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Analyze Whitelist Entry Origins');
    console.log('='.repeat(70));
    console.log('');
    console.log('IMPORTANT: This script does NOT modify the database.');
    console.log('It categorizes entries by origin to identify what needs removal.');
    console.log('');

    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      console.log(`Created output directory: ${CONFIG.outputDir}`);
      console.log('');
    }

    // Fetch all entries
    const entries = await fetchAllWhitelists();

    if (entries.length === 0) {
      console.log('No entries found in database!');
      return;
    }

    // Analyze entries
    analyzeEntries(entries);

    // Generate outputs
    console.log('Generating output files...');

    const outputPath = (filename) => path.join(CONFIG.outputDir, filename);

    // JSON exports
    fs.writeFileSync(
      outputPath('imported-entries.json'),
      JSON.stringify(results.imported, null, 2)
    );
    console.log(`  ✓ imported-entries.json (${results.imported.length} entries TO REMOVE)`);

    fs.writeFileSync(
      outputPath('bot-created-entries.json'),
      JSON.stringify(results.botCreated, null, 2)
    );
    console.log(`  ✓ bot-created-entries.json (${results.botCreated.length} entries TO KEEP)`);

    fs.writeFileSync(
      outputPath('role-based-entries.json'),
      JSON.stringify(results.roleBased, null, 2)
    );
    console.log(`  ✓ role-based-entries.json (${results.roleBased.length} entries TO KEEP)`);

    // Duplicate imports
    const duplicatesArray = Array.from(results.duplicateBattlemetricsIds.entries())
      .filter(([bmId, entries]) => entries.length > 1)
      .map(([bmId, entries]) => ({
        battlemetricsId: bmId,
        importCount: entries.length,
        entries: entries
      }));

    fs.writeFileSync(
      outputPath('duplicate-imports.json'),
      JSON.stringify(duplicatesArray, null, 2)
    );
    console.log(`  ✓ duplicate-imports.json (${duplicatesArray.length} BattleMetrics IDs with multiple imports)`);

    // SQL DELETE statements
    const sql = generateDeleteSQL();
    fs.writeFileSync(outputPath('remove-imported-entries.sql'), sql);
    console.log('  ✓ remove-imported-entries.sql');

    // Summary report
    const summary = generateSummary();
    fs.writeFileSync(outputPath('whitelist-origins-summary.txt'), summary);
    console.log('  ✓ whitelist-origins-summary.txt');

    console.log('');
    console.log('='.repeat(70));
    console.log('Analysis Complete!');
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
