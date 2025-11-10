#!/usr/bin/env node

/**
 * BattleMetrics Donation Whitelist Export - Test Batch (500 entries)
 *
 * This script pulls the first 500 entries from BattleMetrics,
 * filters to 'Rewarded Whitelist via Donation', and generates:
 * - JSON file with filtered donation data
 * - SQL INSERT statements for database migration
 * - Summary statistics
 *
 * Usage: node scripts/export-battlemetrics-test.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const CONFIG = {
  pageSize: 100, // BattleMetrics API max
  pagesToFetch: null, // null = unlimited (fetch all pages)
  exactReasonMatch: 'Rewarded Whitelist via Donation',
  skipNoSteamId: true,
  maxCreatedDate: '2025-10-26T23:59:59.999Z', // Ignore entries created after Oct 26, 2025
  outputDir: path.join(__dirname, '..', 'migration-output'),
  sqlBatchSize: 100, // Rows per INSERT statement
  defaultGroupId: 1 // Default whitelist group ID
};

// Statistics tracking
const stats = {
  totalFetched: 0,
  matchingReason: 0,
  withSteamId: 0,
  withoutSteamId: 0,
  expired: 0,
  permanent: 0,
  temporary: 0,
  skipped: 0,
  tooRecent: 0,
  pagesFetched: 0
};

/**
 * Fetch all entries from BattleMetrics (unlimited pagination)
 */
async function fetchBattleMetricsData() {
  const baseUrl = 'https://api.battlemetrics.com';
  const token = process.env.BATTLEMETRICS_TOKEN;
  const banListId = process.env.BATTLEMETRICS_BANLIST_ID;

  if (!token || !banListId) {
    throw new Error('Missing BATTLEMETRICS_TOKEN or BATTLEMETRICS_BANLIST_ID in .env');
  }

  console.log('Fetching ALL entries from BattleMetrics (unlimited pagination)...');
  console.log(`Ban List ID: ${banListId}`);
  console.log(`Date filter: Ignoring entries created after ${CONFIG.maxCreatedDate}`);
  console.log('');

  const allData = [];
  const allIncluded = [];
  let nextUrl = null;
  let page = 0;

  try {
    do {
      page++;
      console.log(`Fetching page ${page}...`);

      let url = `${baseUrl}/bans`;
      let params = {
        'filter[banList]': banListId,
        'include': 'user,server',
        'page[size]': CONFIG.pageSize
      };

      // If we have a next URL from previous page, use it
      if (nextUrl) {
        const urlObj = new URL(nextUrl);
        url = `${baseUrl}${urlObj.pathname}${urlObj.search}`;
        params = {}; // nextUrl already has all params
      }

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: nextUrl ? {} : params,
        timeout: 30000
      });

      const pageData = response.data.data || [];
      const pageIncluded = response.data.included || [];

      allData.push(...pageData);
      allIncluded.push(...pageIncluded);

      console.log(`  Page ${page}: ${pageData.length} entries, ${pageIncluded.length} included items (Total: ${allData.length})`);

      // Get next page URL
      nextUrl = response.data.links?.next || null;

      // Rate limiting - wait 220ms between requests (~4.5 req/sec)
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 220));
      }
    } while (nextUrl);

    stats.totalFetched = allData.length;
    stats.pagesFetched = page;

    console.log(`\nFetched ${stats.totalFetched} total entries from BattleMetrics (${page} pages)`);
    console.log(`Total included data: ${allIncluded.length} items`);

    return {
      data: allData,
      included: allIncluded
    };
  } catch (error) {
    console.error('Error fetching from BattleMetrics:');
    console.error('Message:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    throw error;
  }
}

/**
 * Process whitelist batch and combine with user data
 * (Based on BattleMetricsService.processWhitelistBatch)
 */
