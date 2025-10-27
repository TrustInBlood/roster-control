const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { withLoadingMessage, createResponseEmbed, sendSuccess, sendError } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { getHighestPriorityGroup } = require('../utils/environment');
const {
  createOrUpdateLink,
  resolveSteamIdFromDiscord,
  getUserInfo
} = require('../utils/accountLinking');
const { isValidSteamId } = require('../utils/steamId');
const { logWhitelistOperation } = require('../utils/discordLogger');
const notificationService = require('../services/NotificationService');
const { console: loggerConsole } = require('../utils/logger');
const WhitelistAuthorityService = require('../services/WhitelistAuthorityService');
const RoleWhitelistSyncService = require('../services/RoleWhitelistSyncService');


// Helper function to get role ID based on whitelist reason
function getRoleForReason(reason) {
  const roleMapping = {
    'service-member': WHITELIST_AWARD_ROLES.SERVICE_MEMBER,
    'first-responder': WHITELIST_AWARD_ROLES.FIRST_RESPONDER,
    'donator': WHITELIST_AWARD_ROLES.DONATOR,
    // 'reporting' has no specific role
  };
  
  return roleMapping[reason] || null;
}

// Note: Steam ID resolution is now handled by accountLinking utility

// Helper function to get user info from steamid or discord user (with auto-linking)
async function resolveUserInfo(steamid, discordUser, createLink = false) {
  let resolvedSteamId = steamid;
  let discordUsername = null;
  let username = null;
  let linkedAccount = false;

  // IMPORTANT: Only set Discord attribution if a Discord user was explicitly provided
  // This prevents cross-contamination when granting standalone Steam ID whitelists
  if (discordUser) {
    discordUsername = `${discordUser.username}#${discordUser.discriminator}`;
    username = discordUser.displayName || discordUser.username;
  }

  if (!resolvedSteamId && discordUser) {
    // Try to resolve Steam ID from Discord user via account linking
    resolvedSteamId = await resolveSteamIdFromDiscord(discordUser.id);
    if (!resolvedSteamId) {
      throw new Error('Steam ID is required. No linked account found for this Discord user.');
    }
  }

  if (!isValidSteamId(resolvedSteamId)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  // Create or update account link ONLY if both Discord and Steam info are explicitly available
  // This ensures no automatic linking happens for standalone Steam ID grants
  if (createLink && discordUser && resolvedSteamId) {
    const linkResult = await createOrUpdateLink(
      discordUser.id,
      resolvedSteamId,
      null, // eosID
      username,
      0.5,  // Whitelist operations create 0.5 confidence links (will preserve higher existing confidence)
      discordUser // Pass Discord user object for display name logging
    );

    if (!linkResult.error) {
      linkedAccount = linkResult.created ? 'created' : 'updated';
    } else {
      // Log the error but don't fail the whitelist operation
      loggerConsole.error(`Failed to create/update account link for ${discordUser.id} <-> ${resolvedSteamId}:`, linkResult.error);

      // Send error notification using NotificationService
      try {
        await notificationService.sendAccountLinkNotification({
          success: false,
          description: 'Failed to create Discord-Steam account link during whitelist operation',
          fields: [
            { name: 'Discord User', value: `<@${discordUser.id}> (${discordUser.id})`, inline: true },
            { name: 'Steam ID', value: resolvedSteamId, inline: true },
            { name: 'Error', value: linkResult.error || 'Unknown error', inline: false }
          ]
        });
      } catch (logError) {
        loggerConsole.error('Failed to send error notification:', logError);
      }

      // Still continue with the whitelist, just note that linking failed
      linkedAccount = 'failed';
    }
  }

  return {
    steamid64: resolvedSteamId,
    discord_username: discordUsername,  // Will be null if no discordUser provided
    username: username,                 // Will be null if no discordUser provided
    linkedAccount: linkedAccount       // Will be false if no discordUser provided
  };
}

// Helper function for info command - works with either user OR steamid
async function resolveUserForInfo(steamid, discordUser, interaction = null) {
  // Use the comprehensive getUserInfo function
  const userInfo = await getUserInfo({
    discordUserId: discordUser?.id,
    steamid64: steamid,
    username: discordUser?.displayName || discordUser?.username
  });

  // If no Steam ID was found and no Steam ID was provided, that's okay for info command
  // The user might have role-based whitelist access
  if (!userInfo.steamid64 && !steamid && discordUser) {
    // Return with null steamid64 - the info handler will check role-based status
    return {
      steamid64: null,
      discordUser: discordUser,
      hasLink: false,
      hasWhitelistHistory: false
    };
  }

  // Validate that we have at least a Steam ID or Discord user
  if (!userInfo.steamid64 && !discordUser) {
    throw new Error('Please provide either a Discord user or Steam ID to check.');
  }

  // Only validate Steam ID format if we have one
  if (userInfo.steamid64 && !isValidSteamId(userInfo.steamid64)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  // If we resolved a Discord user ID from Steam ID, try to fetch the Discord user object
  let resolvedDiscordUser = discordUser;
  if (!discordUser && userInfo.discordUserId && interaction?.client) {
    try {
      resolvedDiscordUser = await interaction.client.users.fetch(userInfo.discordUserId);
      loggerConsole.debug('Resolved Discord user from Steam ID', {
        steamId: userInfo.steamid64,
        discordUserId: userInfo.discordUserId,
        discordTag: resolvedDiscordUser.tag
      });
    } catch (error) {
      loggerConsole.warn('Failed to fetch Discord user from resolved ID', {
        discordUserId: userInfo.discordUserId,
        steamId: userInfo.steamid64,
        error: error.message
      });
      // Continue without Discord user object - we'll show the ID in the display
    }
  }

  return {
    steamid64: userInfo.steamid64,
    discordUser: resolvedDiscordUser,
    discordUserId: userInfo.discordUserId, // Also return the raw Discord user ID
    hasLink: userInfo.hasLink,
    hasWhitelistHistory: userInfo.hasWhitelistHistory
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage whitelist entries for Squad servers')
    
    // Grant subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant')
        .setDescription('Grant whitelist access to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to grant whitelist to')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user (required)')
            .setRequired(true)))

    // Grant Steam ID only subcommand (admin-restricted)
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant-steamid')
        .setDescription('Grant whitelist access by Steam ID only (admin use)')
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('username')
            .setDescription('Username for audit trail (optional but recommended)')
            .setRequired(false)))
    
    // Info subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Check whitelist status for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to check')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to check')
            .setRequired(false)))

    // Revoke subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke whitelist access for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for revocation')
            .setRequired(false)))

    // Sync subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sync Discord roles to database whitelist entries (admin only)')
        .addBooleanOption(option =>
          option.setName('dry-run')
            .setDescription('Preview changes without making them')
            .setRequired(false))),

  async execute(interaction) {
    // Permission middleware now automatically checks both parent command and subcommand permissions
    await permissionMiddleware(interaction, async () => {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
        case 'grant':
          await handleGrant(interaction);
          break;
        case 'grant-steamid':
          await handleGrantSteamId(interaction);
          break;
        case 'info':
          await handleInfo(interaction);
          break;
        case 'revoke':
          await handleRevoke(interaction);
          break;
        case 'sync':
          await handleSync(interaction);
          break;
        default:
          await sendError(interaction, 'Unknown subcommand.');
        }
      } catch (error) {
        loggerConsole.error('Whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the whitelist command.');
      }
    });
  }
};

