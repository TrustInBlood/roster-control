const { PlayerDiscordLink, Whitelist } = require('../database/models');
const { console: loggerConsole } = require('./logger');

/**
 * Generic account linking utilities
 * Provides functions to link Discord users with Steam IDs and resolve them
 */

/**
 * Create or update a Discord-Steam account link
 * @param {string} discordUserId - Discord user ID
 * @param {string} steamid64 - Steam ID64
 * @param {string} eosID - Optional EOS ID
 * @param {string} username - Optional username
 * @param {number} confidenceScore - Confidence score for the link (default 0.5 for whitelist operations)
 * @param {Object} discordUser - Optional Discord user object for display name (for logging)
 * @returns {Object} The created or updated link
 */
async function createOrUpdateLink(discordUserId, steamid64, eosID = null, username = null, confidenceScore = 0.5, discordUser = null) {
  try {
    const { link, created } = await PlayerDiscordLink.createOrUpdateLink(
      discordUserId, 
      steamid64, 
      eosID, 
      username,
      {
        linkSource: 'manual',
        confidenceScore: confidenceScore,
        isPrimary: true
      }
    );
    
    const userIdentifier = discordUser?.displayName || discordUser?.username || discordUser?.tag || discordUserId;
    loggerConsole.log(`Account link ${created ? 'created' : 'updated'}: Discord ${userIdentifier} <-> Steam ${steamid64}`);
    return { link, created, error: null };
  } catch (error) {
    loggerConsole.error('Failed to create/update account link:', error);
    return { link: null, created: false, error: error.message };
  }
}

/**
 * Resolve Steam ID from Discord user ID
 * Checks both formal account links and whitelist entries
 * @param {string} discordUserId - Discord user ID
 * @returns {string|null} Steam ID64 if found
 */
async function resolveSteamIdFromDiscord(discordUserId) {
  try {
    // First, check formal account links
    const link = await PlayerDiscordLink.findByDiscordId(discordUserId);
    if (link && link.steamid64) {
      return link.steamid64;
    }

    // Second, check whitelist entries (fallback for users without formal links)
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
 * Checks both formal account links and whitelist entries
 * @param {string} steamid64 - Steam ID64
 * @returns {string|null} Discord user ID if found
 */
async function resolveDiscordFromSteamId(steamid64) {
  try {
    // First, check formal account links
    const link = await PlayerDiscordLink.findBySteamId(steamid64);
    if (link && link.discord_user_id) {
      return link.discord_user_id;
    }

    // Second, check whitelist entries (fallback)
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
    hasLink: false,
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

    // Check if formal account link exists
    if (result.discordUserId) {
      const link = await PlayerDiscordLink.findByDiscordId(result.discordUserId);
      if (link) {
        result.hasLink = true;
        result.steamid64 = result.steamid64 || link.steamid64;
        result.eosID = result.eosID || link.eosID;
        result.username = result.username || link.username;
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
  createOrUpdateLink,
  resolveSteamIdFromDiscord,
  resolveDiscordFromSteamId,
  getUserInfo,
  getAllLinkedAccounts
};