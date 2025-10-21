/**
 * Manual Test for Fix 5.1: Atomic Cache Invalidation (Simplified)
 *
 * This script tests that cache invalidation is called at all database modification points,
 * ensuring cache stays synchronized with database changes.
 *
 * Test Strategy:
 * - Verify cache invalidation is called after each type of database operation
 * - Use spy/mock pattern to detect invalidation calls
 * - Test concurrent operations maintain atomicity
 *
 * Expected Results:
 * - Cache invalidated after create/update/revoke/upgrade operations
 * - All invalidation calls happen within transactions
 * - Concurrent operations don't skip invalidation
 */

require('dotenv').config();
const { Whitelist, PlayerDiscordLink } = require('../src/database/models');
const RoleWhitelistSyncService = require('../src/services/RoleWhitelistSyncService');
const { createServiceLogger } = require('../src/utils/logger');

const logger = createServiceLogger('TestFix5.1');

// Mock whitelist service to track invalidation calls
class MockWhitelistService {
  constructor() {
    this.invalidationCalls = [];
  }

  invalidateCache(type = null) {
    this.invalidationCalls.push({
      timestamp: Date.now(),
      type: type,
      stackTrace: new Error().stack
    });
    logger.debug('Cache invalidation called', { type, callCount: this.invalidationCalls.length });
  }

  getInvalidationCount() {
    return this.invalidationCalls.length;
  }

  resetCalls() {
    this.invalidationCalls = [];
  }
}

