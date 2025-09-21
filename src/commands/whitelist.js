const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { withLoadingMessage, createResponseEmbed, sendSuccess, sendError } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { getHighestPriorityGroup } = require('../utils/environment');
const {
  createOrUpdateLink,
  resolveSteamIdFromDiscord,
  resolveDiscordFromSteamId,
  getUserInfo
} = require('../utils/accountLinking');
const { isValidSteamId } = require('../utils/steamId');
const { logWhitelistOperation, logCommand } = require('../utils/discordLogger');
const notificationService = require('../services/NotificationService');
const { console: loggerConsole } = require('../utils/logger');
const WhitelistAuthorityService = require('../services/WhitelistAuthorityService');


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
      0.5,  // Whitelist operations create 0.5 confidence links
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
async function resolveUserForInfo(steamid, discordUser) {
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

  return {
    steamid64: userInfo.steamid64,
    discordUser: discordUser, // Keep original Discord user object for mentions
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
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to link with the Steam ID (optional)')
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
    
    // Extend subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('extend')
        .setDescription('Extend whitelist duration for a user')
        .addIntegerOption(option =>
          option.setName('months')
            .setDescription('Number of months to extend')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(24))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to extend')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to extend')
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
            .setRequired(false))),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
        case 'grant':
          await handleGrant(interaction);
          break;
        case 'info':
          await handleInfo(interaction);
          break;
        case 'extend':
          await handleExtend(interaction);
          break;
        case 'revoke':
          await handleRevoke(interaction);
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
  const steamid = interaction.options.getString('steamid');
  const discordUser = interaction.options.getUser('user');

  try {
    // Step 1: Resolve user information first (steamid is now required)
    const userInfo = await resolveUserInfo(steamid, discordUser, true);

    // Step 2: Show reason selection embed
    const reasonEmbed = createResponseEmbed({
      title: '🎯 Select Whitelist Type',
      description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nPlease select the type of whitelist to grant:`,
      color: 0x3498db
    });

    const reasonSelect = new StringSelectMenuBuilder()
      .setCustomId('whitelist_reason_select')
      .setPlaceholder('Choose whitelist type...')
      .addOptions([
        {
          label: '🎖️ Service Member',
          description: 'Automatic 6 months whitelist',
          value: 'service-member'
        },
        {
          label: '🚑 First Responder', 
          description: 'Automatic 6 months whitelist',
          value: 'first-responder'
        },
        {
          label: '💎 Donator',
          description: 'Custom duration whitelist',
          value: 'donator'
        },
        {
          label: '📋 Reporting',
          description: 'Custom days whitelist',
          value: 'reporting'
        }
      ]);

    const reasonRow = new ActionRowBuilder().addComponents(reasonSelect);

    await interaction.reply({
      embeds: [reasonEmbed],
      components: [reasonRow],
      flags: MessageFlags.Ephemeral
    });

    // Step 3: Handle reason selection and show duration options
    const reasonCollector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === 'whitelist_reason_select' && i.user.id === interaction.user.id,
      time: 300000 // 5 minutes
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
          originalUser: interaction.user
        });
      } catch (error) {
        loggerConsole.error('Error handling reason selection:', error);
        if (!reasonInteraction.replied && !reasonInteraction.deferred) {
          try {
            await reasonInteraction.reply({
              content: '❌ An error occurred while processing your selection. Please try again.',
              flags: MessageFlags.Ephemeral
            });
          } catch (replyError) {
            loggerConsole.error('Failed to send error reply:', replyError);
          }
        }
      }
    });

    reasonCollector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        interaction.editReply({
          content: '❌ Whitelist grant timed out. Please try again.',
          embeds: [],
          components: []
        });
      }
    });

  } catch (error) {
    loggerConsole.error('Whitelist grant error:', error);
    await sendError(interaction, error.message);
  }
}

async function handleDurationSelection(interaction, grantData) {
  const { reason, discordUser, userInfo, originalUser } = grantData;

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
  
  const durationEmbed = createResponseEmbed({
    title: '💎 Donator Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the donator whitelist duration:`,
    color: 0xe91e63
  });

  const durationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('donator_6m')
        .setLabel('6 Months')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📅'),
      new ButtonBuilder()
        .setCustomId('donator_1y')
        .setLabel('1 Year')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🗓️')
    );

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration button selection
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === 'donator_6m' || i.customId === 'donator_1y') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (buttonInteraction) => {
    try {
      const duration = buttonInteraction.customId === 'donator_6m' ? { value: 6, type: 'months', text: '6 months' } : { value: 12, type: 'months', text: '1 year' };
      
      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }
      await handleConfirmation(buttonInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
    } catch (error) {
      loggerConsole.error('Error handling donator duration selection:', error);
    }
  });
}

