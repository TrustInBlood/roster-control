const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink } = require('../database/models');
const { logAccountLink } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgradeconfidence')
    .setDescription('Upgrade confidence score to 1.0 (SUPER ADMIN ONLY)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user whose confidence to upgrade')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for confidence upgrade')
        .setRequired(true)),

  async execute(interaction) {
    // Use permission middleware - restricted to super admin roles via 'upgradeconfidence' permission group
    await permissionMiddleware(interaction, async () => {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');

      try {
        // Find existing link
        const existingLink = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: targetUser.id,
            is_primary: true
          }
        });

        if (!existingLink) {
          await sendError(interaction, `No Steam account link found for <@${targetUser.id}>. User must have an existing link before confidence can be upgraded.`);
          return;
        }

        // Check current confidence
        const currentConfidence = existingLink.confidence_score;

        if (currentConfidence >= 1.0) {
          await sendError(interaction, `<@${targetUser.id}> already has maximum confidence score (${currentConfidence}).`);
          return;
        }

        // Show confirmation
        const confirmEmbed = createResponseEmbed({
          title: '🔐 Upgrade Confidence Score',
          description: 'You are about to upgrade confidence score to **1.0 (Verified)** for:',
          fields: [
            { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Steam ID', value: existingLink.steamid64, inline: true },
            { name: 'Current Confidence', value: currentConfidence.toString(), inline: true },
            { name: 'New Confidence', value: '1.0 (Super Admin Verified)', inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: '⚠️ WARNING', value: 'This will grant **FULL staff whitelist access**. Only upgrade if you are 100% certain this Steam ID belongs to the Discord user.', inline: false }
          ],
          color: 0xff6b35
        });

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('confirm_upgrade')
              .setLabel('Confirm Upgrade to 1.0')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🔐'),
            new ButtonBuilder()
              .setCustomId('cancel_upgrade')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.reply({
          embeds: [confirmEmbed],
          components: [confirmRow],
          flags: MessageFlags.Ephemeral
        });

        // Handle confirmation
        const confirmCollector = interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => (i.customId === 'confirm_upgrade' || i.customId === 'cancel_upgrade') && i.user.id === interaction.user.id,
          time: 300000
        });

        confirmCollector.on('collect', async (buttonInteraction) => {
          if (buttonInteraction.customId === 'cancel_upgrade') {
            try {
              await buttonInteraction.update({
                content: '❌ Confidence upgrade cancelled.',
                embeds: [],
                components: []
              });
            } catch (error) {
              // Handle interaction timeout gracefully
              if (error.code === 10062 || error.rawError?.code === 10062) {
                loggerConsole.warn('Interaction expired during upgrade confidence cancellation');
                return;
              }
              throw error;
            }
            return;
          }

          // Perform the upgrade
          try {
            await buttonInteraction.deferUpdate();

            // Update the confidence score
            await existingLink.update({
              confidence_score: 1.0,
              link_source: 'manual', // Keep as manual since it's admin-initiated, track super admin in metadata
              metadata: {
                ...existingLink.metadata,
                super_admin_verification: {
                  verified_by: interaction.user.id,
                  verified_by_tag: interaction.user.tag,
                  verified_at: new Date().toISOString(),
                  reason: reason,
                  previous_confidence: currentConfidence,
                  upgrade_type: 'super_admin_confidence_upgrade'
                }
              }
            });

            // Log the upgrade
            await logAccountLink(interaction.client, targetUser, existingLink.steamid64, 'super_admin_upgrade', {
              'Previous Confidence': currentConfidence.toString(),
              'New Confidence': '1.0 (Super Admin Verified)',
              'Upgraded By': interaction.user.tag,
              'Reason': reason
            });

            const successEmbed = createResponseEmbed({
              title: '🔐 Confidence Upgraded Successfully',
              description: `Confidence score has been upgraded to **1.0** for <@${targetUser.id}>`,
              fields: [
                { name: 'Steam ID', value: existingLink.steamid64, inline: true },
                { name: 'Previous Confidence', value: currentConfidence.toString(), inline: true },
                { name: 'New Confidence', value: '1.0 (Super Admin Verified)', inline: true },
                { name: 'Upgraded By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: '✅ Staff Access', value: 'This user now has **FULL staff whitelist access** based on their Discord role.', inline: false }
              ],
              color: 0x00ff00
            });

            await buttonInteraction.editReply({
              content: '',
              embeds: [successEmbed],
              components: []
            });

            // Send public notification
            const publicEmbed = createResponseEmbed({
              title: '🔐 Confidence Score Upgraded',
              description: `<@${targetUser.id}>'s account link confidence has been upgraded to maximum level`,
              fields: [
                { name: 'Steam ID', value: existingLink.steamid64, inline: true },
                { name: 'New Confidence', value: '1.0 (Verified)', inline: true },
                { name: 'Upgraded By', value: `<@${interaction.user.id}>`, inline: true }
              ],
              color: 0x5865f2
            });

            await interaction.followUp({
              embeds: [publicEmbed]
            });

          } catch (error) {
            loggerConsole.error('Confidence upgrade error:', error);
            await buttonInteraction.editReply({
              content: `❌ Failed to upgrade confidence: ${error.message}`,
              embeds: [],
              components: []
            });
          }
        });

        confirmCollector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            interaction.editReply({
              content: '❌ Confidence upgrade timed out.',
              embeds: [],
              components: []
            });
          }
        });

      } catch (error) {
        loggerConsole.error('Upgrade confidence command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the upgrade confidence command.');
      }
    });
  }
};