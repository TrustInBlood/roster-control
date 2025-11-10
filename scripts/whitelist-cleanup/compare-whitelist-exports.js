#!/usr/bin/env node

/**
 * Compare BattleMetrics Donation Export vs Production Database Export
 *
 * This script compares the BattleMetrics donation whitelist export with the
 * production database export to identify overlaps, duplicates, and missing entries.
 *
 * Usage: node scripts/compare-whitelist-exports.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '..', 'migration-output'),
  battlemetricsFile: 'battlemetrics-donations-full.json',
  prodDbFile: 'prod-whitelists-export.json'
};

// Statistics tracking
const stats = {
  battlemetrics: {
    total: 0,
    active: 0,
    expired: 0
  },
  prodDb: {
    total: 0,
    donations: 0,
    manual: 0,
    role: 0,
    active: 0,
    expired: 0
  },
  comparison: {
    exactMatches: 0,           // Same Steam ID, same source='donation'
    manualOverlaps: 0,          // Same Steam ID, but source='manual' in prod
    roleOverlaps: 0,            // Same Steam ID, but source='role' in prod
    multipleEntriesSameSteam: 0, // Multiple prod entries for same Steam ID
    missing: 0,                 // In BattleMetrics but not in prod at all
    duplicatesInProd: 0         // Steam IDs with multiple entries in prod
  }
};

// Result arrays
const results = {
  exactMatches: [],           // BM donations that exist in prod as donations
  manualOverlaps: [],          // BM donations that exist in prod as manual entries
  roleOverlaps: [],            // BM donations that exist in prod as role entries
  multipleEntries: [],         // BM donations where prod has multiple entries for that Steam ID
  missing: [],                 // BM donations completely missing from prod
  duplicatesInProd: []         // Steam IDs with multiple prod entries
};

/**
 * Load JSON file
 */
function loadJsonFile(filename) {
  const filePath = path.join(CONFIG.outputDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Analyze BattleMetrics data
 */
function analyzeBattleMetrics(bmData) {
  console.log('Analyzing BattleMetrics donation data...');

  const now = new Date();

  bmData.forEach(entry => {
    stats.battlemetrics.total++;

    if (entry.expiresAt) {
      const expirationDate = new Date(entry.expiresAt);
      if (expirationDate > now) {
        stats.battlemetrics.active++;
      } else {
        stats.battlemetrics.expired++;
      }
    } else {
      stats.battlemetrics.active++; // Permanent
    }
  });

  console.log(`  Total BattleMetrics donations: ${stats.battlemetrics.total}`);
  console.log(`  Active: ${stats.battlemetrics.active}`);
  console.log(`  Expired: ${stats.battlemetrics.expired}`);
  console.log('');
}

/**
 * Analyze production database data
 */
function analyzeProdDb(prodData) {
  console.log('Analyzing production database data...');

  const now = new Date();

  prodData.forEach(entry => {
    stats.prodDb.total++;

    // Count by source
    if (entry.source === 'donation') {
      stats.prodDb.donations++;
    } else if (entry.source === 'manual') {
      stats.prodDb.manual++;
    } else if (entry.source === 'role') {
      stats.prodDb.role++;
    }

    // Count active/expired
    if (entry.revoked) {
      // Revoked entries don't count as active
      return;
    }

    if (!entry.approved) {
      // Unapproved entries don't count as active
      return;
    }

    if (entry.duration_value === null && entry.duration_type === null) {
      // Permanent
      stats.prodDb.active++;
    } else if (entry.expiration) {
      const expirationDate = new Date(entry.expiration);
      if (expirationDate > now) {
        stats.prodDb.active++;
      } else {
        stats.prodDb.expired++;
      }
    } else if (entry.duration_value === 0) {
      stats.prodDb.expired++;
    } else {
      stats.prodDb.active++;
    }
  });

  console.log(`  Total prod DB entries: ${stats.prodDb.total}`);
  console.log(`  By source:`);
  console.log(`    donation: ${stats.prodDb.donations}`);
  console.log(`    manual: ${stats.prodDb.manual}`);
  console.log(`    role: ${stats.prodDb.role}`);
  console.log(`  Active: ${stats.prodDb.active}`);
  console.log(`  Expired: ${stats.prodDb.expired}`);
  console.log('');
}

/**
 * Build Steam ID index for production database
 */
function buildProdDbIndex(prodData) {
  console.log('Building production database index by Steam ID...');

  const index = new Map();

  prodData.forEach(entry => {
    const steamId = entry.steamid64;

    if (!index.has(steamId)) {
      index.set(steamId, []);
    }

    index.get(steamId).push(entry);
  });

  // Find duplicates (Steam IDs with multiple entries)
  for (const [steamId, entries] of index.entries()) {
    if (entries.length > 1) {
      stats.comparison.duplicatesInProd++;
      results.duplicatesInProd.push({
        steamId: steamId,
        count: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          source: e.source,
          reason: e.reason,
          granted_at: e.granted_at,
          expiration: e.expiration,
          approved: e.approved,
          revoked: e.revoked
        }))
      });
    }
  }

  console.log(`  Indexed ${index.size} unique Steam IDs`);
  console.log(`  Found ${stats.comparison.duplicatesInProd} Steam IDs with multiple entries`);
  console.log('');

  return index;
}