async function handleGrant(interaction) {
  const discordUser = interaction.options.getUser('user'); // Now required
  const steamid = interaction.options.getString('steamid');

  try {
    // Step 1: Resolve user information first (both user and steamid are now required)
    const userInfo = await resolveUserInfo(steamid, discordUser, true);

    // Step 2: Show reason selection with buttons
    await showReasonSelectionButtons(interaction, {
      discordUser,
      userInfo,
      originalUser: interaction.user,
      isSteamIdOnly: false
    });

  } catch (error) {
    loggerConsole.error('Whitelist grant error:', error);
    await sendError(interaction, error.message);
  }
}

async function handleGrantSteamId(interaction) {
  const steamid = interaction.options.getString('steamid');
  const username = interaction.options.getString('username');

  try {
    // Defer reply immediately to prevent timeout during database query
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Step 0: Check for Steam ID conflicts
    const { PlayerDiscordLink } = require('../database/models');
    const existingLink = await PlayerDiscordLink.findBySteamId(steamid);

    // If Steam ID is already linked to a different Discord account, show conflict warning
    if (existingLink) {
      // Generate unique IDs for this specific interaction to prevent cross-contamination
      const interactionId = interaction.id;
      const proceedConflictId = `proceed_despite_conflict_${interactionId}`;
      const cancelConflictId = `cancel_conflict_${interactionId}`;

      const conflictEmbed = createResponseEmbed({
        title: '🚨 Steam ID Conflict Detected',
        description: `**WARNING:** This Steam ID is already linked to a Discord account.\n\n**Steam ID:** ${steamid}\n${username ? `**Username:** ${username}` : '**Username:** Not provided'}\n\n**Existing Link:**\n• Discord User: <@${existingLink.discord_user_id}> (ID: ${existingLink.discord_user_id})\n• Link Confidence: ${existingLink.confidence_score}\n• Link Source: ${existingLink.link_source}\n• Created: ${new Date(existingLink.created_at).toLocaleDateString()}\n\n⚠️ **Proceeding will grant whitelist to this Steam ID without changing the existing link.**\n\nOnly proceed if you're certain this is correct.`,
        color: 0xff0000
      });

      const conflictRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(proceedConflictId)
            .setLabel('Proceed Anyway')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚠️'),
          new ButtonBuilder()
            .setCustomId(cancelConflictId)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );

      await interaction.editReply({
        embeds: [conflictEmbed],
        components: [conflictRow]
      });

      // Handle conflict confirmation
      const conflictCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => (i.customId === proceedConflictId || i.customId === cancelConflictId) && i.user.id === interaction.user.id,
        time: 300000
      });

      conflictCollector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.customId === cancelConflictId) {
          try {
            await buttonInteraction.update({
              content: '❌ Steam ID grant cancelled due to conflict.',
              embeds: [],
              components: []
            });
          } catch (error) {
            // Handle interaction timeout gracefully
            if (error.code === 10062 || error.rawError?.code === 10062) {
              loggerConsole.warn('Interaction expired during conflict cancellation');
              return;
            }
            throw error;
          }
          return;
        }

        // User chose to proceed despite conflict - continue to normal warning
        try {
          if (!buttonInteraction.deferred && !buttonInteraction.replied) {
            await buttonInteraction.deferUpdate();
          }

          // Show normal Steam ID grant warning (Step 1)
          await showSteamIdGrantWarning(buttonInteraction, steamid, username, interaction.user);
        } catch (error) {
          if (error.code === 10062 || error.rawError?.code === 10062) {
            loggerConsole.warn('Interaction expired during conflict resolution');
            return;
          }

          if (error.code === 40060 || error.rawError?.code === 40060) {
            loggerConsole.warn('Attempted to respond to already acknowledged interaction in conflict resolution');
            return;
          }

          loggerConsole.error('Conflict resolution error:', error);

          try {
            if (!buttonInteraction.replied && !buttonInteraction.deferred) {
              await buttonInteraction.reply({
                content: `❌ ${error.message}`,
                flags: MessageFlags.Ephemeral
              });
            } else {
              await buttonInteraction.editReply({
                content: `❌ ${error.message}`,
                embeds: [],
                components: []
              });
            }
          } catch (replyError) {
            if (replyError.code !== 10062 && replyError.code !== 40060) {
              loggerConsole.error('Failed to send error message:', replyError);
            }
          }
        }
      });

      return; // Exit early to wait for conflict resolution
    }

    // No conflict - proceed to normal Steam ID grant warning (Step 1)
    await showSteamIdGrantWarning(interaction, steamid, username, interaction.user);

  } catch (error) {
    loggerConsole.error('Steam ID grant setup error:', error);
    await sendError(interaction, error.message);
  }
}

