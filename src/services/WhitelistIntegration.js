const WhitelistService = require('./WhitelistService');
const RoleWhitelistSyncService = require('./RoleWhitelistSyncService');
const { squadGroupService } = require('./SquadGroupService');
const SquadJSConnectionManager = require('./SquadJSConnectionManager');
const SquadJSLinkingService = require('./SquadJSLinkingService');
const PlaytimeTrackingService = require('./PlaytimeTrackingService');
const InGameCommandService = require('./InGameCommandService');
const { initializeDutySquadJSTrackingService, getDutySquadJSTrackingService } = require('./DutySquadJSTrackingService');
const { VerificationCode } = require('../database/models');
const { config: whitelistConfig, validateConfig } = require('../../config/whitelist');

async function setupWhitelistRoutes(app, _sequelize, logger, discordClient) {
  logger.info('Setting up whitelist integration');

  // Validate configuration
  try {
    validateConfig();
    logger.info('Whitelist configuration validated successfully');
  } catch (error) {
    logger.error('Whitelist configuration validation failed', { error: error.message });
    throw error;
  }

  // Initialize role-based whitelist sync service
  const roleWhitelistSync = new RoleWhitelistSyncService(logger, discordClient);
  logger.info('Role-based whitelist sync service created');

  // Check if initial sync should be skipped
  const skipInitialSync = process.env.SKIP_INITIAL_WHITELIST_SYNC === 'true';

  if (skipInitialSync) {
    logger.info('Skipping initial whitelist sync (SKIP_INITIAL_WHITELIST_SYNC=true)');
  } else {
    logger.info('Initial whitelist sync enabled (SKIP_INITIAL_WHITELIST_SYNC not set or false)');

    // Delay initial sync to ensure guild members are loaded
    setTimeout(async () => {
      try {
        logger.info('Attempting initial role-based whitelist sync...');

        const primaryGuild = discordClient.guilds.cache.first();
        if (!primaryGuild) {
          logger.warn('No Discord guild found for role-based whitelist sync');
          logger.info('Available guilds:', {
            guildCount: discordClient.guilds.cache.size,
            guildIds: discordClient.guilds.cache.map(g => g.id)
          });
          return;
        }

        logger.info('Starting initial role-based whitelist sync from Discord guild', {
          guildId: primaryGuild.id,
          guildName: primaryGuild.name,
          memberCount: primaryGuild.memberCount
        });

        const syncResult = await roleWhitelistSync.bulkSyncGuild(primaryGuild.id, { dryRun: true });
        logger.info('Initial sync analysis completed', {
          totalMembers: syncResult.totalMembers,
          membersToSync: syncResult.membersToSync,
          groups: syncResult.groups
        });

        // Perform the actual sync if dry run found members to sync
        if (syncResult.membersToSync > 0) {
          logger.info('Starting actual initial sync', { membersToSync: syncResult.membersToSync });
          const actualSync = await roleWhitelistSync.bulkSyncGuild(primaryGuild.id, { dryRun: false });
          logger.info('Initial sync completed', {
            successful: actualSync.successful,
            failed: actualSync.failed,
            totalProcessed: actualSync.totalProcessed
          });
        } else {
          logger.info('No members found to sync - this is normal if no users have tracked roles');
        }
      } catch (error) {
        logger.error('Failed to perform initial role-based sync', {
          error: error.message,
          stack: error.stack
        });
      }
    }, 10000); // 10 seconds delay to ensure guild members are loaded
  }

  const whitelistService = new WhitelistService(logger, whitelistConfig, discordClient);

  // Link whitelistService to roleWhitelistSync for cache invalidation
  roleWhitelistSync.whitelistService = whitelistService;

  // Link whitelistService to squadGroupService for cache invalidation when squad groups change
  squadGroupService.setWhitelistService(whitelistService);

  whitelistService.setupRoutes(app);

  const connectionManager = new SquadJSConnectionManager(logger, whitelistConfig);
  const squadJSService = new SquadJSLinkingService(logger, discordClient, whitelistConfig, whitelistService, connectionManager);
  const playtimeTrackingService = new PlaytimeTrackingService(logger, connectionManager);
  const inGameCommandService = new InGameCommandService(connectionManager, whitelistConfig);
  const dutySquadJSTrackingService = initializeDutySquadJSTrackingService(connectionManager, discordClient);

  try {
    await connectionManager.connect();
    squadJSService.initialize();
    await playtimeTrackingService.initialize();
    inGameCommandService.initialize();
    dutySquadJSTrackingService.initialize();
  } catch (error) {
    logger.error('Failed to connect to SquadJS servers', { error: error.message });
  }

  // Make playtime tracking service globally available for shutdown handling
  global.playtimeTrackingService = playtimeTrackingService;

  const cleanupInterval = setInterval(async () => {
    try {
      const deletedCount = await VerificationCode.cleanupExpired();
      if (deletedCount > 0) {
        logger.debug('Cleaned up expired verification codes', { count: deletedCount });
      }
    } catch (error) {
      logger.error('Error cleaning up verification codes', { error: error.message });
    }
  }, whitelistConfig.verification.cleanupIntervalMs);

  const gracefulShutdown = async () => {
    logger.info('Shutting down whitelist integration');
    clearInterval(cleanupInterval);
    whitelistService.shutdown();
    await playtimeTrackingService.shutdown();
    inGameCommandService.shutdown();
    dutySquadJSTrackingService.shutdown();
    squadJSService.destroy();
    connectionManager.disconnect();
  };

  // Note: SIGINT/SIGTERM handlers are in index.js to avoid duplicate shutdown calls

  logger.info('Whitelist integration setup complete', {
    routes: Object.keys(whitelistConfig.paths),
    cacheRefreshSeconds: whitelistConfig.cache.refreshSeconds,
    preferEosID: whitelistConfig.identifiers.preferEosID,
    squadJSServers: whitelistConfig.squadjs.servers.length,
    squadJSConnected: connectionManager.isConnected(),
    connectionStatus: connectionManager.getConnectionStatus()
  });

  return {
    whitelistService,
    roleWhitelistSync,
    connectionManager,
    squadJSService,
    inGameCommandService,
    gracefulShutdown,
    config: whitelistConfig
  };
}

module.exports = {
  setupWhitelistRoutes
};