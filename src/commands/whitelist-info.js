const { SlashCommandBuilder } = require('discord.js');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const { getUserInfo } = require('../utils/accountLinking');
const { isValidSteamId } = require('../utils/steamId');
const { getHighestPriorityGroup } = require('../utils/environment');
const WhitelistAuthorityService = require('../services/WhitelistAuthorityService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-info')
    .setDescription('Check whitelist status for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to check')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 to check')
        .setRequired(false)),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const discordUser = interaction.options.getUser('user');
      const steamid = interaction.options.getString('steamid');

      // Validate that at least one parameter is provided
      if (!discordUser && !steamid) {
        await sendError(interaction, 'Please provide either a Discord user or Steam ID to check.');
        return;
      }

      // Get comprehensive user info
      const userInfo = await getUserInfo({
        discordUserId: discordUser?.id,
        steamid64: steamid,
        username: discordUser?.displayName || discordUser?.username
      });

      // Validate Steam ID format if we have one
      if (userInfo.steamid64 && !isValidSteamId(userInfo.steamid64)) {
        await sendError(interaction, 'Invalid Steam ID format. Please provide a valid Steam ID64.');
        return;
      }

      // Resolve Discord user object if needed
      let resolvedDiscordUser = discordUser;
      if (!discordUser && userInfo.discordUserId && interaction.client) {
        try {
          resolvedDiscordUser = await interaction.client.users.fetch(userInfo.discordUserId);
          loggerConsole.debug('Resolved Discord user from Steam ID', {
            steamId: userInfo.steamid64,
            discordUserId: userInfo.discordUserId
          });
        } catch (error) {
          loggerConsole.warn('Failed to fetch Discord user from resolved ID', {
            discordUserId: userInfo.discordUserId,
            error: error.message
          });
        }
      }

      // Get comprehensive whitelist status using WhitelistAuthorityService
      let authorityStatus = null;
      let member = null;

      if (resolvedDiscordUser) {
        try {
          member = await interaction.guild.members.fetch(resolvedDiscordUser.id);
          authorityStatus = await WhitelistAuthorityService.getWhitelistStatus(
            resolvedDiscordUser.id,
            userInfo.steamid64,
            member
          );
        } catch (error) {
          loggerConsole.error('WhitelistAuthorityService validation failed:', error);
          authorityStatus = null;
        }
      }

      // Get whitelist database entries
      let whitelistStatus = { hasWhitelist: false, status: 'No whitelist' };
      let history = [];

      if (userInfo.steamid64) {
        whitelistStatus = await Whitelist.getActiveWhitelistForUser(userInfo.steamid64);
        history = await Whitelist.findAll({
          where: { steamid64: userInfo.steamid64 },
          order: [['granted_at', 'DESC']]
        });
      }

      // Filter for truly active entries (not revoked AND not expired)
      const now = new Date();
      const activeEntries = history.filter(entry => {
        if (entry.revoked) return false;

        if (!entry.duration_value || !entry.duration_type) {
          return entry.duration_value !== 0;
        }

        const grantedDate = new Date(entry.granted_at);
        const expirationDate = new Date(grantedDate);

        if (entry.duration_type === 'days') {
          expirationDate.setDate(expirationDate.getDate() + entry.duration_value);
        } else if (entry.duration_type === 'months') {
          expirationDate.setMonth(expirationDate.getMonth() + entry.duration_value);
        }

        return expirationDate > now;
      });

      // Determine final status
      let finalStatus, finalColor;

      if (authorityStatus && authorityStatus.effectiveStatus) {
        // Use authority service result
        if (authorityStatus.isWhitelisted) {
          const source = authorityStatus.effectiveStatus.primarySource;

          if (source === 'database') {
            finalStatus = authorityStatus.sources?.database?.isActive ?
              `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})` :
              'Active (database)';
            finalColor = 0x00FF00;
          } else {
            finalStatus = `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})`;
            finalColor = 0x00FF00;
          }
        } else {
          const reason = authorityStatus.effectiveStatus.reason;

          if (reason === 'security_blocked_insufficient_confidence' && authorityStatus.effectiveStatus.details) {
            const details = authorityStatus.effectiveStatus.details;
            finalStatus = `Inactive - Steam link confidence too low (${details.actualConfidence}/1.0 required)`;
            finalColor = 0xFF6600;
          } else if (reason === 'no_steam_account_linked' && authorityStatus.effectiveStatus.details) {
            const details = authorityStatus.effectiveStatus.details;
            if (details.hasStaffRole) {
              finalStatus = 'Inactive - Steam account not linked (has staff role)';
              finalColor = 0xFFA500;
            } else {
              finalStatus = 'No whitelist - Steam account not linked';
              finalColor = 0xFF0000;
            }
          } else {
            finalStatus = 'No whitelist access';
            finalColor = 0xFF0000;
          }
        }
      } else {
        // Fallback to database-only check
        if (!userInfo.steamid64) {
          finalStatus = 'No whitelist - Steam account not linked';
          finalColor = 0xFF0000;
        } else if (whitelistStatus.hasWhitelist) {
          finalStatus = whitelistStatus.status;
          finalColor = 0x00FF00;
        } else {
          finalStatus = whitelistStatus.status;
          finalColor = 0xFF0000;
        }
      }

      // Determine account link status
      let accountLinkStatus = '❌ Not linked';
      if (authorityStatus?.linkInfo) {
        const confidence = authorityStatus.linkInfo.confidence;
        if (confidence >= 0.5) {
          accountLinkStatus = `✅ Linked (${confidence}/1.0)`;
        } else {
          accountLinkStatus = `⚠️ Low confidence (${confidence}/1.0)`;
        }
      } else if (userInfo.hasLink) {
        accountLinkStatus = '✅ Linked';
      }

      // Display user identifier
      let displayUser = resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'user';
      if (!resolvedDiscordUser && userInfo.discordUserId) {
        displayUser = `<@${userInfo.discordUserId}> (ID: ${userInfo.discordUserId})`;
      } else if (!resolvedDiscordUser && !userInfo.discordUserId && history.length > 0) {
        const entryWithDiscord = history.find(entry => entry.discord_username);
        if (entryWithDiscord) {
          displayUser = `${entryWithDiscord.discord_username} (from whitelist record)`;
        }
      }

      // Build info embed
      const embed = createResponseEmbed({
        title: '📋 Whitelist Status',
        description: `Whitelist information for ${displayUser}`,
        fields: [
          { name: 'Steam ID', value: userInfo.steamid64 || 'Not linked', inline: true },
          { name: 'Status', value: finalStatus, inline: true },
          { name: 'Account Link', value: accountLinkStatus, inline: true }
        ],
        color: finalColor
      });

      // Show whitelist expiration if applicable
      if (whitelistStatus.expiration) {
        embed.addFields({
          name: whitelistStatus.hasWhitelist ? 'Expires' : 'Expired',
          value: whitelistStatus.expiration.toLocaleDateString(),
          inline: true
        });
      }

      // Show active whitelist entries
      let whitelistEntries = [];

      if (activeEntries.length > 0) {
        const stackingInfo = activeEntries.map(entry => {
          const reason = entry.reason || 'Unknown';
          const note = entry.note ? `: ${entry.note}` : '';

          if (!entry.duration_value || !entry.duration_type || entry.duration_value === 0) {
            return `• ${reason}${note}: permanent`;
          }

          const grantedDate = new Date(entry.granted_at);
          const expirationDate = new Date(grantedDate);

          if (entry.duration_type === 'days') {
            expirationDate.setDate(expirationDate.getDate() + entry.duration_value);
          } else if (entry.duration_type === 'months') {
            expirationDate.setMonth(expirationDate.getMonth() + entry.duration_value);
          }

          const remainingMs = expirationDate - now;
          const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

          return `• ${reason}${note}: ${remainingDays} days`;
        });
        whitelistEntries.push(...stackingInfo);
      }

      if (whitelistEntries.length > 0) {
        embed.addFields({
          name: `Active Whitelist Entries (${whitelistEntries.length})`,
          value: whitelistEntries.join('\n'),
          inline: false
        });
      }

      // Add warnings if needed
      if (authorityStatus && !authorityStatus.isWhitelisted && authorityStatus.effectiveStatus) {
        const reason = authorityStatus.effectiveStatus.reason;

        if (reason === 'security_blocked_insufficient_confidence' && authorityStatus.effectiveStatus.details) {
          const details = authorityStatus.effectiveStatus.details;
          embed.addFields({
            name: '🚨 Security Warning',
            value: `Your Steam account link has insufficient confidence (${details.actualConfidence}/1.0). Use \`/linkid\` to create a proper link.`,
            inline: false
          });
        } else if (reason === 'no_steam_account_linked' && authorityStatus.effectiveStatus.details) {
          const details = authorityStatus.effectiveStatus.details;
          if (details.hasStaffRole) {
            embed.addFields({
              name: '⚠️ Action Required',
              value: 'You have a staff role but need to link your Steam account. Use `/linkid` to connect your Steam account.',
              inline: false
            });
          }
        }
      } else if (!userInfo.steamid64 && member) {
        const group = getHighestPriorityGroup(member.roles.cache);
        if (group && group !== 'Member') {
          embed.addFields({
            name: '⚠️ Action Required',
            value: 'You need to link your Steam account for the whitelist to work. Use `/linkid` to connect your Steam account.',
            inline: false
          });
        }
      }

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      loggerConsole.error('Whitelist info command failed', {
        error: error.message,
        stack: error.stack
      });
      await sendError(interaction, `Failed to retrieve whitelist status: ${error.message}`);
    }
  }
};