async function showSteamIdGrantWarning(interaction, steamid, username, originalUser) {
  // Generate unique IDs for this specific interaction to prevent cross-contamination
  const interactionId = interaction.id;
  const proceedId = `proceed_steamid_grant_${interactionId}`;
  const cancelId = `cancel_steamid_grant_${interactionId}`;

  // Step 1: Show warning about Steam ID only grant
  const warningEmbed = createResponseEmbed({
    title: '⚠️ Steam ID Only Grant',
    description: `**Steam ID:** ${steamid}\n${username ? `**Username:** ${username}` : '**Username:** Not provided'}\n\n🚨 **Important:** This grant will NOT create a Discord-Steam account link.\nThis means the user will have lower link confidence.\n\n⏰ **Please complete this process within 2-3 minutes to avoid timeout.**\n\nOnly use this for users who are not in Discord or emergency situations.`,
    color: 0xffa500
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(proceedId)
        .setLabel('Proceed with Steam ID Grant')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

  // Check if we need to edit reply (for conflict flow) or send new reply
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [warningEmbed],
        components: [confirmRow]
      });
    } else {
      await interaction.reply({
        embeds: [warningEmbed],
        components: [confirmRow],
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    if (error.code === 10062 || error.rawError?.code === 10062) {
      loggerConsole.warn('Interaction expired while showing Steam ID grant warning');
      return;
    }
    throw error;
  }

  // Capture variables in closure to prevent contamination from concurrent commands
  const capturedSteamId = steamid;
  const capturedUsername = username;

  // Handle confirmation
  const confirmCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === proceedId || i.customId === cancelId) && i.user.id === originalUser.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === cancelId) {
      try {
        await buttonInteraction.update({
          content: '❌ Steam ID grant cancelled.',
          embeds: [],
          components: []
        });
      } catch (error) {
        // Handle interaction timeout gracefully
        if (error.code === 10062 || error.rawError?.code === 10062) {
          loggerConsole.warn('Interaction expired during Steam ID grant cancellation');
          return;
        }
        throw error;
      }
      return;
    }

    // Proceed with Steam ID only grant
    try {
      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }

      // Step 2: Resolve user information (no Discord user, no linking)
      const userInfo = await resolveUserInfo(capturedSteamId, null, false);
      // Manually add username if provided
      if (capturedUsername) {
        userInfo.username = capturedUsername;
      }

      // Step 3: Show reason selection with buttons instead of dropdown
      await showReasonSelectionButtons(buttonInteraction, {
        discordUser: null,
        userInfo,
        originalUser: originalUser,
        isSteamIdOnly: true
      });
    } catch (error) {
      // For interaction timeout errors, just log and don't try to respond
      if (error.code === 10062 || error.rawError?.code === 10062) {
        loggerConsole.warn('Interaction expired during Steam ID grant process');
        return;
      }

      // For "already acknowledged" errors, just log briefly
      if (error.code === 40060 || error.rawError?.code === 40060) {
        loggerConsole.warn('Attempted to respond to already acknowledged interaction in Steam ID grant');
        return;
      }

      loggerConsole.error('Steam ID grant error:', error);

      try {
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: `❌ ${error.message}`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await buttonInteraction.editReply({
            content: `❌ ${error.message}`,
            embeds: [],
            components: []
          });
        }
      } catch (replyError) {
        // Don't log twice for the same interaction timeout
        if (replyError.code !== 10062 && replyError.code !== 40060) {
          loggerConsole.error('Failed to send error message:', replyError);
        }
      }
    }
  });
}

async function showReasonSelectionButtons(interaction, grantData) {
  const { discordUser, userInfo, originalUser, isSteamIdOnly } = grantData;

  // Generate unique ID for this specific interaction to prevent cross-contamination
  const interactionId = interaction.id;
  const reasonSelectId = `reason_select_${interactionId}`;

  const reasonEmbed = createResponseEmbed({
    title: '🎯 Select Whitelist Type',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}${isSteamIdOnly ? '\n\n⚠️ **Steam ID Only Grant** - No account linking will occur' : ''}\n\nPlease select the type of whitelist to grant:`,
    color: isSteamIdOnly ? 0xffa500 : 0x3498db
  });

  const reasonSelect = new StringSelectMenuBuilder()
    .setCustomId(reasonSelectId)
    .setPlaceholder('Select whitelist type')
    .addOptions([
      {
        label: 'Service Member',
        description: 'Military service member (6 months default)',
        value: 'service-member',
        emoji: '🎖️'
      },
      {
        label: 'First Responder',
        description: 'Emergency service personnel (6 months default)',
        value: 'first-responder',
        emoji: '🚑'
      },
      {
        label: 'Donator',
        description: 'Server donator (6 months or 1 year)',
        value: 'donator',
        emoji: '💎'
      },
      {
        label: 'Reporting',
        description: 'Temporary reporting access (3-365 days)',
        value: 'reporting',
        emoji: '📋'
      }
    ]);

  const reasonRow1 = new ActionRowBuilder().addComponents(reasonSelect);

  // Check if we need to reply or edit reply based on interaction state
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [reasonEmbed],
        components: [reasonRow1]
      });
    } else {
      await interaction.reply({
        embeds: [reasonEmbed],
        components: [reasonRow1],
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    // If interaction failed, it might be expired - log and continue
    if (error.code === 10062 || error.rawError?.code === 10062) {
      loggerConsole.warn('Interaction expired while showing reason selection');
      return;
    }
    throw error; // Re-throw if it's not an expiration error
  }

  // Handle reason select menu
  const reasonCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === reasonSelectId && i.user.id === originalUser.id,
    time: 300000
  });

  reasonCollector.on('collect', async (reasonInteraction) => {
    const selectedReason = reasonInteraction.values[0];

    try {
      if (!reasonInteraction.deferred && !reasonInteraction.replied) {
        await reasonInteraction.deferUpdate();
      }
      await handleDurationSelection(reasonInteraction, {
        reason: selectedReason,
        discordUser,
        userInfo,
        originalUser,
        isSteamIdOnly
      });
      // Stop collector after successful processing
      reasonCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling reason selection:', error);
      // For interaction timeout errors, stop collector and don't try to respond
      if (error.code === 10062 || error.rawError?.code === 10062) {
        loggerConsole.warn('Interaction expired during reason selection');
        reasonCollector.stop('expired');
        return;
      }
      // For already acknowledged errors, stop collector silently
      if (error.code === 40060 || error.rawError?.code === 40060) {
        reasonCollector.stop('acknowledged');
        return;
      }

      if (!reasonInteraction.replied && !reasonInteraction.deferred) {
        try {
          await reasonInteraction.reply({
            content: '❌ An error occurred while processing your selection. Please try again.',
            flags: MessageFlags.Ephemeral
          });
        } catch (replyError) {
          // Don't log twice for the same interaction timeout
          if (replyError.code !== 10062 && replyError.code !== 40060) {
            loggerConsole.error('Failed to send error reply:', replyError);
          }
        }
      }
    }
  });

  reasonCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      try {
        interaction.editReply({
          content: '❌ Whitelist grant timed out. Please try again.',
          embeds: [],
          components: []
        });
      } catch (error) {
        loggerConsole.error('Failed to send timeout message (interaction may have expired):', error);
      }
    }
  });
}

async function handleDurationSelection(interaction, grantData) {
  const { reason } = grantData;

  // Show different duration selection based on reason
  switch (reason) {
  case 'service-member':
  case 'first-responder':
    // Skip duration selection, go straight to confirmation (auto 6 months)
    await handleConfirmation(interaction, {
      ...grantData,
      durationValue: 6,
      durationType: 'months',
      durationText: '6 months'
    });
    break;
      
  case 'donator':
    await showDonatorDurationSelection(interaction, grantData);
    break;
      
  case 'reporting':
    await showReportingDurationSelection(interaction, grantData);
    break;
      
  default:
    await interaction.update({
      content: '❌ Invalid whitelist type selected.',
      embeds: [],
      components: []
    });
  }
}

async function showDonatorDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;

  // Generate unique ID for this specific interaction to prevent cross-contamination
  const interactionId = interaction.id;
  const donatorDurationId = `donator_duration_${interactionId}`;

  const durationEmbed = createResponseEmbed({
    title: '💎 Donator Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the donator whitelist duration:`,
    color: 0xe91e63
  });

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId(donatorDurationId)
    .setPlaceholder('Select duration')
    .addOptions([
      {
        label: '6 Months',
        description: '6 month donator access',
        value: '6m',
        emoji: '📅'
      },
      {
        label: '1 Year',
        description: '1 year donator access',
        value: '1y',
        emoji: '🗓️'
      }
    ]);

  const durationRow = new ActionRowBuilder().addComponents(durationSelect);

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration select menu
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === donatorDurationId && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (selectInteraction) => {
    try {
      const duration = selectInteraction.values[0] === '6m' ? { value: 6, type: 'months', text: '6 months' } : { value: 12, type: 'months', text: '1 year' };

      if (!selectInteraction.deferred && !selectInteraction.replied) {
        await selectInteraction.deferUpdate();
      }
      await handleConfirmation(selectInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
      // Stop collector after successful processing
      durationCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling donator duration selection:', error);
      // For interaction timeout errors, stop collector and don't try to respond
      if (error.code === 10062 || error.rawError?.code === 10062) {
        loggerConsole.warn('Interaction expired during donator duration selection');
        durationCollector.stop('expired');
        return;
      }
      // For already acknowledged errors, stop collector silently
      if (error.code === 40060 || error.rawError?.code === 40060) {
        durationCollector.stop('acknowledged');
        return;
      }
    }
  });
}

