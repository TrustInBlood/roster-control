const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const { Whitelist, AuditLog } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { getHighestPriorityGroup, isDevelopment } = require('../utils/environment');
const { getAllAdminRoles } = require(isDevelopment ? '../../config/discordRoles.development' : '../../config/discordRoles');
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

// Helper function to get role ID based on whitelist reason
function getRoleForReason(reason) {
  const roleMapping = {
    'service-member': WHITELIST_AWARD_ROLES.SERVICE_MEMBER,
    'first-responder': WHITELIST_AWARD_ROLES.FIRST_RESPONDER,
    'donator': WHITELIST_AWARD_ROLES.DONATOR,
  };
  return roleMapping[reason] || null;
}

// Helper function to calculate expiration date from duration
function calculateExpirationDate(grantedAt, durationValue, durationType) {
  const grantedDate = new Date(grantedAt);
  const expiration = new Date(grantedDate);

  if (durationType === 'days') {
    expiration.setDate(expiration.getDate() + durationValue);
  } else if (durationType === 'months') {
    expiration.setMonth(expiration.getMonth() + durationValue);
  } else if (durationType === 'hours') {
    const millisecondsPerHour = 60 * 60 * 1000;
    return new Date(grantedDate.getTime() + (durationValue * millisecondsPerHour));
  }

  return expiration;
}

// Helper function to format duration for display
function formatDuration(durationValue, durationType) {
  if (!durationValue || !durationType) return null;

  if (durationType === 'hours') {
    const days = durationValue / 24;
    if (days === Math.floor(days)) {
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    } else {
      return `${days.toFixed(2)} days`;
    }
  } else if (durationType === 'days') {
    return `${durationValue} ${durationValue === 1 ? 'day' : 'days'}`;
  } else if (durationType === 'months') {
    return `${durationValue} ${durationValue === 1 ? 'month' : 'months'}`;
  }

  return `${durationValue} ${durationType}`;
}

// Helper function to redact email addresses from text
function redactEmails(text) {
  if (!text) return text;
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return text.replace(emailPattern, '[email redacted]');
}

// Helper function to get user info from steamid or discord user (with auto-linking)
async function resolveUserInfo(steamid, discordUser, createLink = false) {
  let resolvedSteamId = steamid;
  let discordUsername = null;
  let username = null;
  let linkedAccount = false;

  if (discordUser) {
    discordUsername = `${discordUser.username}#${discordUser.discriminator}`;
    username = discordUser.displayName || discordUser.username;
  }

  if (!resolvedSteamId && discordUser) {
    resolvedSteamId = await resolveSteamIdFromDiscord(discordUser.id);
    if (!resolvedSteamId) {
      throw new Error('Steam ID is required. No linked account found for this Discord user.');
    }
  }

  if (!isValidSteamId(resolvedSteamId)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  if (createLink && discordUser && resolvedSteamId) {
    const linkResult = await createOrUpdateLink(
      discordUser.id,
      resolvedSteamId,
      null,
      username,
      0.5,
      discordUser
    );

    if (!linkResult.error) {
      linkedAccount = linkResult.created ? 'created' : 'updated';
    } else {
      loggerConsole.error(`Failed to create/update account link for ${discordUser.id} <-> ${resolvedSteamId}:`, linkResult.error);
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
      linkedAccount = 'failed';
    }
  }

  return {
    steamid64: resolvedSteamId,
    discord_username: discordUsername,
    username: username,
    linkedAccount: linkedAccount
  };
}

// Helper function for info command - works with either user OR steamid
async function resolveUserForInfo(steamid, discordUser, interaction = null) {
  const userInfo = await getUserInfo({
    discordUserId: discordUser?.id,
    steamid64: steamid,
    username: discordUser?.displayName || discordUser?.username
  });

  if (!userInfo.steamid64 && !steamid && discordUser) {
    return {
      steamid64: null,
      discordUser: discordUser,
      hasLink: false,
      hasWhitelistHistory: false
    };
  }

  if (!userInfo.steamid64 && !discordUser) {
    throw new Error('Please provide either a Discord user or Steam ID to check.');
  }

  if (userInfo.steamid64 && !isValidSteamId(userInfo.steamid64)) {
    throw new Error('Invalid Steam ID format. Please provide a valid Steam ID64.');
  }

  let resolvedDiscordUser = discordUser;
  if (!discordUser && userInfo.discordUserId && interaction?.client) {
    try {
      resolvedDiscordUser = await interaction.client.users.fetch(userInfo.discordUserId);
    } catch (error) {
      loggerConsole.warn('Failed to fetch Discord user from resolved ID', {
        discordUserId: userInfo.discordUserId,
        steamId: userInfo.steamid64,
        error: error.message
      });
    }
  }

  return {
    steamid64: userInfo.steamid64,
    discordUser: resolvedDiscordUser,
    discordUserId: userInfo.discordUserId,
    hasLink: userInfo.hasLink,
    hasWhitelistHistory: userInfo.hasWhitelistHistory
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wl')
    .setDescription('Open interactive whitelist management dashboard')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to manage')
        .setRequired(true)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await handleDashboard(interaction);
      } catch (error) {
        loggerConsole.error('WL dashboard command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the dashboard command.');
      }
    });
  }
};

