const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { PlayerDiscordLink, UnlinkHistory, Whitelist } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { triggerUserRoleSync } = require('../utils/triggerUserRoleSync');
const { getRoleArchiveService } = require('../services/RoleArchiveService');
const WhitelistAuthorityService = require('../services/WhitelistAuthorityService');
const notificationService = require('../services/NotificationService');
const { createServiceLogger } = require('../utils/logger');
const environment = require('../utils/environment');
const {
  buildWarningEmbed,
  buildSuccessEmbed,
  buildCancelledEmbed,
  performUnlink
} = require('../utils/unlinkFlow');
const {
  LINK_BUTTON_PREFIX,
  LINK_SOURCES,
  extractLinkSource,
  formatSourceForDisplay
} = require('../utils/linkButton');
const { STATS_BUTTON_ID } = require('../services/StatsService');
const { Op } = require('sequelize');

const serviceLogger = createServiceLogger('ButtonInteractionHandler');

// Button custom IDs for the whitelist post (legacy, kept for backwards compatibility)
const BUTTON_IDS = {
  LINK: 'whitelist_post_link',
  STATUS: 'whitelist_post_status',
  UNLINK: 'whitelist_post_unlink'
};

// Prefix for dynamically generated info buttons
const INFO_BUTTON_PREFIX = 'info_';

// Prefixes for dynamic button IDs (unlink confirmation flow)
const UNLINK_CONFIRM_PREFIX = 'unlink_confirm_';
const UNLINK_CANCEL_PREFIX = 'unlink_cancel_';

// Prefix for ticket link buttons
const TICKET_LINK_BUTTON_PREFIX = 'ticket_link_';

// Modal custom ID prefix (will be suffixed with source_userId for uniqueness)
const MODAL_ID_PREFIX = 'link_modal_';

/**
 * Handle button interactions from persistent posts
 * @param {import('discord.js').Interaction} interaction
 */
async function handleButtonInteraction(interaction) {
  // Handle button clicks
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Check for dynamic unlink confirmation buttons first
    if (customId.startsWith(UNLINK_CONFIRM_PREFIX)) {
      await handleUnlinkConfirm(interaction);
      return;
    }
    if (customId.startsWith(UNLINK_CANCEL_PREFIX)) {
      await handleUnlinkCancel(interaction);
      return;
    }

    // Check for dynamic info buttons
    if (customId.startsWith(INFO_BUTTON_PREFIX)) {
      await handleInfoButton(interaction, customId);
      return;
    }

    // Check for ticket link buttons
    if (customId.startsWith(TICKET_LINK_BUTTON_PREFIX)) {
      await handleTicketLinkButton(interaction);
      return;
    }

    // Check for dynamic link buttons (link_button_{source})
    if (customId.startsWith(LINK_BUTTON_PREFIX)) {
      const source = extractLinkSource(customId);
      await handleLinkButton(interaction, source);
      return;
    }

    switch (customId) {
    case BUTTON_IDS.LINK:
      // Legacy whitelist post link button
      await handleLinkButton(interaction, LINK_SOURCES.WHITELIST_POST);
      break;
    case BUTTON_IDS.STATUS:
      await handleStatusButton(interaction);
      break;
    case BUTTON_IDS.UNLINK:
      await handleUnlinkButton(interaction);
      break;
    case STATS_BUTTON_ID:
      await handleStatsButton(interaction);
      break;
    // Return early for unhandled buttons (not ours)
    default:
      return;
    }
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith(MODAL_ID_PREFIX)) {
      await handleLinkModalSubmit(interaction);
    }
  }
}

/**
 * Handle the "Link Steam ID" button click
 * Shows modal if user isn't linked, or informs them if already linked
 * @param {import('discord.js').Interaction} interaction
 * @param {string} source - Source context for tracking (e.g., 'whitelist_post', 'stats')
 */
