#!/usr/bin/env node
/**
 * Test script for whitelist stacking functionality
 *
 * This script tests that consecutive whitelist grants properly stack their expiration dates
 * instead of calculating from the current time.
 */

require('dotenv').config();
const { Whitelist } = require('../src/database/models');
const { sequelize } = require('../config/database');

async function testWhitelistStacking() {
  console.log('Testing whitelist stacking functionality...\n');

  const testSteamId = '76561199999999999'; // Test Steam ID
  const testGrantedBy = 'TEST_SCRIPT';

  try {
    // Clean up any existing test entries
    console.log('Cleaning up existing test entries...');
    await Whitelist.destroy({
      where: { steamid64: testSteamId }
    });

    // Test 1: First grant (14 days)
    console.log('\n=== Test 1: First Grant (14 days) ===');
    const grant1 = await Whitelist.grantWhitelist({
      steamid64: testSteamId,
      username: 'Test User',
      discord_username: 'testuser#0000',
      reason: 'reporting',
      duration_value: 14,
      duration_type: 'days',
      granted_by: testGrantedBy
    });

    const grant1Expiration = new Date(grant1.expiration);
    const grant1GrantedAt = new Date(grant1.granted_at);
    const grant1DaysFromNow = Math.ceil((grant1Expiration - grant1GrantedAt) / (1000 * 60 * 60 * 24));

    console.log('Grant 1:');
    console.log(`  Granted at: ${grant1GrantedAt.toISOString()}`);
    console.log(`  Expires at: ${grant1Expiration.toISOString()}`);
    console.log(`  Duration: ${grant1DaysFromNow} days`);
    console.log(`  ✓ Expected: 14 days, Got: ${grant1DaysFromNow} days`);

    // Test 2: Second grant (16 days) - should stack from first expiration
    console.log('\n=== Test 2: Second Grant (16 days) - Should Stack ===');
    const grant2 = await Whitelist.grantWhitelist({
      steamid64: testSteamId,
      username: 'Test User',
      discord_username: 'testuser#0000',
      reason: 'reporting',
      duration_value: 16,
      duration_type: 'days',
      granted_by: testGrantedBy
    });

    const grant2Expiration = new Date(grant2.expiration);
    const grant2GrantedAt = new Date(grant2.granted_at);
    const totalDaysFromGrant1 = Math.ceil((grant2Expiration - grant1GrantedAt) / (1000 * 60 * 60 * 24));

    console.log('Grant 2:');
    console.log(`  Granted at: ${grant2GrantedAt.toISOString()}`);
    console.log(`  Expires at: ${grant2Expiration.toISOString()}`);
    console.log(`  Should stack from Grant 1's expiration: ${grant1Expiration.toISOString()}`);
    console.log(`  Total duration from Grant 1: ${totalDaysFromGrant1} days`);
    console.log(`  ✓ Expected: ~30 days (14 + 16), Got: ${totalDaysFromGrant1} days`);

    // Verify stacking worked correctly
    const expectedTotalDays = 30; // 14 + 16
    const tolerance = 1; // Allow 1 day tolerance for rounding

    if (Math.abs(totalDaysFromGrant1 - expectedTotalDays) <= tolerance) {
      console.log('\n✅ PASS: Whitelist grants stack correctly!');
      console.log(`   Grant 2 expires ${totalDaysFromGrant1} days after Grant 1 was created (expected ~${expectedTotalDays})`);
    } else {
      console.log('\n❌ FAIL: Whitelist grants did NOT stack correctly!');
      console.log(`   Grant 2 expires ${totalDaysFromGrant1} days after Grant 1 was created (expected ~${expectedTotalDays})`);
      console.log(`   Grant 2 should expire on or around: ${new Date(grant1GrantedAt.getTime() + (expectedTotalDays * 24 * 60 * 60 * 1000)).toISOString()}`);
      process.exit(1);
    }

    // Test 3: Get active whitelist status
    console.log('\n=== Test 3: Active Whitelist Status ===');
    const status = await Whitelist.getActiveWhitelistForUser(testSteamId);
    const statusExpirationDays = Math.ceil((status.expiration - grant1GrantedAt) / (1000 * 60 * 60 * 24));

    console.log('Status:');
    console.log(`  Has whitelist: ${status.hasWhitelist}`);
    console.log(`  Status: ${status.status}`);
    console.log(`  Expiration: ${status.expiration?.toISOString()}`);
    console.log(`  Days from Grant 1: ${statusExpirationDays}`);
    console.log(`  ✓ Expected: ${status.hasWhitelist} = true, ~${expectedTotalDays} days`);

    if (status.hasWhitelist && Math.abs(statusExpirationDays - expectedTotalDays) <= tolerance) {
      console.log('\n✅ PASS: Active whitelist status shows correct stacked expiration!');
    } else {
      console.log('\n❌ FAIL: Active whitelist status is incorrect!');
      process.exit(1);
    }

    // Test 4: Third grant (7 days) - should stack from combined expiration
    console.log('\n=== Test 4: Third Grant (7 days) - Should Stack from Combined ===');
    const grant3 = await Whitelist.grantWhitelist({
      steamid64: testSteamId,
      username: 'Test User',
      discord_username: 'testuser#0000',
      reason: 'reporting',
      duration_value: 7,
      duration_type: 'days',
      granted_by: testGrantedBy
    });

    const grant3Expiration = new Date(grant3.expiration);
    const totalDaysFromGrant1After3 = Math.ceil((grant3Expiration - grant1GrantedAt) / (1000 * 60 * 60 * 24));
    const expectedTotalDaysAfter3 = 37; // 14 + 16 + 7

    console.log('Grant 3:');
    console.log(`  Granted at: ${grant3.granted_at}`);
    console.log(`  Expires at: ${grant3Expiration.toISOString()}`);
    console.log(`  Total duration from Grant 1: ${totalDaysFromGrant1After3} days`);
    console.log(`  ✓ Expected: ~${expectedTotalDaysAfter3} days (14 + 16 + 7), Got: ${totalDaysFromGrant1After3} days`);

    if (Math.abs(totalDaysFromGrant1After3 - expectedTotalDaysAfter3) <= tolerance) {
      console.log('\n✅ PASS: Third grant stacked correctly!');
    } else {
      console.log('\n❌ FAIL: Third grant did NOT stack correctly!');
      process.exit(1);
    }

    // Clean up
    console.log('\n=== Cleanup ===');
    await Whitelist.destroy({
      where: { steamid64: testSteamId }
    });
    console.log('Test entries cleaned up.');

    console.log('\n🎉 All tests passed! Whitelist stacking is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testWhitelistStacking();