async function showReportingDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;

  // Generate unique IDs for this specific interaction to prevent cross-contamination
  const interactionId = interaction.id;
  const reportingDurationId = `reporting_duration_${interactionId}`;
  const customModalId = `reporting_custom_modal_${interactionId}`;

  const durationEmbed = createResponseEmbed({
    title: '📋 Reporting Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the reporting whitelist duration:`,
    color: 0xff9800
  });

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId(reportingDurationId)
    .setPlaceholder('Select duration')
    .addOptions([
      {
        label: '3 Days',
        description: '3 day reporting access',
        value: '3d',
        emoji: '🕐'
      },
      {
        label: '7 Days',
        description: '7 day reporting access (recommended)',
        value: '7d',
        emoji: '📅'
      },
      {
        label: '14 Days',
        description: '14 day reporting access',
        value: '14d',
        emoji: '🗓️'
      },
      {
        label: '30 Days',
        description: '30 day reporting access',
        value: '30d',
        emoji: '📆'
      },
      {
        label: 'Custom',
        description: 'Enter custom number of days (1-365)',
        value: 'custom',
        emoji: '✏️'
      }
    ]);

  const durationRow = new ActionRowBuilder().addComponents(durationSelect);

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration select menu
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === reportingDurationId && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (selectInteraction) => {
    if (selectInteraction.values[0] === 'custom') {
      // Show modal for custom duration input
      const customDaysModal = new ModalBuilder()
        .setCustomId(customModalId)
        .setTitle('Custom Reporting Duration');

      const daysInput = new TextInputBuilder()
        .setCustomId('custom_days_input')
        .setLabel('Number of Days')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter number of days (1-365)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(3);

      const daysRow = new ActionRowBuilder().addComponents(daysInput);
      customDaysModal.addComponents(daysRow);

      await selectInteraction.showModal(customDaysModal);

      // Handle modal submission - using awaitModalSubmit instead

      // Create a more specific modal filter
      try {
        const modalResponse = await selectInteraction.awaitModalSubmit({
          filter: (i) => i.customId === customModalId && i.user.id === grantData.originalUser.id,
          time: 300000
        });

        const customDays = parseInt(modalResponse.fields.getTextInputValue('custom_days_input'));
        
        if (isNaN(customDays) || customDays < 1 || customDays > 365) {
          await modalResponse.reply({
            content: '❌ Please enter a valid number of days between 1 and 365.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!modalResponse.deferred && !modalResponse.replied) {
          await modalResponse.deferUpdate();
        }
        await handleConfirmation(modalResponse, {
          ...grantData,
          durationValue: customDays,
          durationType: 'days',
          durationText: `${customDays} day${customDays > 1 ? 's' : ''}`
        });

      } catch (error) {
        loggerConsole.error('Modal submission error:', error);
        // Modal timed out or errored
      }
      
      return;
    }

    // Handle preset duration selections
    try {
      const durationMap = {
        '3d': { value: 3, type: 'days', text: '3 days' },
        '7d': { value: 7, type: 'days', text: '7 days' },
        '14d': { value: 14, type: 'days', text: '14 days' },
        '30d': { value: 30, type: 'days', text: '30 days' }
      };

      const duration = durationMap[selectInteraction.values[0]];

      if (!selectInteraction.deferred && !selectInteraction.replied) {
        await selectInteraction.deferUpdate();
      }
      await handleConfirmation(selectInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
      // Stop collector after successful processing
      durationCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling reporting duration selection:', error);
      // For interaction timeout errors, stop collector and don't try to respond
      if (error.code === 10062 || error.rawError?.code === 10062) {
        loggerConsole.warn('Interaction expired during reporting duration selection');
        durationCollector.stop('expired');
        return;
      }
      // For already acknowledged errors, stop collector silently
      if (error.code === 40060 || error.rawError?.code === 40060) {
        durationCollector.stop('acknowledged');
        return;
      }
    }
  });
}

async function handleConfirmation(interaction, grantData) {
  // Generate unique IDs for this specific interaction to prevent cross-contamination
  const interactionId = interaction.id;
  const confirmGrantId = `confirm_grant_${interactionId}`;
  const cancelGrantId = `cancel_grant_${interactionId}`;

  // IMPORTANT: Capture all variables at function entry to prevent contamination from concurrent commands
  const capturedGrantData = {
    reason: grantData.reason,
    discordUser: grantData.discordUser,
    userInfo: {
      steamid64: grantData.userInfo.steamid64,
      discord_username: grantData.userInfo.discord_username,
      username: grantData.userInfo.username,
      linkedAccount: grantData.userInfo.linkedAccount
    },
    originalUser: grantData.originalUser,
    isSteamIdOnly: grantData.isSteamIdOnly,
    durationValue: grantData.durationValue,
    durationType: grantData.durationType,
    durationText: grantData.durationText
  };

  const confirmEmbed = createResponseEmbed({
    title: '✅ Confirm Whitelist Grant',
    description: 'Please confirm the whitelist details below:',
    fields: [
      { name: 'Discord User', value: capturedGrantData.discordUser ? `<@${capturedGrantData.discordUser.id}>` : 'Not linked', inline: true },
      { name: 'Steam ID', value: capturedGrantData.userInfo.steamid64, inline: true },
      { name: 'Type', value: capturedGrantData.reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
      { name: 'Duration', value: capturedGrantData.durationText, inline: true },
      { name: 'Granted By', value: `<@${capturedGrantData.originalUser.id}>`, inline: true }
    ],
    color: 0x4caf50
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(confirmGrantId)
        .setLabel('Confirm & Grant')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(cancelGrantId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [confirmRow]
  });

  // Handle confirmation
  const confirmCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === confirmGrantId || i.customId === cancelGrantId) && i.user.id === capturedGrantData.originalUser.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    try {
      if (buttonInteraction.customId === cancelGrantId) {
        await buttonInteraction.update({
          content: '❌ Whitelist grant cancelled.',
          embeds: [],
          components: []
        });
        // Stop collector after cancellation
        confirmCollector.stop('cancelled');
        return;
      }

      // Process the actual grant
      // Don't defer if we've already updated the interaction above
      if (!buttonInteraction.deferred && !buttonInteraction.replied && buttonInteraction.customId !== 'whitelist_cancel') {
        await buttonInteraction.deferUpdate();
      }
      await processWhitelistGrant(buttonInteraction, capturedGrantData);
      // Stop collector after successful processing
      confirmCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling confirmation:', error);
      // For interaction timeout errors, stop collector and don't try to respond
      if (error.code === 10062 || error.rawError?.code === 10062) {
        loggerConsole.warn('Interaction expired during confirmation');
        confirmCollector.stop('expired');
        return;
      }
      // For already acknowledged errors, stop collector silently
      if (error.code === 40060 || error.rawError?.code === 40060) {
        confirmCollector.stop('acknowledged');
        return;
      }

      try {
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: '❌ An error occurred while processing the confirmation. Please try again.',
            flags: MessageFlags.Ephemeral
          });
        } else {
          await buttonInteraction.editReply({
            content: '❌ An error occurred while processing the confirmation.',
            embeds: [],
            components: []
          });
        }
      } catch (replyError) {
        // Don't log twice for the same interaction timeout
        if (replyError.code !== 10062 && replyError.code !== 40060) {
          loggerConsole.error('Failed to send confirmation error message:', replyError);
        }
      }
    }
  });
}

