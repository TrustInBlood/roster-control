#!/usr/bin/env node

/**
 * Analyze Revoked and Unapproved Entries
 *
 * This script shows details about revoked and unapproved whitelist entries.
 *
 * Usage: node scripts/analyze-revoked-unapproved.js
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

async function main() {
  console.log('Analyze Revoked and Unapproved Entries');
  console.log('='.repeat(70));
  console.log('');

  let sequelize;

  try {
    // Connect to database
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

    // Query revoked entries
    console.log('REVOKED ENTRIES (38 total)');
    console.log('-'.repeat(70));
    console.log('');

    const revokedEntries = await sequelize.query(
      `SELECT id, steamid64, username, source, type, reason, granted_at, granted_by,
              revoked, revoked_at, revoked_by, revoked_reason, expiration
       FROM whitelists
       WHERE revoked = 1
       ORDER BY revoked_at DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log(`Found ${revokedEntries.length} revoked entries:`);
    console.log('');

    revokedEntries.forEach((entry, index) => {
      console.log(`${index + 1}. ID ${entry.id}: ${entry.steamid64} (${entry.username || 'no username'})`);
      console.log(`   Source: ${entry.source || 'NULL'} | Type: ${entry.type || 'NULL'}`);
      console.log(`   Granted: ${entry.granted_at} by ${entry.granted_by || 'NULL'}`);
      console.log(`   Revoked: ${entry.revoked_at || 'NULL'} by ${entry.revoked_by || 'NULL'}`);
      console.log(`   Revoked Reason: ${entry.revoked_reason || 'NULL'}`);
      console.log(`   Original Reason: ${entry.reason ? entry.reason.substring(0, 80) : 'NULL'}`);
      console.log('');
    });

    // Query unapproved entries
    console.log('');
    console.log('UNAPPROVED ENTRIES (13 total)');
    console.log('-'.repeat(70));
    console.log('');

    const unapprovedEntries = await sequelize.query(
      `SELECT id, steamid64, username, source, type, reason, granted_at, granted_by,
              approved, expiration, duration_value, duration_type
       FROM whitelists
       WHERE approved = 0
       ORDER BY granted_at DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log(`Found ${unapprovedEntries.length} unapproved entries:`);
    console.log('');

    unapprovedEntries.forEach((entry, index) => {
      console.log(`${index + 1}. ID ${entry.id}: ${entry.steamid64} (${entry.username || 'no username'})`);
      console.log(`   Source: ${entry.source || 'NULL'} | Type: ${entry.type || 'NULL'}`);
      console.log(`   Granted: ${entry.granted_at} by ${entry.granted_by || 'NULL'}`);
      console.log(`   Duration: ${entry.duration_value || 'NULL'} ${entry.duration_type || 'NULL'}`);
      console.log(`   Expiration: ${entry.expiration || 'NULL'}`);
      console.log(`   Reason: ${entry.reason ? entry.reason.substring(0, 80) : 'NULL'}`);
      console.log('');
    });

    // Summary statistics
    console.log('');
    console.log('SUMMARY');
    console.log('-'.repeat(70));
    console.log('');

    // Revoked by source
    const revokedBySource = {};
    revokedEntries.forEach(entry => {
      const source = entry.source || 'NULL';
      revokedBySource[source] = (revokedBySource[source] || 0) + 1;
    });

    console.log('Revoked entries by source:');
    Object.entries(revokedBySource).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
    console.log('');

    // Unapproved by source
    const unapprovedBySource = {};
    unapprovedEntries.forEach(entry => {
      const source = entry.source || 'NULL';
      unapprovedBySource[source] = (unapprovedBySource[source] || 0) + 1;
    });

    console.log('Unapproved entries by source:');
    Object.entries(unapprovedBySource).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
    console.log('');

    // Recent revocations
    const recentRevoked = revokedEntries.filter(entry => {
      if (!entry.revoked_at) return false;
      const revokedDate = new Date(entry.revoked_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return revokedDate > thirtyDaysAgo;
    });

    console.log(`Recent revocations (last 30 days): ${recentRevoked.length}`);
    console.log('');

    // Export to JSON
    const outputDir = path.join(__dirname, '..', 'migration-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, 'revoked-entries.json'),
      JSON.stringify(revokedEntries, null, 2)
    );

    fs.writeFileSync(
      path.join(outputDir, 'unapproved-entries.json'),
      JSON.stringify(unapprovedEntries, null, 2)
    );

    console.log('Exported to:');
    console.log('  migration-output/revoked-entries.json');
    console.log('  migration-output/unapproved-entries.json');
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
    }
  }
}

main();
