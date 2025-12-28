const { PlayerDiscordLink, PotentialPlayerLink, Whitelist } = require('../database/models');
const { console: loggerConsole } = require('./logger');

/**
 * Generic account linking utilities
 * Provides functions to link Discord users with Steam IDs and resolve them
 *
 * After the soft-link refactor:
 * - PlayerDiscordLink: ONLY verified (1.0 confidence) links
 * - PotentialPlayerLink: Unverified potential links for alt detection
 */

/**
 * Create a POTENTIAL link (not a verified link) during whitelist grant
 * These are used for alt detection only and don't grant any access
 *
 * @param {string} discordUserId - Discord user ID
 * @param {string} steamid64 - Steam ID64
 * @param {string} eosID - Optional EOS ID
 * @param {string} username - Optional username
 * @param {Object} discordUser - Optional Discord user object for display name (for logging)
 * @returns {Object} The created or updated potential link
 */
async function createPotentialLink(discordUserId, steamid64, eosID = null, username = null, discordUser = null) {
  try {
    // Check if user already has a verified link - if so, don't create a potential link
    const existingVerifiedLink = await PlayerDiscordLink.findByDiscordId(discordUserId);
    if (existingVerifiedLink) {
      const userIdentifier = discordUser?.displayName || discordUser?.username || discordUser?.tag || discordUserId;
      loggerConsole.log(`Skipping potential link - user ${userIdentifier} already has verified link to ${existingVerifiedLink.steamid64}`);
      return { link: existingVerifiedLink, created: false, error: null, alreadyVerified: true };
    }

    const { link, created } = await PotentialPlayerLink.createOrUpdatePotentialLink(
      discordUserId,
      steamid64,
      {
        eosID,
        username,
        linkSource: 'whitelist',
        confidenceScore: 0.5,
        metadata: {
          source: 'whitelist_grant',
          createdAt: new Date()
        }
      }
    );

    const userIdentifier = discordUser?.displayName || discordUser?.username || discordUser?.tag || discordUserId;
    loggerConsole.log(`Potential link ${created ? 'created' : 'updated'}: Discord ${userIdentifier} <-> Steam ${steamid64} (for alt detection)`);
    return { link, created, error: null, alreadyVerified: false };
  } catch (error) {
    loggerConsole.error('Failed to create/update potential link:', error);
    return { link: null, created: false, error: error.message, alreadyVerified: false };
  }
}

/**
 * @deprecated Use createPotentialLink for whitelist grants
 * This function is kept for backward compatibility but now creates potential links
 */
async function createOrUpdateLink(discordUserId, steamid64, eosID = null, username = null, _confidenceScore = 0.5, discordUser = null) {
  // Redirect to createPotentialLink - whitelist grants should create potential links
  return await createPotentialLink(discordUserId, steamid64, eosID, username, discordUser);
}

/**
 * Resolve Steam ID from Discord user ID
 * Checks verified links, potential links, and whitelist entries
 * @param {string} discordUserId - Discord user ID
 * @returns {string|null} Steam ID64 if found
 */
async function resolveSteamIdFromDiscord(discordUserId) {
  try {
    // First, check verified account links (most reliable)
    const verifiedLink = await PlayerDiscordLink.findByDiscordId(discordUserId);
    if (verifiedLink && verifiedLink.steamid64) {
      return verifiedLink.steamid64;
    }

    // Second, check potential links (less reliable but useful)
    const potentialLinks = await PotentialPlayerLink.findByDiscordId(discordUserId);
    if (potentialLinks.length > 0 && potentialLinks[0].steamid64) {
      return potentialLinks[0].steamid64; // Returns highest confidence potential link
    }

    // Third, check whitelist entries (fallback for users without any links)
    const whitelistEntry = await Whitelist.findOne({
      where: {
        discord_username: {
          [require('sequelize').Op.like]: `%${discordUserId}%`
        }
      },
      order: [['granted_at', 'DESC']]
    });

    if (whitelistEntry && whitelistEntry.steamid64) {
      return whitelistEntry.steamid64;
    }

    return null;
  } catch (error) {
    loggerConsole.error('Error resolving Steam ID from Discord:', error);
    return null;
  }
}

/**
 * Resolve Discord user ID from Steam ID
 * Checks verified links, potential links, and whitelist entries
 * @param {string} steamid64 - Steam ID64
 * @returns {string|null} Discord user ID if found
 */
