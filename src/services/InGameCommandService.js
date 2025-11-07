const { Whitelist } = require('../database/models');
const { Op } = require('sequelize');
const { createServiceLogger } = require('../utils/logger');

/**
 * Service for handling in-game chat commands via SquadJS
 * Listens to CHAT_MESSAGE events and responds to commands like !mywhitelist
 */
class InGameCommandService {
  constructor(connectionManager, config) {
    this.logger = createServiceLogger('InGameCommandService');
    this.connectionManager = connectionManager;
    this.config = config;
    this.boundHandleChatMessage = null;
  }

  /**
   * Initialize the service and register event handlers
   */
  initialize() {
    this.logger.info('Initializing in-game command service...');

    // Register handler for CHAT_MESSAGE events
    this.boundHandleChatMessage = this.handleChatMessage.bind(this);
    this.connectionManager.registerEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);

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
      if (message === '!mywhitelist') {
        await this.handleMyWhitelistCommand(player, server);
      }
      // Add more commands here as needed
      // else if (message === '!help') {
      //   await this.handleHelpCommand(player, server);
      // }

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
   * Handle !mywhitelist command - Show player's whitelist status
   * @param {Object} player - Player object from SquadJS
   * @param {Object} server - Server configuration
   */
  async handleMyWhitelistCommand(player, server) {
    try {
      this.logger.info('Processing !mywhitelist command', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        steamID: player.steamID
      });

      // Query database for all active whitelist entries
      // Users may have multiple entries (staff + whitelist), so we need to prioritize
      const allEntries = await Whitelist.findAll({
        where: {
          [Op.or]: [
            { steamid64: player.steamID },
            { eosID: player.eosID }
          ],
          approved: true,
          revoked: false
        },
        order: [['granted_at', 'DESC']]
      });

      let responseMessage;
      let broadcastMessage;

      if (allEntries.length === 0) {
        // No whitelist entry found
        responseMessage = 'No current whitelist.';
        broadcastMessage = `${player.name}'s not currently whitelisted.`;
        this.logger.info('Player has no active whitelist', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID
        });

        // Send targeted response to player via RCON warn
        const warnSent = this.connectionManager.sendRCONWarn(
          server.id,
          player.steamID,
          responseMessage
        );

        if (!warnSent) {
          this.logger.warn('Failed to send RCON warn to player', {
            serverId: server.id,
            playerName: player.name,
            steamID: player.steamID,
            message: responseMessage
          });
        }

        // Broadcast message to all players
        const broadcastSent = this.connectionManager.sendRCONBroadcast(
          server.id,
          broadcastMessage
        );

        if (!broadcastSent) {
          this.logger.warn('Failed to send RCON broadcast', {
            serverId: server.id,
            playerName: player.name,
            message: broadcastMessage
          });
        }
      } else {
        // Prioritize entries: staff > permanent whitelist > temporary whitelist with longest expiration
        let whitelistEntry = null;

        // First, check for staff entries (type: 'staff')
        const staffEntry = allEntries.find(e => e.type === 'staff');
        if (staffEntry) {
          whitelistEntry = staffEntry;
        } else {
          // No staff entry, check for permanent whitelists
          const permanentEntry = allEntries.find(e =>
            e.duration_value === null && e.duration_type === null
          );
          if (permanentEntry) {
            whitelistEntry = permanentEntry;
          } else {
            // No permanent entry, get the one with longest expiration
            whitelistEntry = allEntries.sort((a, b) => {
              if (!a.expiration) return -1;
              if (!b.expiration) return 1;
              return new Date(b.expiration) - new Date(a.expiration);
            })[0];
          }
        }

        // Player has an active whitelist (whitelistEntry is guaranteed to exist here)
        // Check if permanent based on duration fields (null = permanent)
        const isPermanent = whitelistEntry.duration_value === null && whitelistEntry.duration_type === null;

        if (isPermanent) {
          // Permanent whitelist (role-based or manually granted permanent)
          responseMessage = 'Whitelisted (Permanent)';
          broadcastMessage = `${player.name}'s Whitelisted (Permanent)`;
        } else if (whitelistEntry.expiration) {
          // Temporary whitelist with expiration
          const expirationDate = new Date(whitelistEntry.expiration);
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
          // Fallback: no expiration date set
          responseMessage = 'Whitelisted (Permanent)';
          broadcastMessage = `${player.name}'s Whitelisted (Permanent)`;
        }

        this.logger.info('Player whitelist status retrieved', {
          serverId: server.id,
          playerName: player.name,
          steamID: player.steamID,
          type: whitelistEntry.type,
          expiration: whitelistEntry.expiration,
          duration_value: whitelistEntry.duration_value,
          duration_type: whitelistEntry.duration_type,
          isPermanent: isPermanent
        });

        // Send targeted response to player via RCON warn
        const warnSent = this.connectionManager.sendRCONWarn(
          server.id,
          player.steamID,
          responseMessage
        );

        if (!warnSent) {
          this.logger.warn('Failed to send RCON warn to player', {
            serverId: server.id,
            playerName: player.name,
            steamID: player.steamID,
            message: responseMessage
          });
        }

        // Broadcast message to all players
        const broadcastSent = this.connectionManager.sendRCONBroadcast(
          server.id,
          broadcastMessage
        );

        if (!broadcastSent) {
          this.logger.warn('Failed to send RCON broadcast', {
            serverId: server.id,
            playerName: player.name,
            message: broadcastMessage
          });
        }
      }

    } catch (error) {
      this.logger.error('Error processing !mywhitelist command:', {
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
   * Cleanup - unregister event handlers
   */
  shutdown() {
    if (this.boundHandleChatMessage) {
      this.logger.info('Shutting down in-game command service...');
      // Note: SquadJSConnectionManager doesn't currently expose unregisterEventHandler
      // This is here for completeness if that feature is added
      this.boundHandleChatMessage = null;
    }
  }
}

module.exports = InGameCommandService;
