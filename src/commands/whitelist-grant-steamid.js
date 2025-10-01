const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-grant-steamid')
    .setDescription('Emergency Steam-only whitelist grant (no account link)')
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
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Username for audit trail (optional but recommended)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('custom_days')
        .setDescription('Custom number of days (1-365, only if duration=custom)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        const steamid = interaction.options.getString('steamid');
        const durationChoice = interaction.options.getString('duration');
        const username = interaction.options.getString('username');
        const customDays = interaction.options.getInteger('custom_days');

        // Parse duration first to show in warning
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

        // Show WARNING embed
        const warningEmbed = createResponseEmbed({
          title: '⚠️ STEAM ID ONLY GRANT',
          description: `**Steam ID:** ${steamid}\n${username ? `**Username:** ${username}` : '**Username:** Not provided'}\n**Duration:** ${durationText}\n\n🚨 **IMPORTANT WARNING**\n\nThis grant will **NOT create a Discord-Steam account link**.\n\n✅ **Recommended:** Use other whitelist commands that require Discord user for proper account linking.\n\n⚠️ **Only use this for:**\n• User not in Discord server\n• Emergency situations\n• External players who don't use Discord\n\n⏰ **Please confirm within 2 minutes**`,
          color: 0xff6600
        });

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('confirm_steamid_grant')
              .setLabel('Proceed with Steam ID Grant')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('⚠️'),
            new ButtonBuilder()
              .setCustomId('cancel_steamid_grant')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.reply({
          embeds: [warningEmbed],
          components: [confirmRow],
          flags: MessageFlags.Ephemeral
        });

        // Handle confirmation
        const collector = interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => (i.customId === 'confirm_steamid_grant' || i.customId === 'cancel_steamid_grant') && i.user.id === interaction.user.id,
          time: 120000 // 2 minutes
        });

        collector.on('collect', async (buttonInteraction) => {
          if (buttonInteraction.customId === 'cancel_steamid_grant') {
            await buttonInteraction.update({
              content: '❌ Steam ID grant cancelled.',
              embeds: [],
              components: []
            });
            collector.stop('cancelled');
            return;
          }

          // Proceed with Steam ID only grant
          try {
            await buttonInteraction.deferUpdate();

            loggerConsole.warn('Steam-only whitelist grant initiated (NO ACCOUNT LINK)', {
              steamid,
              username,
              duration: durationText,
              grantedBy: interaction.user.id
            });

            // Create service instance
            const grantService = new WhitelistGrantService(interaction.client);

            // Grant whitelist WITHOUT Discord user (no account link, no role)
            const result = await grantService.grantSteamOnly({
              steamid64: steamid,
              username,
              duration_value,
              duration_type: 'days',
              granted_by: interaction.user.id
            });

            if (!result.success) {
              const errorMessage = result.errors?.join('\n') || 'Unknown error occurred';
              await buttonInteraction.editReply({
                content: `❌ ${errorMessage}`,
                embeds: [],
                components: []
              });
              collector.stop('error');
              return;
            }

            // Build success embed with warnings
            const successEmbed = createResponseEmbed({
              title: '⚠️ Steam ID Whitelist Granted',
              description: 'Steam ID whitelist has been granted (emergency use only)',
              fields: [
                { name: 'Steam ID', value: steamid, inline: true },
                { name: 'Username', value: username || 'Not provided', inline: true },
                { name: 'Duration', value: durationText, inline: true },
                { name: 'Expires', value: result.expiration ? result.expiration.toLocaleDateString() : 'Never', inline: true },
                { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
              ],
              color: 0xff6600
            });

            successEmbed.addFields({
              name: '⚠️ WARNING',
              value: 'No Discord-Steam account link was created.\nNo Discord role was assigned.\n\n**Action Required:** If this user is in Discord, link their account using the standard whitelist commands.',
              inline: false
            });

            await buttonInteraction.editReply({
              embeds: [successEmbed],
              components: []
            });

            // Send public announcement with warning
            try {
              const publicEmbed = createResponseEmbed({
                title: '⚠️ Steam ID Whitelist Granted',
                description: `Steam ID \`${steamid}\`${username ? ` (${username})` : ''} has been granted whitelist access\n\n⚠️ **Emergency grant - no Discord link created**`,
                fields: [
                  { name: 'Duration', value: durationText, inline: true },
                  { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
                ],
                color: 0xff6600
              });

              await interaction.followUp({
                embeds: [publicEmbed]
              });
            } catch (publicError) {
              loggerConsole.error('Failed to send public announcement', {
                error: publicError.message
              });
            }

            collector.stop('completed');

          } catch (error) {
            loggerConsole.error('Steam-only whitelist grant failed', {
              steamid,
              error: error.message,
              stack: error.stack
            });

            try {
              await buttonInteraction.editReply({
                content: `❌ Failed to grant whitelist: ${error.message}`,
                embeds: [],
                components: []
              });
            } catch (replyError) {
              loggerConsole.error('Failed to send error message', {
                error: replyError.message
              });
            }

            collector.stop('error');
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            try {
              interaction.editReply({
                content: '❌ Steam ID grant timed out. Please try again.',
                embeds: [],
                components: []
              });
            } catch (error) {
              loggerConsole.error('Failed to send timeout message', {
                error: error.message
              });
            }
          }
        });

      } catch (error) {
        loggerConsole.error('Steam-only whitelist setup failed', {
          error: error.message,
          stack: error.stack
        });
        await sendError(interaction, `Failed to setup Steam ID grant: ${error.message}`);
      }
    });
  }
};
