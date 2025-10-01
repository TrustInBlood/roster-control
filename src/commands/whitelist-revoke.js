const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { getUserInfo } = require('../utils/accountLinking');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-revoke')
    .setDescription('Revoke whitelist access for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to revoke')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 to revoke')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for revocation')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const discordUser = interaction.options.getUser('user');
        const steamid = interaction.options.getString('steamid');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Validate that at least one parameter is provided
        if (!discordUser && !steamid) {
          await sendError(interaction, 'Please provide either a Discord user or Steam ID to revoke.');
          return;
        }

        // Get comprehensive user info
        const userInfo = await getUserInfo({
          discordUserId: discordUser?.id,
          steamid64: steamid,
          username: discordUser?.displayName || discordUser?.username
        });

        // Ensure we have a Steam ID for revocation
        if (!userInfo.steamid64) {
          await sendError(interaction, 'No Steam ID found. Please provide a Steam ID or link the Discord account first.');
          return;
        }

        // Resolve Discord user for display and role removal
        let resolvedDiscordUser = discordUser;
        if (!discordUser && userInfo.discordUserId) {
          try {
            resolvedDiscordUser = await interaction.client.users.fetch(userInfo.discordUserId);
          } catch (error) {
            loggerConsole.warn('Could not fetch Discord user', {
              discordUserId: userInfo.discordUserId,
              error: error.message
            });
          }
        }

        loggerConsole.info('Whitelist revocation initiated', {
          steamid: userInfo.steamid64,
          reason,
          revokedBy: interaction.user.id
        });

        // Create service instance and revoke
        const grantService = new WhitelistGrantService(interaction.client);

        const result = await grantService.revokeWhitelist({
          steamid64: userInfo.steamid64,
          reason,
          revoked_by: interaction.user.id,
          discordUser: resolvedDiscordUser,
          guild: interaction.guild
        });

        if (!result.success) {
          const errorMessage = result.errors?.join('\n') || 'Unknown error occurred';
          await sendError(interaction, errorMessage);
          return;
        }

        // Build success embed
        const successEmbed = createResponseEmbed({
          title: '❌ Whitelist Revoked',
          description: `Successfully revoked whitelist access${result.rolesRemoved.length > 0 ? ' and removed Discord roles' : ''}`,
          fields: [
            { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
            { name: 'Steam ID', value: userInfo.steamid64, inline: true },
            { name: 'Entries Revoked', value: result.entriesRevoked.toString(), inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: 0xFF0000
        });

        if (result.rolesRemoved.length > 0) {
          successEmbed.addFields({
            name: '✅ Discord Roles Removed',
            value: result.rolesRemoved.join(', '),
            inline: false
          });
        } else if (resolvedDiscordUser && !result.hasRemainingEntries) {
          successEmbed.addFields({
            name: 'ℹ️ Discord Roles',
            value: 'No roles removed (user may have role-based or other active whitelist entries)',
            inline: false
          });
        }

        if (result.hasRemainingEntries) {
          successEmbed.addFields({
            name: 'ℹ️ Note',
            value: 'User still has other active whitelist entries (role-based or stacked entries)',
            inline: false
          });
        }

        await interaction.editReply({
          embeds: [successEmbed]
        });

      } catch (error) {
        loggerConsole.error('Whitelist revoke command failed', {
          error: error.message,
          stack: error.stack
        });
        await sendError(interaction, `Failed to revoke whitelist: ${error.message}`);
      }
    });
  }
};