async function resolveDiscordFromSteamId(steamid64) {
  try {
    // First, check verified account links (most reliable)
    const verifiedLink = await PlayerDiscordLink.findBySteamId(steamid64);
    if (verifiedLink && verifiedLink.discord_user_id) {
      return verifiedLink.discord_user_id;
    }

    // Second, check potential links
    const potentialLinks = await PotentialPlayerLink.findBySteamId(steamid64);
    if (potentialLinks.length > 0 && potentialLinks[0].discord_user_id) {
      return potentialLinks[0].discord_user_id;
    }

    // Third, check whitelist entries (fallback)
    const whitelistEntry = await Whitelist.findOne({
      where: { steamid64: steamid64 },
      order: [['granted_at', 'DESC']]
    });

    if (whitelistEntry && whitelistEntry.discord_username) {
      // Extract Discord ID from discord_username format (username#discriminator or <@id>)
      const discordIdMatch = whitelistEntry.discord_username.match(/(\d{17,19})/);
      if (discordIdMatch) {
        return discordIdMatch[1];
      }
    }

    return null;
  } catch (error) {
    loggerConsole.error('Error resolving Discord ID from Steam:', error);
    return null;
  }
}

/**
 * Get comprehensive user info by resolving from any identifier
 * @param {Object} identifiers - Object containing any available identifiers
 * @param {string} identifiers.discordUserId - Discord user ID
 * @param {string} identifiers.steamid64 - Steam ID64
 * @param {string} identifiers.eosID - EOS ID
 * @param {string} identifiers.username - Username
 * @returns {Object} Comprehensive user information
 */
async function getUserInfo(identifiers = {}) {
  const result = {
    discordUserId: identifiers.discordUserId || null,
    steamid64: identifiers.steamid64 || null,
    eosID: identifiers.eosID || null,
    username: identifiers.username || null,
    hasVerifiedLink: false,
    hasPotentialLink: false,
    hasLink: false, // Kept for backward compatibility (true if either verified or potential)
    hasWhitelistHistory: false
  };

  try {
    // If we have Discord ID but no Steam ID, try to resolve it
    if (result.discordUserId && !result.steamid64) {
      result.steamid64 = await resolveSteamIdFromDiscord(result.discordUserId);
    }

    // If we have Steam ID but no Discord ID, try to resolve it
    if (result.steamid64 && !result.discordUserId) {
      result.discordUserId = await resolveDiscordFromSteamId(result.steamid64);
    }

    // Check if verified account link exists
    if (result.discordUserId) {
      const verifiedLink = await PlayerDiscordLink.findByDiscordId(result.discordUserId);
      if (verifiedLink) {
        result.hasVerifiedLink = true;
        result.hasLink = true;
        result.steamid64 = result.steamid64 || verifiedLink.steamid64;
        result.eosID = result.eosID || verifiedLink.eosID;
        result.username = result.username || verifiedLink.username;
      } else {
        // Check for potential links
        const potentialLinks = await PotentialPlayerLink.findByDiscordId(result.discordUserId);
        if (potentialLinks.length > 0) {
          result.hasPotentialLink = true;
          result.hasLink = true;
          result.steamid64 = result.steamid64 || potentialLinks[0].steamid64;
          result.eosID = result.eosID || potentialLinks[0].eosID;
          result.username = result.username || potentialLinks[0].username;
        }
      }
    } else if (result.steamid64) {
      // Check for links by Steam ID if we don't have a Discord user ID
      const verifiedLink = await PlayerDiscordLink.findBySteamId(result.steamid64);
      if (verifiedLink) {
        result.hasVerifiedLink = true;
        result.hasLink = true;
        result.discordUserId = result.discordUserId || verifiedLink.discord_user_id;
        result.eosID = result.eosID || verifiedLink.eosID;
        result.username = result.username || verifiedLink.username;
      } else {
        const potentialLinks = await PotentialPlayerLink.findBySteamId(result.steamid64);
        if (potentialLinks.length > 0) {
          result.hasPotentialLink = true;
          result.hasLink = true;
          result.discordUserId = result.discordUserId || potentialLinks[0].discord_user_id;
          result.eosID = result.eosID || potentialLinks[0].eosID;
          result.username = result.username || potentialLinks[0].username;
        }
      }
    }

    // Check whitelist history
    if (result.steamid64) {
      const whitelistHistory = await Whitelist.findAll({
        where: { steamid64: result.steamid64 },
        limit: 1
      });
      result.hasWhitelistHistory = whitelistHistory.length > 0;
    }

    return result;
  } catch (error) {
    loggerConsole.error('Error getting user info:', error);
    return result;
  }
}

/**
 * Find all linked accounts (useful for admin purposes)
 * @param {number} limit - Maximum number of results
 * @returns {Array} Array of linked accounts
 */
async function getAllLinkedAccounts(limit = 100) {
  try {
    return await PlayerDiscordLink.findAll({
      limit,
      order: [['created_at', 'DESC']]
    });
  } catch (error) {
    loggerConsole.error('Error getting linked accounts:', error);
    return [];
  }
}

module.exports = {
  createOrUpdateLink, // @deprecated - use createPotentialLink for non-verified links
  createPotentialLink,
  resolveSteamIdFromDiscord,
  resolveDiscordFromSteamId,
  getUserInfo,
  getAllLinkedAccounts
};