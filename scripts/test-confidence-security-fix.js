/**
 * Test script to verify the confidence security fix
 * This simulates the scenario where a low-confidence link attempts to upgrade an entry
 */

require('dotenv-flow').config();
const { Whitelist, PlayerDiscordLink } = require('../src/database/models');
const { sequelize } = require('../config/database');
const RoleWhitelistSyncService = require('../src/services/RoleWhitelistSyncService');
const { console: loggerConsole } = require('../src/utils/logger');

// Test Discord user ID (use a test account)
const TEST_DISCORD_USER_ID = 'TEST_USER_12345';
const TEST_STEAM_ID_HIGH = '76561198000000001';
const TEST_STEAM_ID_LOW = '76561198000000002';

async function runTest() {
  try {
    loggerConsole.log('\n=== Testing Confidence Security Fix ===\n');

    // Create a mock logger
    const mockLogger = {
      info: (...args) => loggerConsole.log('[INFO]', ...args),
      warn: (...args) => loggerConsole.log('[WARN]', ...args),
      error: (...args) => loggerConsole.log('[ERROR]', ...args),
      debug: (...args) => loggerConsole.log('[DEBUG]', ...args)
    };

    const syncService = new RoleWhitelistSyncService(mockLogger, null, null);

    loggerConsole.log('Step 1: Clean up any existing test data...');
    await Whitelist.destroy({
      where: { discord_user_id: TEST_DISCORD_USER_ID },
      force: true
    });
    await PlayerDiscordLink.destroy({
      where: { discord_user_id: TEST_DISCORD_USER_ID },
      force: true
    });
    loggerConsole.log('✓ Cleanup complete\n');

    // Test Case 1: Create placeholder entry (user has role but no Steam link)
    loggerConsole.log('Step 2: Create unapproved placeholder entry (staff role without Steam link)...');
    await Whitelist.create({
      type: 'staff',
      steamid64: '00000000000000000',
      discord_user_id: TEST_DISCORD_USER_ID,
      discord_username: 'TestUser#1234',
      username: 'TestUser',
      source: 'role',
      role_name: 'Admin',
      approved: false,
      revoked: false,
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      reason: 'Unlinked staff role: Admin',
      metadata: {
        roleSync: true,
        unlinkedStaff: true,
        discordGuildId: '1234567890'
      }
    });
    loggerConsole.log('✓ Placeholder entry created\n');

    // Test Case 2: Link with LOW confidence (should be blocked)
    loggerConsole.log('Step 3: Create LOW confidence Steam link (0.5)...');
    await PlayerDiscordLink.create({
      discord_user_id: TEST_DISCORD_USER_ID,
      steamid64: TEST_STEAM_ID_LOW,
      username: 'TestUser',
      link_source: 'manual',
      confidence_score: 0.5,
      is_primary: true,
      metadata: { test: true }
    });
    loggerConsole.log('✓ Low confidence link created\n');

    // Test Case 3: Attempt to upgrade with low confidence (should FAIL)
    loggerConsole.log('Step 4: Attempt to upgrade with LOW confidence (should be blocked)...');
    const transaction1 = await sequelize.transaction();
    try {
      await syncService._upgradeUnlinkedEntries(
        TEST_DISCORD_USER_ID,
        TEST_STEAM_ID_LOW,
        0.5, // Low confidence
        'test',
        transaction1
      );
      await transaction1.commit();
      loggerConsole.log('✓ Upgrade attempt completed (should have been blocked)\n');
    } catch (error) {
      await transaction1.rollback();
      loggerConsole.error('✗ Upgrade failed with error:', error.message);
    }

    // Verify entry is still unapproved
    const entryAfterLowConfidence = await Whitelist.findOne({
      where: {
        discord_user_id: TEST_DISCORD_USER_ID,
        steamid64: '00000000000000000'
      }
    });

    if (entryAfterLowConfidence && !entryAfterLowConfidence.approved) {
      loggerConsole.log('✅ PASS: Entry remains UNAPPROVED after low-confidence upgrade attempt\n');
    } else {
      loggerConsole.error('❌ FAIL: Entry was approved with low confidence!\n');
    }

    // Test Case 4: Upgrade primary link to HIGH confidence
    loggerConsole.log('Step 5: Upgrade link to HIGH confidence (1.0)...');
    await PlayerDiscordLink.update(
      { confidence_score: 1.0 },
      { where: { discord_user_id: TEST_DISCORD_USER_ID } }
    );
    loggerConsole.log('✓ Link confidence upgraded to 1.0\n');

    // Test Case 5: Attempt upgrade with HIGH confidence (should SUCCEED)
    loggerConsole.log('Step 6: Attempt to upgrade with HIGH confidence (should succeed)...');
    const transaction2 = await sequelize.transaction();
    try {
      await syncService._upgradeUnlinkedEntries(
        TEST_DISCORD_USER_ID,
        TEST_STEAM_ID_LOW,
        1.0, // High confidence
        'test',
        transaction2
      );
      await transaction2.commit();
      loggerConsole.log('✓ Upgrade completed\n');
    } catch (error) {
      await transaction2.rollback();
      loggerConsole.error('✗ Upgrade failed with error:', error.message);
    }

    // Verify entry is now approved
    const entryAfterHighConfidence = await Whitelist.findOne({
      where: {
        discord_user_id: TEST_DISCORD_USER_ID,
        approved: true
      }
    });

    if (entryAfterHighConfidence && entryAfterHighConfidence.approved) {
      loggerConsole.log('✅ PASS: Entry was APPROVED after high-confidence upgrade\n');
      loggerConsole.log('Entry details:', {
        steamid64: entryAfterHighConfidence.steamid64,
        approved: entryAfterHighConfidence.approved,
        role_name: entryAfterHighConfidence.role_name
      });
    } else {
      loggerConsole.error('❌ FAIL: Entry was not approved with high confidence!\n');
    }

    // Test Case 6: Test Steam ID mismatch protection
    loggerConsole.log('\nStep 7: Test Steam ID mismatch protection...');
    loggerConsole.log('Revoking existing entry and creating new placeholder...');

    // Revoke the approved entry first (simulate role loss and re-grant)
    await Whitelist.update(
      { revoked: true, revoked_at: new Date() },
      { where: { discord_user_id: TEST_DISCORD_USER_ID, approved: true } }
    );

    // Create a new unapproved entry for different Steam ID
    await Whitelist.create({
      type: 'staff',
      steamid64: TEST_STEAM_ID_HIGH,
      discord_user_id: TEST_DISCORD_USER_ID,
      discord_username: 'TestUser#1234',
      username: 'TestUser',
      source: 'role',
      role_name: 'Admin',
      approved: false,
      revoked: false,
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      reason: 'Different Steam ID entry',
      metadata: {
        roleSync: true,
        test: true,
        discordGuildId: '1234567890'
      }
    });

    const transaction3 = await sequelize.transaction();
    try {
      await syncService._upgradeUnlinkedEntries(
        TEST_DISCORD_USER_ID,
        TEST_STEAM_ID_HIGH, // Different Steam ID
        1.0,
        'test',
        transaction3
      );
      await transaction3.commit();
      loggerConsole.log('✓ Upgrade attempt for different Steam ID completed\n');
    } catch (error) {
      await transaction3.rollback();
      loggerConsole.error('✗ Upgrade failed with error:', error.message);
    }

    // Verify only the matching Steam ID entry was upgraded
    const allEntries = await Whitelist.findAll({
      where: { discord_user_id: TEST_DISCORD_USER_ID },
      order: [['createdAt', 'ASC']]
    });

    loggerConsole.log('\nFinal entries for test user:');
    allEntries.forEach((entry, idx) => {
      loggerConsole.log(`  ${idx + 1}. Steam ID: ${entry.steamid64}, Approved: ${entry.approved}, Revoked: ${entry.revoked}`);
    });

    const approvedHighSteamId = allEntries.find(e => e.steamid64 === TEST_STEAM_ID_HIGH && e.approved);
    if (approvedHighSteamId) {
      loggerConsole.log('\n✅ PASS: Different Steam ID entry was properly upgraded\n');
    }

    // Cleanup
    loggerConsole.log('\nStep 8: Cleanup test data...');
    await Whitelist.destroy({
      where: { discord_user_id: TEST_DISCORD_USER_ID },
      force: true
    });
    await PlayerDiscordLink.destroy({
      where: { discord_user_id: TEST_DISCORD_USER_ID },
      force: true
    });
    loggerConsole.log('✓ Cleanup complete\n');

    loggerConsole.log('=== All Tests Complete ===\n');

  } catch (error) {
    loggerConsole.error('Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

runTest();