function processWhitelistBatch(bans, included) {
  // Create user map for quick lookup
  const userMap = new Map();
  if (included && Array.isArray(included)) {
    included.forEach(item => {
      if (item.type === 'user') {
        userMap.set(item.id, item);
      }
    });
  }

  return bans.map(ban => {
    const userId = ban.relationships?.user?.data?.id;
    const user = userId ? userMap.get(userId) : null;

    // Extract identifiers
    let steamId = null;
    let eosId = null;
    let playerName = ban.meta?.player || 'Unknown';

    // Get Steam ID from ban.attributes.identifiers
    if (ban.attributes?.identifiers && Array.isArray(ban.attributes.identifiers)) {
      const steamIdentifier = ban.attributes.identifiers.find(id => id.type === 'steamID');
      const eosIdentifier = ban.attributes.identifiers.find(id => id.type === 'eosID');

      if (steamIdentifier) {
        steamId = steamIdentifier.identifier;
      }
      if (eosIdentifier) {
        eosId = eosIdentifier.identifier;
      }

      // Use Steam profile name if available
      if (steamIdentifier?.metadata?.profile?.personaname) {
        playerName = steamIdentifier.metadata.profile.personaname;
      }
    }

    // Fallback to user attributes
    if (!steamId && user?.attributes?.steamID) {
      steamId = user.attributes.steamID;
    }
    if (!eosId && user?.attributes?.eosID) {
      eosId = user.attributes.eosID;
    }
    if (playerName === 'Unknown' && user?.attributes?.nickname) {
      playerName = user.attributes.nickname;
    }

    return {
      id: ban.id,
      reason: ban.attributes?.reason || '',
      note: ban.attributes?.note || '',
      expiresAt: ban.attributes?.expires || null,
      createdAt: ban.attributes?.timestamp || null,
      player: {
        id: userId || ban.id,
        name: playerName,
        steamId: steamId,
        eosId: eosId
      },
      battlemetricsMetadata: {
        battlemetricsId: ban.id,
        battlemetricsUserId: userId,
        originalReason: ban.attributes?.reason || '',
        originalNote: ban.attributes?.note || '',
        originalExpiresAt: ban.attributes?.expires || null,
        originalCreatedAt: ban.attributes?.timestamp || null
      }
    };
  });
}

/**
 * Calculate duration from expiration date
 * (Based on BattleMetricsService.calculateDuration)
 */
function calculateDuration(expiresAt, createdAt) {
  if (!expiresAt) {
    stats.permanent++;
    return { value: null, type: null }; // Permanent
  }

  const now = new Date();
  const expiration = new Date(expiresAt);
  const created = createdAt ? new Date(createdAt) : now;

  const diffMs = expiration - created;

  if (diffMs <= 0) {
    stats.expired++;
    return { value: 0, type: 'days' }; // Expired
  }

  stats.temporary++;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // If more than 60 days, express in months
  if (diffDays > 60) {
    const months = Math.ceil(diffDays / 30);
    return { value: months, type: 'months' };
  }

  return { value: diffDays, type: 'days' };
}

/**
 * Filter entries to only 'Rewarded Whitelist via Donation' created before max date
 */
function filterDonationEntries(entries) {
  console.log(`\nFiltering to exact match: "${CONFIG.exactReasonMatch}"`);
  console.log(`Date filter: Created on or before ${CONFIG.maxCreatedDate}`);

  const maxDate = new Date(CONFIG.maxCreatedDate);

  const filtered = entries.filter(entry => {
    // Date filter - skip entries created after max date
    if (entry.createdAt) {
      const createdDate = new Date(entry.createdAt);
      if (createdDate > maxDate) {
        stats.tooRecent++;
        stats.skipped++;
        return false;
      }
    }

    // Exact reason match
    if (entry.reason !== CONFIG.exactReasonMatch) {
      stats.skipped++;
      return false;
    }

    stats.matchingReason++;

    // Skip if no Steam ID
    if (!entry.player.steamId) {
      console.log(`Skipping entry ${entry.id} - No Steam ID (Player: ${entry.player.name})`);
      stats.withoutSteamId++;
      if (CONFIG.skipNoSteamId) {
        stats.skipped++;
        return false;
      }
    } else {
      stats.withSteamId++;
    }

    return true;
  });

  console.log(`Found ${filtered.length} matching donation entries (${stats.tooRecent} skipped as too recent)`);
  return filtered;
}

/**
 * Generate SQL INSERT statements
 */
function generateSQL(entries) {
  const sqlStatements = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Header comment
  sqlStatements.push('-- BattleMetrics Donation Whitelist Migration');
  sqlStatements.push(`-- Generated: ${timestamp}`);
  sqlStatements.push(`-- Total entries: ${entries.length}`);
  sqlStatements.push('-- Source: Rewarded Whitelist via Donation');
  sqlStatements.push('');

  // Batch entries into groups for INSERT statements
  for (let i = 0; i < entries.length; i += CONFIG.sqlBatchSize) {
    const batch = entries.slice(i, i + CONFIG.sqlBatchSize);

    sqlStatements.push(`-- Batch ${Math.floor(i / CONFIG.sqlBatchSize) + 1} (${batch.length} rows)`);
    sqlStatements.push('INSERT INTO whitelists (');
    sqlStatements.push('  type, steamid64, eosID, username, reason,');
    sqlStatements.push('  duration_value, duration_type, granted_by, granted_at,');
    sqlStatements.push('  expiration, approved, revoked, source, metadata, group_id');
    sqlStatements.push(') VALUES');

    const values = batch.map((entry, idx) => {
      const duration = calculateDuration(entry.expiresAt, entry.createdAt);
      const createdAt = entry.createdAt ? new Date(entry.createdAt).toISOString().replace('T', ' ').substring(0, 19) : timestamp;
      const expiration = entry.expiresAt ? new Date(entry.expiresAt).toISOString().replace('T', ' ').substring(0, 19) : 'NULL';

      const metadata = JSON.stringify({
        ...entry.battlemetricsMetadata,
        importedAt: timestamp
      });

      const steamId = entry.player.steamId || 'NULL';
      const eosId = entry.player.eosId ? `'${entry.player.eosId}'` : 'NULL';
      const username = entry.player.name ? `'${entry.player.name.replace(/'/g, "''")}'` : 'NULL';
      const durationValue = duration.value !== null ? duration.value : 'NULL';
      const durationType = duration.type ? `'${duration.type}'` : 'NULL';
      const expirationStr = expiration !== 'NULL' ? `'${expiration}'` : 'NULL';

      const row = `  ('whitelist', '${steamId}', ${eosId}, ${username}, 'Donation', ${durationValue}, ${durationType}, 'BATTLEMETRICS_MIGRATION', '${createdAt}', ${expirationStr}, 1, 0, 'donation', '${metadata.replace(/'/g, "''")}', ${CONFIG.defaultGroupId})`;

      // Add comma except for last row
      return idx < batch.length - 1 ? row + ',' : row + ';';
    });

    sqlStatements.push(...values);
    sqlStatements.push('');
  }

  return sqlStatements.join('\n');
}