async function processWhitelistGrant(interaction, grantData) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText, isSteamIdOnly } = grantData;

  await interaction.editReply({
    content: '⏳ Processing whitelist grant...',
    embeds: [],
    components: []
  });

  try {
    // Grant the whitelist
    const whitelistEntry = await Whitelist.grantWhitelist({
      steamid64: userInfo.steamid64,
      username: userInfo.username,
      // IMPORTANT: Only store Discord attribution if a Discord user was explicitly provided
      // This prevents automatic attribution when granting standalone Steam ID whitelists
      discord_username: discordUser ? userInfo.discord_username : null,
      reason: reason,
      duration_value: durationValue,
      duration_type: durationType,
      granted_by: grantData.originalUser.id
    });

    // Log to Discord (with steam ID only flag)
    await logWhitelistOperation(interaction.client, 'grant', {
      id: discordUser?.id || 'unknown',
      tag: discordUser?.tag || 'Unknown User'
    }, userInfo.steamid64, {
      whitelistType: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      duration: durationText,
      grantedBy: `<@${grantData.originalUser.id}>`,
      expiration: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never',
      steamIdOnly: isSteamIdOnly || false // Flag for audit
    });

    // Assign Discord role based on whitelist reason
    let roleAssigned = false;
    const roleId = getRoleForReason(reason);
    
    if (discordUser && roleId) {
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(discordUser.id).catch(() => null);
        
        if (member) {
          const role = guild.roles.cache.get(roleId);
          if (role && !member.roles.cache.has(roleId)) {
            await member.roles.add(role, `${reason.replace('-', ' ')} whitelist granted by ${grantData.originalUser.tag}`);
            roleAssigned = true;
          }
        }
      } catch (error) {
        loggerConsole.error(`Failed to assign ${reason} role:`, error);
      }
    }

    const successEmbed = createResponseEmbed({
      title: 'Whitelist Granted Successfully',
      description: `Whitelist access has been granted successfully${roleAssigned ? ' and Discord role assigned' : ''}!`,
      fields: [
        { name: 'Discord User', value: discordUser ? `<@${discordUser.id}>` : 'Not linked', inline: true },
        { name: 'Steam ID', value: userInfo.steamid64, inline: true },
        { name: 'Type', value: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
        { name: 'Duration', value: durationText, inline: true },
        { name: 'Expires', value: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never', inline: true },
        { name: 'Granted By', value: `<@${grantData.originalUser.id}>`, inline: true }
      ],
      color: 0x00ff00
    });

    if (roleAssigned) {
      const roleId = getRoleForReason(reason);
      const roleName = reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
      successEmbed.addFields({
        name: 'Discord Role Granted',
        value: roleId ? `<@&${roleId}> role has been assigned` : `${roleName} role assigned`,
        inline: false
      });
    }

    if (userInfo.linkedAccount) {
      if (userInfo.linkedAccount === 'failed') {
        successEmbed.addFields({ 
          name: 'Account Link', 
          value: '⚠️ Failed to create Discord-Steam link (check logs)', 
          inline: true 
        });
      } else {
        successEmbed.addFields({ 
          name: 'Account Link', 
          value: `✅ Discord-Steam link ${userInfo.linkedAccount} (Confidence: 0.5)`, 
          inline: true 
        });
      }
      if (reason === 'service-member' || reason === 'first-responder') {
        successEmbed.addFields({
          name: '⚠️ Note',
          value: 'This creates a 0.5 confidence link. User must self-verify with `/linkid` for staff whitelist access.',
          inline: false
        });
      }
    }

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: []
    });

    // Send a public announcement embed (non-ephemeral)
    try {
      const publicEmbed = createResponseEmbed({
        title: roleAssigned ? 'Whitelist & Role Granted' : 'Whitelist Granted',
        description: `${discordUser ? `<@${discordUser.id}>` : `Steam ID \`${userInfo.steamid64}\``} has been granted **${reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}** whitelist access${roleAssigned ? ' and Discord role' : ''}`,
        fields: [
          { name: 'Duration', value: durationText, inline: true },
          { name: 'Granted By', value: `<@${grantData.originalUser.id}>`, inline: true }
        ],
        color: 0x00ff00
      });

      if (roleAssigned) {
        const roleId = getRoleForReason(reason);
        publicEmbed.addFields({
          name: 'Discord Role',
          value: roleId ? `<@&${roleId}> role has been assigned` : `${reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} role assigned`,
          inline: true
        });
      }

      await interaction.followUp({
        embeds: [publicEmbed]
      });
    } catch (publicError) {
      loggerConsole.error('Failed to send public whitelist announcement:', publicError);
      // Don't let this failure affect the main process
    }

  } catch (error) {
    loggerConsole.error('Whitelist grant processing error:', error);
    await interaction.editReply({
      content: `❌ Failed to grant whitelist: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

async function handleInfo(interaction) {
  try {
    // Defer reply immediately - 15 minute timeout starts now
    await interaction.deferReply(); // Non-ephemeral defer
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser, discordUserId: resolvedDiscordUserId, hasLink } = await resolveUserForInfo(steamid, discordUser, interaction);

    // Use WhitelistAuthorityService to get comprehensive whitelist status
    let authorityStatus = null;
    let member = null;

    if (resolvedDiscordUser) {
      try {
        member = await interaction.guild.members.fetch(resolvedDiscordUser.id);
        authorityStatus = await WhitelistAuthorityService.getWhitelistStatus(
          resolvedDiscordUser.id,
          resolvedSteamId,
          member
        );
      } catch (error) {
        loggerConsole.error('WhitelistAuthorityService validation failed:', error);
        // Continue with limited validation if authority service fails
        authorityStatus = null;
      }
    }

    // Get whitelist status with proper stacking calculation (only if we have a Steam ID)
    let whitelistStatus = { hasWhitelist: false, status: 'No whitelist' };
    let history = [];

    if (resolvedSteamId) {
      whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);

      // Get history to show stacking info (without Group association to avoid error)
      history = await Whitelist.findAll({
        where: { steamid64: resolvedSteamId },
        order: [['granted_at', 'DESC']]
      });
    }
    // Filter for truly active entries (not revoked AND not expired)
    const now = new Date();
    const activeEntries = history.filter(entry => {
      if (entry.revoked) return false;
      
      // If no duration specified, it's permanent
      if (!entry.duration_value || !entry.duration_type) {
        return entry.duration_value !== 0; // Exclude entries with 0 duration (expired)
      }
      
      // Calculate actual expiration date
      const grantedDate = new Date(entry.granted_at);
      const expirationDate = new Date(grantedDate);
      
      if (entry.duration_type === 'days') {
        expirationDate.setDate(expirationDate.getDate() + entry.duration_value);
      } else if (entry.duration_type === 'months') {
        expirationDate.setMonth(expirationDate.getMonth() + entry.duration_value);
      }
      
      return expirationDate > now; // Only include if not expired
    });

    // Determine final status using WhitelistAuthorityService result
    let finalStatus, finalColor;

    if (authorityStatus && authorityStatus.effectiveStatus) {
      // Use authority service result as primary source of truth
      if (authorityStatus.isWhitelisted) {
        const source = authorityStatus.effectiveStatus.primarySource;

        if (source === 'role_based' && authorityStatus.sources?.roleBased) {
          // Role-based whitelist (already validated by authority service)
          const group = authorityStatus.sources.roleBased.group;
          finalStatus = `Active (permanent - ${group})`;
          finalColor = 0x9C27B0; // Purple for staff role-based
        } else if (source === 'database') {
          // Database whitelist
          finalStatus = authorityStatus.sources?.database?.isActive ?
            `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})` :
            'Active (database)';
          finalColor = 0x00FF00; // Green for database whitelist
        } else {
          // Fallback for database entries
          finalStatus = `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})`;
          finalColor = 0x00FF00; // Green for database whitelist
        }
      } else {
        // Not whitelisted - show specific reason
        const reason = authorityStatus.effectiveStatus.reason;

        if (reason === 'security_blocked_insufficient_confidence' && authorityStatus.effectiveStatus.details) {
          const details = authorityStatus.effectiveStatus.details;
          finalStatus = `Inactive - Steam link confidence too low (${details.actualConfidence}/1.0 required, has ${details.group} role)`;
          finalColor = 0xFF6600; // Orange-red for security blocked
        } else if (reason === 'no_steam_account_linked' && authorityStatus.effectiveStatus.details) {
          const details = authorityStatus.effectiveStatus.details;
          if (details.hasStaffRole) {
            finalStatus = 'Inactive - Steam account not linked (has staff role)';
            finalColor = 0xFFA500; // Orange - has role but missing Steam link
          } else {
            finalStatus = 'No whitelist - Steam account not linked';
            finalColor = 0xFF0000; // Red - no whitelist and no Steam link
          }
        } else {
          finalStatus = 'No whitelist access';
          finalColor = 0xFF0000; // Red - no access
        }
      }
    } else {
      // Fallback to database-only check if authority service failed
      if (!resolvedSteamId) {
        finalStatus = 'No whitelist - Steam account not linked';
        finalColor = 0xFF0000;
      } else if (whitelistStatus.hasWhitelist) {
        finalStatus = whitelistStatus.status;
        finalColor = 0x00FF00;
      } else {
        finalStatus = whitelistStatus.status;
        finalColor = 0xFF0000;
      }
    }

    // Determine proper account link status
    let accountLinkStatus = '❌ Not linked';
    if (authorityStatus?.linkInfo) {
      // Use authority service link info if available
      const confidence = authorityStatus.linkInfo.confidence;
      if (confidence >= 0.5) {
        accountLinkStatus = `✅ Linked (${confidence}/1.0)`;
      } else {
        accountLinkStatus = `⚠️ Low confidence (${confidence}/1.0)`;
      }
    } else if (hasLink) {
      // Show linked if we have a link, regardless of whether Discord user was provided
      accountLinkStatus = '✅ Linked';
    }

    // Try to get Discord username from whitelist entries if not from Discord user
    let displayUser = resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'user';
    if (!resolvedDiscordUser && resolvedDiscordUserId) {
      // We have a Discord user ID but couldn't fetch the user object - show the ID
      displayUser = `<@${resolvedDiscordUserId}> (ID: ${resolvedDiscordUserId})`;
    } else if (!resolvedDiscordUser && !resolvedDiscordUserId && history.length > 0) {
      // Look for Discord username in any whitelist entry
      const entryWithDiscord = history.find(entry => entry.discord_username);
      if (entryWithDiscord) {
        displayUser = `${entryWithDiscord.discord_username} (from whitelist record)`;
      }
    }

    const embed = createResponseEmbed({
      title: '📋 Whitelist Status',
      description: `Whitelist information for ${displayUser}`,
      fields: [
        { name: 'Steam ID', value: resolvedSteamId || 'Not linked', inline: true },
        { name: 'Status', value: finalStatus, inline: true },
        { name: 'Account Link', value: accountLinkStatus, inline: true }
      ],
      color: finalColor
    });

    // Add whitelist source info using authority service data
    if (authorityStatus && authorityStatus.isWhitelisted && authorityStatus.effectiveStatus) {
      const source = authorityStatus.effectiveStatus.primarySource;

      if (source === 'role_based' && authorityStatus.sources?.roleBased) {
        const group = authorityStatus.sources.roleBased.group;
        const confidence = authorityStatus.linkInfo?.confidence || 0;
        embed.addFields({
          name: 'Whitelist Source',
          value: `Discord Role (${group}) - Link confidence: ${confidence}`,
          inline: true
        });
      } else if (source === 'database') {
        embed.addFields({
          name: 'Whitelist Source',
          value: 'Database Entry',
          inline: true
        });
      }
    }

    // Show database whitelist expiration if it's the primary source or there's no role-based access
    const hasRoleBasedAccess = authorityStatus?.sources?.roleBased?.isActive;
    if (!hasRoleBasedAccess && whitelistStatus.expiration) {
      embed.addFields({
        name: whitelistStatus.hasWhitelist ? 'Expires' : 'Expired',
        value: whitelistStatus.expiration.toLocaleDateString(),
        inline: true
      });
    }

    // Link confidence info is now included in the main Account Link field

    // Show whitelist details using authority service data
    let whitelistEntries = [];
    const hasRoleBasedAccessForEntries = authorityStatus?.sources?.roleBased?.isActive;

    // Add role-based entry if present and active
    if (hasRoleBasedAccessForEntries && authorityStatus.sources?.roleBased) {
      const group = authorityStatus.sources.roleBased.group;
      const confidence = authorityStatus.linkInfo?.confidence || 0;
      whitelistEntries.push(`• ${group} Role: permanent (confidence: ${confidence})`);
    }

    // Add database entries - show both permanent and active entries for full visibility
    if (activeEntries.length > 0) {
      // If user has role-based access, only show permanent database entries as "backup"
      // If no role-based access, show all active entries
      const entriesToShow = hasRoleBasedAccessForEntries
        ? activeEntries.filter(entry => !entry.duration_value || !entry.duration_type || entry.duration_value === null)
        : activeEntries;

      if (entriesToShow.length > 0) {
        const stackingInfo = entriesToShow.map(entry => {
          const reason = entry.reason || 'Unknown';
          const note = entry.note ? `: ${entry.note}` : '';

          // Calculate remaining time for this entry
          if (!entry.duration_value || !entry.duration_type || entry.duration_value === 0) {
            return `• ${reason}${note}: permanent`;
          }

          const grantedDate = new Date(entry.granted_at);
          const expirationDate = new Date(grantedDate);

          if (entry.duration_type === 'days') {
            expirationDate.setDate(expirationDate.getDate() + entry.duration_value);
          } else if (entry.duration_type === 'months') {
            expirationDate.setMonth(expirationDate.getMonth() + entry.duration_value);
          }

          const now = new Date();
          const remainingMs = expirationDate - now;
          const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

          return `• ${reason}${note}: ${remainingDays} days`;
        });
        whitelistEntries.push(...stackingInfo);
      }
    }

    if (whitelistEntries.length > 0) {
      const totalEntries = whitelistEntries.length;
      const entryLabel = hasRoleBasedAccessForEntries ? 'Whitelist Sources' : 'Active Whitelist Entries';

      embed.addFields({
        name: `${entryLabel} (${totalEntries})`,
        value: whitelistEntries.join('\n'),
        inline: false
      });
    }

    // Add warnings based on authority service results
    if (authorityStatus && !authorityStatus.isWhitelisted && authorityStatus.effectiveStatus) {
      const reason = authorityStatus.effectiveStatus.reason;

      if (reason === 'security_blocked_insufficient_confidence' && authorityStatus.effectiveStatus.details) {
        const details = authorityStatus.effectiveStatus.details;
        embed.addFields({
          name: '🚨 Security Warning',
          value: `You have the ${details.group} role but your Steam account link has insufficient confidence (${details.actualConfidence}/1.0). Staff whitelist requires high-confidence linking. Use \`/linkid\` to create a proper link.`,
          inline: false
        });
      } else if (reason === 'no_steam_account_linked' && authorityStatus.effectiveStatus.details) {
        const details = authorityStatus.effectiveStatus.details;
        if (details.hasStaffRole) {
          embed.addFields({
            name: '⚠️ Action Required',
            value: 'You have a staff role but need to link your Steam account for the whitelist to work. Use `/linkid` to connect your Steam account.',
            inline: false
          });
        }
      }
    } else if (!resolvedSteamId && member) {
      // Fallback warning for cases where authority service isn't available
      const group = getHighestPriorityGroup(member.roles.cache);
      if (group && group !== 'Member') {
        embed.addFields({
          name: '⚠️ Action Required',
          value: 'You need to link your Steam account for the whitelist to work. Use `/linkid` to connect your Steam account.',
          inline: false
        });
      }
    }

    await interaction.editReply({
      embeds: [embed]
    });
  } catch (error) {
    loggerConsole.error('Whitelist info error:', error);

    // Handle interaction timeout gracefully
    if (error.code === 10062 || error.rawError?.code === 10062) {
      loggerConsole.warn('Interaction expired while processing whitelist info');
      return;
    }

    try {
      await interaction.editReply({
        content: `❌ Failed to retrieve whitelist status: ${error.message}`
      });
    } catch (replyError) {
      if (replyError.code !== 10062 && replyError.rawError?.code !== 10062) {
        loggerConsole.error('Failed to send error message for whitelist info:', replyError);
      }
    }
  }
}