/**
 * Compare BattleMetrics donations with production database
 */
function compareData(bmData, prodDbIndex) {
  console.log('Comparing BattleMetrics donations with production database...');

  bmData.forEach(bmEntry => {
    const steamId = bmEntry.player.steamId;
    const prodEntries = prodDbIndex.get(steamId);

    if (!prodEntries || prodEntries.length === 0) {
      // No matching Steam ID in prod at all
      stats.comparison.missing++;
      results.missing.push({
        steamId: steamId,
        playerName: bmEntry.player.name,
        bmId: bmEntry.id,
        createdAt: bmEntry.createdAt,
        expiresAt: bmEntry.expiresAt,
        reason: bmEntry.reason,
        note: bmEntry.note
      });
      return;
    }

    // Steam ID exists in prod - check for overlaps
    const donationEntries = prodEntries.filter(e => e.source === 'donation');
    const manualEntries = prodEntries.filter(e => e.source === 'manual');
    const roleEntries = prodEntries.filter(e => e.source === 'role');

    if (donationEntries.length > 0) {
      // Exact match - BM donation exists in prod as donation
      stats.comparison.exactMatches++;
      results.exactMatches.push({
        steamId: steamId,
        playerName: bmEntry.player.name,
        bmId: bmEntry.id,
        bmCreatedAt: bmEntry.createdAt,
        bmExpiresAt: bmEntry.expiresAt,
        prodEntries: donationEntries.map(e => ({
          id: e.id,
          granted_at: e.granted_at,
          expiration: e.expiration,
          approved: e.approved,
          revoked: e.revoked
        }))
      });
    }

    if (manualEntries.length > 0) {
      // Manual overlap - BM donation exists in prod as manual entry
      stats.comparison.manualOverlaps++;
      results.manualOverlaps.push({
        steamId: steamId,
        playerName: bmEntry.player.name,
        bmId: bmEntry.id,
        bmCreatedAt: bmEntry.createdAt,
        bmExpiresAt: bmEntry.expiresAt,
        prodEntries: manualEntries.map(e => ({
          id: e.id,
          source: e.source,
          reason: e.reason,
          granted_at: e.granted_at,
          granted_by: e.granted_by,
          expiration: e.expiration,
          approved: e.approved,
          revoked: e.revoked
        }))
      });
    }

    if (roleEntries.length > 0) {
      // Role overlap - BM donation exists in prod as role-based entry
      stats.comparison.roleOverlaps++;
      results.roleOverlaps.push({
        steamId: steamId,
        playerName: bmEntry.player.name,
        bmId: bmEntry.id,
        bmCreatedAt: bmEntry.createdAt,
        bmExpiresAt: bmEntry.expiresAt,
        prodEntries: roleEntries.map(e => ({
          id: e.id,
          role_name: e.role_name,
          granted_at: e.granted_at,
          expiration: e.expiration,
          approved: e.approved,
          revoked: e.revoked
        }))
      });
    }

    if (prodEntries.length > 1) {
      // Multiple entries in prod for this Steam ID
      stats.comparison.multipleEntriesSameSteam++;
      results.multipleEntries.push({
        steamId: steamId,
        playerName: bmEntry.player.name,
        bmId: bmEntry.id,
        bmCreatedAt: bmEntry.createdAt,
        bmExpiresAt: bmEntry.expiresAt,
        prodEntryCount: prodEntries.length,
        prodEntries: prodEntries.map(e => ({
          id: e.id,
          source: e.source,
          reason: e.reason,
          granted_at: e.granted_at,
          expiration: e.expiration,
          approved: e.approved,
          revoked: e.revoked
        }))
      });
    }
  });

  console.log('  Comparison complete!');
  console.log(`    Exact matches (donation in both): ${stats.comparison.exactMatches}`);
  console.log(`    Manual overlaps (manual in prod): ${stats.comparison.manualOverlaps}`);
  console.log(`    Role overlaps (role in prod): ${stats.comparison.roleOverlaps}`);
  console.log(`    Multiple entries (same Steam ID): ${stats.comparison.multipleEntriesSameSteam}`);
  console.log(`    Missing from prod entirely: ${stats.comparison.missing}`);
  console.log('');
}

/**
 * Generate detailed comparison report
 */
