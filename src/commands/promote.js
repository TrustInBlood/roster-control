const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, InteractionContextType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const BattleMetricsService = require('../services/BattleMetricsService');
const BattleMetricsScrubService = require('../services/BattleMetricsScrubService');
const { loadConfig } = require('../utils/environment');
const { createServiceLogger } = require('../utils/logger');

const serviceLogger = createServiceLogger('PromoteCommand');

// Load environment-specific configurations
const { DISCORD_ROLES } = loadConfig('discordRoles');
const { CHANNELS } = loadConfig('channels');

// Promotion target definitions
const PROMOTION_TARGETS = {
  member: {
    label: 'Member',
    description: 'Promote to Member role only',
    roles: [DISCORD_ROLES.MEMBER],
    welcomeChannel: 'MEMBER_CHAT',
    welcomeMessage: (userId, rulesChannelId) =>
      `**Let's welcome our new member!!!** <@${userId}>\n\n` +
      'Make sure to change your tag to -B&B- in game (DO NOT PUT "=B&B=" as those are admin tags)\n' +
      `And read all the rules in <#${rulesChannelId}>`,
    auditActionType: 'MEMBER_PROMOTED',
    logTitle: 'Member Added'
  },
  moderatort1: {
    label: 'Moderator T1',
    description: 'Promote to Moderator T1 (includes Member and Staff roles)',
    roles: [DISCORD_ROLES.MEMBER, DISCORD_ROLES.MODERATOR_T1, DISCORD_ROLES.STAFF],
    welcomeChannel: 'MODERATOR_CHAT',
    welcomeMessage: (userId) =>
      `**Let's welcome our new moderator!!!** <@${userId}>\n\n` +
      `Make sure to read all the rules in <#${CHANNELS.MOD_RULES}>\n` +
      `And visit the <#${CHANNELS.ADMIN_ACADEMY}> to learn about and earn access to BattleMetrics controls and Ticket Support!`,
    auditActionType: 'MODERATOR_PROMOTED',
    logTitle: 'Moderator Added'
  },
  moderatort2: {
    label: 'Moderator T2',
    description: 'Promote to Moderator T2 (includes Member and Staff roles)',
    roles: [DISCORD_ROLES.MEMBER, DISCORD_ROLES.MODERATOR_T2, DISCORD_ROLES.STAFF],
    welcomeChannel: 'MODERATOR_CHAT',
    welcomeMessage: (userId) =>
      `**Congratulations on your promotion to Moderator T2!!!** <@${userId}>\n\n` +
      `Just a reminder to review the rules in <#${CHANNELS.MOD_RULES}>\n` +
      `And check out <#${CHANNELS.ADMIN_ACADEMY}> if you haven't already!`,
    auditActionType: 'MODERATOR_T2_PROMOTED',
    logTitle: 'Moderator T2 Added'
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user to Member or Moderator T1 with Steam ID linking and role assignment')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Discord user to promote')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('steamid')
        .setDescription('Steam ID64 of the user')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('role')
        .setDescription('Target role to promote to')
        .setRequired(true)
        .addChoices(
          { name: 'Member', value: 'member' },
          { name: 'Moderator T1', value: 'moderatort1' },
          { name: 'Moderator T2', value: 'moderatort2' }
        ))
    .setContexts([InteractionContextType.Guild]),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      // Defer reply for long operation
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        // Get command parameters
        const targetUser = interaction.options.getUser('user');
        const steamId = interaction.options.getString('steamid').trim();
        const targetRole = interaction.options.getString('role');
        const promotionTarget = PROMOTION_TARGETS[targetRole];

        if (!promotionTarget) {
          return await sendError(interaction, {
            title: 'Invalid Role',
            description: 'The selected role is not valid for promotion.',
            ephemeral: true,
            editReply: true
          });
        }

        serviceLogger.info(`/promote invoked by ${interaction.user.tag} for user ${targetUser.tag} to ${promotionTarget.label} with Steam ID ${steamId}`);

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

        // Check which roles user already has
        const existingRoles = promotionTarget.roles.filter(roleId => member.roles.cache.has(roleId));
        const missingRoles = promotionTarget.roles.filter(roleId => !member.roles.cache.has(roleId));

        // Check existing link
        const existingLink = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: targetUser.id,
            steamid64: steamId
          }
        });

        // Generate absolutely unique button IDs with user ID and timestamp
        const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
        const confirmId = `confirm_promote_${uniqueId}`;
        const cancelId = `cancel_promote_${uniqueId}`;
        const editNicknameId = `edit_nickname_promote_${uniqueId}`;

        // Function to create confirmation embed with current nickname
        const createConfirmationEmbed = (nickname) => {
          const embed = createResponseEmbed({
            title: `Confirm Promotion to ${promotionTarget.label}`,
            description: 'Please review the promotion details before confirming:',
            fields: [
              { name: 'Discord User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: false },
              { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
              { name: 'BattleMetrics Profile', value: `[View Profile](${bmProfileUrl})`, inline: true },
              { name: 'Player Name (BM)', value: playerName, inline: false },
              { name: 'Current Nickname', value: currentNickname, inline: true },
              { name: 'New Nickname', value: nickname, inline: true },
              { name: 'Target Role', value: promotionTarget.label, inline: true },
              { name: 'Roles to Add', value: missingRoles.length > 0 ? missingRoles.map(r => `<@&${r}>`).join(', ') : 'All roles already assigned', inline: false },
              { name: 'Existing Link', value: existingLink ? `Yes (Confidence: ${existingLink.confidence_score})` : 'No', inline: true }
            ],
            color: 0x4caf50
          });

          if (existingLink) {
            embed.data.description += '\n\n**Note:** This user already has a link to this Steam ID. The link will be updated to confidence 1.0 if needed.';
          }

          if (existingRoles.length > 0) {
            embed.data.description += `\n\n**Note:** User already has: ${existingRoles.map(r => `<@&${r}>`).join(', ')}`;
          }

          return embed;
        };

        // Create button row
        const confirmRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(confirmId)
              .setLabel(`Confirm Promotion to ${promotionTarget.label}`)
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
              content: 'Promotion cancelled.',
              embeds: [],
              components: []
            });
            confirmCollector.stop();
            return;
          }

          if (buttonInteraction.customId === editNicknameId) {
            // Show modal to edit nickname
            const modal = new ModalBuilder()
              .setCustomId(`modal_edit_nickname_promote_${uniqueId}`)
              .setTitle('Edit Nickname');

            const nicknameInput = new TextInputBuilder()
              .setCustomId('nickname_input')
              .setLabel('Nickname')
              .setStyle(TextInputStyle.Short)
              .setValue(proposedNickname)
              .setRequired(true)
              .setMaxLength(32)
              .setPlaceholder('Enter the nickname for this user');

            const nicknameRow = new ActionRowBuilder().addComponents(nicknameInput);
            modal.addComponents(nicknameRow);

            await buttonInteraction.showModal(modal);

            // Wait for modal submission
            try {
              const modalSubmit = await buttonInteraction.awaitModalSubmit({
                filter: (i) => i.customId === `modal_edit_nickname_promote_${uniqueId}` && i.user.id === interaction.user.id,
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

          // User confirmed - process the promotion
          await buttonInteraction.deferUpdate();

          try {
            const results = {
              linkCreated: false,
              linkUpdated: false,
              rolesAdded: [],
              nicknameSet: false,
              flagAdded: null,
              errors: []
            };

            // 1. Create or update PlayerDiscordLink
            // Role sync is handled automatically by createOrUpdateLink when confidence crosses 1.0 threshold
            serviceLogger.info(`Creating/updating PlayerDiscordLink for ${targetUser.tag} with Steam ID ${steamId}`);

            const { link, created } = await PlayerDiscordLink.createOrUpdateLink(
              targetUser.id,
              steamId,
              null, // eosId
              targetUser.username,
              {
                linkSource: 'manual',
                confidenceScore: 1.0,
                isPrimary: true,
                metadata: {
                  created_via: 'promote_command',
                  created_by: interaction.user.tag,
                  promotion_target: targetRole,
                  battlemetrics_name: playerName,
                  battlemetrics_url: bmProfileUrl
                }
              }
            );

            if (created) {
              serviceLogger.info(`Created new PlayerDiscordLink (ID: ${link.id}) for ${targetUser.tag}`);
              results.linkCreated = true;
            } else {
              serviceLogger.info(`Updated existing PlayerDiscordLink for ${targetUser.tag}`);
              results.linkUpdated = true;
            }

            // 2. Add roles
            for (const roleId of missingRoles) {
              const role = interaction.guild.roles.cache.get(roleId);
              if (role) {
                try {
                  await member.roles.add(role, `${promotionTarget.label} promotion by ${interaction.user.tag} via /promote`);
                  serviceLogger.info(`Added role ${role.name} to ${targetUser.tag}`);
                  results.rolesAdded.push(role.name);
                } catch (roleError) {
                  serviceLogger.error(`Failed to add role ${role.name} to ${targetUser.tag}: ${roleError.message}`);
                  results.errors.push(`Failed to add ${role.name}: ${roleError.message}`);
                }
              } else {
                serviceLogger.error(`Role ${roleId} not found in guild cache`);
                results.errors.push(`Role ${roleId} not found in server`);
              }
            }

            // 3. Set nickname
            try {
              await member.setNickname(proposedNickname, `Nickname set by ${interaction.user.tag} via /promote`);
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
              actionType: promotionTarget.auditActionType,
              actorType: 'user',
              actorId: interaction.user.id,
              actorName: interaction.user.username,
              targetType: 'user',
              targetId: targetUser.id,
              targetName: targetUser.username,
              description: `${promotionTarget.label} promotion: ${targetUser.username} with Steam ID ${steamId}`,
              guildId: interaction.guild.id,
              channelId: interaction.channelId,
              metadata: {
                steamId: steamId,
                playerName: playerName,
                bmProfileUrl: bmProfileUrl,
                nickname: proposedNickname,
                promotionTarget: targetRole,
                linkCreated: results.linkCreated,
                linkUpdated: results.linkUpdated,
                rolesAdded: results.rolesAdded,
                nicknameSet: results.nicknameSet,
                flagAdded: results.flagAdded,
                errors: results.errors
              },
              success: results.errors.length === 0,
              severity: results.errors.length === 0 ? 'info' : 'warning'
            });

            // 6. Role sync is handled automatically by createOrUpdateLink when confidence crosses 1.0 threshold

            // 7. Send success message to admin
            const successFields = [
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
              { name: 'Player Name', value: playerName, inline: true },
              { name: 'Promoted To', value: promotionTarget.label, inline: true }
            ];

            if (results.linkCreated) {
              successFields.push({ name: 'Account Link', value: 'Created (Confidence: 1.0)', inline: true });
            } else if (results.linkUpdated) {
              successFields.push({ name: 'Account Link', value: 'Updated (Confidence: 1.0)', inline: true });
            } else {
              successFields.push({ name: 'Account Link', value: 'Already exists (Confidence: 1.0)', inline: true });
            }

            successFields.push(
              { name: 'Roles Added', value: results.rolesAdded.length > 0 ? results.rolesAdded.join(', ') : 'None (already had all)', inline: true },
              { name: 'Nickname', value: results.nicknameSet ? `Set to \`${proposedNickname}\`` : 'Failed', inline: true },
              {
                name: 'BattleMetrics Flag',
                value: results.flagAdded === 'added' ? 'Added' :
                  results.flagAdded === 'already_has' ? 'Already has' :
                    results.flagAdded === 'failed' ? 'Failed' :
                      'Unknown',
                inline: true
              }
            );

            if (results.errors.length > 0) {
              successFields.push({ name: 'Warnings', value: results.errors.join('\n'), inline: false });
            }

            const successEmbed = createResponseEmbed({
              title: `${promotionTarget.label} Promotion Successful`,
              description: `<@${targetUser.id}> has been promoted to ${promotionTarget.label}.`,
              fields: successFields,
              color: results.errors.length > 0 ? 0xff9800 : 0x4caf50
            });

            await buttonInteraction.editReply({
              embeds: [successEmbed],
              components: []
            });

            // 8. Send log to configured channel
            try {
              const logChannelId = CHANNELS.MEMBER_ADDITION_LOGS;
              const logChannel = await interaction.client.channels.fetch(logChannelId);

              if (logChannel) {
                const logEmbed = createResponseEmbed({
                  title: promotionTarget.logTitle,
                  description: `A user has been promoted to ${promotionTarget.label}.`,
                  fields: [
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: false },
                    { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
                    { name: 'BattleMetrics', value: `[${playerName}](${bmProfileUrl})`, inline: true },
                    { name: 'Nickname', value: proposedNickname, inline: true },
                    { name: 'Promoted By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
                    { name: 'Promoted To', value: promotionTarget.label, inline: true },
                    { name: 'Roles Added', value: results.rolesAdded.length > 0 ? results.rolesAdded.join(', ') : 'None', inline: true },
                    { name: 'Link Status', value: results.linkCreated ? 'New link created' : (results.linkUpdated ? 'Existing link updated' : 'Link already existed'), inline: true },
                    {
                      name: 'BM Flag',
                      value: results.flagAdded === 'added' ? 'Added' :
                        results.flagAdded === 'already_has' ? 'Already has' :
                          'Failed',
                      inline: true
                    }
                  ],
                  color: 0x4caf50,
                  timestamp: true
                });

                await logChannel.send({ embeds: [logEmbed] });
                serviceLogger.info(`Sent promotion log to channel ${logChannelId}`);
              } else {
                serviceLogger.warn(`Log channel ${logChannelId} not found`);
              }
            } catch (logError) {
              serviceLogger.error(`Failed to send log to channel: ${logError.message}`);
            }

            // 9. Send welcome message to appropriate channel
            try {
              const welcomeChannelId = CHANNELS[promotionTarget.welcomeChannel];
              const welcomeChannel = await interaction.client.channels.fetch(welcomeChannelId);

              if (welcomeChannel) {
                let welcomeMessage;
                if (targetRole === 'member') {
                  welcomeMessage = promotionTarget.welcomeMessage(targetUser.id, CHANNELS.MEMBER_RULES);
                } else {
                  welcomeMessage = promotionTarget.welcomeMessage(targetUser.id);
                }

                await welcomeChannel.send(welcomeMessage);
                serviceLogger.info(`Sent welcome message to ${promotionTarget.welcomeChannel} channel ${welcomeChannelId}`);
              } else {
                serviceLogger.warn(`Welcome channel ${welcomeChannelId} not found`);
              }
            } catch (welcomeError) {
              serviceLogger.error(`Failed to send welcome message: ${welcomeError.message}`);
            }

          } catch (error) {
            serviceLogger.error(`Error processing promotion: ${error.message}`, { stack: error.stack });

            await buttonInteraction.editReply({
              content: `**Error:** Failed to process promotion.\n\n**Details:** ${error.message}`,
              embeds: [],
              components: []
            });
          }

          confirmCollector.stop();
        });

        confirmCollector.on('end', (collected, reason) => {
          if (reason === 'time') {
            interaction.editReply({
              content: 'Confirmation timed out. Please run the command again.',
              embeds: [],
              components: []
            }).catch(() => {});
          }
        });

      } catch (error) {
        serviceLogger.error(`Error in /promote command: ${error.message}`, { stack: error.stack });

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
