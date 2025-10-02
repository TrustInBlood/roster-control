const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-grant-steamid')
    .setDescription('Steam-only whitelist grant for donations (no account link)')
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 of the user')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Whitelist duration')
        .setRequired(true)
        .addChoices(
          { name: '6 Months', value: '6_months' },
          { name: '1 Year', value: '12_months' }
        ))
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Username for audit trail (optional but recommended)')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        const steamid = interaction.options.getString('steamid');
        const durationChoice = interaction.options.getString('duration');
        const username = interaction.options.getString('username');

        // Parse duration first to show in warning
        let duration_value, durationText, duration_type;
        if (durationChoice === '6_months') {
          duration_value = 6;
          duration_type = 'months';
          durationText = '6 months';
        } else if (durationChoice === '12_months') {
          duration_value = 12;
          duration_type = 'months';
          durationText = '1 year';
        } else {
          await sendError(interaction, 'Invalid duration selected.');
          return;
        }

        // Show WARNING embed
        const warningEmbed = createResponseEmbed({
          title: '⚠️ STEAM ID ONLY GRANT (Donations)',
          description: `**Steam ID:** ${steamid}\n${username ? `**Username:** ${username}` : '**Username:** Not provided'}\n**Duration:** ${durationText}\n\n🚨 **IMPORTANT WARNING**\n\nThis grant will **NOT create a Discord-Steam account link**.\n\n✅ **Intended Use:** Donations and external supporters\n\n✅ **Recommended:** If user is in Discord, use other whitelist commands for proper account linking.\n\n⏰ **Please confirm within 2 minutes**`,
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
              duration_type,
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
              description: 'Steam ID whitelist has been granted (donation/external supporter)',
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
                description: `Steam ID \`${steamid}\`${username ? ` (${username})` : ''} has been granted whitelist access\n\n⚠️ **Donation/External supporter - no Discord link created**`,
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