async function handleRevoke(interaction) {
  await withLoadingMessage(interaction, 'Revoking whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser, interaction);

    // Ensure we have a Steam ID for revocation
    if (!resolvedSteamId) {
      throw new Error('No Steam ID found. Please provide a Steam ID or link the Discord account first.');
    }

    // Revoke the whitelist
    const revokedCount = await Whitelist.revokeWhitelist(
      resolvedSteamId,
      reason,
      interaction.user.id
    );

    if (revokedCount === 0) {
      throw new Error('No active whitelist entries found for this user.');
    }

    // Remove Discord roles based on revoked whitelist entries
    let rolesRemoved = [];
    if (resolvedDiscordUser) {
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(resolvedDiscordUser.id).catch(() => null);
        
        if (member) {
          // Check if user still has any active whitelist entries
          const whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);
          
          // Only remove roles if user has no active whitelist entries
          if (!whitelistStatus.hasWhitelist) {
            // Check which whitelist roles the user has and remove them
            for (const [reasonKey, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
              if (roleId && member.roles.cache.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                  await member.roles.remove(role, `Whitelist revoked by ${interaction.user.tag}`);
                  rolesRemoved.push(reasonKey.toLowerCase().replace('_', ' '));
                }
              }
            }
          }
        }
      } catch (error) {
        loggerConsole.error('Failed to remove whitelist roles:', error);
        // Continue without failing the command
      }
    }

    const embed = createResponseEmbed({
      title: '❌ Whitelist Revoked',
      description: `Successfully revoked whitelist access${rolesRemoved.length > 0 ? ' and removed Discord roles' : ''}`,
      fields: [
        { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Entries Revoked', value: revokedCount.toString(), inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0xFF0000
    });

    if (rolesRemoved.length > 0) {
      embed.addFields({ 
        name: 'Discord Roles', 
        value: `✅ Removed: ${rolesRemoved.join(', ')}`, 
        inline: true 
      });
    } else if (resolvedDiscordUser) {
      embed.addFields({ name: 'Discord Roles', value: '⚠️ Role removal not needed or failed', inline: true });
    }

    await sendSuccess(interaction, 'Whitelist revoked successfully!', embed);
  });
}

