/**
 * Manual Test for Fix 2.1: Security Upgrade Audit Trail
 *
 * This script tests that security-blocked entries generate audit log entries
 * when they are automatically upgraded to approved status.
 *
 * Test Scenario:
 * 1. Create a security-blocked entry (low confidence staff member)
 * 2. Simulate confidence upgrade to 1.0
 * 3. Trigger the upgrade process
 * 4. Verify AuditLog entry was created
 *
 * Expected Results:
 * - AuditLog entry with actionType 'SECURITY_UPGRADE'
 * - beforeState shows security-blocked state
 * - afterState shows approved state
 * - severity is 'warning'
 */

require('dotenv').config();
const { Whitelist, PlayerDiscordLink, AuditLog } = require('../src/database/models');
const { Sequelize, Op } = require('sequelize');
const RoleWhitelistSyncService = require('../src/services/RoleWhitelistSyncService');
const { createServiceLogger } = require('../src/utils/logger');

const logger = createServiceLogger('TestFix2.1');

async function runTest() {
  try {
    logger.info('Starting Fix 2.1 test: Security Upgrade Audit Trail');
    logger.info('================================================');

    // Test data
    const testDiscordUserId = 'TEST_USER_FIX_2_1';
    const testSteamId = '76561198123456789';
    const testRoleName = 'Admin';

    // Clean up any existing test data
    logger.info('Cleaning up existing test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });
    await AuditLog.destroy({ where: { targetName: { [Op.like]: `%${testDiscordUserId}%` } } });

    // STEP 1: Create a low-confidence Steam link (0.5)
    logger.info('Step 1: Creating low-confidence Steam link (0.5)...');
    await PlayerDiscordLink.create({
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      confidence_score: 0.5,
      is_primary: true,
      link_source: 'manual'
    });
    logger.info('Created low-confidence link');

    // STEP 2: Create a security-blocked entry (simulates staff role with insufficient confidence)
    logger.info('Step 2: Creating security-blocked whitelist entry...');
    const blockedEntry = await Whitelist.create({
      type: 'staff',
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      discord_username: 'TestUser#1234',
      username: 'Test User',
      source: 'role',
      role_name: testRoleName,
      approved: false,
      revoked: true,
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      revoked_by: 'SECURITY_SYSTEM',
      revoked_at: new Date(),
      revoked_reason: 'Security block: insufficient link confidence (0.5/1.0)',
      reason: `SECURITY BLOCKED: Role-based access denied for ${testRoleName}`,
      expiration: null,
      metadata: {
        roleSync: true,
        securityBlocked: true,
        blockReason: 'insufficient_confidence',
        actualConfidence: 0.5,
        requiredConfidence: 1.0
      }
    });
    logger.info(`Created security-blocked entry (ID: ${blockedEntry.id})`);

    // STEP 3: Upgrade confidence to 1.0 (simulates user completing verification)
    logger.info('Step 3: Upgrading confidence to 1.0...');
    await PlayerDiscordLink.update(
      { confidence_score: 1.0 },
      { where: { discord_user_id: testDiscordUserId } }
    );
    logger.info('Confidence upgraded to 1.0');

    // STEP 4: Trigger the upgrade process
    logger.info('Step 4: Triggering automatic upgrade via RoleWhitelistSyncService...');
    const syncService = new RoleWhitelistSyncService(logger, null, null);

    // Call the private method directly for testing
    await syncService._upgradeUnlinkedEntries(testDiscordUserId, testSteamId, 'test_fix_2_1');

    logger.info('Upgrade process completed');

    // STEP 5: Verify the entry was upgraded
    logger.info('Step 5: Verifying entry was upgraded...');
    const upgradedEntry = await Whitelist.findByPk(blockedEntry.id);

    if (!upgradedEntry) {
      throw new Error('Entry not found after upgrade');
    }

    logger.info('Entry state after upgrade:', {
      approved: upgradedEntry.approved,
      revoked: upgradedEntry.revoked,
      steamId: upgradedEntry.steamid64,
      metadata: upgradedEntry.metadata
    });

    if (upgradedEntry.approved !== true) {
      throw new Error('Entry was not approved');
    }

    if (upgradedEntry.revoked !== false) {
      throw new Error('Entry is still revoked');
    }

    if (upgradedEntry.metadata?.securityBlocked !== false) {
      throw new Error('Security block flag was not cleared');
    }

    logger.info('✅ Entry successfully upgraded');

    // STEP 6: Verify AuditLog entry was created
    logger.info('Step 6: Verifying AuditLog entry...');
    const auditEntries = await AuditLog.findAll({
      where: {
        actionType: 'SECURITY_UPGRADE',
        targetId: blockedEntry.id.toString()
      },
      order: [['createdAt', 'DESC']]
    });

    if (auditEntries.length === 0) {
      throw new Error('No AuditLog entry created for security upgrade');
    }

    const auditEntry = auditEntries[0];
    logger.info('Found AuditLog entry:', {
      id: auditEntry.id,
      actionType: auditEntry.actionType,
      actorName: auditEntry.actorName,
      description: auditEntry.description,
      severity: auditEntry.severity
    });

    // Verify audit entry fields
    const errors = [];

    if (auditEntry.actionType !== 'SECURITY_UPGRADE') {
      errors.push(`Wrong actionType: ${auditEntry.actionType}`);
    }

    if (auditEntry.actorType !== 'system') {
      errors.push(`Wrong actorType: ${auditEntry.actorType}`);
    }

    if (auditEntry.actorId !== 'AUTO_UPGRADE_SYSTEM') {
      errors.push(`Wrong actorId: ${auditEntry.actorId}`);
    }

    if (auditEntry.actorName !== 'RoleWhitelistSyncService') {
      errors.push(`Wrong actorName: ${auditEntry.actorName}`);
    }

    if (auditEntry.targetType !== 'whitelist_entry') {
      errors.push(`Wrong targetType: ${auditEntry.targetType}`);
    }

    if (auditEntry.severity !== 'warning') {
      errors.push(`Wrong severity: ${auditEntry.severity} (expected 'warning')`);
    }

    // Verify beforeState
    if (!auditEntry.beforeState) {
      errors.push('Missing beforeState');
    } else {
      if (auditEntry.beforeState.approved !== false) {
        errors.push('beforeState.approved should be false');
      }
      if (auditEntry.beforeState.securityBlocked !== true) {
        errors.push('beforeState.securityBlocked should be true');
      }
    }

    // Verify afterState
    if (!auditEntry.afterState) {
      errors.push('Missing afterState');
    } else {
      if (auditEntry.afterState.approved !== true) {
        errors.push('afterState.approved should be true');
      }
      if (auditEntry.afterState.revoked !== false) {
        errors.push('afterState.revoked should be false');
      }
      if (auditEntry.afterState.securityBlocked !== false) {
        errors.push('afterState.securityBlocked should be false');
      }
    }

    // Verify metadata
    if (!auditEntry.metadata) {
      errors.push('Missing metadata');
    } else {
      if (auditEntry.metadata.discordUserId !== testDiscordUserId) {
        errors.push('Wrong discordUserId in metadata');
      }
      if (auditEntry.metadata.roleName !== testRoleName) {
        errors.push('Wrong roleName in metadata');
      }
      if (auditEntry.metadata.newSteamId !== testSteamId) {
        errors.push('Wrong newSteamId in metadata');
      }
    }

    if (errors.length > 0) {
      logger.error('AuditLog entry validation failed:');
      errors.forEach(error => logger.error(`  - ${error}`));
      throw new Error('AuditLog entry validation failed');
    }

    logger.info('✅ AuditLog entry validated successfully');

    // Clean up test data
    logger.info('Cleaning up test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });
    await AuditLog.destroy({ where: { id: auditEntry.id } });

    logger.info('================================================');
    logger.info('✅ Fix 2.1 test completed successfully!');
    logger.info('All assertions passed:');
    logger.info('  ✅ Security-blocked entry was upgraded');
    logger.info('  ✅ AuditLog entry was created');
    logger.info('  ✅ AuditLog entry has correct fields');
    logger.info('  ✅ beforeState shows security-blocked state');
    logger.info('  ✅ afterState shows approved state');
    logger.info('  ✅ severity is warning');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
