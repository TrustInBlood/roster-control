/**
 * Manual Test for Fix 8.1: Confidence Score Audit Trail
 *
 * This script tests that all confidence score changes are logged to the AuditLog
 * for security review and monitoring.
 *
 * Test Strategy:
 * - Create link with initial confidence score
 * - Update link with higher confidence score
 * - Verify AuditLog entry created with old/new values
 *
 * Expected Results:
 * - No audit log when confidence doesn't change
 * - Audit log created when confidence increases
 * - Audit log contains old/new confidence scores and relevant metadata
 */

require('dotenv').config();
const { PlayerDiscordLink, AuditLog } = require('../src/database/models');
const { createServiceLogger } = require('../src/utils/logger');

const logger = createServiceLogger('TestFix8.1');

async function runTest() {
  try {
    logger.info('Starting Fix 8.1 test: Confidence Score Audit Trail');
    logger.info('====================================================');

    // Test data
    const testDiscordUserId = 'TEST_USER_FIX_8_1';
    const testSteamId = '76561198999999999';
    const testUsername = 'TestUser8_1';

    // Clean up any existing test data
    logger.info('Cleaning up existing test data...');
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });
    await AuditLog.destroy({ where: { targetId: testDiscordUserId } });

    // TEST CASE 1: No audit log when creating initial link
    logger.info('');
    logger.info('TEST CASE 1: No audit log when creating initial link');
    logger.info('---------------------------------------------------');

    const initialAuditCount = await AuditLog.count({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      }
    });

    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      {
        linkSource: 'manual',
        confidenceScore: 0.5,
        isPrimary: true
      }
    );

    const afterCreateAuditCount = await AuditLog.count({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      }
    });

    if (afterCreateAuditCount !== initialAuditCount) {
      throw new Error(`FAIL: Audit log created for initial link (expected ${initialAuditCount}, got ${afterCreateAuditCount})`);
    }

    logger.info('SUCCESS: No audit log created for initial link (as expected)');

    // TEST CASE 2: No audit log when confidence stays the same
    logger.info('');
    logger.info('TEST CASE 2: No audit log when confidence stays the same');
    logger.info('-----------------------------------------------------------');

    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      {
        linkSource: 'manual',
        confidenceScore: 0.5, // Same as before
        isPrimary: true
      }
    );

    const afterSameUpdateCount = await AuditLog.count({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      }
    });

    if (afterSameUpdateCount !== initialAuditCount) {
      throw new Error(`FAIL: Audit log created when confidence unchanged (expected ${initialAuditCount}, got ${afterSameUpdateCount})`);
    }

    logger.info('SUCCESS: No audit log created when confidence unchanged (as expected)');

    // TEST CASE 3: Audit log created when confidence increases
    logger.info('');
    logger.info('TEST CASE 3: Audit log created when confidence increases');
    logger.info('----------------------------------------------------------');

    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      {
        linkSource: 'squadjs',
        confidenceScore: 1.0, // Upgraded from 0.5
        isPrimary: true
      }
    );

    const afterUpgradeCount = await AuditLog.count({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      }
    });

    if (afterUpgradeCount !== initialAuditCount + 1) {
      throw new Error(`FAIL: Audit log not created for confidence upgrade (expected ${initialAuditCount + 1}, got ${afterUpgradeCount})`);
    }

    logger.info('SUCCESS: Audit log created for confidence upgrade');

    // TEST CASE 4: Verify audit log contains correct information
    logger.info('');
    logger.info('TEST CASE 4: Verify audit log contains correct information');
    logger.info('-----------------------------------------------------------');

    const auditEntry = await AuditLog.findOne({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      },
      order: [['createdAt', 'DESC']]
    });

    if (!auditEntry) {
      throw new Error('FAIL: Could not find audit log entry');
    }

    const details = auditEntry.metadata;

    logger.info('Audit log entry details:');
    logger.info(`  - Action Type: ${auditEntry.actionType}`);
    logger.info(`  - Actor: ${auditEntry.actorId}`);
    logger.info(`  - Target: ${auditEntry.targetId}`);
    logger.info(`  - Old Confidence: ${details.old_confidence}`);
    logger.info(`  - New Confidence: ${details.new_confidence}`);
    logger.info(`  - Steam ID: ${details.steamid64}`);
    logger.info(`  - Existing Source: ${details.existing_source}`);
    logger.info(`  - New Source: ${details.new_source}`);
    logger.info(`  - Reason: ${details.reason}`);

    // Validate audit log fields
    if (auditEntry.actionType !== 'confidence_change') {
      throw new Error(`FAIL: Incorrect action type: ${auditEntry.actionType}`);
    }

    if (auditEntry.actorId !== 'SYSTEM') {
      throw new Error(`FAIL: Incorrect actor: ${auditEntry.actorId}`);
    }

    if (auditEntry.targetId !== testDiscordUserId) {
      throw new Error(`FAIL: Incorrect target: ${auditEntry.targetId}`);
    }

    if (details.old_confidence !== 0.5) {
      throw new Error(`FAIL: Incorrect old confidence: ${details.old_confidence}`);
    }

    if (details.new_confidence !== 1.0) {
      throw new Error(`FAIL: Incorrect new confidence: ${details.new_confidence}`);
    }

    if (details.steamid64 !== testSteamId) {
      throw new Error(`FAIL: Incorrect Steam ID: ${details.steamid64}`);
    }

    if (details.existing_source !== 'manual') {
      throw new Error(`FAIL: Incorrect existing source: ${details.existing_source}`);
    }

    if (details.new_source !== 'squadjs') {
      throw new Error(`FAIL: Incorrect new source: ${details.new_source}`);
    }

    logger.info('SUCCESS: All audit log fields are correct');

    // TEST CASE 5: Multiple confidence upgrades create multiple audit logs
    logger.info('');
    logger.info('TEST CASE 5: Multiple confidence upgrades create multiple logs');
    logger.info('--------------------------------------------------------------');

    // Reset to lower confidence
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });
    await AuditLog.destroy({ where: { targetId: testDiscordUserId } });

    // Create initial 0.3 confidence link
    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      { linkSource: 'ticket', confidenceScore: 0.3, isPrimary: true }
    );

    // Upgrade to 0.7
    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      { linkSource: 'manual', confidenceScore: 0.7, isPrimary: true }
    );

    // Upgrade to 1.0
    await PlayerDiscordLink.createOrUpdateLink(
      testDiscordUserId,
      testSteamId,
      null,
      testUsername,
      { linkSource: 'squadjs', confidenceScore: 1.0, isPrimary: true }
    );

    const multipleUpgradesCount = await AuditLog.count({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      }
    });

    if (multipleUpgradesCount !== 2) {
      throw new Error(`FAIL: Expected 2 audit logs, found ${multipleUpgradesCount}`);
    }

    logger.info(`SUCCESS: Multiple confidence upgrades created ${multipleUpgradesCount} audit logs`);

    // Verify the progression
    const allAudits = await AuditLog.findAll({
      where: {
        targetId: testDiscordUserId,
        actionType: 'confidence_change'
      },
      order: [['createdAt', 'ASC']]
    });

    const audit1Details = allAudits[0].metadata;
    const audit2Details = allAudits[1].metadata;

    logger.info('Confidence progression:');
    logger.info(`  1. ${audit1Details.old_confidence} → ${audit1Details.new_confidence} (${audit1Details.existing_source} → ${audit1Details.new_source})`);
    logger.info(`  2. ${audit2Details.old_confidence} → ${audit2Details.new_confidence} (${audit2Details.existing_source} → ${audit2Details.new_source})`);

    if (audit1Details.old_confidence !== 0.3 || audit1Details.new_confidence !== 0.7) {
      throw new Error('FAIL: First upgrade has incorrect confidence values');
    }

    if (audit2Details.old_confidence !== 0.7 || audit2Details.new_confidence !== 1.0) {
      throw new Error('FAIL: Second upgrade has incorrect confidence values');
    }

    logger.info('SUCCESS: Confidence progression is correctly logged');

    // Clean up test data
    logger.info('');
    logger.info('Cleaning up test data...');
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });
    await AuditLog.destroy({ where: { targetId: testDiscordUserId } });

    logger.info('====================================================');
    logger.info('SUCCESS: Fix 8.1 test completed successfully!');
    logger.info('Test results:');
    logger.info('  Test Case 1: PASS - No audit log for initial link');
    logger.info('  Test Case 2: PASS - No audit log when confidence unchanged');
    logger.info('  Test Case 3: PASS - Audit log created for confidence upgrade');
    logger.info('  Test Case 4: PASS - Audit log contains correct information');
    logger.info('  Test Case 5: PASS - Multiple upgrades create multiple logs');
    logger.info('');
    logger.info('Fix 8.1 enhances security monitoring by:');
    logger.info('  - Logging all confidence score changes for audit trail');
    logger.info('  - Recording old and new confidence values');
    logger.info('  - Tracking link source changes during upgrades');
    logger.info('  - Enabling security review of confidence progression');
    logger.info('  - Helping detect potential abuse or anomalies');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error.message);
    logger.error(error.stack);

    process.exit(1);
  }
}

// Run the test
runTest();
