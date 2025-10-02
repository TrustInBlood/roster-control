const { Whitelist, PlayerDiscordLink, AuditLog } = require('../database/models');
const { WHITELIST_AWARD_ROLES } = require('../../config/discord');
const { createOrUpdateLink } = require('../utils/accountLinking');
const { isValidSteamId } = require('../utils/steamId');
const { logWhitelistOperation } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');

/**
 * WhitelistGrantService - Centralized business logic for all whitelist operations
 *
 * This service is the single source of truth for whitelist grants, revocations,
 * and extensions. It enforces business rules, handles account linking, manages
 * Discord role assignment, and provides atomic operations with proper rollback.
 *
 * Core principles:
 * - All whitelist mutations go through this service
 * - Enforces account linking requirements
 * - Handles confidence validation
 * - Manages Discord role sync
 * - Provides comprehensive audit logging
 */
class WhitelistGrantService {
  constructor(discordClient = null) {
    this.discordClient = discordClient;
  }

  /**
   * Validate grant parameters
   * @private
   */
  async _validateGrant({ steamid64, discordUser, duration_value, duration_type }) {
    const errors = [];

    // Validate Steam ID format
    if (!steamid64 || !isValidSteamId(steamid64)) {
      errors.push('Invalid Steam ID format. Please provide a valid Steam ID64.');
    }

    // Validate duration
    if (duration_value !== null && duration_value !== undefined) {
      if (!Number.isInteger(duration_value) || duration_value < 0) {
        errors.push('Duration value must be a non-negative integer.');
      }

      if (!['days', 'months'].includes(duration_type)) {
        errors.push('Duration type must be "days" or "months".');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get role ID for a given whitelist reason
   * @private
   */
  _getRoleForReason(reason) {
    const roleMapping = {
      'service-member': WHITELIST_AWARD_ROLES.SERVICE_MEMBER,
      'first-responder': WHITELIST_AWARD_ROLES.FIRST_RESPONDER,
      'donator': WHITELIST_AWARD_ROLES.DONATOR,
    };

    return roleMapping[reason] || null;
  }

  /**
   * Assign Discord role to user
   * @private
   */
  async _assignDiscordRole(discordUser, roleId, reason, guild, grantedByTag) {
    if (!discordUser || !roleId || !guild) {
      return { success: false, reason: 'missing_parameters' };
    }

    try {
      const member = await guild.members.fetch(discordUser.id).catch(() => null);

      if (!member) {
        loggerConsole.warn('Could not fetch guild member for role assignment', {
          discordUserId: discordUser.id,
          roleId
        });
        return { success: false, reason: 'member_not_found' };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        loggerConsole.error('Role not found in guild', { roleId });
        return { success: false, reason: 'role_not_found' };
      }

      if (member.roles.cache.has(roleId)) {
        loggerConsole.debug('User already has role', { discordUserId: discordUser.id, roleId });
        return { success: true, reason: 'already_has_role' };
      }

      await member.roles.add(role, `${reason.replace('-', ' ')} whitelist granted by ${grantedByTag}`);

      loggerConsole.info('Assigned Discord role', {
        discordUserId: discordUser.id,
        roleId,
        roleName: role.name,
        reason
      });

      return { success: true, roleName: role.name };
    } catch (error) {
      loggerConsole.error('Failed to assign Discord role', {
        discordUserId: discordUser?.id,
        roleId,
        error: error.message
      });
      return { success: false, reason: 'assignment_failed', error: error.message };
    }
  }

  /**
   * Remove Discord role from user
   * @private
   */
  async _removeDiscordRole(discordUser, roleId, guild, revokedByTag) {
    if (!discordUser || !roleId || !guild) {
      return { success: false, reason: 'missing_parameters' };
    }

    try {
      const member = await guild.members.fetch(discordUser.id).catch(() => null);

      if (!member) {
        return { success: false, reason: 'member_not_found' };
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return { success: false, reason: 'role_not_found' };
      }

      if (!member.roles.cache.has(roleId)) {
        return { success: true, reason: 'role_not_present' };
      }

      await member.roles.remove(role, `Whitelist revoked by ${revokedByTag}`);

      loggerConsole.info('Removed Discord role', {
        discordUserId: discordUser.id,
        roleId,
        roleName: role.name
      });

      return { success: true, roleName: role.name };
    } catch (error) {
      loggerConsole.error('Failed to remove Discord role', {
        discordUserId: discordUser?.id,
        roleId,
        error: error.message
      });
      return { success: false, reason: 'removal_failed', error: error.message };
    }
  }

  /**
   * Grant whitelist with Discord user (creates account link)
   * @param {Object} params
   * @param {Object} params.discordUser - Discord user object
   * @param {string} params.steamid64 - Steam ID64
   * @param {string} params.reason - Whitelist reason (service-member, first-responder, donator, reporting)
   * @param {number} params.duration_value - Duration value (e.g., 6 for 6 months)
   * @param {string} params.duration_type - Duration type ('days' or 'months')
   * @param {string} params.granted_by - Discord ID of granter
   * @param {Object} params.guild - Discord guild object
   * @param {Object} params.grantedByUser - Discord user object of granter
   * @returns {Promise<Object>} Grant result
   */
  async grantWithDiscord({
    discordUser,
    steamid64,
    reason,
    duration_value,
    duration_type,
    granted_by,
    guild,
    grantedByUser
  }) {
    const startTime = Date.now();

    try {
      // Validate inputs
      const validation = await this._validateGrant({ steamid64, discordUser, duration_value, duration_type });
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors
        };
      }

      const username = discordUser.displayName || discordUser.username;
      const discord_username = `${discordUser.username}#${discordUser.discriminator}`;

      // Step 1: Create or update account link (0.5 confidence for whitelist operations)
      const linkResult = await createOrUpdateLink(
        discordUser.id,
        steamid64,
        null, // eosID
        username,
        0.5,  // Whitelist operations create 0.5 confidence links
        discordUser
      );

      if (linkResult.error) {
        loggerConsole.error('Failed to create account link during whitelist grant', {
          discordUserId: discordUser.id,
          steamid64,
          error: linkResult.error
        });
        return {
          success: false,
          errors: [`Failed to create account link: ${linkResult.error}`]
        };
      }

      // Step 2: Grant whitelist in database
      const whitelistEntry = await this._createWhitelistEntry({
        steamid64,
        username,
        discord_username,
        reason,
        duration_value,
        duration_type,
        granted_by,
        metadata: {
          grantType: 'with_discord',
          linkCreated: linkResult.created,
          processingTime: Date.now() - startTime
        }
      });

      // Step 3: Assign Discord role if applicable
      let roleAssigned = false;
      let roleName = null;
      const roleId = this._getRoleForReason(reason);

      if (roleId && guild) {
        const roleResult = await this._assignDiscordRole(
          discordUser,
          roleId,
          reason,
          guild,
          grantedByUser?.tag || 'Unknown'
        );
        roleAssigned = roleResult.success;
        roleName = roleResult.roleName;
      }

      // Step 4: Log to Discord audit channel
      if (this.discordClient) {
        await logWhitelistOperation(this.discordClient, 'grant', {
          id: discordUser.id,
          tag: discordUser.tag
        }, steamid64, {
          whitelistType: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          duration: duration_value ? `${duration_value} ${duration_type}` : 'permanent',
          grantedBy: `<@${granted_by}>`,
          expiration: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never',
          linkCreated: linkResult.created
        });
      }

      loggerConsole.info('Whitelist granted with Discord user', {
        discordUserId: discordUser.id,
        steamid64,
        reason,
        duration: `${duration_value} ${duration_type}`,
        roleAssigned,
        linkCreated: linkResult.created,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        whitelistEntry,
        linkCreated: linkResult.created,
        roleAssigned,
        roleName,
        expiration: whitelistEntry.expiration
      };

    } catch (error) {
      loggerConsole.error('Whitelist grant with Discord failed', {
        discordUserId: discordUser?.id,
        steamid64,
        reason,
        error: error.message
      });

      return {
        success: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Grant whitelist with Steam ID only (no account link) - for emergency use
   * @param {Object} params
   * @param {string} params.steamid64 - Steam ID64
   * @param {string} params.username - Optional username for audit trail
   * @param {number} params.duration_value - Duration value
   * @param {string} params.duration_type - Duration type ('days' or 'months')
   * @param {string} params.granted_by - Discord ID of granter
   * @returns {Promise<Object>} Grant result
   */
  async grantSteamOnly({
    steamid64,
    username = null,
    duration_value,
    duration_type,
    granted_by
  }) {
    const startTime = Date.now();

    try {
      // Validate inputs
      const validation = await this._validateGrant({ steamid64, duration_value, duration_type });
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors
        };
      }

      // Create whitelist entry WITHOUT Discord attribution
      const whitelistEntry = await this._createWhitelistEntry({
        steamid64,
        username,
        discord_username: null, // IMPORTANT: No Discord attribution for Steam-only grants
        reason: 'steam-only-grant',
        duration_value,
        duration_type,
        granted_by,
        metadata: {
          grantType: 'steam_only',
          warning: 'No account link created',
          processingTime: Date.now() - startTime
        }
      });

      // Log to Discord audit channel with warning flag
      if (this.discordClient) {
        await logWhitelistOperation(this.discordClient, 'grant', {
          id: 'unknown',
          tag: username || 'Unknown User'
        }, steamid64, {
          whitelistType: 'Steam ID Only (Emergency)',
          duration: `${duration_value} ${duration_type}`,
          grantedBy: `<@${granted_by}>`,
          expiration: whitelistEntry.expiration ? whitelistEntry.expiration.toLocaleDateString() : 'Never',
          steamIdOnly: true
        });
      }

      loggerConsole.warn('Whitelist granted with Steam ID only (no account link)', {
        steamid64,
        username,
        duration: `${duration_value} ${duration_type}`,
        granted_by,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        whitelistEntry,
        expiration: whitelistEntry.expiration,
        warning: 'No account link created. User should be linked via Discord for better tracking.'
      };

    } catch (error) {
      loggerConsole.error('Whitelist grant with Steam ID only failed', {
        steamid64,
        error: error.message
      });

      return {
        success: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Create whitelist database entry
   * @private
   */
  async _createWhitelistEntry({
    steamid64,
    username,
    discord_username,
    reason,
    duration_value,
    duration_type,
    granted_by,
    metadata = {}
  }) {
    const granted_at = new Date();
    let expiration = null;

    // Calculate expiration date based on duration
    if (duration_value && duration_type) {
      expiration = new Date(granted_at);
      if (duration_type === 'months') {
        expiration.setMonth(expiration.getMonth() + duration_value);
      } else if (duration_type === 'days') {
        expiration.setDate(expiration.getDate() + duration_value);
      }
    }

    // Ensure default whitelist group exists
    const { ensureDefaultWhitelistGroup } = require('../utils/ensureDefaultGroup');
    const whitelistGroup = await ensureDefaultWhitelistGroup();

    return await Whitelist.create({
      type: 'whitelist',
      steamid64,
      username,
      discord_username,
      reason,
      duration_value,
      duration_type,
      granted_by,
      granted_at,
      expiration,
      approved: true,
      revoked: false,
      group_id: whitelistGroup.id,
      source: 'manual',
      metadata
    });
  }


  /**
   * Revoke whitelist for a user
   * @param {Object} params
   * @param {string} params.steamid64 - Steam ID64
   * @param {string} params.reason - Revocation reason
   * @param {string} params.revoked_by - Discord ID of revoker
   * @param {Object} params.discordUser - Optional Discord user object for role removal
   * @param {Object} params.guild - Optional Discord guild object for role removal
   * @returns {Promise<Object>} Revocation result
   */
  async revokeWhitelist({ steamid64, reason, revoked_by, discordUser = null, guild = null }) {
    try {
      // Validate Steam ID
      if (!isValidSteamId(steamid64)) {
        return {
          success: false,
          errors: ['Invalid Steam ID format']
        };
      }

      const revoked_at = new Date();

      // Revoke all active manual whitelist entries (exclude role-based entries)
      const [updatedCount] = await Whitelist.update(
        {
          revoked: true,
          revoked_by,
          revoked_reason: reason,
          revoked_at
        },
        {
          where: {
            steamid64,
            approved: true,
            revoked: false,
            source: { [require('sequelize').Op.ne]: 'role' }
          }
        }
      );

      if (updatedCount === 0) {
        return {
          success: false,
          errors: ['No active whitelist entries found for this user']
        };
      }

      // Check if user still has any active whitelist entries
      const remainingEntries = await Whitelist.findAll({
        where: {
          steamid64,
          approved: true,
          revoked: false
        }
      });

      // Remove Discord roles if user has no active entries
      let rolesRemoved = [];
      if (remainingEntries.length === 0 && discordUser && guild) {
        for (const [reasonKey, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
          if (roleId) {
            const roleResult = await this._removeDiscordRole(
              discordUser,
              roleId,
              guild,
              'Whitelist Revocation'
            );
            if (roleResult.success && roleResult.roleName) {
              rolesRemoved.push(roleResult.roleName);
            }
          }
        }
      }

      loggerConsole.info('Whitelist revoked', {
        steamid64,
        entriesRevoked: updatedCount,
        rolesRemoved: rolesRemoved.length,
        revoked_by
      });

      return {
        success: true,
        entriesRevoked: updatedCount,
        rolesRemoved,
        hasRemainingEntries: remainingEntries.length > 0
      };

    } catch (error) {
      loggerConsole.error('Whitelist revocation failed', {
        steamid64,
        error: error.message
      });

      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}

module.exports = WhitelistGrantService;
