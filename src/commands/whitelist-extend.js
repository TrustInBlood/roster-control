const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { getUserInfo } = require('../utils/accountLinking');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-extend')
    .setDescription('Extend whitelist duration for a user')
    .addIntegerOption(option =>
      option.setName('months')
        .setDescription('Number of months to extend')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(24))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to extend')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 to extend')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const discordUser = interaction.options.getUser('user');
        const steamid = interaction.options.getString('steamid');
        const months = interaction.options.getInteger('months');

        // Validate that at least one parameter is provided
        if (!discordUser && !steamid) {
          await sendError(interaction, 'Please provide either a Discord user or Steam ID to extend.');
          return;
        }

        // Get comprehensive user info
        const userInfo = await getUserInfo({
          discordUserId: discordUser?.id,
          steamid64: steamid,
          username: discordUser?.displayName || discordUser?.username
        });

        // Ensure we have a Steam ID for extension
        if (!userInfo.steamid64) {
          await sendError(interaction, 'No Steam ID found. Please provide a Steam ID or link the Discord account first.');
          return;
        }

        // Resolve Discord user for display
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

        loggerConsole.info('Whitelist extension initiated', {
          steamid: userInfo.steamid64,
          months,
          grantedBy: interaction.user.id
        });

        // Create service instance and extend
        const grantService = new WhitelistGrantService(interaction.client);

        const result = await grantService.extendWhitelist({
          steamid64: userInfo.steamid64,
          months,
          granted_by: interaction.user.id
        });

        if (!result.success) {
          const errorMessage = result.errors?.join('\n') || 'Unknown error occurred';
          await sendError(interaction, errorMessage);
          return;
        }

        // Build success embed
        const successEmbed = createResponseEmbed({
          title: '⏰ Whitelist Extended',
          description: 'Successfully extended whitelist access',
          fields: [
            { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
            { name: 'Steam ID', value: userInfo.steamid64, inline: true },
            { name: 'Extension', value: `${months} month${months > 1 ? 's' : ''}`, inline: true },
            { name: 'New Entry Expires', value: result.newExpiration ? result.newExpiration.toLocaleDateString() : 'Never', inline: true },
            { name: 'Extended By', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: 0x0099FF
        });

        await interaction.editReply({
          embeds: [successEmbed]
        });

      } catch (error) {
        loggerConsole.error('Whitelist extend command failed', {
          error: error.message,
          stack: error.stack
        });
        await sendError(interaction, `Failed to extend whitelist: ${error.message}`);
      }
    });
  }
};
