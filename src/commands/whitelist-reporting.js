const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-reporting')
    .setDescription('Grant temporary reporting whitelist (no role)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to grant whitelist to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 of the user')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Whitelist duration')
        .setRequired(true)
        .addChoices(
          { name: '3 Days', value: '3_days' },
          { name: '7 Days', value: '7_days' },
          { name: '14 Days', value: '14_days' },
          { name: '30 Days', value: '30_days' },
          { name: 'Custom', value: 'custom' }
        ))
    .addIntegerOption(option =>
      option.setName('custom_days')
        .setDescription('Custom number of days (1-365, only if duration=custom)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const discordUser = interaction.options.getUser('user');
        const steamid = interaction.options.getString('steamid');
        const durationChoice = interaction.options.getString('duration');
        const customDays = interaction.options.getInteger('custom_days');

        // Parse duration
        let duration_value, durationText;
        if (durationChoice === 'custom') {
          if (!customDays) {
            await sendError(interaction, 'Please provide custom_days when using custom duration.');
            return;
          }
          duration_value = customDays;
          durationText = `${customDays} day${customDays > 1 ? 's' : ''}`;
        } else {
          const durationMap = {
            '3_days': { value: 3, text: '3 days' },
            '7_days': { value: 7, text: '7 days' },
            '14_days': { value: 14, text: '14 days' },
            '30_days': { value: 30, text: '30 days' }
          };

          const selected = durationMap[durationChoice];
          if (!selected) {
            await sendError(interaction, 'Invalid duration selected.');
            return;
          }

          duration_value = selected.value;
          durationText = selected.text;
        }

        loggerConsole.info('Reporting whitelist grant initiated', {
          discordUserId: discordUser.id,
          steamid,
          duration: durationText,
          grantedBy: interaction.user.id
        });

        // Create service instance
        const grantService = new WhitelistGrantService(interaction.client);

        // Grant whitelist with Discord user (no role assignment for reporting)
        const result = await grantService.grantWithDiscord({
          discordUser,
          steamid64: steamid,
          reason: 'reporting',
          duration_value,
          duration_type: 'days',
          granted_by: interaction.user.id,
          guild: interaction.guild,
          grantedByUser: interaction.user
        });

        if (!result.success) {
          const errorMessage = result.errors?.join('\n') || 'Unknown error occurred';
          await sendError(interaction, errorMessage);
          return;
        }

        // Build success embed
        const successEmbed = createResponseEmbed({
          title: '📋 Reporting Whitelist Granted',
          description: 'Temporary reporting whitelist access has been granted successfully!',
          fields: [
            { name: 'Discord User', value: `<@${discordUser.id}>`, inline: true },
            { name: 'Steam ID', value: steamid, inline: true },
            { name: 'Type', value: 'Reporting (Temporary)', inline: true },
            { name: 'Duration', value: durationText, inline: true },
            { name: 'Expires', value: result.expiration ? result.expiration.toLocaleDateString() : 'Never', inline: true },
            { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: 0xff9800
        });

        successEmbed.addFields({
          name: 'ℹ️ Note',
          value: 'This is a temporary whitelist for reporting purposes. No Discord role is assigned.',
          inline: false
        });

        if (result.linkCreated) {
          successEmbed.addFields({
            name: '🔗 Account Link',
            value: '✅ Discord-Steam link created (Confidence: 0.5)',
            inline: false
          });
        } else {
          successEmbed.addFields({
            name: '🔗 Account Link',
            value: '✅ Discord-Steam link updated (existing link preserved)',
            inline: false
          });
        }

        await interaction.editReply({
          embeds: [successEmbed]
        });

        // Send public announcement
        try {
          const publicEmbed = createResponseEmbed({
            title: '📋 Reporting Whitelist Granted',
            description: `<@${discordUser.id}> has been granted **Reporting** whitelist access (temporary)`,
            fields: [
              { name: 'Duration', value: durationText, inline: true },
              { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
            ],
            color: 0xff9800
          });

          await interaction.followUp({
            embeds: [publicEmbed]
          });
        } catch (publicError) {
          loggerConsole.error('Failed to send public announcement', {
            error: publicError.message
          });
        }

      } catch (error) {
        loggerConsole.error('Reporting whitelist grant failed', {
          error: error.message,
          stack: error.stack
        });
        await sendError(interaction, `Failed to grant reporting whitelist: ${error.message}`);
      }
    });
  }
};