async function showReportingDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;
  
  const durationEmbed = createResponseEmbed({
    title: '📋 Reporting Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the reporting whitelist duration:`,
    color: 0xff9800
  });

  const durationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reporting_3d')
        .setLabel('3 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🕐'),
      new ButtonBuilder()
        .setCustomId('reporting_7d')
        .setLabel('7 Days')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📅'),
      new ButtonBuilder()
        .setCustomId('reporting_14d')
        .setLabel('14 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗓️'),
      new ButtonBuilder()
        .setCustomId('reporting_30d')
        .setLabel('30 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📆'),
      new ButtonBuilder()
        .setCustomId('reporting_custom')
        .setLabel('Custom')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️')
    );

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration button selection
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId.startsWith('reporting_') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === 'reporting_custom') {
      // Show modal for custom duration input
      const customDaysModal = new ModalBuilder()
        .setCustomId('reporting_custom_modal')
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

      await buttonInteraction.showModal(customDaysModal);

      // Handle modal submission
      const modalCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Modal,
        filter: (i) => i.customId === 'reporting_custom_modal' && i.user.id === grantData.originalUser.id,
        time: 300000
      });

      // Create a more specific modal filter
      try {
        const modalResponse = await buttonInteraction.awaitModalSubmit({
          filter: (i) => i.customId === 'reporting_custom_modal' && i.user.id === grantData.originalUser.id,
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

    // Handle preset duration buttons
    try {
      const durationMap = {
        'reporting_3d': { value: 3, type: 'days', text: '3 days' },
        'reporting_7d': { value: 7, type: 'days', text: '7 days' },
        'reporting_14d': { value: 14, type: 'days', text: '14 days' },
        'reporting_30d': { value: 30, type: 'days', text: '30 days' }
      };
      
      const duration = durationMap[buttonInteraction.customId];
      
      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }
      await handleConfirmation(buttonInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
    } catch (error) {
      loggerConsole.error('Error handling reporting duration selection:', error);
    }
  });
}

async function handleConfirmation(interaction, grantData) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText } = grantData;
  
  const confirmEmbed = createResponseEmbed({
    title: '✅ Confirm Whitelist Grant',
    description: 'Please confirm the whitelist details below:',
    fields: [
      { name: 'Discord User', value: discordUser ? `<@${discordUser.id}>` : 'Not linked', inline: true },
      { name: 'Steam ID', value: userInfo.steamid64, inline: true },
      { name: 'Type', value: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
      { name: 'Duration', value: durationText, inline: true },
      { name: 'Granted By', value: `<@${grantData.originalUser.id}>`, inline: true }
    ],
    color: 0x4caf50
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_grant')
        .setLabel('Confirm & Grant')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_grant')
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
    filter: (i) => (i.customId === 'confirm_grant' || i.customId === 'cancel_grant') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    try {
      if (buttonInteraction.customId === 'cancel_grant') {
        await buttonInteraction.update({
          content: '❌ Whitelist grant cancelled.',
          embeds: [],
          components: []
        });
        return;
      }

      // Process the actual grant
      // Don't defer if we've already updated the interaction above
      if (!buttonInteraction.deferred && !buttonInteraction.replied && buttonInteraction.customId !== 'whitelist_cancel') {
        await buttonInteraction.deferUpdate();
      }
      await processWhitelistGrant(buttonInteraction, {
        ...grantData,
        durationValue,
        durationType,
        durationText
      });
    } catch (error) {
      loggerConsole.error('Error handling confirmation:', error);
    }
  });
}

