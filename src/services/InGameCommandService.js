const { Whitelist } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');
const { fetchStats } = require('./StatsService');
const { isDevelopment } = require('../utils/environment');

/**
 * Service for handling in-game chat commands via SquadJS
 * Listens to CHAT_MESSAGE events and responds to commands:
 * - !mywhitelist, !whitelist, !wl - Show player's whitelist status
 * - !stats, !mystats - Show player's K/D ratio with Discord invite
 */
class InGameCommandService {
  constructor(connectionManager, config) {
    this.logger = createServiceLogger('InGameCommandService');
    this.connectionManager = connectionManager;
    this.config = config;
    this.boundHandleChatMessage = null;

    // Rate limiting: Track last command usage per player (steamID -> timestamp)
    this.commandCooldowns = new Map();
    this.cooldownDuration = 600000; // 10 minutes in milliseconds
  }

  /**
   * Initialize the service and register event handlers
   */
  initialize() {
    // Skip initialization in development environment
    if (isDevelopment) {
      this.logger.info('Skipping in-game command service initialization (development environment)');
      return;
    }

    this.logger.info('Initializing in-game command service...');

    // Register handler for CHAT_MESSAGE events
    this.boundHandleChatMessage = this.handleChatMessage.bind(this);
    this.connectionManager.registerEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);

