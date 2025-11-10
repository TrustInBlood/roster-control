#!/usr/bin/env node

/**
 * Production Database Whitelist Export
 *
 * This script connects to the production database and exports all whitelist entries
 * to prepare for migration. Generates JSON export and summary statistics.
 *
 * Usage: node scripts/export-prod-whitelists.js
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

// Statistics tracking
const stats = {
  total: 0,
  bySource: {},
  byType: {},
  active: 0,
  expired: 0,
  revoked: 0,
  permanent: 0,
  temporary: 0,
  withSteamId: 0,
  withoutSteamId: 0,
  withEosId: 0,
  withoutEosId: 0,
  approved: 0,
  unapproved: 0
};

/**
 * Connect to production database and fetch all whitelists
 */
async function fetchProductionWhitelists() {
  console.log('Connecting to production database...');
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
  console.log(`Database: ${process.env.DB_NAME}`);
  console.log('');

  let sequelize;

  try {
    // Create Sequelize connection to production database
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
        logging: false // Suppress SQL logging
      }
    );

    // Test connection
    await sequelize.authenticate();
    console.log('Connected successfully!');
    console.log('');

    // Query all whitelists
    console.log('Fetching all whitelist entries...');
    const rows = await sequelize.query(
      'SELECT * FROM whitelists ORDER BY granted_at ASC',
      { type: QueryTypes.SELECT }
    );

    console.log(`Fetched ${rows.length} total whitelist entries`);
    console.log('');

    return rows;

  } catch (error) {
    console.error('Database connection error:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
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
 * Process and analyze whitelist entries
 */
function analyzeWhitelists(entries) {
  console.log('Analyzing whitelist entries...');
  const now = new Date();

  const processed = entries.map(entry => {
    stats.total++;

    // Count by source
    const source = entry.source || 'unknown';
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;

    // Count by type
    const type = entry.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // Approved status
    if (entry.approved) {
      stats.approved++;
    } else {
      stats.unapproved++;
    }

    // Revoked status
    if (entry.revoked) {
      stats.revoked++;
    }

    // Steam ID presence
    if (entry.steamid64) {
      stats.withSteamId++;
    } else {
      stats.withoutSteamId++;
    }

    // EOS ID presence
    if (entry.eosID) {
      stats.withEosId++;
    } else {
      stats.withoutEosId++;
    }

    // Duration analysis
    let status = 'unknown';
    let daysLeft = null;

    if (entry.revoked) {
      status = 'revoked';
    } else if (!entry.approved) {
      status = 'unapproved';
    } else if (entry.duration_value === null && entry.duration_type === null) {
      // Permanent whitelist
      status = 'permanent';
      stats.permanent++;
      stats.active++;
    } else if (entry.expiration) {
      // Temporary whitelist with expiration date
      const expirationDate = new Date(entry.expiration);

      if (expirationDate > now) {
        status = 'active';
        stats.active++;
        daysLeft = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
      } else {
        status = 'expired';
        stats.expired++;
      }
      stats.temporary++;
    } else if (entry.duration_value === 0) {
      // Expired entry (marked with duration_value = 0)
      status = 'expired';
      stats.expired++;
      stats.temporary++;
    } else {
      // Has duration but no expiration date calculated
      status = 'active';
      stats.active++;
      stats.temporary++;
    }

    // Parse metadata if it's a string
    let metadata = entry.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        // Keep as string if parse fails
      }
    }

    return {
      id: entry.id,
      type: entry.type,
      steamid64: entry.steamid64,
      eosID: entry.eosID,
      username: entry.username,
      discord_username: entry.discord_username,
      discord_user_id: entry.discord_user_id,
      group_id: entry.group_id,
      approved: entry.approved,
      expiration: entry.expiration,
      reason: entry.reason,
      duration_value: entry.duration_value,
      duration_type: entry.duration_type,
      granted_by: entry.granted_by,
      granted_at: entry.granted_at,
      revoked: entry.revoked,
      revoked_by: entry.revoked_by,
      revoked_reason: entry.revoked_reason,
      revoked_at: entry.revoked_at,
      source: entry.source,
      role_name: entry.role_name,
      metadata: metadata,
      // Analysis fields
      _analysis: {
        status: status,
        daysLeft: daysLeft
      }
    };
  });

  console.log(`Analyzed ${processed.length} entries`);
  console.log('');

  return processed;
}

/**
 * Generate summary statistics
 */
function generateSummary(entries) {
  const lines = [];
  lines.push('Production Database Whitelist Export Summary');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`);
  lines.push('');

  lines.push('Overall Statistics:');
  lines.push(`  Total entries: ${stats.total}`);
  lines.push(`  Approved: ${stats.approved}`);
  lines.push(`  Unapproved: ${stats.unapproved}`);
  lines.push(`  Revoked: ${stats.revoked}`);
  lines.push('');

  lines.push('By Source:');
  Object.entries(stats.bySource).sort().forEach(([source, count]) => {
    lines.push(`  ${source}: ${count}`);
  });
  lines.push('');

  lines.push('By Type:');
  Object.entries(stats.byType).sort().forEach(([type, count]) => {
    lines.push(`  ${type}: ${count}`);
  });
  lines.push('');

  lines.push('Duration Statistics:');
  lines.push(`  Permanent: ${stats.permanent}`);
  lines.push(`  Temporary: ${stats.temporary}`);
  lines.push(`  Active: ${stats.active}`);
  lines.push(`  Expired: ${stats.expired}`);
  lines.push('');

  lines.push('Identifier Statistics:');
  lines.push(`  With Steam ID: ${stats.withSteamId}`);
  lines.push(`  Without Steam ID: ${stats.withoutSteamId}`);
  lines.push(`  With EOS ID: ${stats.withEosId}`);
  lines.push(`  Without EOS ID: ${stats.withoutEosId}`);
  lines.push('');

  lines.push('Output Files:');
  lines.push('  - prod-whitelists-export.json (all entries)');
  lines.push('  - prod-whitelists-active.json (active only)');
  lines.push('  - prod-whitelists-summary.txt (this file)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Production Database Whitelist Export');
    console.log('='.repeat(70));
    console.log('');

    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      console.log(`Created output directory: ${CONFIG.outputDir}`);
      console.log('');
    }

    // Fetch data from production database
    const entries = await fetchProductionWhitelists();

    if (entries.length === 0) {
      console.log('WARNING: No whitelist entries found in production database!');
      return;
    }

    // Analyze entries
    const processed = analyzeWhitelists(entries);

    // Generate outputs
    console.log('Generating outputs...');

    // Full JSON export
    const jsonPath = path.join(CONFIG.outputDir, 'prod-whitelists-export.json');
    fs.writeFileSync(jsonPath, JSON.stringify(processed, null, 2));
    console.log(`✓ Full JSON export: ${jsonPath}`);

    // Active-only JSON export
    const activeEntries = processed.filter(entry =>
      entry._analysis.status === 'active' || entry._analysis.status === 'permanent'
    );
    const activeJsonPath = path.join(CONFIG.outputDir, 'prod-whitelists-active.json');
    fs.writeFileSync(activeJsonPath, JSON.stringify(activeEntries, null, 2));
    console.log(`✓ Active JSON export: ${activeJsonPath} (${activeEntries.length} entries)`);

    // Summary
    const summary = generateSummary(processed);
    const summaryPath = path.join(CONFIG.outputDir, 'prod-whitelists-summary.txt');
    fs.writeFileSync(summaryPath, summary);
    console.log(`✓ Summary: ${summaryPath}`);

    console.log('');
    console.log('='.repeat(70));
    console.log('Export Complete!');
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