async function handleDashboard(interaction) {
  const targetUser = interaction.options.getUser('user');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Resolve user info
  let steamid64 = null;
  let hasLink = false;
  let authorityStatus = null;
  let member = null;

  try {
    const userInfo = await resolveUserForInfo(null, targetUser, interaction);
    steamid64 = userInfo.steamid64;
    hasLink = userInfo.hasLink;
  } catch (error) {
    // User may not have a linked Steam account - that's okay
    loggerConsole.debug('Could not resolve Steam ID for user', { userId: targetUser.id, error: error.message });
  }

  // Get whitelist status via WhitelistAuthorityService
  try {
    member = await interaction.guild.members.fetch(targetUser.id);
    authorityStatus = await WhitelistAuthorityService.getWhitelistStatus(
      targetUser.id,
      steamid64,
      member
    );
  } catch (error) {
    loggerConsole.debug('Could not get authority status', { userId: targetUser.id, error: error.message });
  }

  // Get active whitelist entries count
  let activeEntriesCount = 0;
  if (steamid64) {
    try {
      const history = await Whitelist.findAll({
        where: { steamid64: steamid64, revoked: false, approved: true }
      });
      const now = new Date();
      activeEntriesCount = history.filter(entry => {
        if (!entry.duration_value || !entry.duration_type) {
          return entry.duration_value !== 0;
        }
        const expirationDate = calculateExpirationDate(entry.granted_at, entry.duration_value, entry.duration_type);
        return expirationDate > now;
      }).length;
    } catch (error) {
      loggerConsole.debug('Could not get whitelist history', { steamid64, error: error.message });
    }
  }

  // Build dashboard embed
  const dashboardEmbed = createDashboardEmbed(targetUser, steamid64, hasLink, authorityStatus, activeEntriesCount);

  // Check if invoking user has admin permissions for revoke
  const adminRoles = getAllAdminRoles();
  const invokerMember = await interaction.guild.members.fetch(interaction.user.id);
  const canRevoke = invokerMember.roles.cache.some(role => adminRoles.includes(role.id));

  // Create buttons with unique IDs
  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const grantButtonId = `wl_grant_${uniqueId}`;
  const infoButtonId = `wl_info_${uniqueId}`;
  const revokeButtonId = `wl_revoke_${uniqueId}`;

  const hasActiveWhitelist = authorityStatus?.isWhitelisted || activeEntriesCount > 0;

  const buttonRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(grantButtonId)
        .setLabel('Grant')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(infoButtonId)
        .setLabel('Info')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(revokeButtonId)
        .setLabel('Revoke')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasActiveWhitelist || !canRevoke)
    );

  await interaction.editReply({
    embeds: [dashboardEmbed],
    components: [buttonRow]
  });

  // Set up button collectors
  const buttonCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === grantButtonId || i.customId === infoButtonId || i.customId === revokeButtonId) && i.user.id === interaction.user.id,
    time: 300000 // 5 minutes
  });

  buttonCollector.on('collect', async (buttonInteraction) => {
    try {
      if (buttonInteraction.customId === grantButtonId) {
        buttonCollector.stop('grant_started');
        await handleGrantButton(buttonInteraction, targetUser, steamid64, hasLink, interaction);
      } else if (buttonInteraction.customId === infoButtonId) {
        await handleInfoButton(buttonInteraction, targetUser, steamid64, authorityStatus, interaction);
      } else if (buttonInteraction.customId === revokeButtonId) {
        buttonCollector.stop('revoke_started');
        await handleRevokeButton(buttonInteraction, targetUser, steamid64, interaction);
      }
    } catch (error) {
      loggerConsole.error('Error handling dashboard button:', error);
      if (error.code === 10062 || error.rawError?.code === 10062) {
        return;
      }
      try {
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: 'An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (replyError) {
        loggerConsole.error('Failed to send error reply:', replyError);
      }
    }
  });

  buttonCollector.on('end', (collected, reason) => {
    if (reason === 'time') {
      try {
        interaction.editReply({
          content: 'Dashboard timed out. Use `/wl` again to open a new dashboard.',
          embeds: [],
          components: []
        }).catch(() => {});
      } catch (error) {
        // Ignore errors when trying to update expired interaction
      }
    }
  });
}

