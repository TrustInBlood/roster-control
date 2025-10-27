const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink, Whitelist } = require('../database/models');
const { logAccountLink } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');
const { sequelize } = require('../../config/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminunlink')
    .setDescription('Admin: Unlink Steam account and revoke all whitelists (ADMIN ONLY)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to unlink')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unlinking')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('remove-role')
        .setDescription('Also remove Discord role (if present)')
        .setRequired(false)),

  async execute(interaction) {
    // Use permission middleware - restricted to admin roles via 'adminunlink' permission group
    await permissionMiddleware(interaction, async () => {
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const removeRole = interaction.options.getBoolean('remove-role') || false;

      try {
        // Find existing link
        const existingLink = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: targetUser.id,
            is_primary: true
          }
        });

        if (!existingLink) {
          await sendError(interaction, `No Steam account link found for <@${targetUser.id}>.`);
          return;
        }

        // Find all whitelist entries for this user (including role-based)
        const allWhitelistEntries = await Whitelist.findAll({
          where: {
            discord_user_id: targetUser.id,
            revoked: false
          }
        });

        // Show confirmation
        const confirmEmbed = createResponseEmbed({
          title: '🚨 Admin Unlink & Revoke All Access',
          description: 'You are about to **FORCIBLY UNLINK** and **REVOKE ALL WHITELIST ACCESS** for:',
          fields: [
            { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Steam ID', value: existingLink.steamid64, inline: true },
            { name: 'Link Confidence', value: existingLink.confidence_score.toString(), inline: true },
            { name: 'Link Source', value: existingLink.link_source, inline: true },
            { name: 'Whitelist Entries to Revoke', value: allWhitelistEntries.length.toString(), inline: true },
            { name: 'Remove Discord Role', value: removeRole ? 'YES' : 'NO', inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: '⚠️ WARNING', value: 'This will:\n• Delete the Steam-Discord account link\n• Revoke ALL whitelist entries (including role-based)\n• Remove whitelist access immediately' + (removeRole ? '\n• Remove the Discord role' : ''), inline: false }
          ],
          color: 0xff0000
        });

        // Generate unique IDs for this specific interaction to prevent cross-contamination
        const interactionId = interaction.id;
        const confirmId = `confirm_adminunlink_${interactionId}`;
        const cancelId = `cancel_adminunlink_${interactionId}`;

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(confirmId)
              .setLabel('Confirm Admin Unlink')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🚨'),
            new ButtonBuilder()
              .setCustomId(cancelId)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.reply({
          embeds: [confirmEmbed],
          components: [confirmRow],
          flags: MessageFlags.Ephemeral
        });

        // Handle confirmation - use message-specific collector to prevent cross-contamination
        const message = await interaction.fetchReply();
        const confirmCollector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => (i.customId === confirmId || i.customId === cancelId) && i.user.id === interaction.user.id,
          time: 300000
        });

        confirmCollector.on('collect', async (buttonInteraction) => {
          if (buttonInteraction.customId === cancelId) {
            try {
              await buttonInteraction.update({
                content: '❌ Admin unlink cancelled.',
                embeds: [],
                components: []
              });
            } catch (error) {
              // Handle interaction timeout gracefully
              if (error.code === 10062 || error.rawError?.code === 10062) {
                loggerConsole.warn('Interaction expired during admin unlink cancellation');
                return;
              }
              throw error;
            }
            return;
          }

          // Perform the admin unlink and revoke
          try {
            await buttonInteraction.deferUpdate();

            // Use transaction for atomicity
            const transaction = await sequelize.transaction();

            try {
              // Step 1: Revoke ALL whitelist entries (including role-based)
              const revokedCount = await Whitelist.update(
                {
                  revoked: true,
                  revoked_by: interaction.user.id,
                  revoked_reason: `Admin unlink: ${reason}`,
                  revoked_at: new Date()
                },
                {
                  where: {
                    discord_user_id: targetUser.id,
                    revoked: false
                  },
                  transaction
                }
              );

              // Step 2: Delete the account link
              await PlayerDiscordLink.destroy({
                where: {
                  discord_user_id: targetUser.id,
                  is_primary: true
                },
                transaction
              });

              // Step 3: Remove Discord role if requested
              let roleRemoved = false;
              let roleName = null;
              if (removeRole) {
                try {
                  const member = await interaction.guild.members.fetch(targetUser.id);
                  if (member) {
                    // Find which whitelist-granting role they have
                    const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
                    for (const [, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
                      if (roleId && member.roles.cache.has(roleId)) {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role) {
                          await member.roles.remove(role, `Admin unlink by ${interaction.user.tag}: ${reason}`);
                          roleRemoved = true;
                          roleName = role.name;
                          break;
                        }
                      }
                    }

                    // Also check staff roles
                    const { squadGroups } = require('../../utils/environment');
                    const { getAllTrackedRoles } = squadGroups;
                    const staffRoles = getAllTrackedRoles();

                    for (const roleId of staffRoles) {
                      if (member.roles.cache.has(roleId)) {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (role) {
                          await member.roles.remove(role, `Admin unlink by ${interaction.user.tag}: ${reason}`);
                          roleRemoved = true;
                          roleName = roleName || role.name;
                        }
                      }
                    }
                  }
                } catch (roleError) {
                  loggerConsole.error('Failed to remove Discord role during admin unlink:', roleError);
                  // Don't fail the transaction for role removal errors
                }
              }

              // Commit transaction
              await transaction.commit();

              // Log the admin unlink
              await logAccountLink(interaction.client, targetUser, existingLink.steamid64, 'admin_unlink', {
                'Previous Confidence': existingLink.confidence_score.toString(),
                'Previous Link Source': existingLink.link_source,
                'Whitelist Entries Revoked': revokedCount[0].toString(),
                'Role Removed': roleRemoved ? (roleName || 'Yes') : 'No',
                'Unlinked By': interaction.user.tag,
                'Reason': reason
              });

              const successEmbed = createResponseEmbed({
                title: '🚨 Admin Unlink Completed',
                description: `Account link has been forcibly removed and all whitelist access revoked for <@${targetUser.id}>`,
                fields: [
                  { name: 'Steam ID', value: existingLink.steamid64, inline: true },
                  { name: 'Previous Confidence', value: existingLink.confidence_score.toString(), inline: true },
                  { name: 'Previous Link Source', value: existingLink.link_source, inline: true },
                  { name: 'Whitelist Entries Revoked', value: revokedCount[0].toString(), inline: true },
                  { name: 'Role Removed', value: roleRemoved ? (roleName || 'Yes') : 'No', inline: true },
                  { name: 'Unlinked By', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Reason', value: reason, inline: false },
                  { name: '✅ Result', value: 'User no longer has any whitelist access or Steam account link.', inline: false }
                ],
                color: 0xff6600
              });

              await buttonInteraction.editReply({
                content: '',
                embeds: [successEmbed],
                components: []
              });

              // Send public notification
              const publicEmbed = createResponseEmbed({
                title: '🚨 Account Unlinked by Admin',
                description: `<@${targetUser.id}>'s Steam account link and whitelist access have been revoked by an admin`,
                fields: [
                  { name: 'Steam ID', value: existingLink.steamid64, inline: true },
                  { name: 'Entries Revoked', value: revokedCount[0].toString(), inline: true },
                  { name: 'Unlinked By', value: `<@${interaction.user.id}>`, inline: true }
                ],
                color: 0xff0000
              });

              await interaction.followUp({
                embeds: [publicEmbed]
              });

            } catch (error) {
              // Rollback transaction on error
              await transaction.rollback();
              throw error;
            }

          } catch (error) {
            loggerConsole.error('Admin unlink error:', error);
            try {
              await buttonInteraction.editReply({
                content: `❌ Failed to perform admin unlink: ${error.message}`,
                embeds: [],
                components: []
              });
            } catch (interactionError) {
              // Handle interaction timeout gracefully
              if (interactionError.code === 10062 || interactionError.rawError?.code === 10062 || interactionError.code === 'InteractionNotReplied') {
                loggerConsole.warn('Interaction expired during admin unlink error handling');
                return;
              }
              throw interactionError;
            }
          }
        });

        confirmCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            try {
              await interaction.editReply({
                content: '❌ Admin unlink timed out.',
                embeds: [],
                components: []
              });
            } catch (error) {
              // Handle interaction timeout gracefully - if already expired, just log
              if (error.code === 10062 || error.rawError?.code === 10062 || error.code === 'InteractionNotReplied') {
                loggerConsole.warn('Interaction already expired during timeout handler');
                return;
              }
              loggerConsole.error('Error during timeout handler:', error);
            }
          }
        });

      } catch (error) {
        loggerConsole.error('Admin unlink command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the admin unlink command.');
      }
    });
  }
};
