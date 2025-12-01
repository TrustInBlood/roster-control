const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { PlayerDiscordLink, UnlinkHistory } = require('../database/models');

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

        // Show confirmation warning with 30-day cooldown information
        const warningEmbed = {
          color: 0xffa500,
          title: '⚠️ Unlinking Warning',
          description: 'Are you sure you want to unlink your Steam ID? **This action has consequences.**',
          fields: [
            {
              name: 'Steam ID',
              value: existingLink.steamid64,
              inline: true
            },
            {
              name: 'Link Confidence',
              value: `${(existingLink.confidence_score * 100).toFixed(0)}%`,
              inline: true
            },
            {
              name: 'Linked Since',
              value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`,
              inline: true
            },
            {
              name: '⏳ IMPORTANT: 30-Day Cooldown',
              value: '**You will NOT be able to link a new Steam ID for 30 days after unlinking.**\n\nThis cooldown prevents abuse of the linking system.',
              inline: false
            },
            {
              name: 'What will happen?',
              value: '• Your Steam ID will be unlinked from your Discord account\n• Your whitelist access may be affected\n• You cannot link a different Steam ID for 30 days\n• You can re-link the SAME Steam ID immediately',
              inline: false
            },
            {
              name: 'Are you absolutely sure?',
              value: 'Only proceed if you understand the consequences. This action cannot be easily reversed.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Roster Control System - Confirmation Required'
          }
        };

        // Generate unique IDs for buttons
        const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
        const confirmId = `confirm_unlink_${uniqueId}`;
        const cancelId = `cancel_unlink_${uniqueId}`;

        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(confirmId)
              .setLabel('Yes, Unlink (30-day cooldown)')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('⚠️'),
            new ButtonBuilder()
              .setCustomId(cancelId)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.reply({
          embeds: [warningEmbed],
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
            // User cancelled
            const cancelledEmbed = {
              color: 0x808080,
              title: '❌ Unlink Cancelled',
              description: 'Your account link has NOT been changed.',
              fields: [
                {
                  name: 'Steam ID',
                  value: existingLink.steamid64,
                  inline: true
                },
                {
                  name: 'Status',
                  value: 'Still Linked',
                  inline: true
                }
              ],
              timestamp: new Date().toISOString(),
              footer: {
                text: 'Roster Control System'
              }
            };

            await buttonInteraction.update({
              embeds: [cancelledEmbed],
              components: []
            });

            confirmCollector.stop('cancelled');
            return;
          }

          if (buttonInteraction.customId === confirmId) {
            // User confirmed - proceed with unlink
            await buttonInteraction.deferUpdate();

            // Record unlink in history
            await UnlinkHistory.recordUnlink(
              discordUserId,
              existingLink.steamid64,
              existingLink.eosID,
              existingLink.username,
              'User request via /unlink command'
            );

            // Delete the link
            await existingLink.destroy();

            // Calculate when cooldown ends
            const cooldownEndDate = new Date();
            cooldownEndDate.setDate(cooldownEndDate.getDate() + 30);

            const successEmbed = {
              color: 0xff9900,
              title: '✅ Account Unlinked Successfully',
              fields: [
                {
                  name: 'Unlinked Steam ID',
                  value: existingLink.steamid64,
                  inline: true
                },
                {
                  name: 'Username',
                  value: existingLink.username || 'Unknown',
                  inline: true
                },
                {
                  name: '⏳ 30-Day Cooldown Active',
                  value: `You cannot link a **different** Steam ID until:\n<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:F>\n(<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:R>)`,
                  inline: false
                },
                {
                  name: 'Important Notes',
                  value: '• You can re-link the SAME Steam ID (`' + existingLink.steamid64 + '`) immediately without cooldown\n• Linking a different Steam ID will be blocked for 30 days\n• Contact staff if you need urgent assistance',
                  inline: false
                }
              ],
              timestamp: new Date().toISOString(),
              footer: {
                text: 'Roster Control System'
              }
            };

            await buttonInteraction.editReply({
              embeds: [successEmbed],
              components: []
            });

            confirmCollector.stop('confirmed');

            interaction.client.logger?.info('Account unlinked', {
              discordUserId,
              steamid64: existingLink.steamid64,
              eosID: existingLink.eosID,
              username: existingLink.username,
              cooldownUntil: cooldownEndDate.toISOString()
            });
          }
        });

        confirmCollector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            // Timeout - disable buttons
            const timeoutEmbed = {
              color: 0x808080,
              title: '⏱️ Confirmation Timeout',
              description: 'The unlink confirmation timed out. Your account link has NOT been changed.',
              fields: [
                {
                  name: 'Steam ID',
                  value: existingLink.steamid64,
                  inline: true
                },
                {
                  name: 'Status',
                  value: 'Still Linked',
                  inline: true
                },
                {
                  name: 'Want to unlink?',
                  value: 'Run `/unlink` again to restart the process.',
                  inline: false
                }
              ],
              timestamp: new Date().toISOString(),
              footer: {
                text: 'Roster Control System'
              }
            };

            await interaction.editReply({
              embeds: [timeoutEmbed],
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