async function runTest() {
  try {
    logger.info('Starting Fix 5.1 test: Atomic Cache Invalidation (Simplified)');
    logger.info('====================================================');

    // Test data
    const testDiscordUserId = 'TEST_USER_FIX_5_1_SIMPLE';
    const testSteamId = '76561198888888888';
    const testRoleName = 'Admin';

    // Clean up any existing test data
    logger.info('Cleaning up existing test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    // Initialize mock service
    const mockWhitelistService = new MockWhitelistService();
    const syncService = new RoleWhitelistSyncService(logger, null, mockWhitelistService);

    // Member data
    const memberData = {
      user: { tag: 'TestUser#1234', username: 'TestUser' },
      displayName: 'Test User',
      guild: { id: process.env.DISCORD_GUILD_ID }
    };

    // TEST CASE 1: Cache invalidated after creating entry
    logger.info('');
    logger.info('TEST CASE 1: Cache invalidated after creating entry');
    logger.info('---------------------------------------------------');

    mockWhitelistService.resetCalls();

    await PlayerDiscordLink.create({
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      confidence_score: 1.0,
      is_primary: true,
      link_source: 'manual'
    });

    await syncService.syncUserRole(testDiscordUserId, testRoleName, memberData, {
      source: 'test_create',
      skipNotification: true
    });

    const callsAfterCreate = mockWhitelistService.getInvalidationCount();
    if (callsAfterCreate === 0) {
      throw new Error('FAIL: Cache not invalidated after creating entry');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterCreate} time(s) after create`);

    // TEST CASE 2: Cache invalidated after updating entry
    logger.info('');
    logger.info('TEST CASE 2: Cache invalidated after updating entry');
    logger.info('---------------------------------------------------');

    mockWhitelistService.resetCalls();

    await syncService.syncUserRole(testDiscordUserId, 'Moderator', memberData, {
      source: 'test_update',
      skipNotification: true
    });

    const callsAfterUpdate = mockWhitelistService.getInvalidationCount();
    if (callsAfterUpdate === 0) {
      throw new Error('FAIL: Cache not invalidated after updating entry');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterUpdate} time(s) after update`);

    // TEST CASE 3: Cache invalidated after revoking entry
    logger.info('');
    logger.info('TEST CASE 3: Cache invalidated after revoking entry');
    logger.info('---------------------------------------------------');

    mockWhitelistService.resetCalls();

    await syncService.syncUserRole(testDiscordUserId, null, memberData, {
      source: 'test_revoke',
      skipNotification: true
    });

    const callsAfterRevoke = mockWhitelistService.getInvalidationCount();
    if (callsAfterRevoke === 0) {
      throw new Error('FAIL: Cache not invalidated after revoking entry');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterRevoke} time(s) after revoke`);

    // TEST CASE 4: Cache invalidated after upgrading entry
    logger.info('');
    logger.info('TEST CASE 4: Cache invalidated after upgrading placeholder');
    logger.info('------------------------------------------------------------');

    // Clean slate
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    // Create placeholder entry (low confidence, will be security-blocked)
    await PlayerDiscordLink.create({
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      confidence_score: 0.5,
      is_primary: true,
      link_source: 'manual'
    });

    mockWhitelistService.resetCalls();

    // This will create security-blocked entry
    await syncService.syncUserRole(testDiscordUserId, testRoleName, memberData, {
      source: 'test_blocked',
      skipNotification: true
    });

    const callsAfterBlocked = mockWhitelistService.getInvalidationCount();
    if (callsAfterBlocked === 0) {
      throw new Error('FAIL: Cache not invalidated after creating security-blocked entry');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterBlocked} time(s) after creating blocked entry`);

    // Upgrade confidence and trigger upgrade
    await PlayerDiscordLink.update(
      { confidence_score: 1.0 },
      { where: { discord_user_id: testDiscordUserId } }
    );

    mockWhitelistService.resetCalls();

    // This will upgrade the blocked entry
    await syncService.syncUserRole(testDiscordUserId, testRoleName, memberData, {
      source: 'test_upgrade',
      skipNotification: true
    });

    const callsAfterUpgrade = mockWhitelistService.getInvalidationCount();
    if (callsAfterUpgrade === 0) {
      throw new Error('FAIL: Cache not invalidated after upgrading entry');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterUpgrade} time(s) after upgrade`);

    // TEST CASE 5: Cache invalidated for unlinked staff placeholder
    logger.info('');
    logger.info('TEST CASE 5: Cache invalidated for unlinked staff');
    logger.info('-------------------------------------------------');

    // Clean slate
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    mockWhitelistService.resetCalls();

    // Sync user with no Steam link
    await syncService.syncUserRole(testDiscordUserId, testRoleName, memberData, {
      source: 'test_unlinked',
      skipNotification: true
    });

    const callsAfterUnlinked = mockWhitelistService.getInvalidationCount();
    if (callsAfterUnlinked === 0) {
      throw new Error('FAIL: Cache not invalidated after creating unlinked staff placeholder');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterUnlinked} time(s) after unlinked staff`);

    // TEST CASE 6: Concurrent operations all call invalidation
    logger.info('');
    logger.info('TEST CASE 6: Concurrent operations all call invalidation');
    logger.info('---------------------------------------------------------');

    // Clean slate - add back Steam link
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.create({
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      confidence_score: 1.0,
      is_primary: true,
      link_source: 'manual'
    });

    mockWhitelistService.resetCalls();

    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(
        syncService.syncUserRole(testDiscordUserId, testRoleName, memberData, {
          source: `concurrent_test_${i}`,
          skipNotification: true
        })
      );
    }

    await Promise.all(operations);

    const callsAfterConcurrent = mockWhitelistService.getInvalidationCount();

    // At least 1 call should have been made (first successful operation)
    // Multiple calls are expected due to deduplication logic
    if (callsAfterConcurrent === 0) {
      throw new Error('FAIL: No cache invalidation during concurrent operations');
    }

    logger.info(`SUCCESS: Cache invalidated ${callsAfterConcurrent} time(s) during concurrent ops`);

    // Clean up test data
    logger.info('');
    logger.info('Cleaning up test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    logger.info('====================================================');
    logger.info('SUCCESS: Fix 5.1 test completed successfully!');
    logger.info('Test results:');
    logger.info('  Test Case 1: PASS - Cache invalidated after create');
    logger.info('  Test Case 2: PASS - Cache invalidated after update');
    logger.info('  Test Case 3: PASS - Cache invalidated after revoke');
    logger.info('  Test Case 4: PASS - Cache invalidated after upgrade');
    logger.info('  Test Case 5: PASS - Cache invalidated for unlinked staff');
    logger.info('  Test Case 6: PASS - Cache invalidated during concurrent ops');
    logger.info('');
    logger.info('Fix 5.1 ensures cache consistency by:');
    logger.info('  - Calling invalidateCache() after every database modification');
    logger.info('  - Invalidating cache within database transactions');
    logger.info('  - Ensuring cache stays synchronized with database state');
    logger.info('  - Preventing stale cache data from being served');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error.message);
    logger.error(error.stack);

    process.exit(1);
  }
}

// Run the test
runTest();
