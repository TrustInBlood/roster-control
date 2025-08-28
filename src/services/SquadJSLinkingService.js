const { VerificationCode, PlayerDiscordLink, Whitelist } = require('../database/models');

class SquadJSLinkingService {
  constructor(logger, discordClient, config, whitelistService, connectionManager) {
    this.logger = logger;
    this.discordClient = discordClient;
    this.config = config;
    this.whitelistService = whitelistService;
    this.connectionManager = connectionManager;
    this.codePattern = new RegExp(`\\b[A-Z0-9]{${config.verification.codeLength}}\\b`, 'g');
  }

  initialize() {
    this.boundHandleChatMessage = this.handleChatMessage.bind(this);
    this.connectionManager.registerEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);
    
    this.logger.info('SquadJS linking service initialized', {
      codeLength: this.config.verification.codeLength
    });
  }

  async handleChatMessage(data, server) {
    if (!data || !data.message || !data.player) {
      return;
    }

    const message = data.message.trim();
    const codeMatches = message.match(this.codePattern);
    
    if (!codeMatches) {
      return;
    }

    this.logger.debug('Potential verification code detected', {
      serverId: server.id,
      serverName: server.name,
      playerId: data.player.id,
      playerName: data.player.name,
      message: message,
      codes: codeMatches
    });

    for (const code of codeMatches) {
      await this.processVerificationCode(code, data.player, server);
    }
  }

  async processVerificationCode(code, player, server) {
    try {
      const verificationCode = await VerificationCode.findValidCode(code);
      
      if (!verificationCode) {
        this.logger.debug('Invalid or expired verification code', { 
          serverId: server.id,
          serverName: server.name,
          code, 
          playerId: player.id,
          playerName: player.name 
        });
        return;
      }

      const { link, created } = await PlayerDiscordLink.createOrUpdateLink(
        verificationCode.discord_user_id,
        player.steamID,
        player.eosID,
        player.name
      );

      // Store the verification code data before destroying it
      const originalCode = verificationCode.code;
      
      await verificationCode.destroy();

      await this.updateWhitelistDiscordUsernames(player.steamID, player.eosID, link.discord_user_id);

      // Update the Discord interaction message
      await this.updateDiscordInteraction(originalCode, player, server, created);

      // Send in-game notification
      await this.sendRCONNotification(player, server, created ? 'linked' : 'updated');

      this.whitelistService?.invalidateCache();

      this.logger.info('Account linking successful', {
        serverId: server.id,
        serverName: server.name,
        discordUserId: link.discord_user_id,
        steamid64: player.steamID,
        eosID: player.eosID,
        username: player.name,
        action: created ? 'created' : 'updated'
      });

    } catch (error) {
      this.logger.error('Failed to process verification code', {
        serverId: server.id,
        serverName: server.name,
        code,
        playerId: player.id,
        playerName: player.name,
        error: error.message
      });
    }
  }

  async updateWhitelistDiscordUsernames(steamid64, eosID, discordUserId) {
    try {
      const discordUser = await this.discordClient.users.fetch(discordUserId);
      const discordUsername = discordUser ? `${discordUser.username}#${discordUser.discriminator}` : null;

      if (discordUsername) {
        const updatedCount = await Whitelist.updateDiscordUsername(steamid64, eosID, discordUsername);
        
        if (updatedCount > 0) {
          this.logger.info('Updated whitelist entries with Discord username', {
            discordUsername,
            steamid64,
            eosID,
            updatedCount
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to update whitelist Discord usernames', {
        steamid64,
        eosID,
        discordUserId,
        error: error.message
      });
    }
  }

  async notifySuccessfulLink(link, player, server, created) {
    try {
      const user = await this.discordClient.users.fetch(link.discord_user_id);
      
      if (!user) {
        this.logger.warn('Could not fetch Discord user for notification', {
          discordUserId: link.discord_user_id
        });
        return;
      }

      const embed = {
        color: created ? 0x00ff00 : 0x0099ff,
        title: created ? 'Account Linked Successfully!' : 'Account Link Updated!',
        fields: [
          {
            name: 'Game Account',
            value: `**Username:** ${player.name}\n**Steam ID:** ${player.steamID || 'N/A'}\n**EOS ID:** ${player.eosID || 'N/A'}`,
            inline: false
          },
          {
            name: 'Discord Account',
            value: `${user.username}#${user.discriminator}`,
            inline: false
          },
          {
            name: 'Server',
            value: `${server.name} (${server.id})`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Roster Control System'
        }
      };

      await user.send({ embeds: [embed] });

      this.logger.info('Link notification sent', {
        discordUserId: link.discord_user_id,
        username: user.username
      });

    } catch (error) {
      this.logger.error('Failed to send link notification', {
        discordUserId: link.discord_user_id,
        error: error.message
      });
    }
  }

  async updateDiscordInteraction(code, player, server, created) {
    try {
      const pending = global.pendingVerifications?.get(code);
      if (pending) {
        const successEmbed = {
          color: 0x00ff00,
          title: '✅ Account Linked Successfully!',
          description: `Your Discord account has been ${created ? 'linked' : 'updated'} with your Squad account.`,
          fields: [
            {
              name: 'Game Account',
              value: `**Username:** ${player.name}\n**Steam ID:** ${player.steamID || 'N/A'}\n**EOS ID:** ${player.eosID || 'N/A'}`,
              inline: false
            },
            {
              name: 'Server',
              value: `${server.name} (${server.id})`,
              inline: false
            },
            {
              name: 'Status',
              value: `Account ${created ? 'linked' : 'updated'} successfully!`,
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System'
          }
        };

        await pending.interaction.editReply({ embeds: [successEmbed] });
        global.pendingVerifications.delete(code);
        
        this.logger.info('Discord interaction updated with success message', {
          code,
          discordUserId: pending.discordUserId,
          playerName: player.name
        });
      }
    } catch (error) {
      this.logger.error('Failed to update Discord interaction', {
        code,
        playerName: player.name,
        error: error.message
      });
    }
  }

  async sendRCONNotification(player, server, action) {
    try {
      // Use the working rcon.warn method (targeted warning to player)
      const message = `Account ${action}: Your Discord account is now linked to ${player.name}!`;
      const sent = this.connectionManager.sendRCONWarn(server.id, player.steamID, message);
      
      if (sent) {
        this.logger.debug('RCON notification sent', {
          serverId: server.id,
          serverName: server.name,
          playerName: player.name,
          steamID: player.steamID,
          action,
          message
        });
      }
    } catch (error) {
      this.logger.error('Failed to send RCON notification', {
        serverId: server.id,
        serverName: server.name,
        playerId: player.id,
        playerName: player.name,
        action,
        error: error.message
      });
    }
  }

  destroy() {
    if (this.boundHandleChatMessage) {
      this.connectionManager.unregisterEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);
    }
    
    this.logger.info('SquadJS linking service destroyed');
  }
}

module.exports = SquadJSLinkingService;