function generateReport() {
  const lines = [];

  lines.push('BattleMetrics vs Production Database Comparison Report');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('BattleMetrics Donation Data:');
  lines.push(`  Total: ${stats.battlemetrics.total}`);
  lines.push(`  Active: ${stats.battlemetrics.active}`);
  lines.push(`  Expired: ${stats.battlemetrics.expired}`);
  lines.push('');

  lines.push('Production Database Data:');
  lines.push(`  Total entries: ${stats.prodDb.total}`);
  lines.push(`  By source:`);
  lines.push(`    donation: ${stats.prodDb.donations}`);
  lines.push(`    manual: ${stats.prodDb.manual}`);
  lines.push(`    role: ${stats.prodDb.role}`);
  lines.push(`  Active: ${stats.prodDb.active}`);
  lines.push(`  Expired: ${stats.prodDb.expired}`);
  lines.push('');

  lines.push('Comparison Results:');
  lines.push(`  Exact matches (donation in both): ${stats.comparison.exactMatches}`);
  lines.push(`  Manual overlaps (BM donation exists as manual in prod): ${stats.comparison.manualOverlaps}`);
  lines.push(`  Role overlaps (BM donation exists as role in prod): ${stats.comparison.roleOverlaps}`);
  lines.push(`  Multiple prod entries for same Steam ID: ${stats.comparison.multipleEntriesSameSteam}`);
  lines.push(`  Missing from prod entirely: ${stats.comparison.missing}`);
  lines.push(`  Steam IDs with duplicates in prod: ${stats.comparison.duplicatesInProd}`);
  lines.push('');

  lines.push('Migration Status:');
  const migrated = stats.comparison.exactMatches;
  const notMigrated = stats.battlemetrics.total - migrated;
  const migrationRate = ((migrated / stats.battlemetrics.total) * 100).toFixed(2);
  lines.push(`  Successfully migrated as donations: ${migrated} (${migrationRate}%)`);
  lines.push(`  Not migrated as donations: ${notMigrated}`);
  lines.push('');

  lines.push('Action Items:');
  lines.push(`  1. Review manual overlaps (${stats.comparison.manualOverlaps}) - may need source correction`);
  lines.push(`  2. Import missing donations (${stats.comparison.missing}) - completely absent from prod`);
  lines.push(`  3. Review duplicates (${stats.comparison.duplicatesInProd} Steam IDs) - may need consolidation`);
  lines.push('');

  lines.push('Output Files:');
  lines.push('  - comparison-exact-matches.json (donation exists in both)');
  lines.push('  - comparison-manual-overlaps.json (exists as manual in prod)');
  lines.push('  - comparison-role-overlaps.json (exists as role in prod)');
  lines.push('  - comparison-multiple-entries.json (multiple prod entries)');
  lines.push('  - comparison-missing.json (missing from prod entirely)');
  lines.push('  - comparison-prod-duplicates.json (duplicate Steam IDs in prod)');
  lines.push('  - comparison-summary.txt (this file)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('BattleMetrics vs Production Database Comparison');
    console.log('='.repeat(70));
    console.log('');

    // Load data
    console.log('Loading export files...');
    const bmData = loadJsonFile(CONFIG.battlemetricsFile);
    const prodData = loadJsonFile(CONFIG.prodDbFile);
    console.log(`  Loaded ${bmData.length} BattleMetrics donations`);
    console.log(`  Loaded ${prodData.length} production DB entries`);
    console.log('');

    // Analyze data
    analyzeBattleMetrics(bmData);
    analyzeProdDb(prodData);

    // Build index
    const prodDbIndex = buildProdDbIndex(prodData);

    // Compare
    compareData(bmData, prodDbIndex);

    // Generate outputs
    console.log('Generating output files...');

    const outputPath = (filename) => path.join(CONFIG.outputDir, filename);

    // Save detailed results
    fs.writeFileSync(outputPath('comparison-exact-matches.json'), JSON.stringify(results.exactMatches, null, 2));
    console.log(`  ✓ comparison-exact-matches.json (${results.exactMatches.length} entries)`);

    fs.writeFileSync(outputPath('comparison-manual-overlaps.json'), JSON.stringify(results.manualOverlaps, null, 2));
    console.log(`  ✓ comparison-manual-overlaps.json (${results.manualOverlaps.length} entries)`);

    fs.writeFileSync(outputPath('comparison-role-overlaps.json'), JSON.stringify(results.roleOverlaps, null, 2));
    console.log(`  ✓ comparison-role-overlaps.json (${results.roleOverlaps.length} entries)`);

    fs.writeFileSync(outputPath('comparison-multiple-entries.json'), JSON.stringify(results.multipleEntries, null, 2));
    console.log(`  ✓ comparison-multiple-entries.json (${results.multipleEntries.length} entries)`);

    fs.writeFileSync(outputPath('comparison-missing.json'), JSON.stringify(results.missing, null, 2));
    console.log(`  ✓ comparison-missing.json (${results.missing.length} entries)`);

    fs.writeFileSync(outputPath('comparison-prod-duplicates.json'), JSON.stringify(results.duplicatesInProd, null, 2));
    console.log(`  ✓ comparison-prod-duplicates.json (${results.duplicatesInProd.length} entries)`);

    // Save summary
    const summary = generateReport();
    fs.writeFileSync(outputPath('comparison-summary.txt'), summary);
    console.log(`  ✓ comparison-summary.txt`);

    console.log('');
    console.log('='.repeat(70));
    console.log('Comparison Complete!');
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
