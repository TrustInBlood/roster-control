const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { PlayerDiscordLink } = require('../database/models');
const {
  buildWarningEmbed,
  buildSuccessEmbed,
  buildCancelledEmbed,
  buildTimeoutEmbed,
  performUnlink
} = require('../utils/unlinkFlow');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlink your Discord account from your game account'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        const discordUserId = interaction.user.id;

        const existingLink = await PlayerDiscordLink.findByDiscordId(discordUserId);

        if (!existingLink) {
          await interaction.reply({
            content: 'No linked game account found for your Discord account.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Generate unique IDs for buttons
        const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
        const confirmId = `confirm_unlink_${uniqueId}`;
        const cancelId = `cancel_unlink_${uniqueId}`;

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(confirmId)
              .setLabel('Yes, Unlink (30-day cooldown)')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(cancelId)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({
          embeds: [buildWarningEmbed(existingLink)],
          components: [confirmRow],
          flags: MessageFlags.Ephemeral
        });

        // Handle confirmation - use message-specific collector
        const message = await interaction.fetchReply();
        const confirmCollector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000 // 60 second timeout
        });

        confirmCollector.on('collect', async (buttonInteraction) => {
          // Security: Only allow the original user to click buttons
          if (buttonInteraction.user.id !== interaction.user.id) {
            await buttonInteraction.reply({
              content: 'You cannot interact with this confirmation.',
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          if (buttonInteraction.customId === cancelId) {
            await buttonInteraction.update({
              embeds: [buildCancelledEmbed(existingLink)],
              components: []
            });

            confirmCollector.stop('cancelled');
            return;
          }

          if (buttonInteraction.customId === confirmId) {
            await buttonInteraction.deferUpdate();

            // Perform the unlink using shared utility
            const { cooldownEndDate } = await performUnlink(discordUserId, existingLink, '/unlink command');

            await buttonInteraction.editReply({
              embeds: [buildSuccessEmbed(existingLink, cooldownEndDate)],
              components: []
            });

            confirmCollector.stop('confirmed');
          }
        });

        confirmCollector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            await interaction.editReply({
              embeds: [buildTimeoutEmbed(existingLink)],
              components: []
            }).catch(() => {
              // Ignore errors if the interaction is already expired
            });
          }
        });

      } catch (error) {
        interaction.client.logger?.error('Failed to unlink account', {
          discordUserId: interaction.user.id,
          error: error.message
        });

        const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
        await interaction[replyMethod]({
          content: 'Failed to unlink your account. Please try again later.',
          flags: MessageFlags.Ephemeral
        }).catch(() => {
          // Ignore errors if the interaction is already expired
        });
      }
    });
  }
};