/**
 * Generate summary statistics
 */
function generateSummary(entries) {
  const lines = [];
  lines.push('BattleMetrics Donation Whitelist Migration - Full Export Summary');
  lines.push('='.repeat(70));
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Date Filter: Entries created on or before ${CONFIG.maxCreatedDate}`);
  lines.push('');
  lines.push('Fetch Statistics:');
  lines.push(`  Pages fetched: ${stats.pagesFetched}`);
  lines.push(`  Total entries fetched: ${stats.totalFetched}`);
  lines.push(`  Too recent (after Oct 26): ${stats.tooRecent}`);
  lines.push(`  Matching "${CONFIG.exactReasonMatch}": ${stats.matchingReason}`);
  lines.push(`  With Steam ID: ${stats.withSteamId}`);
  lines.push(`  Without Steam ID: ${stats.withoutSteamId}`);
  lines.push(`  Total skipped: ${stats.skipped}`);
  lines.push('');
  lines.push('Duration Statistics:');
  lines.push(`  Permanent: ${stats.permanent}`);
  lines.push(`  Temporary: ${stats.temporary}`);
  lines.push(`  Expired: ${stats.expired}`);
  lines.push('');
  lines.push('Export Statistics:');
  lines.push(`  JSON entries: ${entries.length}`);
  lines.push(`  SQL INSERT batches: ${Math.ceil(entries.length / CONFIG.sqlBatchSize)}`);
  lines.push(`  Rows per batch: ${CONFIG.sqlBatchSize}`);
  lines.push('');
  lines.push('Output Files:');
  lines.push('  - battlemetrics-donations-full.json');
  lines.push('  - battlemetrics-donations-full.sql');
  lines.push('  - battlemetrics-donations-summary.txt');
  lines.push('');
  lines.push('Next Steps:');
  lines.push('  1. Review battlemetrics-donations-full.json for data accuracy');
  lines.push('  2. Inspect battlemetrics-donations-full.sql queries');
  lines.push('  3. Test SQL on development database');
  lines.push('  4. If successful, execute on production database');
  lines.push('');

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('BattleMetrics Donation Whitelist Export - FULL EXPORT');
    console.log('='.repeat(70));
    console.log('');

    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      console.log(`Created output directory: ${CONFIG.outputDir}`);
    }

    // Fetch data
    const { data, included } = await fetchBattleMetricsData();

    // Process entries
    console.log('\nProcessing entries...');
    const processed = processWhitelistBatch(data, included);

    // Filter to donation entries
    const donations = filterDonationEntries(processed);

    if (donations.length === 0) {
      console.log('\nWARNING: No matching donation entries found!');
      console.log('Check if the exact reason match is correct.');
      return;
    }

    // Generate outputs
    console.log('\nGenerating outputs...');

    // JSON export
    const jsonPath = path.join(CONFIG.outputDir, 'battlemetrics-donations-full.json');
    fs.writeFileSync(jsonPath, JSON.stringify(donations, null, 2));
    console.log(`✓ JSON export: ${jsonPath}`);

    // SQL export
    const sql = generateSQL(donations);
    const sqlPath = path.join(CONFIG.outputDir, 'battlemetrics-donations-full.sql');
    fs.writeFileSync(sqlPath, sql);
    console.log(`✓ SQL export: ${sqlPath}`);

    // Summary
    const summary = generateSummary(donations);
    const summaryPath = path.join(CONFIG.outputDir, 'battlemetrics-donations-summary.txt');
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
