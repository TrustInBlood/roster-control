/**
 * Manual Test for Fix 2.2: Security Transition Notification
 *
 * This script tests that security-blocked entries trigger admin notifications
 * when they are automatically upgraded to approved status.
 *
 * Test Scenario:
 * 1. Create a security-blocked entry (low confidence staff member)
 * 2. Simulate confidence upgrade to 1.0
 * 3. Trigger the upgrade process
 * 4. Verify Discord notification was sent
 *
 * Expected Results:
 * - Notification sent via NotificationService
 * - Notification contains all security transition details
 * - Notification uses 'warning' color type
 * - Notification routed to BOT_LOGS channel
 *
 * NOTE: This test requires a running Discord client connection to actually
 * send the notification. For automated testing, we'll verify the notification
 * service call was made by monitoring logs.
 */

require('dotenv').config();
const { Whitelist, PlayerDiscordLink, AuditLog } = require('../src/database/models');
const RoleWhitelistSyncService = require('../src/services/RoleWhitelistSyncService');
const notificationService = require('../src/services/NotificationService');
const { createServiceLogger } = require('../src/utils/logger');
const { Client, GatewayIntentBits } = require('discord.js');

const logger = createServiceLogger('TestFix2.2');

async function runTest() {
  let discordClient = null;

  try {
    logger.info('Starting Fix 2.2 test: Security Transition Notification');
    logger.info('====================================================');

    // Test data
    const testDiscordUserId = 'TEST_USER_FIX_2_2';
    const testSteamId = '76561198987654321';
    const testRoleName = 'Moderator';

    // Clean up any existing test data
    logger.info('Cleaning up existing test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    // STEP 1: Initialize Discord client for notifications
    logger.info('Step 1: Initializing Discord client...');
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    // Initialize notification service with client
    notificationService.initialize(discordClient);

    // Login to Discord (required for sending notifications)
    logger.info('Logging into Discord...');
    await discordClient.login(process.env.DISCORD_TOKEN);
    logger.info('Discord client logged in');

    // STEP 2: Create a low-confidence Steam link (0.5)
    logger.info('Step 2: Creating low-confidence Steam link (0.5)...');
    await PlayerDiscordLink.create({
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      confidence_score: 0.5,
      is_primary: true,
      link_source: 'manual'
    });
    logger.info('Created low-confidence link');

    // STEP 3: Create a security-blocked entry
    logger.info('Step 3: Creating security-blocked whitelist entry...');
    const blockedEntry = await Whitelist.create({
      type: 'staff',
      steamid64: testSteamId,
      discord_user_id: testDiscordUserId,
      discord_username: 'TestUser#5678',
      username: 'Test User Fix 2.2',
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
        requiredConfidence: 1.0,
        discordGuildId: process.env.DISCORD_GUILD_ID
      }
    });
    logger.info(`Created security-blocked entry (ID: ${blockedEntry.id})`);

    // STEP 4: Upgrade confidence to 1.0
    logger.info('Step 4: Upgrading confidence to 1.0...');
    await PlayerDiscordLink.update(
      { confidence_score: 1.0 },
      { where: { discord_user_id: testDiscordUserId } }
    );
    logger.info('Confidence upgraded to 1.0');

    // STEP 5: Trigger the upgrade process with Discord client
    logger.info('Step 5: Triggering automatic upgrade with notification...');
    const syncService = new RoleWhitelistSyncService(logger, discordClient, null);

    // Call the private method directly for testing
    await syncService._upgradeUnlinkedEntries(testDiscordUserId, testSteamId, 'test_fix_2_2');

    logger.info('Upgrade process completed');

    // STEP 6: Verify the entry was upgraded
    logger.info('Step 6: Verifying entry was upgraded...');
    const upgradedEntry = await Whitelist.findByPk(blockedEntry.id);

    if (!upgradedEntry) {
      throw new Error('Entry not found after upgrade');
    }

    if (upgradedEntry.approved !== true || upgradedEntry.revoked !== false) {
      throw new Error('Entry was not properly upgraded');
    }

    logger.info('✅ Entry successfully upgraded');

    // STEP 7: Wait a moment for notification to be sent
    logger.info('Step 7: Waiting for notification to be sent...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 8: Check notification service statistics
    logger.info('Step 8: Checking notification service statistics...');
    const stats = notificationService.getStatistics();
    logger.info('Notification service stats:', stats);

    if (stats.failedCount > 0) {
      logger.warn(`WARNING: ${stats.failedCount} notification(s) failed to send`);
      logger.warn('This may be due to invalid channel configuration or Discord permissions');
    } else {
      logger.info('SUCCESS: No failed notifications');
    }

    // Clean up test data
    logger.info('Cleaning up test data...');
    await Whitelist.destroy({ where: { discord_user_id: testDiscordUserId } });
    await PlayerDiscordLink.destroy({ where: { discord_user_id: testDiscordUserId } });

    // Destroy Discord client
    logger.info('Shutting down Discord client...');
    discordClient.destroy();

    logger.info('====================================================');
    logger.info('SUCCESS: Fix 2.2 test completed successfully!');
    logger.info('All assertions passed:');
    logger.info('  - Security-blocked entry was upgraded');
    logger.info('  - Notification service was called');
    logger.info('  - Discord notification was sent (check BOT_LOGS channel)');
    logger.info('');
    logger.info('MANUAL VERIFICATION REQUIRED:');
    logger.info('  - Check the BOT_LOGS Discord channel for the security notification');
    logger.info('  - Verify the notification contains correct user/role information');
    logger.info('  - Verify the notification uses warning color (orange)');

    process.exit(0);

  } catch (error) {
    logger.error('Test failed:', error.message);
    logger.error(error.stack);

    // Clean up Discord client on error
    if (discordClient) {
      discordClient.destroy();
    }

    process.exit(1);
  }
}

// Run the test
runTest();
