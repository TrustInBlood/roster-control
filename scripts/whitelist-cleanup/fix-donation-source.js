#!/usr/bin/env node

/**
 * Fix Donation Source Field
 *
 * This script identifies whitelist entries that were migrated from BattleMetrics
 * but incorrectly tagged with source='manual' instead of source='donation'.
 * It generates SQL UPDATE statements to correct the source field.
 *
 * Identification criteria:
 * - source = 'manual'
 * - reason starts with 'Rewarded Whitelist via Donation:'
 *
 * Usage: node scripts/fix-donation-source.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '..', 'migration-output'),
  prodDbFile: 'prod-whitelists-export.json'
};

// Statistics
const stats = {
  total: 0,
  needsCorrection: 0,
  alreadyCorrect: 0,
  revoked: 0,
  unapproved: 0
};

// Results
const results = {
  toFix: [],
  alreadyCorrect: []
};

/**
 * Load production database export
 */
function loadProdDb() {
  const filePath = path.join(CONFIG.outputDir, CONFIG.prodDbFile);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Analyze entries to find incorrectly tagged donations
 */
function analyzeEntries(prodData) {
  console.log('Analyzing entries for source field corrections...');

  prodData.forEach(entry => {
    const reason = entry.reason || '';

    // Check if this looks like a donation entry
    if (reason.startsWith('Rewarded Whitelist via Donation:')) {
      stats.total++;

      if (entry.source === 'donation') {
        // Already correct
        stats.alreadyCorrect++;
        results.alreadyCorrect.push({
          id: entry.id,
          steamid64: entry.steamid64,
          username: entry.username,
          source: entry.source,
          reason: entry.reason,
          granted_at: entry.granted_at,
          approved: entry.approved,
          revoked: entry.revoked
        });
      } else if (entry.source === 'manual') {
        // Needs correction
        stats.needsCorrection++;

        if (entry.revoked) {
          stats.revoked++;
        }
        if (!entry.approved) {
          stats.unapproved++;
        }

        results.toFix.push({
          id: entry.id,
          steamid64: entry.steamid64,
          username: entry.username,
          source: entry.source,
          reason: entry.reason,
          granted_at: entry.granted_at,
          granted_by: entry.granted_by,
          expiration: entry.expiration,
          approved: entry.approved,
          revoked: entry.revoked
        });
      }
    }
  });

  console.log(`  Total donation entries found: ${stats.total}`);
  console.log(`  Already correct (source='donation'): ${stats.alreadyCorrect}`);
  console.log(`  Needs correction (source='manual'): ${stats.needsCorrection}`);
  console.log(`    Of which revoked: ${stats.revoked}`);
  console.log(`    Of which unapproved: ${stats.unapproved}`);
  console.log('');
}

/**
 * Generate SQL UPDATE statements
 */
function generateSQL() {
  const lines = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  lines.push('-- Fix Donation Source Field');
  lines.push(`-- Generated: ${timestamp}`);
  lines.push(`-- Total entries to fix: ${stats.needsCorrection}`);
  lines.push('-- Changes: source = "manual" -> source = "donation"');
  lines.push('');
  lines.push('-- IMPORTANT: Review these updates before executing!');
  lines.push('-- This will change the source field for entries that were migrated');
  lines.push('-- from BattleMetrics but incorrectly tagged as manual.');
  lines.push('');

  if (results.toFix.length === 0) {
    lines.push('-- No entries need correction!');
    return lines.join('\n');
  }

  // Generate UPDATE statement for all entries at once
  const ids = results.toFix.map(entry => entry.id);

  lines.push('-- Update all entries in one statement');
  lines.push('UPDATE whitelists');
  lines.push('SET source = \'donation\'');
  lines.push('WHERE id IN (');

  // Split into chunks of 100 IDs per line for readability
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const isLast = i + 100 >= ids.length;
    lines.push(`  ${chunk.join(', ')}${isLast ? '' : ','}`);
  }

  lines.push(');');
  lines.push('');

  // Add verification query
  lines.push('-- Verification query (run after update)');
  lines.push('SELECT source, COUNT(*) as count');
  lines.push('FROM whitelists');
  lines.push('WHERE reason LIKE \'Rewarded Whitelist via Donation:%\'');
  lines.push('GROUP BY source;');
  lines.push('');

  lines.push('-- Expected result after update:');
  lines.push(`-- source='donation': ${stats.total} (${stats.alreadyCorrect} already + ${stats.needsCorrection} fixed)`);
  lines.push('-- source='manual': 0');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate summary report
 */
function generateSummary() {
  const lines = [];

  lines.push('Donation Source Field Fix - Summary Report');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('Analysis Results:');
  lines.push(`  Total donation entries: ${stats.total}`);
  lines.push(`  Already correct (source='donation'): ${stats.alreadyCorrect}`);
  lines.push(`  Needs correction (source='manual'): ${stats.needsCorrection}`);
  lines.push('');

  lines.push('Entries Needing Correction:');
  lines.push(`  Total: ${stats.needsCorrection}`);
  lines.push(`  Revoked: ${stats.revoked}`);
  lines.push(`  Unapproved: ${stats.unapproved}`);
  lines.push(`  Active/Approved: ${stats.needsCorrection - stats.revoked - stats.unapproved}`);
  lines.push('');

  lines.push('What This Script Does:');
  lines.push('  1. Identifies entries with reason starting with "Rewarded Whitelist via Donation:"');
  lines.push('  2. Finds entries where source="manual" (incorrect)');
  lines.push('  3. Generates SQL UPDATE to change source="manual" to source="donation"');
  lines.push('');

  lines.push('Output Files:');
  lines.push('  - fix-donation-source.sql (SQL UPDATE statements)');
  lines.push('  - fix-donation-source-list.json (entries to fix)');
  lines.push('  - fix-donation-source-summary.txt (this file)');
  lines.push('');

  lines.push('Next Steps:');
  lines.push('  1. Review fix-donation-source.sql');
  lines.push('  2. Test on development database first');
  lines.push('  3. Verify results with the included verification query');
  lines.push('  4. Execute on production database');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Fix Donation Source Field');
    console.log('='.repeat(70));
    console.log('');

    // Load data
    console.log('Loading production database export...');
    const prodData = loadProdDb();
    console.log(`  Loaded ${prodData.length} entries`);
    console.log('');

    // Analyze
    analyzeEntries(prodData);

    // Generate outputs
    console.log('Generating output files...');

    const outputPath = (filename) => path.join(CONFIG.outputDir, filename);

    // SQL statements
    const sql = generateSQL();
    fs.writeFileSync(outputPath('fix-donation-source.sql'), sql);
    console.log(`  ✓ fix-donation-source.sql`);

    // JSON list of entries to fix
    fs.writeFileSync(outputPath('fix-donation-source-list.json'), JSON.stringify(results.toFix, null, 2));
    console.log(`  ✓ fix-donation-source-list.json (${results.toFix.length} entries)`);

    // Summary
    const summary = generateSummary();
    fs.writeFileSync(outputPath('fix-donation-source-summary.txt'), summary);
    console.log(`  ✓ fix-donation-source-summary.txt`);

    console.log('');
    console.log('='.repeat(70));
    console.log('Complete!');
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