async function processWhitelistGrant(interaction, grantData) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText } = grantData;

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

    // Log to Discord
    await logWhitelistOperation(interaction.client, 'grant', {
      id: discordUser?.id || 'unknown',
      tag: discordUser?.tag || 'Unknown User'
    }, userInfo.steamid64, {
      whitelistType: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      duration: durationText,
      grantedBy: `<@${grantData.originalUser.id}>`,
      expiration: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never'
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
      title: '✅ Whitelist Granted Successfully',
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
      const roleName = reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
      successEmbed.addFields({ name: 'Discord Role', value: `✅ ${roleName} role assigned`, inline: true });
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
        title: '✅ Whitelist Granted',
        description: `${discordUser ? `<@${discordUser.id}>` : `Steam ID \`${userInfo.steamid64}\``} has been granted **${reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}** whitelist access`,
        fields: [
          { name: 'Duration', value: durationText, inline: true },
          { name: 'Granted By', value: `<@${grantData.originalUser.id}>`, inline: true }
        ],
        color: 0x00ff00
      });

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
    await interaction.deferReply(); // Non-ephemeral defer
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser, hasLink, hasWhitelistHistory } = await resolveUserForInfo(steamid, discordUser);

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
    let finalStatus, finalColor, hasActiveWhitelist;

    if (authorityStatus) {
      // Use authority service result as primary source of truth
      hasActiveWhitelist = authorityStatus.isWhitelisted;

      if (authorityStatus.isWhitelisted) {
        const source = authorityStatus.effectiveStatus.primarySource;

        if (source === 'role_based') {
          // Role-based whitelist (already validated by authority service)
          const group = authorityStatus.sources.roleBased.group;
          finalStatus = `Active (permanent - ${group})`;
          finalColor = 0x9C27B0; // Purple for staff role-based
        } else if (source === 'database') {
          // Database whitelist
          finalStatus = authorityStatus.sources.database.isActive ?
            `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})` :
            'Active (database)';
          finalColor = 0x00FF00; // Green for database whitelist
        }
      } else {
        // Not whitelisted - show specific reason
        const reason = authorityStatus.effectiveStatus.reason;

        if (reason === 'security_blocked_insufficient_confidence') {
          const details = authorityStatus.effectiveStatus.details;
          finalStatus = `Inactive - Steam link confidence too low (${details.actualConfidence}/1.0 required, has ${details.group} role)`;
          finalColor = 0xFF6600; // Orange-red for security blocked
        } else if (reason === 'no_steam_account_linked') {
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
        hasActiveWhitelist = false;
      } else if (whitelistStatus.hasWhitelist) {
        finalStatus = whitelistStatus.status;
        finalColor = 0x00FF00;
        hasActiveWhitelist = true;
      } else {
        finalStatus = whitelistStatus.status;
        finalColor = 0xFF0000;
        hasActiveWhitelist = false;
      }
    }

    const embed = createResponseEmbed({
      title: '📋 Whitelist Status',
      description: `Whitelist information for ${resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'user'}`,
      fields: [
        { name: 'Steam ID', value: resolvedSteamId || 'Not linked', inline: true },
        { name: 'Status', value: finalStatus, inline: true },
        { name: 'Account Link', value: hasLink ? '✅ Linked' : '❌ Not linked', inline: true }
      ],
      color: finalColor
    });

    // Add whitelist source info using authority service data
    if (authorityStatus && authorityStatus.isWhitelisted) {
      const source = authorityStatus.effectiveStatus.primarySource;

      if (source === 'role_based') {
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

    // Add link confidence info if available
    if (authorityStatus?.linkInfo) {
      embed.addFields({
        name: 'Account Link',
        value: `Confidence: ${authorityStatus.linkInfo.confidence}/1.0 (${authorityStatus.linkInfo.source})`,
        inline: true
      });
    }

    // Show whitelist details using authority service data
    let whitelistEntries = [];
    const hasRoleBasedAccessForEntries = authorityStatus?.sources?.roleBased?.isActive;

    // Add role-based entry if present and active
    if (hasRoleBasedAccessForEntries) {
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
    if (authorityStatus && !authorityStatus.isWhitelisted) {
      const reason = authorityStatus.effectiveStatus.reason;

      if (reason === 'security_blocked_insufficient_confidence') {
        const details = authorityStatus.effectiveStatus.details;
        embed.addFields({
          name: '🚨 Security Warning',
          value: `You have the ${details.group} role but your Steam account link has insufficient confidence (${details.actualConfidence}/1.0). Staff whitelist requires high-confidence linking. Use \`/linkid\` to create a proper link.`,
          inline: false
        });
      } else if (reason === 'no_steam_account_linked') {
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
    await interaction.editReply({
      content: `❌ Failed to retrieve whitelist status: ${error.message}`
    });
  }
}

async function handleExtend(interaction) {
  await withLoadingMessage(interaction, 'Extending whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const months = interaction.options.getInteger('months');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

    // Ensure we have a Steam ID for extension
    if (!resolvedSteamId) {
      throw new Error('No Steam ID found. Please provide a Steam ID or link the Discord account first.');
    }

    // Extend the whitelist
    const extensionEntry = await Whitelist.extendWhitelist(
      resolvedSteamId,
      months,
      interaction.user.id
    );

    // Note: Extensions don't assign new roles - user should already have appropriate role from initial grant

    const embed = createResponseEmbed({
      title: '⏰ Whitelist Extended',
      description: 'Successfully extended whitelist access',
      fields: [
        { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Extension', value: `${months} month${months > 1 ? 's' : ''}`, inline: true },
        { name: 'New Entry Expires', value: extensionEntry.expiration.toLocaleDateString(), inline: true },
        { name: 'Extended By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0x0099FF
    });

    await sendSuccess(interaction, 'Whitelist extended successfully!', embed);
  });
}

async function handleRevoke(interaction) {
  await withLoadingMessage(interaction, 'Revoking whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

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