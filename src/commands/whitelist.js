const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { withLoadingMessage, createResponseEmbed, sendSuccess, sendError } = require('../utils/messageHandler');
const { Whitelist } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { 
  createOrUpdateLink, 
  resolveSteamIdFromDiscord, 
  resolveDiscordFromSteamId, 
  getUserInfo 
} = require('../utils/accountLinking');

// Helper function to validate Steam ID format
function isValidSteamId(steamid) {
  // Steam ID64 validation - 17 digits, typically starting with 76561197 or 76561198
  if (!steamid || typeof steamid !== 'string') return false;
  
  // Check if it's exactly 17 digits
  if (!/^[0-9]{17}$/.test(steamid)) return false;
  
  // Check if it starts with valid Steam ID64 prefixes
  return steamid.startsWith('76561197') || steamid.startsWith('76561198') || steamid.startsWith('76561199');
}

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

  // Create or update account link if both Discord and Steam info available
  if (createLink && discordUser && resolvedSteamId) {
    const linkResult = await createOrUpdateLink(
      discordUser.id, 
      resolvedSteamId, 
      null, // eosID
      username
    );
    
    if (!linkResult.error) {
      linkedAccount = linkResult.created ? 'created' : 'updated';
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
async function resolveUserForInfo(steamid, discordUser) {
  // Use the comprehensive getUserInfo function
  const userInfo = await getUserInfo({
    discordUserId: discordUser?.id,
    steamid64: steamid,
    username: discordUser?.displayName || discordUser?.username
  });

  // Validate that we have at least a Steam ID
  if (!userInfo.steamid64) {
    if (discordUser && !steamid) {
      throw new Error('No linked Steam account found for this Discord user. Please provide a Steam ID.');
    } else {
      throw new Error('Please provide either a Discord user or Steam ID to check.');
    }
  }

  if (!isValidSteamId(userInfo.steamid64)) {
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
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to grant whitelist')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user (optional if account is linked)')
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
        console.error('Whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the whitelist command.');
      }
    });
  }
};

async function handleGrant(interaction) {
  const discordUser = interaction.options.getUser('user');
  const steamid = interaction.options.getString('steamid');

  try {
    // Step 1: Resolve user information first
    const userInfo = await resolveUserInfo(steamid, discordUser, true);

    // Step 2: Show reason selection embed
    const reasonEmbed = createResponseEmbed({
      title: '🎯 Select Whitelist Type',
      description: `**Granting whitelist for:** ${discordUser ? `<@${discordUser.id}>` : 'Unknown User'}\n**Steam ID:** ${userInfo.steamid64}\n\nPlease select the type of whitelist to grant:`,
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
      ephemeral: true
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
        console.error('Error handling reason selection:', error);
        if (!reasonInteraction.replied && !reasonInteraction.deferred) {
          try {
            await reasonInteraction.reply({
              content: '❌ An error occurred while processing your selection. Please try again.',
              ephemeral: true
            });
          } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
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
    console.error('Whitelist grant error:', error);
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
    description: `**User:** ${discordUser ? `<@${discordUser.id}>` : 'Unknown User'}\n**Steam ID:** ${userInfo.steamid64}\n\nSelect the donator whitelist duration:`,
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
      console.error('Error handling donator duration selection:', error);
    }
  });
}

async function showReportingDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;
  
  const durationEmbed = createResponseEmbed({
    title: '📋 Reporting Duration Selection',
    description: `**User:** ${discordUser ? `<@${discordUser.id}>` : 'Unknown User'}\n**Steam ID:** ${userInfo.steamid64}\n\nSelect the reporting whitelist duration:`,
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
            ephemeral: true
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
        console.error('Modal submission error:', error);
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
      console.error('Error handling reporting duration selection:', error);
    }
  });
}

async function handleConfirmation(interaction, grantData) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText } = grantData;
  
  const confirmEmbed = createResponseEmbed({
    title: '✅ Confirm Whitelist Grant',
    description: `Please confirm the whitelist details below:`,
    fields: [
      { name: 'User', value: discordUser ? `<@${discordUser.id}>` : 'Unknown User', inline: true },
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
      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }
      await processWhitelistGrant(buttonInteraction, {
        ...grantData,
        durationValue,
        durationType,
        durationText
      });
    } catch (error) {
      console.error('Error handling confirmation:', error);
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
      discord_username: userInfo.discord_username,
      reason: reason,
      duration_value: durationValue,
      duration_type: durationType,
      granted_by: grantData.originalUser.id
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
        console.error(`Failed to assign ${reason} role:`, error);
      }
    }

    const successEmbed = createResponseEmbed({
      title: '✅ Whitelist Granted Successfully',
      description: `Whitelist access has been granted successfully${roleAssigned ? ' and Discord role assigned' : ''}!`,
      fields: [
        { name: 'User', value: discordUser ? `<@${discordUser.id}>` : 'Unknown User', inline: true },
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
      successEmbed.addFields({ 
        name: 'Account Link', 
        value: `✅ Discord-Steam link ${userInfo.linkedAccount}`, 
        inline: true 
      });
    }

    await interaction.editReply({
      content: '',
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('Whitelist grant processing error:', error);
    await interaction.editReply({
      content: `❌ Failed to grant whitelist: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

async function handleInfo(interaction) {
  await withLoadingMessage(interaction, 'Checking whitelist status...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser, hasLink, hasWhitelistHistory } = await resolveUserForInfo(steamid, discordUser);

    // Get whitelist status with proper stacking calculation
    const whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);

    // Get history to show stacking info (without Group association to avoid error)
    const history = await Whitelist.findAll({
      where: { steamid64: resolvedSteamId },
      order: [['granted_at', 'DESC']]
    });
    const activeEntries = history.filter(entry => !entry.revoked);

    const embed = createResponseEmbed({
      title: '📋 Whitelist Status',
      description: `Whitelist information for ${resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'user'}`,
      fields: [
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Status', value: whitelistStatus.status, inline: true },
        { name: 'Account Link', value: hasLink ? '✅ Linked' : '❌ Not linked', inline: true }
      ],
      color: whitelistStatus.hasWhitelist ? 0x00FF00 : 0xFF0000
    });

    if (whitelistStatus.expiration) {
      embed.addFields({ 
        name: whitelistStatus.hasWhitelist ? 'Expires' : 'Expired', 
        value: whitelistStatus.expiration.toLocaleDateString(), 
        inline: true 
      });
    }

    // Show stacking info if there are multiple active entries
    if (activeEntries.length > 1) {
      const stackingInfo = activeEntries.map(entry => {
        const duration = `${entry.duration_value} ${entry.duration_type}`;
        const reason = entry.reason || 'Unknown';
        return `• ${reason}: ${duration}`;
      }).join('\n');
      
      embed.addFields({ 
        name: `Active Entries (${activeEntries.length})`, 
        value: stackingInfo, 
        inline: false 
      });
    }

    await sendSuccess(interaction, 'Whitelist status retrieved!', embed);
  });
}

async function handleExtend(interaction) {
  await withLoadingMessage(interaction, 'Extending whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const months = interaction.options.getInteger('months');

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

    // Extend the whitelist
    const extensionEntry = await Whitelist.extendWhitelist(
      resolvedSteamId, 
      months, 
      interaction.user.id
    );

    // Note: Extensions don't assign new roles - user should already have appropriate role from initial grant

    const embed = createResponseEmbed({
      title: '⏰ Whitelist Extended',
      description: `Successfully extended whitelist access`,
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
        console.error('Failed to remove whitelist roles:', error);
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