function createDashboardEmbed(targetUser, steamid64, hasLink, authorityStatus, activeEntriesCount) {
  // Determine status and color
  let statusText = 'Inactive';
  let color = 0xFF0000; // Red - no whitelist

  if (authorityStatus?.isWhitelisted) {
    color = 0x00FF00; // Green - active
    if (authorityStatus.effectiveStatus?.isPermanent) {
      statusText = 'Active (permanent)';
    } else if (authorityStatus.effectiveStatus?.expiration) {
      const now = new Date();
      const daysRemaining = Math.ceil((new Date(authorityStatus.effectiveStatus.expiration) - now) / (1000 * 60 * 60 * 24));
      statusText = `Active (${daysRemaining} days remaining)`;
    } else {
      statusText = 'Active';
    }
  } else if (hasLink) {
    color = 0xFFA500; // Orange - has link but no whitelist
  }

  // Build link status string
  let linkStatus = 'Not linked';
  if (authorityStatus?.linkInfo) {
    const conf = authorityStatus.linkInfo.confidence;
    linkStatus = conf >= 1.0 ? `Verified (${conf})` : `Linked (${conf})`;
  } else if (hasLink) {
    linkStatus = 'Linked';
  }

  return createResponseEmbed({
    title: 'Whitelist Dashboard',
    description: `Managing whitelist for <@${targetUser.id}>`,
    fields: [
      { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
      { name: 'Steam ID', value: steamid64 || 'Not linked', inline: true },
      { name: 'Account Link', value: linkStatus, inline: true },
      { name: 'Status', value: statusText, inline: true },
      { name: 'Active Entries', value: activeEntriesCount.toString(), inline: true }
    ],
    color: color,
    footer: { text: 'Click a button below to manage this user\'s whitelist' }
  });
}

async function handleGrantButton(buttonInteraction, targetUser, steamid64, hasLink, originalInteraction) {
  if (!steamid64) {
    // No Steam ID linked - show modal to enter Steam ID
    await showSteamIdModal(buttonInteraction, targetUser, originalInteraction);
  } else {
    // Has Steam ID - proceed directly to reason selection
    await buttonInteraction.deferUpdate();
    const userInfo = {
      steamid64: steamid64,
      discord_username: `${targetUser.username}#${targetUser.discriminator}`,
      username: targetUser.displayName || targetUser.username,
      linkedAccount: false
    };
    await showReasonSelectionButtons(originalInteraction, {
      discordUser: targetUser,
      userInfo: userInfo,
      originalUser: originalInteraction.user,
      isSteamIdOnly: false
    });
  }
}

async function showSteamIdModal(buttonInteraction, targetUser, originalInteraction) {
  const uniqueId = `${buttonInteraction.id}_${buttonInteraction.user.id}_${Date.now()}`;
  const modalId = `steam_id_modal_${uniqueId}`;

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle('Enter Steam ID');

  const steamIdInput = new TextInputBuilder()
    .setCustomId('steam_id_input')
    .setLabel('Steam ID64')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 76561198012345678')
    .setRequired(true)
    .setMinLength(17)
    .setMaxLength(17);

  const inputRow = new ActionRowBuilder().addComponents(steamIdInput);
  modal.addComponents(inputRow);

  await buttonInteraction.showModal(modal);

  // Wait for modal submission
  try {
    const modalSubmission = await buttonInteraction.awaitModalSubmit({
      filter: (i) => i.customId === modalId && i.user.id === buttonInteraction.user.id,
      time: 120000
    });

    const steamId = modalSubmission.values[0] || modalSubmission.fields.getTextInputValue('steam_id_input');

    if (!isValidSteamId(steamId)) {
      await modalSubmission.reply({
        content: 'Invalid Steam ID format. Please provide a valid Steam ID64 (17 digits).',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await modalSubmission.deferUpdate();

    // Create user info and proceed to reason selection
    let userInfo;
    try {
      userInfo = await resolveUserInfo(steamId, targetUser, true);
    } catch (error) {
      await originalInteraction.editReply({
        content: `Failed to resolve user info: ${error.message}`,
        embeds: [],
        components: []
      });
      return;
    }

    await showReasonSelectionButtons(originalInteraction, {
      discordUser: targetUser,
      userInfo: userInfo,
      originalUser: originalInteraction.user,
      isSteamIdOnly: false
    });

  } catch (error) {
    if (error.code === 'InteractionCollectorError') {
      // Modal timed out - update the original message
      try {
        await originalInteraction.editReply({
          content: 'Steam ID input timed out. Use `/wl` to try again.',
          embeds: [],
          components: []
        });
      } catch (editError) {
        // Ignore if can't edit
      }
    } else {
      throw error;
    }
  }
}

async function showReasonSelectionButtons(interaction, grantData) {
  const { discordUser, userInfo, originalUser, isSteamIdOnly } = grantData;

  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const reasonSelectId = `reason_select_${uniqueId}`;

  const reasonEmbed = createResponseEmbed({
    title: 'Select Whitelist Type',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}${isSteamIdOnly ? '\n\n**Steam ID Only Grant** - No account linking will occur' : ''}\n\nPlease select the type of whitelist to grant:`,
    color: isSteamIdOnly ? 0xffa500 : 0x3498db
  });

  const reasonSelect = new StringSelectMenuBuilder()
    .setCustomId(reasonSelectId)
    .setPlaceholder('Select whitelist type')
    .addOptions([
      {
        label: 'Service Member',
        description: 'Military service member (1 year default)',
        value: 'service-member',
        emoji: '🎖️'
      },
      {
        label: 'First Responder',
        description: 'Emergency service personnel (1 year default)',
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
      },
      {
        label: 'Custom',
        description: 'Custom reason and duration',
        value: 'custom',
        emoji: '⚙️'
      }
    ]);

  const reasonRow = new ActionRowBuilder().addComponents(reasonSelect);

  await interaction.editReply({
    embeds: [reasonEmbed],
    components: [reasonRow]
  });

  // Handle reason selection
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
        isSteamIdOnly,
        originalInteraction: interaction
      });
      reasonCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling reason selection:', error);
      if (error.code === 10062 || error.rawError?.code === 10062) {
        reasonCollector.stop('expired');
        return;
      }
      if (error.code === 40060 || error.rawError?.code === 40060) {
        reasonCollector.stop('acknowledged');
        return;
      }
    }
  });

  reasonCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      try {
        interaction.editReply({
          content: 'Whitelist grant timed out. Please try again.',
          embeds: [],
          components: []
        });
      } catch (error) {
        // Ignore
      }
    }
  });
}

async function handleDurationSelection(interaction, grantData) {
  const { reason, originalInteraction } = grantData;

  switch (reason) {
  case 'service-member':
  case 'first-responder':
    await handleConfirmation(originalInteraction || interaction, {
      ...grantData,
      durationValue: 12,
      durationType: 'months',
      durationText: '1 year'
    });
    break;

  case 'donator':
    await showDonatorDurationSelection(originalInteraction || interaction, grantData);
    break;

  case 'reporting':
    await showReportingDurationSelection(originalInteraction || interaction, grantData);
    break;

  case 'custom':
    await showCustomWhitelistSelection(originalInteraction || interaction, grantData);
    break;

  default:
    await (originalInteraction || interaction).editReply({
      content: 'Invalid whitelist type selected.',
      embeds: [],
      components: []
    });
  }
}

async function showDonatorDurationSelection(interaction, grantData) {
  const { discordUser, userInfo, originalUser } = grantData;

  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const donatorDurationId = `donator_duration_${uniqueId}`;

  const durationEmbed = createResponseEmbed({
    title: 'Donator Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the donator whitelist duration:`,
    color: 0xe91e63
  });

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId(donatorDurationId)
    .setPlaceholder('Select duration')
    .addOptions([
      { label: '6 Months', description: '6 month donator access', value: '6m', emoji: '📅' },
      { label: '1 Year', description: '1 year donator access', value: '1y', emoji: '🗓️' }
    ]);

  const durationRow = new ActionRowBuilder().addComponents(durationSelect);

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === donatorDurationId && i.user.id === originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (selectInteraction) => {
    const selection = selectInteraction.values[0];
    let durationValue, durationType, durationText;

    if (selection === '6m') {
      durationValue = 6;
      durationType = 'months';
      durationText = '6 months';
    } else {
      durationValue = 12;
      durationType = 'months';
      durationText = '1 year';
    }

    try {
      await selectInteraction.deferUpdate();
      await handleConfirmation(interaction, {
        ...grantData,
        durationValue,
        durationType,
        durationText
      });
      durationCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling donator duration:', error);
      durationCollector.stop('error');
    }
  });
}

async function showReportingDurationSelection(interaction, grantData) {
  const { discordUser, userInfo, originalUser } = grantData;

  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const reportingDurationId = `reporting_duration_${uniqueId}`;

  const durationEmbed = createResponseEmbed({
    title: 'Reporting Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the reporting whitelist duration:`,
    color: 0x9c27b0
  });

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId(reportingDurationId)
    .setPlaceholder('Select duration')
    .addOptions([
      { label: '3 Days', description: '3 day reporting access', value: '3d' },
      { label: '7 Days', description: '7 day reporting access', value: '7d' },
      { label: '14 Days', description: '14 day reporting access', value: '14d' },
      { label: '30 Days', description: '30 day reporting access', value: '30d' }
    ]);

  const durationRow = new ActionRowBuilder().addComponents(durationSelect);

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === reportingDurationId && i.user.id === originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (selectInteraction) => {
    const selection = selectInteraction.values[0];
    const daysMap = { '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
    const durationValue = daysMap[selection];

    try {
      await selectInteraction.deferUpdate();
      await handleConfirmation(interaction, {
        ...grantData,
        durationValue,
        durationType: 'days',
        durationText: `${durationValue} days`
      });
      durationCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling reporting duration:', error);
      durationCollector.stop('error');
    }
  });
}

async function showCustomWhitelistSelection(interaction, grantData) {
  const { discordUser, userInfo, originalUser } = grantData;

  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const customDurationId = `custom_duration_${uniqueId}`;

  const durationEmbed = createResponseEmbed({
    title: 'Custom Whitelist Duration',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the custom whitelist duration:`,
    color: 0x607d8b
  });

  const durationSelect = new StringSelectMenuBuilder()
    .setCustomId(customDurationId)
    .setPlaceholder('Select duration')
    .addOptions([
      { label: '1 Week', description: '7 day access', value: '7d' },
      { label: '2 Weeks', description: '14 day access', value: '14d' },
      { label: '1 Month', description: '30 day access', value: '30d' },
      { label: '3 Months', description: '90 day access', value: '90d' }
    ]);

  const durationRow = new ActionRowBuilder().addComponents(durationSelect);

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === customDurationId && i.user.id === originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (selectInteraction) => {
    const selection = selectInteraction.values[0];
    const daysMap = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
    const durationValue = daysMap[selection];

    try {
      await selectInteraction.deferUpdate();
      await handleConfirmation(interaction, {
        ...grantData,
        durationValue,
        durationType: 'days',
        durationText: `${durationValue} days`
      });
      durationCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling custom duration:', error);
      durationCollector.stop('error');
    }
  });
}

async function handleConfirmation(interaction, grantData) {
  const uniqueId = `${interaction.id}_${interaction.user.id}_${Date.now()}`;
  const confirmGrantId = `confirm_grant_${uniqueId}`;
  const cancelGrantId = `cancel_grant_${uniqueId}`;

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
    title: 'Confirm Whitelist Grant',
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
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(cancelGrantId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [confirmRow]
  });

  const confirmCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === confirmGrantId || i.customId === cancelGrantId) && i.user.id === capturedGrantData.originalUser.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    try {
      if (buttonInteraction.customId === cancelGrantId) {
        await buttonInteraction.update({
          content: 'Whitelist grant cancelled.',
          embeds: [],
          components: []
        });
        confirmCollector.stop('cancelled');
        return;
      }

      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }
      await processWhitelistGrant(buttonInteraction, capturedGrantData, interaction);
      confirmCollector.stop('completed');
    } catch (error) {
      loggerConsole.error('Error handling confirmation:', error);
      if (error.code === 10062 || error.rawError?.code === 10062) {
        confirmCollector.stop('expired');
        return;
      }
    }
  });
}

async function processWhitelistGrant(buttonInteraction, grantData, originalInteraction) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText, isSteamIdOnly } = grantData;
  const interaction = originalInteraction || buttonInteraction;

  await interaction.editReply({
    content: 'Processing whitelist grant...',
    embeds: [],
    components: []
  });

  try {
    const whitelistEntry = await Whitelist.grantWhitelist({
      steamid64: userInfo.steamid64,
      username: userInfo.username,
      discord_username: discordUser ? userInfo.discord_username : null,
      reason: reason,
      duration_value: durationValue,
      duration_type: durationType,
      granted_by: grantData.originalUser.id
    });

    await logWhitelistOperation(interaction.client, 'grant', {
      id: discordUser?.id || 'unknown',
      tag: discordUser?.tag || 'Unknown User'
    }, userInfo.steamid64, {
      whitelistType: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      duration: durationText,
      grantedBy: `<@${grantData.originalUser.id}>`,
      expiration: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never',
      steamIdOnly: isSteamIdOnly || false
    });

    await AuditLog.logAction({
      actionType: 'whitelist_grant',
      actorType: 'discord_user',
      actorId: grantData.originalUser.id,
      actorName: grantData.originalUser.username || grantData.originalUser.tag,
      targetType: 'player',
      targetId: userInfo.steamid64,
      targetName: userInfo.username || userInfo.steamid64,
      description: `Granted ${reason.replace('-', ' ')} whitelist via Discord command`,
      afterState: {
        duration_value: durationValue,
        duration_type: durationType,
        reason: reason,
        expiration: whitelistEntry.expiration?.toISOString() || null
      },
      metadata: {
        source: 'discord_command',
        isSteamIdOnly: isSteamIdOnly || false,
        discord_user_id: discordUser?.id || null
      }
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
      const assignedRoleId = getRoleForReason(reason);
      successEmbed.addFields({
        name: 'Discord Role Granted',
        value: assignedRoleId ? `<@&${assignedRoleId}> role has been assigned` : 'Role assigned',
        inline: false
      });
    }

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: []
    });

    // Send public announcement
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

      await interaction.followUp({
        embeds: [publicEmbed]
      });
    } catch (publicError) {
      loggerConsole.error('Failed to send public whitelist announcement:', publicError);
    }

  } catch (error) {
    loggerConsole.error('Whitelist grant processing error:', error);
    await interaction.editReply({
      content: `Failed to grant whitelist: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

async function handleInfoButton(buttonInteraction, targetUser, steamid64, authorityStatus, originalInteraction) {
  await buttonInteraction.deferUpdate();

  // Get whitelist history
  let history = [];
  if (steamid64) {
    history = await Whitelist.findAll({
      where: { steamid64: steamid64 },
      order: [['granted_at', 'DESC']]
    });
  }

  const now = new Date();
  const activeEntries = history.filter(entry => {
    if (entry.revoked) return false;
    if (!entry.duration_value || !entry.duration_type) {
      return entry.duration_value !== 0;
    }
    const expirationDate = calculateExpirationDate(entry.granted_at, entry.duration_value, entry.duration_type);
    return expirationDate > now;
  });

  // Determine status
  let finalStatus, finalColor;

  if (authorityStatus && authorityStatus.effectiveStatus) {
    if (authorityStatus.isWhitelisted) {
      const source = authorityStatus.effectiveStatus.primarySource;
      if (source === 'role_based' && authorityStatus.sources?.roleBased) {
        const group = authorityStatus.sources.roleBased.group;
        finalStatus = `Active (permanent - ${group})`;
        finalColor = 0x9C27B0;
      } else if (source === 'database') {
        finalStatus = authorityStatus.sources?.database?.isActive ?
          `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})` :
          'Active (database)';
        finalColor = 0x00FF00;
      } else {
        finalStatus = `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})`;
        finalColor = 0x00FF00;
      }
    } else {
      finalStatus = 'No whitelist access';
      finalColor = 0xFF0000;
    }
  } else {
    finalStatus = steamid64 ? 'Unknown' : 'No Steam account linked';
    finalColor = 0xFF0000;
  }

  // Build link status
  let accountLinkStatus = 'Not linked';
  if (authorityStatus?.linkInfo) {
    const confidence = authorityStatus.linkInfo.confidence;
    accountLinkStatus = confidence >= 1.0 ? `Verified (${confidence})` : `Linked (${confidence})`;
  }

  const embed = createResponseEmbed({
    title: 'Whitelist Status',
    description: `Whitelist information for <@${targetUser.id}>`,
    fields: [
      { name: 'Steam ID', value: steamid64 || 'Not linked', inline: true },
      { name: 'Status', value: finalStatus, inline: true },
      { name: 'Account Link', value: accountLinkStatus, inline: true }
    ],
    color: finalColor
  });

  // Add active entries info
  if (activeEntries.length > 0) {
    const entriesInfo = activeEntries.slice(0, 5).map(entry => {
      const reason = redactEmails(entry.reason) || 'Unknown';
      if (!entry.duration_value || !entry.duration_type || entry.duration_value === 0) {
        return `- ${reason}: permanent`;
      }
      const durationDisplay = formatDuration(entry.duration_value, entry.duration_type);
      const grantedDate = new Date(entry.granted_at).toLocaleDateString();
      return `- ${reason}: ${durationDisplay} (granted ${grantedDate})`;
    });

    embed.addFields({
      name: `Active Entries (${activeEntries.length})`,
      value: entriesInfo.join('\n'),
      inline: false
    });
  }

  // Add back button
  const uniqueId = `${buttonInteraction.id}_${buttonInteraction.user.id}_${Date.now()}`;
  const backButtonId = `info_back_${uniqueId}`;

  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(backButtonId)
        .setLabel('Back to Dashboard')
        .setStyle(ButtonStyle.Secondary)
    );

  await originalInteraction.editReply({
    embeds: [embed],
    components: [backRow]
  });

  // Handle back button
  const backCollector = originalInteraction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === backButtonId && i.user.id === originalInteraction.user.id,
    time: 300000,
    max: 1
  });

  backCollector.on('collect', async (backButtonInteraction) => {
    try {
      await backButtonInteraction.deferUpdate();
      // Recreate the dashboard
      await handleDashboard(originalInteraction);
    } catch (error) {
      loggerConsole.error('Error returning to dashboard:', error);
    }
  });
}

async function handleRevokeButton(buttonInteraction, targetUser, steamid64, originalInteraction) {
  // Check if user has admin permissions for revoke
  const adminRoles = getAllAdminRoles();
  const member = await originalInteraction.guild.members.fetch(originalInteraction.user.id);
  const hasAdminRole = member.roles.cache.some(role => adminRoles.includes(role.id));

  if (!hasAdminRole) {
    await buttonInteraction.reply({
      content: 'You do not have permission to revoke whitelist entries. This action requires admin privileges.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!steamid64) {
    await buttonInteraction.reply({
      content: 'Cannot revoke whitelist - no Steam ID linked to this user.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const uniqueId = `${buttonInteraction.id}_${buttonInteraction.user.id}_${Date.now()}`;
  const confirmRevokeId = `confirm_revoke_${uniqueId}`;
  const cancelRevokeId = `cancel_revoke_${uniqueId}`;

  const confirmEmbed = createResponseEmbed({
    title: 'Confirm Whitelist Revocation',
    description: `Are you sure you want to revoke all whitelist entries for <@${targetUser.id}>?\n\n**Steam ID:** ${steamid64}`,
    color: 0xFF0000
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(confirmRevokeId)
        .setLabel('Confirm Revoke')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelRevokeId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

  await buttonInteraction.update({
    embeds: [confirmEmbed],
    components: [confirmRow]
  });

  const confirmCollector = originalInteraction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === confirmRevokeId || i.customId === cancelRevokeId) && i.user.id === originalInteraction.user.id,
    time: 60000,
    max: 1
  });

  confirmCollector.on('collect', async (confirmButtonInteraction) => {
    try {
      if (confirmButtonInteraction.customId === cancelRevokeId) {
        await confirmButtonInteraction.update({
          content: 'Revocation cancelled.',
          embeds: [],
          components: []
        });
        return;
      }

      await confirmButtonInteraction.deferUpdate();

      // Revoke the whitelist
      const revokedCount = await Whitelist.revokeWhitelist(
        steamid64,
        'Revoked via /wl dashboard',
        originalInteraction.user.id
      );

      if (revokedCount === 0) {
        await originalInteraction.editReply({
          content: 'No active whitelist entries found for this user.',
          embeds: [],
          components: []
        });
        return;
      }

      // Log to AuditLog
      await AuditLog.logAction({
        actionType: 'whitelist_revoke',
        actorType: 'discord_user',
        actorId: originalInteraction.user.id,
        actorName: originalInteraction.user.username || originalInteraction.user.tag,
        targetType: 'player',
        targetId: steamid64,
        targetName: targetUser?.username || steamid64,
        description: `Revoked ${revokedCount} whitelist entries via /wl dashboard`,
        afterState: {
          reason: 'Revoked via /wl dashboard',
          entries_revoked: revokedCount
        },
        metadata: {
          source: 'discord_command',
          discord_user_id: targetUser?.id || null
        }
      });

      // Remove Discord roles
      let rolesRemoved = [];
      try {
        const guild = originalInteraction.guild;
        const member = await guild.members.fetch(targetUser.id).catch(() => null);

        if (member) {
          const whitelistStatus = await Whitelist.getActiveWhitelistForUser(steamid64);

          if (!whitelistStatus.hasWhitelist) {
            for (const [reasonKey, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
              if (roleId && member.roles.cache.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                  await member.roles.remove(role, `Whitelist revoked by ${originalInteraction.user.tag}`);
                  rolesRemoved.push(reasonKey.toLowerCase().replace('_', ' '));
                }
              }
            }
          }
        }
      } catch (error) {
        loggerConsole.error('Failed to remove whitelist roles:', error);
      }

      const resultEmbed = createResponseEmbed({
        title: 'Whitelist Revoked',
        description: `Successfully revoked whitelist access${rolesRemoved.length > 0 ? ' and removed Discord roles' : ''}`,
        fields: [
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Steam ID', value: steamid64, inline: true },
          { name: 'Entries Revoked', value: revokedCount.toString(), inline: true },
          { name: 'Revoked By', value: `<@${originalInteraction.user.id}>`, inline: true }
        ],
        color: 0xFF0000
      });

      if (rolesRemoved.length > 0) {
        resultEmbed.addFields({
          name: 'Discord Roles Removed',
          value: rolesRemoved.join(', '),
          inline: false
        });
      }

      await originalInteraction.editReply({
        embeds: [resultEmbed],
        components: []
      });

    } catch (error) {
      loggerConsole.error('Error processing revocation:', error);
      await originalInteraction.editReply({
        content: `Failed to revoke whitelist: ${error.message}`,
        embeds: [],
        components: []
      });
    }
  });
}
