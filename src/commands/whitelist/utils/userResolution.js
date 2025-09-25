const { getUserInfo } = require('../../../utils/accountLinking');
const { isValidSteamId } = require('../../../utils/steamId');
const { createOrUpdateLink } = require('../../../utils/accountLinking');
const { console: loggerConsole } = require('../../../utils/logger');
const notificationService = require('../../../services/NotificationService');

/**
 * Helper function to get user info from steamid or discord user (with auto-linking)
 */
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
    const { resolveSteamIdFromDiscord } = require('../../../utils/accountLinking');
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

/**
 * Helper function for info command - works with either user OR steamid
 */
async function resolveUserForInfo(steamid, discordUser) {
  try {
    // Validate inputs before proceeding
    if (!steamid && !discordUser) {
      throw new Error('Please provide either a Discord user or Steam ID to check.');
    }

    // Use the comprehensive getUserInfo function
    const userInfo = await getUserInfo({
      discordUserId: discordUser?.id,
      steamid64: steamid,
      username: discordUser?.displayName || discordUser?.username
    });

    // Handle the case where both parameters were provided but no link exists
    if (steamid && discordUser && userInfo.steamid64 && userInfo.discordUserId && !userInfo.hasLink) {
      // User provided both Steam ID and Discord user, but they're not linked in database
      // This is valid for info command - we can still check whitelist status
      loggerConsole.info('Checking whitelist for unlinked accounts:', {
        providedSteamId: steamid,
        providedDiscordUser: discordUser.id,
        resolvedSteamId: userInfo.steamid64,
        resolvedDiscordUser: userInfo.discordUserId,
        hasLink: userInfo.hasLink
      });
    }

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

    // For info command, we're more lenient - we can work with just Discord user even if no Steam ID
    if (!userInfo.steamid64 && discordUser) {
      loggerConsole.info('No Steam ID found for Discord user, checking role-based access:', {
        discordUserId: discordUser.id,
        username: discordUser.username
      });
      return {
        steamid64: null,
        discordUser: discordUser,
        hasLink: userInfo.hasLink,
        hasWhitelistHistory: false
      };
    }

    // Validate that we have at least some identifier
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
  } catch (error) {
    // Log the error with more context
    loggerConsole.error('Error in resolveUserForInfo:', {
      error: error.message,
      steamid: steamid,
      discordUserId: discordUser?.id,
      discordUsername: discordUser?.username,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  resolveUserInfo,
  resolveUserForInfo
};