const { getHighestPriorityGroup } = require('./environment');
const { console: loggerConsole } = require('./logger');

/**
 * Trigger role-based whitelist sync for a specific Discord user
 *
 * This utility ensures that when a user's account link is created or confidence is upgraded,
 * their role-based whitelist entries are automatically synchronized.
 *
 * @param {Client} discordClient - Discord.js client instance
 * @param {string} discordUserId - Discord user ID to sync
 * @param {Object} options - Sync options
 * @param {string} options.source - Source identifier for audit trail (e.g., 'adminlink', 'upgradeconfidence')
 * @param {boolean} options.skipNotification - Whether to skip notifications (default: false)
 * @param {string} options.guildId - Optional guild ID override (uses DISCORD_GUILD_ID env var if not provided)
 * @returns {Promise<Object>} - { success: boolean, synced: boolean, group: string|null, error?: string }
 */
async function triggerUserRoleSync(discordClient, discordUserId, options = {}) {
  const {
    source = 'manual_trigger',
    skipNotification = false,
    guildId = process.env.DISCORD_GUILD_ID
  } = options;

  // Check if role sync service is available
  if (!global.whitelistServices?.roleWhitelistSync) {
    loggerConsole.warn('Role sync service not available, skipping sync', {
      discordUserId,
      source
    });
    return {
      success: false,
      synced: false,
      group: null,
      error: 'Role sync service not available'
    };
  }

  if (!discordClient) {
    loggerConsole.warn('Discord client not available, skipping role sync', {
      discordUserId,
      source
    });
    return {
      success: false,
      synced: false,
      group: null,
      error: 'Discord client not available'
    };
  }

  try {
    // Fetch guild
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      loggerConsole.warn('Guild not found, skipping role sync', {
        discordUserId,
        guildId,
        source
      });
      return {
        success: false,
        synced: false,
        group: null,
        error: 'Guild not found'
      };
    }

    // Fetch member
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      loggerConsole.warn('Member not found in guild, skipping role sync', {
        discordUserId,
        guildId,
        source
      });
      return {
        success: false,
        synced: false,
        group: null,
        error: 'Member not found in guild'
      };
    }

    // Get user's highest priority group
    const userGroup = getHighestPriorityGroup(member.roles.cache);

    if (!userGroup) {
      loggerConsole.debug('User has no tracked roles, skipping role sync', {
        discordUserId,
        username: member.user.tag,
        source
      });
      return {
        success: true,
        synced: false,
        group: null
      };
    }

    // Trigger role sync
    loggerConsole.log(`Triggering role sync for user: ${member.user.tag} (${userGroup})`, {
      discordUserId,
      group: userGroup,
      source
    });

    await global.whitelistServices.roleWhitelistSync.syncUserRole(
      discordUserId,
      userGroup,
      member,
      { source, skipNotification }
    );

    loggerConsole.log(`Role sync completed for ${member.user.tag}`, {
      discordUserId,
      group: userGroup,
      source
    });

    return {
      success: true,
      synced: true,
      group: userGroup
    };

  } catch (error) {
    loggerConsole.error('Failed to sync user role', {
      discordUserId,
      source,
      error: error.message
    });

    return {
      success: false,
      synced: false,
      group: null,
      error: error.message
    };
  }
}

module.exports = { triggerUserRoleSync };