async function handleSync(interaction) {
  await interaction.deferReply();

  try {
    const dryRun = interaction.options.getBoolean('dry-run') || false;
    const guildId = interaction.guild.id;

    loggerConsole.info('Starting whitelist sync', {
      guildId,
      dryRun,
      requestedBy: interaction.user.id
    });

    // Create sync service with Discord client
    const syncService = new RoleWhitelistSyncService(loggerConsole, interaction.client);

    // Show initial message
    const initialEmbed = createResponseEmbed({
      title: dryRun ? '🔍 Whitelist Sync Preview' : '🔄 Syncing Whitelist',
      description: dryRun
        ? 'Analyzing Discord roles and database entries...'
        : 'Syncing Discord roles to database whitelist entries...',
      color: dryRun ? 0xffa500 : 0x3498db
    });

    await interaction.editReply({ embeds: [initialEmbed] });

    // Perform the sync
    const result = await syncService.bulkSyncGuild(guildId, {
      dryRun,
      batchSize: 25  // Smaller batches for better responsiveness
    });

    // Create result embed
    const resultEmbed = createResponseEmbed({
      title: dryRun ? '🔍 Sync Preview Results' : '✅ Sync Complete',
      description: dryRun
        ? 'Preview of changes that would be made:'
        : 'Successfully synced Discord roles to database whitelist entries.',
      fields: [
        { name: 'Total Members', value: result.totalMembers?.toString() || 'Unknown', inline: true },
        { name: 'Members with Roles', value: (result.membersToSync || result.totalProcessed || 0).toString(), inline: true },
        { name: 'Successful', value: result.successful?.toString() || '0', inline: true }
      ],
      color: result.success ? 0x00ff00 : 0xff0000
    });

    if (result.failed && result.failed > 0) {
      resultEmbed.addFields({
        name: 'Failed',
        value: result.failed.toString(),
        inline: true
      });
    }

    if (result.withoutSteamLinks && result.withoutSteamLinks > 0) {
      resultEmbed.addFields({
        name: 'Without Steam Links',
        value: result.withoutSteamLinks.toString(),
        inline: true
      });
    }

    if (result.staffWithoutLinks && result.staffWithoutLinks > 0) {
      resultEmbed.addFields({
        name: '⚠️ Staff Without Links',
        value: result.staffWithoutLinks.toString(),
        inline: true
      });
    }

    if (dryRun && result.groups) {
      const groupInfo = Object.entries(result.groups)
        .map(([group, count]) => `• ${group}: ${count}`)
        .join('\n');

      if (groupInfo) {
        resultEmbed.addFields({
          name: 'Role Distribution',
          value: groupInfo,
          inline: false
        });
      }
    }

    if (!dryRun && result.staffWithoutLinks && result.staffWithoutLinks > 0) {
      resultEmbed.addFields({
        name: '📝 Next Steps',
        value: 'Some staff members don\'t have Steam account links. Use `/unlinkedstaff` to see who needs to link their accounts.',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [resultEmbed] });

    loggerConsole.info('Whitelist sync completed', {
      guildId,
      dryRun,
      result: {
        success: result.success,
        totalProcessed: result.totalProcessed || result.membersToSync,
        successful: result.successful,
        failed: result.failed,
        withoutSteamLinks: result.withoutSteamLinks,
        staffWithoutLinks: result.staffWithoutLinks
      }
    });

  } catch (error) {
    loggerConsole.error('Whitelist sync error:', error);

    const errorEmbed = createResponseEmbed({
      title: '❌ Sync Failed',
      description: `Failed to sync whitelist: ${error.message}`,
      color: 0xff0000
    });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}