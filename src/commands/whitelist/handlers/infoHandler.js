const { Whitelist } = require('../../../database/models');
const { createResponseEmbed } = require('../../../utils/messageHandler');
const { getHighestPriorityGroup } = require('../../../utils/environment');
const { console: loggerConsole } = require('../../../utils/logger');
const WhitelistAuthorityService = require('../../../services/WhitelistAuthorityService');
const { resolveUserForInfo } = require('../utils/userResolution');

/**
 * Handle whitelist info subcommand
 */
async function handleInfo(interaction) {
  try {
    await interaction.deferReply(); // Non-ephemeral defer
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');

    // Validate that at least one parameter is provided
    if (!discordUser && !steamid) {
      await interaction.editReply({
        content: '❌ Please provide either a Discord user or Steam ID to check.'
      });
      return;
    }

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser, hasLink } = await resolveUserForInfo(steamid, discordUser);

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
    let finalStatus, finalColor;

    if (authorityStatus) {
      // Use authority service result as primary source of truth
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
      } else if (whitelistStatus.hasWhitelist) {
        finalStatus = whitelistStatus.status;
        finalColor = 0x00FF00;
      } else {
        finalStatus = whitelistStatus.status;
        finalColor = 0xFF0000;
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

    // Provide a more user-friendly error message
    const userFriendlyMessage = error.message || 'An unexpected error occurred while retrieving whitelist status.';

    try {
      await interaction.editReply({
        content: `❌ ${userFriendlyMessage}`
      });
    } catch (replyError) {
      loggerConsole.error('Failed to send error message to user:', replyError);
      // Try to send a follow-up if edit reply fails
      try {
        await interaction.followUp({
          content: `❌ ${userFriendlyMessage}`,
          ephemeral: true
        });
      } catch (followUpError) {
        loggerConsole.error('Failed to send follow-up error message:', followUpError);
      }
    }
  }
}

module.exports = {
  handleInfo
};