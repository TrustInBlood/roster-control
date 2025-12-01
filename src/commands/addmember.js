const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, InteractionContextType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { triggerUserRoleSync } = require('../utils/triggerUserRoleSync');
const BattleMetricsService = require('../services/BattleMetricsService');
const BattleMetricsScrubService = require('../services/BattleMetricsScrubService');
const { loadConfig } = require('../utils/environment');
const { createServiceLogger } = require('../utils/logger');

const serviceLogger = createServiceLogger('AddMemberCommand');

// Load environment-specific configurations
const { DISCORD_ROLES } = loadConfig('discordRoles');
const { CHANNELS } = loadConfig('channels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addmember')
    .setDescription('Add a new member with Steam ID linking and role assignment')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Discord user to add as member')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('steamid')
        .setDescription('Steam ID64 of the user')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts([InteractionContextType.Guild]),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      // Defer reply for long operation
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        // Get command parameters
        const targetUser = interaction.options.getUser('user');
        const steamId = interaction.options.getString('steamid').trim();

        serviceLogger.info(`/addmember invoked by ${interaction.user.tag} for user ${targetUser.tag} with Steam ID ${steamId}`);

        // Validate Steam ID format
        if (!isValidSteamId(steamId)) {
          return await sendError(interaction, {
            title: 'Invalid Steam ID',
            description: `The provided Steam ID \`${steamId}\` is not valid.\n\nSteam IDs must:\n- Be 17 digits long\n- Start with 7656119`,
            ephemeral: true,
            editReply: true
          });
        }

        // Lookup player in BattleMetrics
        serviceLogger.info(`Looking up player in BattleMetrics: ${steamId}`);
        const bmResult = await BattleMetricsService.searchPlayerBySteamId(steamId, 5000);

        if (!bmResult.found) {
          serviceLogger.warn(`BattleMetrics lookup failed for Steam ID ${steamId}: ${bmResult.error || 'Not found'}`);
          return await sendError(interaction, {
            title: 'BattleMetrics Lookup Failed',
            description: `Unable to find player with Steam ID \`${steamId}\` in BattleMetrics.\n\n**Error:** ${bmResult.error || 'Player not found'}\n\nPlease verify the Steam ID is correct and the player has joined a =B&B= server before.`,
            ephemeral: true,
            editReply: true
          });
        }

        const playerName = bmResult.playerData.name;
        const bmProfileUrl = bmResult.profileUrl;
        let proposedNickname = `-B&B- ${playerName}`;

        serviceLogger.info(`BattleMetrics lookup successful: ${playerName} (${bmProfileUrl})`);

        // Check current member state
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
          return await sendError(interaction, {
            title: 'User Not Found',
            description: `Unable to find user <@${targetUser.id}> in this server. They may have left.`,
            ephemeral: true,
            editReply: true
          });
        }

        const currentNickname = member.nickname || 'None';
        const hasMemberRole = member.roles.cache.has(DISCORD_ROLES.MEMBER);

        // Check existing link
        const existingLink = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: targetUser.id,
            steamid64: steamId
          }
        });

        // Generate unique button IDs
        const interactionId = interaction.id;
        const confirmId = `confirm_addmember_${interactionId}`;
        const cancelId = `cancel_addmember_${interactionId}`;
        const editNicknameId = `edit_nickname_${interactionId}`;

        // Function to create confirmation embed with current nickname
        const createConfirmationEmbed = (nickname) => {
          const embed = createResponseEmbed({
            title: '✅ Confirm Add Member',
            description: 'Please review the member details before confirming:',
            fields: [
              { name: 'Discord User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: false },
              { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
              { name: 'BattleMetrics Profile', value: `[View Profile](${bmProfileUrl})`, inline: true },
              { name: 'Player Name (BM)', value: playerName, inline: false },
              { name: 'Current Nickname', value: currentNickname, inline: true },
              { name: 'New Nickname', value: nickname, inline: true },
              { name: 'Has Member Role', value: hasMemberRole ? '✅ Yes' : '❌ No', inline: true },
              { name: 'Existing Link', value: existingLink ? `✅ Yes (Confidence: ${existingLink.confidence_score})` : '❌ No', inline: true }
            ],
            color: 0x4caf50
          });

          if (existingLink) {
            embed.data.description += '\n\n⚠️ **Note:** This user already has a link to this Steam ID. The link will be updated to confidence 1.0 if needed.';
          }

          return embed;
        };

        // Create button row
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(confirmId)
              .setLabel('Confirm & Add Member')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(editNicknameId)
              .setLabel('Edit Nickname')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('✏️'),
            new ButtonBuilder()
              .setCustomId(cancelId)
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );

        await interaction.editReply({
          embeds: [createConfirmationEmbed(proposedNickname)],
          components: [confirmRow]
        });

        // Create collector for buttons
        const confirmCollector = interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => (i.customId === confirmId || i.customId === cancelId || i.customId === editNicknameId) && i.user.id === interaction.user.id,
          time: 300000  // 5 minute timeout
        });

        confirmCollector.on('collect', async (buttonInteraction) => {
          if (buttonInteraction.customId === cancelId) {
            await buttonInteraction.update({
              content: '❌ Add member operation cancelled.',
              embeds: [],
              components: []
            });
            confirmCollector.stop();
            return;
          }

          if (buttonInteraction.customId === editNicknameId) {
            // Show modal to edit nickname
            const modal = new ModalBuilder()
              .setCustomId(`modal_edit_nickname_${interactionId}`)
              .setTitle('Edit Member Nickname');

            const nicknameInput = new TextInputBuilder()
              .setCustomId('nickname_input')
              .setLabel('Nickname')
              .setStyle(TextInputStyle.Short)
              .setValue(proposedNickname)
              .setRequired(true)
              .setMaxLength(32)
              .setPlaceholder('Enter the nickname for this member');

            const nicknameRow = new ActionRowBuilder().addComponents(nicknameInput);
            modal.addComponents(nicknameRow);

            await buttonInteraction.showModal(modal);

            // Wait for modal submission
            try {
              const modalSubmit = await buttonInteraction.awaitModalSubmit({
                filter: (i) => i.customId === `modal_edit_nickname_${interactionId}` && i.user.id === interaction.user.id,
                time: 120000 // 2 minute timeout for modal
              });

              // Get the new nickname from modal
              const newNickname = modalSubmit.fields.getTextInputValue('nickname_input');
              proposedNickname = newNickname;

              serviceLogger.info(`Nickname updated to: ${newNickname}`);

              // Update the confirmation embed with new nickname
              await modalSubmit.update({
                embeds: [createConfirmationEmbed(proposedNickname)],
                components: [confirmRow]
              });
            } catch (error) {
              // Modal timeout or error
              serviceLogger.warn(`Modal timeout or error: ${error.message}`);
            }

            return;
          }

          // User confirmed - process the member addition
          await buttonInteraction.deferUpdate();

          try {
            const results = {
              linkCreated: false,
              linkUpdated: false,
              roleAdded: false,
              nicknameSet: false,
              flagAdded: null,
              errors: []
            };

            // 1. Create or update PlayerDiscordLink
            serviceLogger.info(`Creating/updating PlayerDiscordLink for ${targetUser.tag} with Steam ID ${steamId}`);

            if (existingLink) {
            // Update existing link if confidence is less than 1.0
              if (existingLink.confidence_score < 1.0) {
                await existingLink.update({ confidence_score: 1.0 });
                serviceLogger.info(`Updated existing link confidence to 1.0 for ${targetUser.tag}`);
                results.linkUpdated = true;
              } else {
                serviceLogger.info(`Existing link already has confidence 1.0 for ${targetUser.tag}`);
                results.linkUpdated = false;
              }
            } else {
            // Create new link
              const newLink = await PlayerDiscordLink.create({
                discord_user_id: targetUser.id,
                steamid64: steamId,
                eosID: null,
                username: targetUser.username,
                link_source: 'manual',
                confidence_score: 1.0,
                is_primary: true,
                linked_by: interaction.user.id,
                metadata: {
                  created_via: 'addmember_command',
                  created_by: interaction.user.tag,
                  battlemetrics_name: playerName,
                  battlemetrics_url: bmProfileUrl
                }
              });
              serviceLogger.info(`Created new PlayerDiscordLink (ID: ${newLink.id}) for ${targetUser.tag}`);
              results.linkCreated = true;
            }

            // 2. Add Member role
            if (!hasMemberRole) {
              const memberRole = interaction.guild.roles.cache.get(DISCORD_ROLES.MEMBER);
              if (memberRole) {
                try {
                  await member.roles.add(memberRole, `Member role added by ${interaction.user.tag} via /addmember`);
                  serviceLogger.info(`Added Member role to ${targetUser.tag}`);
                  results.roleAdded = true;
                } catch (roleError) {
                  serviceLogger.error(`Failed to add Member role to ${targetUser.tag}: ${roleError.message}`);
                  results.errors.push(`Failed to add Member role: ${roleError.message}`);
                }
              } else {
                serviceLogger.error('Member role not found in guild cache');
                results.errors.push('Member role not found in server');
              }
            } else {
              serviceLogger.info(`${targetUser.tag} already has Member role`);
            }

            // 3. Set nickname
            try {
              await member.setNickname(proposedNickname, `Nickname set by ${interaction.user.tag} via /addmember`);
              serviceLogger.info(`Set nickname for ${targetUser.tag} to ${proposedNickname}`);
              results.nicknameSet = true;
            } catch (nicknameError) {
              serviceLogger.error(`Failed to set nickname for ${targetUser.tag}: ${nicknameError.message}`);
              results.errors.push(`Failed to set nickname: ${nicknameError.message}`);
            }

            // 4. Add BattleMetrics member flag
            const bmPlayerId = bmResult.playerData.id;
            try {
              const bmScrubService = new BattleMetricsScrubService(interaction.client);

              const flagResult = await bmScrubService.addMemberFlag(bmPlayerId, {
                actorType: 'user',
                actorId: interaction.user.id,
                actorName: interaction.user.username,
                playerName: playerName,
                steamId: steamId,
                discordUserId: targetUser.id
              });

              if (flagResult.success) {
                results.flagAdded = flagResult.alreadyHasFlag ? 'already_has' : 'added';
                serviceLogger.info(`BattleMetrics flag ${results.flagAdded} for player ${bmPlayerId}`);
              } else {
                results.flagAdded = 'failed';
                const errorMsg = `${flagResult.error || 'Unknown error'} (Status: ${flagResult.status})`;
                serviceLogger.warn(`Failed to add BattleMetrics flag: ${errorMsg}`);
                results.errors.push(`BattleMetrics flag: ${errorMsg}`);
              }
            } catch (flagError) {
              results.flagAdded = 'failed';
              serviceLogger.error(`Error adding BattleMetrics flag: ${flagError.message}`);
              results.errors.push(`BattleMetrics flag error: ${flagError.message}`);
            }

            // 5. Create audit log
            await AuditLog.create({
              actionType: 'MEMBER_ADDED',
              actorType: 'user',
              actorId: interaction.user.id,
              actorName: interaction.user.username,
              targetType: 'user',
              targetId: targetUser.id,
              targetName: targetUser.username,
              description: `Member added: ${targetUser.username} with Steam ID ${steamId}`,
              guildId: interaction.guild.id,
              channelId: interaction.channelId,
              metadata: {
                steamId: steamId,
                playerName: playerName,
                bmProfileUrl: bmProfileUrl,
                nickname: proposedNickname,
                linkCreated: results.linkCreated,
                linkUpdated: results.linkUpdated,
                roleAdded: results.roleAdded,
                nicknameSet: results.nicknameSet,
                flagAdded: results.flagAdded,
                errors: results.errors
              },
              success: results.errors.length === 0,
              severity: results.errors.length === 0 ? 'info' : 'warning'
            });

            // 5. Trigger role sync
            serviceLogger.info(`Triggering role sync for ${targetUser.tag}`);
            await triggerUserRoleSync(interaction.client, targetUser.id, {
              reason: 'Member added via /addmember command',
              triggeredBy: interaction.user.id
            });

            // 6. Send success message to admin
            const successFields = [
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
              { name: 'Player Name', value: playerName, inline: true }
            ];

            if (results.linkCreated) {
              successFields.push({ name: 'Account Link', value: '✅ Created (Confidence: 1.0)', inline: true });
            } else if (results.linkUpdated) {
              successFields.push({ name: 'Account Link', value: '✅ Updated (Confidence: 1.0)', inline: true });
            } else {
              successFields.push({ name: 'Account Link', value: '✅ Already exists (Confidence: 1.0)', inline: true });
            }

            successFields.push(
              { name: 'Member Role', value: results.roleAdded ? '✅ Added' : (hasMemberRole ? '✅ Already has' : '❌ Failed'), inline: true },
              { name: 'Nickname', value: results.nicknameSet ? `✅ Set to \`${proposedNickname}\`` : '❌ Failed', inline: true },
              {
                name: 'BattleMetrics Flag',
                value: results.flagAdded === 'added' ? '✅ Added' :
                  results.flagAdded === 'already_has' ? '✅ Already has' :
                    results.flagAdded === 'failed' ? '❌ Failed' :
                      '⚠️ Unknown',
                inline: true
              }
            );

            if (results.errors.length > 0) {
              successFields.push({ name: '⚠️ Warnings', value: results.errors.join('\n'), inline: false });
            }

            const successEmbed = createResponseEmbed({
              title: '✅ Member Added Successfully',
              description: `<@${targetUser.id}> has been added as a member.`,
              fields: successFields,
              color: results.errors.length > 0 ? 0xff9800 : 0x4caf50
            });

            await buttonInteraction.editReply({
              embeds: [successEmbed],
              components: []
            });

            // 7. Send log to configured channel
            try {
              const logChannelId = CHANNELS.MEMBER_ADDITION_LOGS;
              const logChannel = await interaction.client.channels.fetch(logChannelId);

              if (logChannel) {
                const logEmbed = createResponseEmbed({
                  title: '📝 Member Added',
                  description: 'A new member has been added to the server.',
                  fields: [
                    { name: 'Member', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: false },
                    { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
                    { name: 'BattleMetrics', value: `[${playerName}](${bmProfileUrl})`, inline: true },
                    { name: 'Nickname', value: proposedNickname, inline: true },
                    { name: 'Added By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
                    { name: 'Link Status', value: results.linkCreated ? 'New link created' : (results.linkUpdated ? 'Existing link updated' : 'Link already existed'), inline: true },
                    { name: 'Role Added', value: results.roleAdded ? '✅ Yes' : (hasMemberRole ? 'Already had role' : '❌ Failed'), inline: true },
                    { name: 'Nickname Set', value: results.nicknameSet ? '✅ Yes' : '❌ Failed', inline: true },
                    {
                      name: 'BM Flag',
                      value: results.flagAdded === 'added' ? '✅ Added' :
                        results.flagAdded === 'already_has' ? '✅ Already has' :
                          '❌ Failed',
                      inline: true
                    }
                  ],
                  color: 0x4caf50,
                  timestamp: true
                });

                await logChannel.send({ embeds: [logEmbed] });
                serviceLogger.info(`Sent member addition log to channel ${logChannelId}`);
              } else {
                serviceLogger.warn(`Log channel ${logChannelId} not found`);
              }
            } catch (logError) {
              serviceLogger.error(`Failed to send log to channel: ${logError.message}`);
            }

          } catch (error) {
            serviceLogger.error(`Error processing member addition: ${error.message}`, { stack: error.stack });

            await buttonInteraction.editReply({
              content: `❌ **Error:** Failed to add member.\n\n**Details:** ${error.message}`,
              embeds: [],
              components: []
            });
          }

          confirmCollector.stop();
        });

        confirmCollector.on('end', (collected, reason) => {
          if (reason === 'time') {
            interaction.editReply({
              content: '⏱️ Confirmation timed out. Please run the command again.',
              embeds: [],
              components: []
            }).catch(() => {});
          }
        });

      } catch (error) {
        serviceLogger.error(`Error in /addmember command: ${error.message}`, { stack: error.stack });

        return await sendError(interaction, {
          title: 'Command Error',
          description: `An unexpected error occurred while processing the command.\n\n**Error:** ${error.message}`,
          ephemeral: true,
          editReply: true
        });
      }
    });
  }
};
