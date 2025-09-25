const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { Whitelist } = require('../../../database/models');
const { createResponseEmbed, sendError } = require('../../../utils/messageHandler');
const { console: loggerConsole } = require('../../../utils/logger');
const { logWhitelistOperation } = require('../../../utils/discordLogger');
const { resolveUserInfo } = require('../utils/userResolution');
const { getRoleForReason } = require('../utils/roleHelpers');
const { showReasonSelectionButtons } = require('../ui/grantComponents');

/**
 * Handle grant subcommand - requires both Discord user and Steam ID
 */
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

/**
 * Handle grant-steamid subcommand - Steam ID only grants for admin use
 */
async function handleGrantSteamId(interaction) {
  const steamid = interaction.options.getString('steamid');
  const username = interaction.options.getString('username');

  try {
    // Step 1: Show warning about Steam ID only grant
    const warningEmbed = createResponseEmbed({
      title: '⚠️ Steam ID Only Grant',
      description: `**Steam ID:** ${steamid}\n${username ? `**Username:** ${username}` : '**Username:** Not provided'}\n\n🚨 **Important:** This grant will NOT create a Discord-Steam account link.\nThis means the user will have lower link confidence.\n\nOnly use this for users who are not in Discord or emergency situations.`,
      color: 0xffa500
    });

    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('proceed_steamid_grant')
          .setLabel('Proceed with Steam ID Grant')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setCustomId('cancel_steamid_grant')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );

    await interaction.reply({
      embeds: [warningEmbed],
      components: [confirmRow],
      flags: MessageFlags.Ephemeral
    });

    // Handle confirmation
    const confirmCollector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => (i.customId === 'proceed_steamid_grant' || i.customId === 'cancel_steamid_grant') && i.user.id === interaction.user.id,
      time: 300000
    });

    confirmCollector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.customId === 'cancel_steamid_grant') {
        await buttonInteraction.update({
          content: '❌ Steam ID grant cancelled.',
          embeds: [],
          components: []
        });
        return;
      }

      // Proceed with Steam ID only grant
      try {
        if (!buttonInteraction.deferred && !buttonInteraction.replied) {
          await buttonInteraction.deferUpdate();
        }

        // Step 2: Resolve user information (no Discord user, no linking)
        const userInfo = await resolveUserInfo(steamid, null, false);
        // Manually add username if provided
        if (username) {
          userInfo.username = username;
        }

        // Step 3: Show reason selection with buttons instead of dropdown
        await showReasonSelectionButtons(buttonInteraction, {
          discordUser: null,
          userInfo,
          originalUser: interaction.user,
          isSteamIdOnly: true
        });
      } catch (error) {
        loggerConsole.error('Steam ID grant error:', error);
        await buttonInteraction.editReply({
          content: `❌ ${error.message}`,
          embeds: [],
          components: []
        });
      }
    });

  } catch (error) {
    loggerConsole.error('Steam ID grant setup error:', error);
    await sendError(interaction, error.message);
  }
}

/**
 * Handle duration selection for grant workflow
 */
async function handleDurationSelection(interaction, grantData) {
  const { reason } = grantData;

  // Show different duration selection based on reason
  switch (reason) {
  case 'service-member':
  case 'first-responder':
    // Skip duration selection, go straight to confirmation (auto 6 months)
    const { handleConfirmation } = require('../ui/confirmationComponents');
    await handleConfirmation(interaction, {
      ...grantData,
      durationValue: 6,
      durationType: 'months',
      durationText: '6 months'
    });
    break;

  case 'donator':
    const { showDonatorDurationSelection } = require('../ui/grantComponents');
    await showDonatorDurationSelection(interaction, grantData);
    break;

  case 'reporting':
    const { showReportingDurationSelection } = require('../ui/grantComponents');
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

/**
 * Process the actual whitelist grant
 */
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

module.exports = {
  handleGrant,
  handleGrantSteamId,
  handleDurationSelection,
  processWhitelistGrant
};