    // Set up periodic cleanup of expired cooldowns (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCooldowns();
    }, 300000); // 5 minutes

    this.logger.info('In-game command service initialized successfully');
  }

  /**
   * Handle incoming chat messages and route to appropriate command handlers
   * @param {Object} data - Chat message data from SquadJS
   * @param {Object} server - Server configuration
   */
  async handleChatMessage(data, server) {
    try {
      const message = data.message.trim().toLowerCase();
      const player = data.player;

      // Route to appropriate command handler
      if (message === '!mywhitelist' || message === '!whitelist' || message === '!wl') {
        // Check rate limit
        if (this.isOnCooldown(player.steamID)) {
          const remainingSeconds = this.getRemainingCooldown(player.steamID);
          const remainingMinutes = Math.floor(remainingSeconds / 60);
          const remainingSecondsOnly = remainingSeconds % 60;

          let timeMessage;
          if (remainingMinutes > 0) {
            timeMessage = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
            if (remainingSecondsOnly > 0) {
              timeMessage += ` and ${remainingSecondsOnly} second${remainingSecondsOnly !== 1 ? 's' : ''}`;
            }
          } else {
            timeMessage = `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
          }

          this.logger.info('Player on cooldown for whitelist command', {
            serverId: server.id,
            playerName: player.name,
            steamID: player.steamID,
            command: message,
            remainingSeconds
          });

          // Send cooldown message to player only (not broadcast)
          this.connectionManager.sendRCONWarn(
            server.id,
            player.steamID,
            `Please wait ${timeMessage} before using this command again.`
          );
          return;
        }

        // Update cooldown
        this.updateCooldown(player.steamID);

        // Process command
        await this.handleMyWhitelistCommand(player, server);
      } else if (message === '!stats' || message === '!mystats') {
        // Check rate limit
        if (this.isOnCooldown(player.steamID)) {
          const remainingSeconds = this.getRemainingCooldown(player.steamID);
          const remainingMinutes = Math.floor(remainingSeconds / 60);
          const remainingSecondsOnly = remainingSeconds % 60;

          let timeMessage;
          if (remainingMinutes > 0) {
            timeMessage = `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
            if (remainingSecondsOnly > 0) {
              timeMessage += ` and ${remainingSecondsOnly} second${remainingSecondsOnly !== 1 ? 's' : ''}`;
            }
          } else {
            timeMessage = `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
          }

          this.logger.info('Player on cooldown for stats command', {
            serverId: server.id,
            playerName: player.name,
            steamID: player.steamID,
            command: message,
            remainingSeconds
          });

          this.connectionManager.sendRCONWarn(
            server.id,
            player.steamID,
            `Please wait ${timeMessage} before using this command again.`
          );
          return;
        }

        // Update cooldown
        this.updateCooldown(player.steamID);

        // Process command
        await this.handleStatsCommand(player, server);
      }

    } catch (error) {
      this.logger.error('Error handling chat message:', {
        serverId: server.id,
        serverName: server.name,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handle whitelist status command (!mywhitelist, !whitelist, !wl) - Show player's whitelist status
   * @param {Object} player - Player object from SquadJS
   * @param {Object} server - Server configuration
   */
  async handleMyWhitelistCommand(player, server) {
    try {
      this.logger.info('Processing whitelist status command', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        steamID: player.steamID
      });

      // Use the same method as /whitelist info command for consistency
      const whitelistStatus = await Whitelist.getActiveWhitelistForUser(player.steamID);

      let responseMessage;
      let broadcastMessage;

      if (!whitelistStatus.hasWhitelist) {
        // No whitelist entry found
        responseMessage = 'No current whitelist.';
        broadcastMessage = `${player.name}'s not currently whitelisted.`;

        this.logger.info('Player has no active whitelist', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID,
          status: whitelistStatus.status
        });
      } else {
        // Player has an active whitelist
        if (whitelistStatus.status === 'Active (permanent)') {
          // Permanent whitelist (role-based or manually granted permanent)
          responseMessage = 'Whitelisted (Permanent)';
          broadcastMessage = `${player.name}'s Whitelisted (Permanent)`;
        } else if (whitelistStatus.expiration) {
          // Temporary whitelist with expiration
          const expirationDate = whitelistStatus.expiration;
          const now = new Date();
          const daysLeft = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

          const formattedDate = expirationDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });

          responseMessage = `Whitelisted until ${formattedDate}`;
          broadcastMessage = `${player.name}'s Whitelisted until ${formattedDate} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;
        } else {
          // Fallback: status says active but no expiration
          responseMessage = 'Whitelisted (Permanent)';
          broadcastMessage = `${player.name}'s Whitelisted (Permanent)`;
        }

        this.logger.info('Player whitelist status retrieved', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID,
          status: whitelistStatus.status,
          expiration: whitelistStatus.expiration
        });
      }

      // Send targeted response to player via RCON warn
      this.connectionManager.sendRCONWarn(
        server.id,
        player.steamID,
        responseMessage
      );

      // Broadcast message to all players
      this.connectionManager.sendRCONBroadcast(
        server.id,
        broadcastMessage
      );

    } catch (error) {
      this.logger.error('Error processing whitelist status command:', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        steamID: player.steamID,
        error: error.message,
        stack: error.stack
      });

      // Send error message to player
      this.connectionManager.sendRCONWarn(
        server.id,
        player.steamID,
        'Error checking whitelist status. Please try again later.'
      );
    }
  }

  /**
   * Handle stats command (!stats, !mystats) - Show player's K/D ratio
   * @param {Object} player - Player object from SquadJS
   * @param {Object} server - Server configuration
   */
  async handleStatsCommand(player, server) {
    try {
      this.logger.info('Processing stats command', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        steamID: player.steamID
      });

      // Fetch stats from the API
      const result = await fetchStats(player.steamID);

      let responseMessage;
      let broadcastMessage;

      if (!result.success) {
        // No stats found or error
        responseMessage = 'No stats found. Visit discord.gg/bbucket for more info.';
        broadcastMessage = `${player.name} has no recorded stats yet.`;

        this.logger.info('No stats found for player', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID,
          error: result.error
        });
      } else {
        const stats = result.stats;
        const kd = stats.kdRatio?.toFixed(2) || '0.00';
        const kills = stats.kills || 0;
        const deaths = stats.deaths || 0;

        responseMessage = `K/D: ${kd} (${kills}/${deaths}) - More stats at discord.gg/bbucket`;
        broadcastMessage = `${player.name}'s K/D: ${kd} (${kills} kills, ${deaths} deaths)`;

        this.logger.info('Player stats retrieved', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID,
          kd,
          kills,
          deaths
        });
      }

      // Send targeted response to player via RCON warn
      this.connectionManager.sendRCONWarn(
        server.id,
        player.steamID,
        responseMessage
      );

      // Broadcast message to all players
      this.connectionManager.sendRCONBroadcast(
        server.id,
        broadcastMessage
      );

    } catch (error) {
      this.logger.error('Error processing stats command:', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        steamID: player.steamID,
        error: error.message,
        stack: error.stack
      });

      // Send error message to player
      this.connectionManager.sendRCONWarn(
        server.id,
        player.steamID,
        'Error checking stats. Please try again later.'
      );
    }
  }

  /**
   * Check if a player is on cooldown for commands
   * @param {string} steamID - Player's Steam ID
   * @returns {boolean} True if player is on cooldown
   */
  isOnCooldown(steamID) {
    if (!this.commandCooldowns.has(steamID)) {
      return false;
    }

    const lastUse = this.commandCooldowns.get(steamID);
    const now = Date.now();
    const timeSinceLastUse = now - lastUse;

    return timeSinceLastUse < this.cooldownDuration;
  }

  /**
   * Get remaining cooldown time in seconds
   * @param {string} steamID - Player's Steam ID
   * @returns {number} Remaining seconds (rounded up)
   */
  getRemainingCooldown(steamID) {
    if (!this.commandCooldowns.has(steamID)) {
      return 0;
    }

    const lastUse = this.commandCooldowns.get(steamID);
    const now = Date.now();
    const timeSinceLastUse = now - lastUse;
    const remainingMs = this.cooldownDuration - timeSinceLastUse;

    return Math.ceil(remainingMs / 1000);
  }

  /**
   * Update cooldown timestamp for a player
   * @param {string} steamID - Player's Steam ID
   */
  updateCooldown(steamID) {
    this.commandCooldowns.set(steamID, Date.now());
  }

  /**
   * Clean up expired cooldown entries to prevent memory leaks
   */
  cleanupExpiredCooldowns() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [steamID, timestamp] of this.commandCooldowns.entries()) {
      const timeSinceLastUse = now - timestamp;

      // Remove entries older than the cooldown duration
      if (timeSinceLastUse >= this.cooldownDuration) {
        this.commandCooldowns.delete(steamID);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up expired cooldowns', {
        cleanedCount,
        remainingCount: this.commandCooldowns.size
      });
    }
  }

  /**
   * Cleanup - unregister event handlers
   */
  shutdown() {
    if (this.boundHandleChatMessage) {
      this.logger.info('Shutting down in-game command service...');
      // Note: SquadJSConnectionManager doesn't currently expose unregisterEventHandler
      // This is here for completeness if that feature is added
      this.boundHandleChatMessage = null;
    }

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear cooldown tracking
    this.commandCooldowns.clear();
  }
}

module.exports = InGameCommandService;
