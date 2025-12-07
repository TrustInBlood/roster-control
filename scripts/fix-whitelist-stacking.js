#!/usr/bin/env node
/**
 * Fix Whitelist Stacking - Retroactive Expiration Recalculation
 *
 * This script fixes existing whitelist entries that were granted with the old buggy logic
 * where consecutive grants calculated from the current time instead of stacking properly.
 *
 * Usage:
 *   node scripts/fix-whitelist-stacking.js --dry-run  # Preview changes
 *   node scripts/fix-whitelist-stacking.js            # Apply changes
 */

require('dotenv').config();
const { Whitelist } = require('../src/database/models');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

/**
 * Calculate expiration date from granted date and duration
 */
function calculateExpiration(grantedAt, durationValue, durationType) {
  const grantedDate = new Date(grantedAt);
  const expiration = new Date(grantedDate);

  if (durationType === 'days') {
    expiration.setDate(expiration.getDate() + durationValue);
  } else if (durationType === 'months') {
    expiration.setMonth(expiration.getMonth() + durationValue);
  } else if (durationType === 'hours') {
    const millisecondsPerHour = 60 * 60 * 1000;
    expiration.setTime(grantedDate.getTime() + (durationValue * millisecondsPerHour));
  }

  return expiration;
}

/**
 * Calculate stacked expiration for a set of entries
 */
function calculateStackedExpiration(entries) {
  if (entries.length === 0) {
    return null;
  }

  // Sort by granted_at to ensure proper stacking order
  const sortedEntries = [...entries].sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at));

  // Check for permanent entries
  const hasPermanent = sortedEntries.some(entry =>
    (entry.duration_value === null && entry.duration_type === null));

  if (hasPermanent) {
    return null; // Permanent whitelist
  }

  // Start from the earliest grant
  const earliestEntry = sortedEntries[0];
  let stackedExpiration = new Date(earliestEntry.granted_at);

  // Add up all durations
  let totalMonths = 0;
  let totalDays = 0;
  let totalHours = 0;

  sortedEntries.forEach(entry => {
    if (entry.duration_value === 0) return; // Skip expired entries

    if (entry.duration_type === 'months') {
      totalMonths += entry.duration_value;
    } else if (entry.duration_type === 'days') {
      totalDays += entry.duration_value;
    } else if (entry.duration_type === 'hours') {
      totalHours += entry.duration_value;
    }
  });

  // Apply the stacked duration
  if (totalMonths > 0) {
    stackedExpiration.setMonth(stackedExpiration.getMonth() + totalMonths);
  }
  if (totalDays > 0) {
    stackedExpiration.setDate(stackedExpiration.getDate() + totalDays);
  }
  if (totalHours > 0) {
    const millisecondsPerHour = 60 * 60 * 1000;
    stackedExpiration.setTime(stackedExpiration.getTime() + (totalHours * millisecondsPerHour));
  }

  return stackedExpiration;
}