async function handleLinkButton(interaction, source = LINK_SOURCES.COMMAND) {
  try {
    const discordUserId = interaction.user.id;

    // Check if user already has a high-confidence link
    const existingLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: discordUserId,
        is_primary: true
      },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });

    // If user is already linked at 1.0 confidence, inform them with unlink option (goes through warning flow)
    if (existingLink && existingLink.confidence_score >= 1.0) {
      const alreadyLinkedEmbed = {
        color: 0x00ff00,
        title: 'Steam Account Linked',
        description: 'Your Discord account is already linked to a Steam ID.',
        fields: [
          {
            name: 'Steam ID',
            value: `\`${existingLink.steamid64}\``,
            inline: true
          },
          {
            name: 'Linked Since',
            value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`,
            inline: true
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      // Use the standard unlink button which goes through handleUnlinkButton -> warning flow
      const unlinkRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(BUTTON_IDS.UNLINK)
            .setLabel('Unlink Steam ID')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.reply({
        embeds: [alreadyLinkedEmbed],
        components: [unlinkRow],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Show modal for Steam ID entry (unique ID per user and source to prevent cross-wiring)
    const modalId = `${MODAL_ID_PREFIX}${source}_${interaction.user.id}`;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle('Link Steam ID');

    const steamIdInput = new TextInputBuilder()
      .setCustomId('steam_id_input')
      .setLabel('Steam ID64')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('76561198123456789')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(17);

    const steamIdRow = new ActionRowBuilder().addComponents(steamIdInput);
    modal.addComponents(steamIdRow);

    await interaction.showModal(modal);
  } catch (error) {
    serviceLogger.error('Error handling link button:', error);

    // Only respond if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Handle the modal submission for Steam ID linking
 */
async function handleLinkModalSubmit(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordUserId = interaction.user.id;
    const steamId = interaction.fields.getTextInputValue('steam_id_input').trim();

    // Extract source from modal ID (format: link_modal_{source}_{userId})
    // Source may contain underscores (e.g., 'whitelist_post'), so we join all parts except the last (userId)
    const modalId = interaction.customId;
    const modalParts = modalId.replace(MODAL_ID_PREFIX, '').split('_');
    // Last part is always the userId, everything before is the source
    const source = modalParts.length > 1 ? modalParts.slice(0, -1).join('_') : LINK_SOURCES.COMMAND;
    const sourceDisplay = formatSourceForDisplay(source);

    // Validate Steam ID format
    if (!isValidSteamId(steamId)) {
      const invalidEmbed = {
        color: 0xff4444,
        title: 'Invalid Steam ID',
        description: 'The Steam ID you provided is not valid.',
        fields: [
          {
            name: 'What you entered',
            value: `\`${steamId}\``,
            inline: false
          },
          {
            name: 'Expected format',
            value: 'Steam ID64 must be exactly 17 digits starting with 7656119',
            inline: false
          },
          {
            name: 'Example',
            value: '`76561198123456789`',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.editReply({ embeds: [invalidEmbed] });
      return;
    }

    // Check for 30-day cooldown from recent unlink (only applies to DIFFERENT Steam IDs)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUnlink = await UnlinkHistory.findOne({
      where: {
        discord_user_id: discordUserId,
        unlinked_at: { [Op.gt]: thirtyDaysAgo }
      },
      order: [['unlinked_at', 'DESC']]
    });

    // Allow re-linking the same Steam ID that was unlinked (no cooldown)
    if (recentUnlink && recentUnlink.steamid64 !== steamId) {
      const unlinkDate = new Date(recentUnlink.unlinked_at);
      const cooldownEndDate = new Date(unlinkDate);
      cooldownEndDate.setDate(cooldownEndDate.getDate() + 30);

      const daysRemaining = Math.ceil((cooldownEndDate - new Date()) / (1000 * 60 * 60 * 24));

      const cooldownEmbed = {
        color: 0xff4444,
        title: 'Cooldown Active',
        description: 'You recently unlinked your Steam ID and must wait before linking again.',
        fields: [
          {
            name: 'Previous Steam ID',
            value: recentUnlink.steamid64,
            inline: true
          },
          {
            name: 'Days Remaining',
            value: `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
            inline: true
          },
          {
            name: 'Cooldown Ends',
            value: `<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:R>`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.editReply({ embeds: [cooldownEmbed] });
      return;
    }

    // Check if user already has a Steam account linked
    const existingLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: discordUserId,
        is_primary: true
      },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });

    // Case 1: User is linking the SAME Steam ID (upgrade to 1.0 confidence)
    if (existingLink && existingLink.steamid64 === steamId) {
      if (existingLink.confidence_score >= 1.0) {
        const alreadyLinkedEmbed = {
          color: 0x00ff00,
          title: 'Already Linked',
          description: 'Your Discord account is already linked to this Steam ID.',
          fields: [
            { name: 'Steam ID', value: steamId, inline: true },
            { name: 'Linked Since', value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`, inline: true }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Roster Control System' }
        };

        // Use the standard unlink button which goes through handleUnlinkButton -> warning flow
        const unlinkRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(BUTTON_IDS.UNLINK)
              .setLabel('Unlink Steam ID')
              .setStyle(ButtonStyle.Danger)
          );

        await interaction.editReply({ embeds: [alreadyLinkedEmbed], components: [unlinkRow] });
        return;
      }

      // Upgrade confidence to 1.0
      await existingLink.update({
        confidence_score: 1.0,
        link_source: 'manual',
        metadata: {
          ...existingLink.metadata,
          confidence_upgrade: {
            upgraded_by: discordUserId,
            upgraded_at: new Date().toISOString(),
            previous_confidence: existingLink.confidence_score,
            upgrade_method: `link_button_${source}`
          }
        }
      });

      const upgradeEmbed = {
        color: 0x00ff00,
        title: 'Link Confidence Upgraded',
        description: 'Your account link confidence has been upgraded!',
        fields: [
          { name: 'Steam ID', value: steamId, inline: true },
          { name: 'Previous Confidence', value: `${(existingLink.confidence_score * 100).toFixed(0)}%`, inline: true },
          { name: 'New Confidence', value: '100%', inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.editReply({ embeds: [upgradeEmbed] });

      // Trigger role sync and restore archived roles
      await triggerUserRoleSync(interaction.client, discordUserId, {
        source: `link_button_${source}_upgrade`,
        skipNotification: true
      });

      await handleRoleRestoration(interaction, discordUserId);

      // Send notification for confidence upgrade
      await notificationService.sendAccountLinkNotification({
        success: true,
        description: `<@${discordUserId}> upgraded their Steam link confidence via ${sourceDisplay}`,
        fields: [
          { name: 'Discord User', value: `<@${discordUserId}>`, inline: true },
          { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
          { name: 'Confidence', value: `${(existingLink.confidence_score * 100).toFixed(0)}% → 100%`, inline: true }
        ]
      });

      serviceLogger.info(`User upgraded link confidence via ${sourceDisplay}`, {
        discordUserId,
        steamId,
        previousConfidence: existingLink.confidence_score
      });

      return;
    }

    // Case 2: User is linking a DIFFERENT Steam ID AND has 1.0 confidence (block)
    if (existingLink && existingLink.steamid64 !== steamId && existingLink.confidence_score >= 1.0) {
      const blockEmbed = {
        color: 0xffa500,
        title: 'Cannot Change Steam ID',
        description: 'You already have a verified Steam ID linked. You must unlink it first.',
        fields: [
          { name: 'Current Steam ID', value: existingLink.steamid64, inline: true },
          { name: 'Linked Since', value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`, inline: true },
          {
            name: 'Want to change?',
            value: 'Use `/unlink` to remove your current link.\n**Warning**: 30-day cooldown after unlinking.',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.editReply({ embeds: [blockEmbed] });
      return;
    }

    // Case 3: New link OR replacing lower confidence link
    const { created } = await PlayerDiscordLink.createOrUpdateLink(
      discordUserId,
      steamId,
      null, // eosId
      interaction.user.username,
      {
        linkSource: 'manual',
        confidenceScore: 1.0,
        isPrimary: true,
        metadata: {
          direct_link: true,
          created_by: `link_button_${source}`,
          created_at: new Date().toISOString(),
          replaced_link: existingLink ? {
            previous_steamid: existingLink.steamid64,
            previous_confidence: existingLink.confidence_score,
            replaced_at: new Date().toISOString()
          } : null
        }
      }
    );

    const successEmbed = {
      color: 0x00ff00,
      title: created ? 'Steam ID Linked Successfully' : 'Steam ID Updated Successfully',
      description: `Your Discord account is now linked to Steam ID \`${steamId}\`.`,
      fields: [
        { name: 'Steam ID', value: steamId, inline: true },
        { name: 'Link Type', value: created ? 'New Link' : 'Updated Link', inline: true },
        {
          name: 'What now?',
          value: 'Your Steam ID is linked! Your roles will be synchronized automatically.',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Roster Control System' }
    };

    if (existingLink && existingLink.steamid64 !== steamId) {
      successEmbed.fields.push({
        name: 'Previous Steam ID',
        value: `\`${existingLink.steamid64}\` (replaced)`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [successEmbed] });

    // Trigger role sync
    await triggerUserRoleSync(interaction.client, discordUserId, {
      source: `link_button_${source}`,
      skipNotification: false
    });

    // Handle role restoration
    await handleRoleRestoration(interaction, discordUserId);

    // Send notification for new/updated link
    const notificationFields = [
      { name: 'Discord User', value: `<@${discordUserId}>`, inline: true },
      { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
      { name: 'Link Type', value: created ? 'New Link' : 'Updated Link', inline: true }
    ];

    if (existingLink && existingLink.steamid64 !== steamId) {
      notificationFields.push({
        name: 'Previous Steam ID',
        value: `\`${existingLink.steamid64}\` (replaced)`,
        inline: false
      });
    }

    await notificationService.sendAccountLinkNotification({
      success: true,
      description: `<@${discordUserId}> linked their Steam ID via ${sourceDisplay}`,
      fields: notificationFields
    });

    serviceLogger.info(`User linked Steam ID via ${sourceDisplay}`, {
      discordUserId,
      steamId,
      created,
      replacedPrevious: existingLink && existingLink.steamid64 !== steamId
    });

  } catch (error) {
    serviceLogger.error('Error handling link modal submit:', error);

    const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: 'Failed to link Steam ID. Please try again later or contact staff.',
      flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
    });
  }
}

/**
 * Handle role restoration after linking
 */
async function handleRoleRestoration(interaction, discordUserId) {
  try {
    const roleArchiveService = getRoleArchiveService(interaction.client);
    const restoreResult = await roleArchiveService.restoreUserRoles(
      discordUserId,
      interaction.guild,
      discordUserId
    );

    if (restoreResult.restoredRoles && restoreResult.restoredRoles.length > 0) {
      const restoredNames = restoreResult.restoredRoles
        .filter(r => r.restored)
        .map(r => r.name);

      if (restoredNames.length > 0) {
        await interaction.followUp({
          embeds: [{
            color: 0x00ff00,
            title: 'Roles Restored',
            description: 'Your previously removed roles have been restored!',
            fields: [{
              name: 'Restored Roles',
              value: restoredNames.join(', '),
              inline: false
            }],
            timestamp: new Date().toISOString(),
            footer: { text: 'Roster Control System' }
          }],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  } catch (error) {
    serviceLogger.error('Error restoring roles:', error);
    // Don't fail the whole operation for role restoration issues
  }
}

/**
 * Handle the "View Status" button click
 */
async function handleStatusButton(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const discordUserId = interaction.user.id;

    // Get user's primary link
    const primaryLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: discordUserId,
        is_primary: true
      },
      order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
    });

    // If not linked, show instructions
    if (!primaryLink) {
      const notLinkedEmbed = {
        color: 0xff4444,
        title: 'Steam Account Not Linked',
        description: 'You have not linked a Steam account to your Discord.',
        fields: [
          {
            name: 'How to Link',
            value: 'Click the **Link Steam ID** button on the whitelist post, or use the `/linkid` command.',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.editReply({ embeds: [notLinkedEmbed] });
      return;
    }

    const steamId = primaryLink.steamid64;

    // Get member for role-based checks
    let member = null;
    let authorityStatus = null;

    try {
      member = await interaction.guild.members.fetch(discordUserId);
      authorityStatus = await WhitelistAuthorityService.getWhitelistStatus(
        discordUserId,
        steamId,
        member
      );
    } catch (error) {
      serviceLogger.error('WhitelistAuthorityService validation failed:', error);
    }

    // Get whitelist status
    const whitelistStatus = await Whitelist.getActiveWhitelistForUser(steamId);

    // Get active entries
    const now = new Date();
    const history = await Whitelist.findAll({
      where: { steamid64: steamId },
      order: [['granted_at', 'DESC']]
    });

    const activeEntries = history.filter(entry => {
      if (entry.revoked) return false;
      if (!entry.duration_value || !entry.duration_type) {
        return entry.duration_value !== 0;
      }
      const expirationDate = calculateExpirationDate(entry.granted_at, entry.duration_value, entry.duration_type);
      return expirationDate > now;
    });

    // Determine status and color
    let finalStatus, finalColor;

    if (authorityStatus && authorityStatus.effectiveStatus) {
      if (authorityStatus.isWhitelisted) {
        const source = authorityStatus.effectiveStatus.primarySource;
        if (source === 'role_based' && authorityStatus.sources?.roleBased) {
          const group = authorityStatus.sources.roleBased.group;
          finalStatus = `Active (permanent - ${group})`;
          finalColor = 0x9C27B0; // Purple
        } else {
          finalStatus = `Active (${authorityStatus.effectiveStatus.isPermanent ? 'permanent' : 'temporary'})`;
          finalColor = 0x00FF00; // Green
        }
      } else {
        const reason = authorityStatus.effectiveStatus.reason;
        if (reason === 'security_blocked_insufficient_confidence') {
          finalStatus = 'Inactive - Link confidence too low';
          finalColor = 0xFF6600; // Orange-red
        } else {
          finalStatus = 'No whitelist access';
          finalColor = 0xFF0000; // Red
        }
      }
    } else if (whitelistStatus.hasWhitelist) {
      finalStatus = whitelistStatus.status;
      finalColor = 0x00FF00;
    } else {
      finalStatus = 'No whitelist access';
      finalColor = 0xFF0000;
    }

    // Build embed
    const embed = {
      color: finalColor,
      title: 'Whitelist Status',
      description: `Your whitelist status for <@${discordUserId}>`,
      fields: [
        { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
        { name: 'Status', value: finalStatus, inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Roster Control System' }
    };

    // Add expiration info for database entries
    const databaseEntries = activeEntries.filter(entry =>
      entry.source !== 'role' &&
      entry.duration_value &&
      entry.duration_type &&
      entry.duration_value !== 0
    );

    if (databaseEntries.length > 0) {
      // Calculate stacked expiration
      const earliestEntry = databaseEntries.sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at))[0];
      let stackedExpiration = new Date(earliestEntry.granted_at);

      let totalMonths = 0;
      let totalDays = 0;
      let totalHours = 0;

      databaseEntries.forEach(entry => {
        if (entry.duration_type === 'months') {
          totalMonths += entry.duration_value;
        } else if (entry.duration_type === 'days') {
          totalDays += entry.duration_value;
        } else if (entry.duration_type === 'hours') {
          totalHours += entry.duration_value;
        }
      });

      if (totalMonths > 0) {
        stackedExpiration.setMonth(stackedExpiration.getMonth() + totalMonths);
      }
      if (totalDays > 0) {
        stackedExpiration.setDate(stackedExpiration.getDate() + totalDays);
      }
      if (totalHours > 0) {
        stackedExpiration.setTime(stackedExpiration.getTime() + (totalHours * 60 * 60 * 1000));
      }

      const expiresInDays = Math.ceil((stackedExpiration - now) / (1000 * 60 * 60 * 24));

      embed.fields.push({
        name: 'Expiration',
        value: `${stackedExpiration.toLocaleDateString()} (${expiresInDays} days remaining)`,
        inline: false
      });
    } else if (authorityStatus?.sources?.roleBased?.isActive) {
      embed.fields.push({
        name: 'Expiration',
        value: 'Permanent (role-based)',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    serviceLogger.error('Error handling status button:', error);

    const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: 'Failed to retrieve whitelist status. Please try again later.',
      flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
    });
  }
}

/**
 * Handle the "Unlink" button click
 * Shows confirmation dialog before unlinking
 */
async function handleUnlinkButton(interaction) {
  try {
    const discordUserId = interaction.user.id;

    // Check if user has a link
    const existingLink = await PlayerDiscordLink.findByDiscordId(discordUserId);

    if (!existingLink) {
      const notLinkedEmbed = {
        color: 0xff4444,
        title: 'No Account Linked',
        description: 'You do not have a Steam account linked to your Discord.',
        fields: [
          {
            name: 'Want to link?',
            value: 'Click the **Link Steam ID** button to connect your Steam account.',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      };

      await interaction.reply({
        embeds: [notLinkedEmbed],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Generate unique IDs for confirmation buttons (include user ID for security)
    const uniqueId = `${discordUserId}_${Date.now()}`;
    const confirmId = `${UNLINK_CONFIRM_PREFIX}${uniqueId}`;
    const cancelId = `${UNLINK_CANCEL_PREFIX}${uniqueId}`;

    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel('Yes, Unlink (30-day cooldown)')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      embeds: [buildWarningEmbed(existingLink)],
      components: [confirmRow],
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    serviceLogger.error('Error handling unlink button:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Handle unlink confirmation button
 */
async function handleUnlinkConfirm(interaction) {
  try {
    // Extract user ID from custom ID for security verification
    const customId = interaction.customId;
    const uniquePart = customId.replace(UNLINK_CONFIRM_PREFIX, '');
    const expectedUserId = uniquePart.split('_')[0];

    // Security check: Only allow the original user
    if (interaction.user.id !== expectedUserId) {
      await interaction.reply({
        content: 'You cannot interact with this confirmation.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferUpdate();

    const discordUserId = interaction.user.id;

    // Re-fetch the link to ensure it still exists
    const existingLink = await PlayerDiscordLink.findByDiscordId(discordUserId);

    if (!existingLink) {
      await interaction.editReply({
        embeds: [{
          color: 0xff4444,
          title: 'No Account Linked',
          description: 'Your account is no longer linked.',
          timestamp: new Date().toISOString(),
          footer: { text: 'Roster Control System' }
        }],
        components: []
      });
      return;
    }

    // Perform the unlink using shared utility
    const { cooldownEndDate } = await performUnlink(discordUserId, existingLink, 'whitelist post button');

    await interaction.editReply({
      embeds: [buildSuccessEmbed(existingLink, cooldownEndDate)],
      components: []
    });

  } catch (error) {
    serviceLogger.error('Error handling unlink confirm:', error);

    const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: 'Failed to unlink your account. Please try again later.',
      flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
    });
  }
}

/**
 * Handle unlink cancel button
 */
async function handleUnlinkCancel(interaction) {
  try {
    // Extract user ID from custom ID for security verification
    const customId = interaction.customId;
    const uniquePart = customId.replace(UNLINK_CANCEL_PREFIX, '');
    const expectedUserId = uniquePart.split('_')[0];

    // Security check: Only allow the original user
    if (interaction.user.id !== expectedUserId) {
      await interaction.reply({
        content: 'You cannot interact with this confirmation.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const existingLink = await PlayerDiscordLink.findByDiscordId(interaction.user.id);

    await interaction.update({
      embeds: [buildCancelledEmbed(existingLink)],
      components: []
    });

  } catch (error) {
    serviceLogger.error('Error handling unlink cancel:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Replace channel placeholders {#key} with Discord channel mentions <#channelId>
 * @param {string} text - Text containing placeholders
 * @param {object} channels - Channel mapping { key: channelId }
 * @returns {string} - Text with placeholders replaced
 */
function replaceChannelPlaceholders(text, channels) {
  if (!text || !channels) return text;

  return text.replace(/\{#(\w+)\}/g, (match, key) => {
    const channelId = channels[key];
    if (channelId) {
      return `<#${channelId}>`;
    }
    // Leave placeholder as-is if channel not found
    serviceLogger.warn(`Channel placeholder {#${key}} not found in channels config`);
    return match;
  });
}

/**
 * Handle info button clicks - display configurable ephemeral content
 * @param {import('discord.js').Interaction} interaction
 * @param {string} buttonId - Button ID to look up in INFO_POSTS config
 */
async function handleInfoButton(interaction, buttonId) {
  try {
    // Find the info config that matches this buttonId
    // Get INFO_POSTS fresh each time to pick up reloaded config
    const infoConfig = Object.values(environment.INFO_POSTS).find(post => post.buttonId === buttonId);

    if (!infoConfig) {
      serviceLogger.error('Unknown info button:', buttonId);
      await interaction.reply({
        content: 'This information is not available.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const channels = infoConfig.channels || {};

    // Build embed from config with channel placeholder replacement
    const embed = {
      color: infoConfig.embed.color,
      title: infoConfig.embed.title,
      description: replaceChannelPlaceholders(infoConfig.embed.description, channels),
      fields: (infoConfig.embed.fields || []).map(field => ({
        name: field.name,
        value: replaceChannelPlaceholders(field.value, channels),
        inline: field.inline
      })),
      timestamp: new Date().toISOString(),
      footer: infoConfig.embed.footer || { text: 'Roster Control System' }
    };

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    serviceLogger.error('Error handling info button:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Handle ticket link button click
 * Anyone in the ticket can click this to link the Steam ID to the target user
 */
async function handleTicketLinkButton(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Parse the custom ID: ticket_link_{targetUserId}_{steamId}
    const customId = interaction.customId;
    const parts = customId.replace(TICKET_LINK_BUTTON_PREFIX, '').split('_');

    if (parts.length < 2) {
      await interaction.editReply({
        content: 'Invalid button data. Please try again.',
      });
      return;
    }

    const targetUserId = parts[0];
    const steamId = parts[1];

    // Validate Steam ID format
    if (!isValidSteamId(steamId)) {
      await interaction.editReply({
        embeds: [{
          color: 0xff4444,
          title: 'Invalid Steam ID',
          description: 'The Steam ID in this button is no longer valid.',
          timestamp: new Date().toISOString(),
          footer: { text: 'Roster Control System' }
        }]
      });
      return;
    }

    // Check if already linked at 1.0 confidence
    const existingLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: targetUserId,
        steamid64: steamId
      }
    });

    if (existingLink && parseFloat(existingLink.confidence_score) >= 1.0) {
      await interaction.editReply({
        embeds: [{
          color: 0x00ff00,
          title: 'Already Linked',
          description: `This Steam ID is already linked to <@${targetUserId}> with full confidence.`,
          fields: [
            { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
            { name: 'Confidence', value: '100%', inline: true },
            { name: 'Linked Since', value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`, inline: true }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Roster Control System' }
        }]
      });

      // Disable the button on the original message
      await disableTicketLinkButton(interaction.message, customId);
      return;
    }

    // Create or upgrade the link
    const previousConfidence = existingLink ? parseFloat(existingLink.confidence_score) : null;

    const { created } = await PlayerDiscordLink.createOrUpdateLink(
      targetUserId,
      steamId,
      null, // eosId
      null, // username (will be fetched if needed)
      {
        linkSource: 'manual', // Ticket button click counts as manual verification
        confidenceScore: 1.0,
        isPrimary: true,
        metadata: {
          linked_via: 'ticket_button',
          linked_by: interaction.user.id,
          linked_by_tag: interaction.user.tag,
          linked_at: new Date().toISOString(),
          channel_id: interaction.channel.id,
          channel_name: interaction.channel.name,
          previous_confidence: previousConfidence
        }
      }
    );

    const actionType = created ? 'linked' : (previousConfidence ? 'verified' : 'linked');
    const title = created ? 'Account Linked' : 'Account Link Verified';
    const description = created
      ? `Steam ID successfully linked to <@${targetUserId}>.`
      : `Steam ID link for <@${targetUserId}> has been verified.`;

    await interaction.editReply({
      embeds: [{
        color: 0x00ff00,
        title: title,
        description: description,
        fields: [
          { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
          { name: 'Confidence', value: previousConfidence ? `${(previousConfidence * 100).toFixed(0)}% → 100%` : '100%', inline: true },
          { name: 'Linked By', value: `<@${interaction.user.id}>`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Roster Control System' }
      }]
    });

    // Disable the button on the original message
    await disableTicketLinkButton(interaction.message, customId);

    // Trigger role sync for the target user
    await triggerUserRoleSync(interaction.client, targetUserId, {
      source: 'ticket_link_button',
      skipNotification: false
    });

    // Send notification
    await notificationService.sendAccountLinkNotification({
      success: true,
      description: `<@${targetUserId}>'s Steam ID was ${actionType} via ticket button by <@${interaction.user.id}>`,
      fields: [
        { name: 'Target User', value: `<@${targetUserId}>`, inline: true },
        { name: 'Steam ID', value: `\`${steamId}\``, inline: true },
        { name: 'Linked By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true }
      ]
    });

    serviceLogger.info('Steam ID linked via ticket button', {
      targetUserId,
      steamId,
      linkedBy: interaction.user.id,
      channelId: interaction.channel.id,
      created,
      previousConfidence
    });

  } catch (error) {
    serviceLogger.error('Error handling ticket link button:', error);

    const replyMethod = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: 'Failed to link the Steam ID. Please try again later or use `/adminlink`.',
      flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
    });
  }
}

/**
 * Disable the ticket link button after it's been used
 * @param {Message} message - The message containing the button
 * @param {string} buttonId - The custom ID of the button to disable
 */
async function disableTicketLinkButton(message, buttonId) {
  try {
    if (!message.components || message.components.length === 0) return;

    const newComponents = message.components.map(row => {
      const newRow = new ActionRowBuilder();
      row.components.forEach(component => {
        if (component.customId === buttonId) {
          newRow.addComponents(
            ButtonBuilder.from(component)
              .setLabel('Linked')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true)
              .setEmoji('✅')
          );
        } else {
          newRow.addComponents(ButtonBuilder.from(component));
        }
      });
      return newRow;
    });

    await message.edit({ components: newComponents });
  } catch (error) {
    serviceLogger.warn('Failed to disable ticket link button:', error.message);
    // Non-blocking - button still works, just won't be visually disabled
  }
}

/**
 * Handle the "View My Stats" button click
 */
async function handleStatsButton(interaction) {
  const { resolveSteamIdFromDiscord } = require('../utils/accountLinking');
  const { checkCooldown, fetchStats, buildStatsEmbed, buildStatsButtonRow, buildNoLinkResponse, setCooldown } = require('../services/StatsService');

  try {
    const userId = interaction.user.id;

    // Check cooldown first (ephemeral, no defer needed)
    const cooldownStatus = checkCooldown(userId);
    if (cooldownStatus.onCooldown) {
      return await interaction.reply({
        content: `This command is on cooldown. Please wait **${cooldownStatus.displayText}** before using it again.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Quick check for Steam link before deferring
    const steamId = await resolveSteamIdFromDiscord(userId);

    // No link - reply ephemeral immediately (no defer needed)
    if (!steamId) {
      const noLinkResponse = buildNoLinkResponse();
      return await interaction.reply({
        embeds: [noLinkResponse.embed],
        components: noLinkResponse.components,
        flags: MessageFlags.Ephemeral
      });
    }

    // Has link - defer public, then fetch stats
    await interaction.deferReply();

    // Set cooldown now that we know they're linked (pass member for admin check)
    setCooldown(userId, interaction.member);

    // Fetch stats (potentially slow API call)
    const result = await fetchStats(steamId);

    if (!result.success) {
      return await interaction.editReply({ content: result.error });
    }

    // Try image generation first, fall back to embed
    const { generateStatsImage, DEFAULT_TEMPLATE } = require('../services/StatsImageService');
    const StatsTemplateService = require('../services/StatsTemplateService');
    const { AttachmentBuilder } = require('discord.js');

    // Get template based on member roles (from database)
    const roleIds = interaction.member?.roles?.cache?.map(role => role.id) || [];
    let templateName = DEFAULT_TEMPLATE;
    try {
      const mappedTemplate = await StatsTemplateService.getTemplateForRoles(roleIds);
      if (mappedTemplate) {
        templateName = mappedTemplate.name;
      } else {
        const randomTemplate = await StatsTemplateService.getRandomTemplate();
        if (randomTemplate) {
          templateName = randomTemplate.name;
        }
      }
    } catch (err) {
      serviceLogger.warn('Failed to get template from database, using default:', err.message);
    }
    serviceLogger.info(`Stats button: Using template "${templateName}" for user ${userId}`);

    try {
      const imageBuffer = await generateStatsImage(result.stats, templateName);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'stats.png' });

      await interaction.editReply({
        content: `<@${userId}>`,
        files: [attachment],
        components: [buildStatsButtonRow()]
      });
    } catch (imageError) {
      // Fall back to embed if image generation fails
      const embed = buildStatsEmbed(result.stats);
      await interaction.editReply({
        content: `<@${userId}>`,
        embeds: [embed],
        components: [buildStatsButtonRow()]
      });
    }

  } catch (error) {
    serviceLogger.error('Error handling stats button:', error);

    const replyMethod = interaction.deferred ? 'editReply' : 'reply';
    await interaction[replyMethod]({
      content: 'Failed to retrieve stats. Please try again later.',
      flags: replyMethod === 'reply' ? MessageFlags.Ephemeral : undefined
    });
  }
}

/**
 * Calculate expiration date from granted_at and duration
 */
function calculateExpirationDate(grantedAt, durationValue, durationType) {
  const expiration = new Date(grantedAt);

  if (durationType === 'days') {
    expiration.setDate(expiration.getDate() + durationValue);
  } else if (durationType === 'months') {
    expiration.setMonth(expiration.getMonth() + durationValue);
  } else if (durationType === 'hours') {
    expiration.setTime(expiration.getTime() + (durationValue * 60 * 60 * 1000));
  }

  return expiration;
}

module.exports = {
  handleButtonInteraction,
  BUTTON_IDS,
  MODAL_ID_PREFIX,
  TICKET_LINK_BUTTON_PREFIX
};
