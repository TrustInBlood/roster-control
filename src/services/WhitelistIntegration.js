const WhitelistService = require('./WhitelistService');
const RoleBasedWhitelistCache = require('./RoleBasedWhitelistCache');
const SquadJSConnectionManager = require('./SquadJSConnectionManager');
const SquadJSLinkingService = require('./SquadJSLinkingService');
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

  // Initialize role-based whitelist cache
  const roleBasedCache = new RoleBasedWhitelistCache(logger, whitelistConfig);
  logger.info('Role-based whitelist cache created');
  
  // Delay cache initialization to ensure guild members are loaded
  setTimeout(async () => {
    try {
      const primaryGuild = discordClient.guilds.cache.first();
      if (primaryGuild) {
        logger.info('Initializing role-based cache from Discord guild');
        await roleBasedCache.initializeFromGuild(primaryGuild);
        const counts = roleBasedCache.getTotalCount();
        logger.info('Role-based cache initialization completed', counts);
      } else {
        logger.warn('No Discord guild found for role-based cache initialization');
      }
    } catch (error) {
      logger.error('Failed to initialize role-based cache', { error: error.message });
    }
  }, 7000); // 7 seconds delay to ensure guild members are loaded

  const whitelistService = new WhitelistService(logger, whitelistConfig, roleBasedCache, discordClient);
  
  whitelistService.setupRoutes(app);

  const connectionManager = new SquadJSConnectionManager(logger, whitelistConfig);
  const squadJSService = new SquadJSLinkingService(logger, discordClient, whitelistConfig, whitelistService, connectionManager);
  
  try {
    await connectionManager.connect();
    squadJSService.initialize();
  } catch (error) {
    logger.error('Failed to connect to SquadJS servers', { error: error.message });
  }

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

  const gracefulShutdown = () => {
    logger.info('Shutting down whitelist integration');
    clearInterval(cleanupInterval);
    squadJSService.destroy();
    connectionManager.disconnect();
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

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
    roleBasedCache,
    connectionManager,
    squadJSService,
    gracefulShutdown,
    config: whitelistConfig
  };
}

module.exports = {
  setupWhitelistRoutes
};