async function fixWhitelistStacking() {
  console.log('='.repeat(80));
  console.log('Fix Whitelist Stacking - Retroactive Expiration Recalculation');
  console.log('='.repeat(80));
  console.log();

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made to the database\n');
  } else {
    console.log('⚠️  LIVE MODE - Changes will be written to the database\n');
  }

  try {
    // Find all non-revoked, non-role-based whitelist entries
    console.log('Fetching all active whitelist entries...');
    const allEntries = await Whitelist.findAll({
      where: {
        approved: true,
        revoked: false,
        source: { [Op.ne]: 'role' } // Exclude role-based entries
      },
      order: [['steamid64', 'ASC'], ['granted_at', 'ASC']]
    });

    console.log(`Found ${allEntries.length} active whitelist entries\n`);

    // Group entries by Steam ID
    const entriesBySteamId = new Map();
    for (const entry of allEntries) {
      if (!entriesBySteamId.has(entry.steamid64)) {
        entriesBySteamId.set(entry.steamid64, []);
      }
      entriesBySteamId.get(entry.steamid64).push(entry);
    }

    console.log(`Found ${entriesBySteamId.size} unique Steam IDs\n`);

    // Find users with multiple entries (candidates for stacking fixes)
    const usersWithMultipleEntries = Array.from(entriesBySteamId.entries())
      .filter(([_, entries]) => entries.length > 1);

    console.log(`Found ${usersWithMultipleEntries.length} users with multiple entries\n`);

    if (usersWithMultipleEntries.length === 0) {
      console.log('✅ No stacking issues found - all users have single entries');
      return;
    }

    console.log('='.repeat(80));
    console.log('Analyzing Stacking Issues');
    console.log('='.repeat(80));
    console.log();

    let totalUpdates = 0;
    const updateLog = [];

    for (const [steamId, entries] of usersWithMultipleEntries) {
      const sortedEntries = [...entries].sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at));

      console.log(`\n📋 Steam ID: ${steamId}`);
      console.log(`   Entries: ${entries.length}`);
      console.log(`   Username: ${sortedEntries[0].username || 'Unknown'}`);
      console.log(`   Discord: ${sortedEntries[0].discord_username || 'Not linked'}`);

      // Calculate what the correct stacked expiration should be
      const correctStackedExpiration = calculateStackedExpiration(sortedEntries);

      if (correctStackedExpiration === null) {
        console.log('   Status: Permanent whitelist - no fix needed');
        continue;
      }

      console.log('\n   Current entries:');
      sortedEntries.forEach((entry, index) => {
        const grantedAt = new Date(entry.granted_at);
        const currentExpiration = entry.expiration ? new Date(entry.expiration) : null;
        const individualExpiration = calculateExpiration(entry.granted_at, entry.duration_value, entry.duration_type);

        console.log(`     ${index + 1}. Granted: ${grantedAt.toISOString().split('T')[0]}`);
        console.log(`        Duration: ${entry.duration_value} ${entry.duration_type}`);
        console.log(`        Current expiration: ${currentExpiration ? currentExpiration.toISOString().split('T')[0] : 'null'}`);
        console.log(`        Individual expiration: ${individualExpiration.toISOString().split('T')[0]}`);
        console.log(`        Reason: ${entry.reason}`);
      });

      console.log(`\n   Correct stacked expiration: ${correctStackedExpiration.toISOString().split('T')[0]}`);

      // Check if any entries need updating
      // We only update the LAST entry's expiration to reflect the stacked total
      // The individual entries keep their original duration_value/duration_type for audit purposes
      const lastEntry = sortedEntries[sortedEntries.length - 1];
      const currentLastExpiration = lastEntry.expiration ? new Date(lastEntry.expiration) : null;

      // Compare dates (ignore time differences of less than 1 hour for floating point issues)
      const needsUpdate = !currentLastExpiration ||
        Math.abs(currentLastExpiration - correctStackedExpiration) > (60 * 60 * 1000);

      if (needsUpdate) {
        console.log('\n   ⚠️  Expiration mismatch detected!');
        console.log(`      Current: ${currentLastExpiration ? currentLastExpiration.toISOString().split('T')[0] : 'null'}`);
        console.log(`      Correct: ${correctStackedExpiration.toISOString().split('T')[0]}`);

        if (!isDryRun) {
          // Update the last entry's expiration to reflect stacked total
          await lastEntry.update({
            expiration: correctStackedExpiration
          });

          console.log(`      ✅ Updated entry #${lastEntry.id}`);
        } else {
          console.log(`      📝 Would update entry #${lastEntry.id}`);
        }

        totalUpdates++;
        updateLog.push({
          steamId,
          username: sortedEntries[0].username,
          discord_username: sortedEntries[0].discord_username,
          entryCount: sortedEntries.length,
          oldExpiration: currentLastExpiration,
          newExpiration: correctStackedExpiration,
          entryId: lastEntry.id
        });
      } else {
        console.log('\n   ✅ Expiration is correct - no update needed');
      }
    }

    // Summary
    console.log('\n');
    console.log('='.repeat(80));
    console.log('Summary');
    console.log('='.repeat(80));
    console.log();
    console.log(`Total Steam IDs analyzed: ${entriesBySteamId.size}`);
    console.log(`Users with multiple entries: ${usersWithMultipleEntries.length}`);
    console.log(`Entries ${isDryRun ? 'that would be' : ''} updated: ${totalUpdates}`);

    if (updateLog.length > 0) {
      console.log('\nDetailed Update Log:');
      console.log('─'.repeat(80));
      updateLog.forEach((log, index) => {
        console.log(`${index + 1}. ${log.username || log.steamId}`);
        console.log(`   Steam ID: ${log.steamId}`);
        console.log(`   Discord: ${log.discord_username || 'Not linked'}`);
        console.log(`   Entries: ${log.entryCount}`);
        console.log(`   Old Expiration: ${log.oldExpiration ? log.oldExpiration.toISOString().split('T')[0] : 'null'}`);
        console.log(`   New Expiration: ${log.newExpiration.toISOString().split('T')[0]}`);
        console.log(`   Entry ID: ${log.entryId}`);
        console.log();
      });
    }

    if (isDryRun && totalUpdates > 0) {
      console.log('\n💡 Run without --dry-run to apply these changes');
    } else if (!isDryRun && totalUpdates > 0) {
      console.log('\n✅ All expiration dates have been corrected!');
    } else {
      console.log('\n✅ No corrections needed - all expiration dates are correct!');
    }

  } catch (error) {
    console.error('\n❌ Error fixing whitelist stacking:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the fix
fixWhitelistStacking();
