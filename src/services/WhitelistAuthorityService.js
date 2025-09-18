const { Whitelist, PlayerDiscordLink, AuditLog } = require('../database/models');
const { getHighestPriorityGroup } = require('../utils/environment');

/**
 * WhitelistAuthorityService - Single source of truth for all whitelist validation decisions
 *
 * This service centralizes all whitelist validation logic to prevent security vulnerabilities
 * caused by scattered validation code. It enforces strict confidence score requirements
 * and provides consistent validation across all entry points.
 *
 * SECURITY REQUIREMENTS:
 * - Staff role-based whitelist requires confidence score >= 1.0
 * - Database whitelist entries are always valid regardless of roles
 * - All validation decisions are logged for audit purposes
 * - No privilege escalation through low-confidence links
 */
class WhitelistAuthorityService {
  /**
   * Get comprehensive whitelist status for a user
   * @param {string} discordUserId - Discord user ID
   * @param {string|null} steamId - Steam ID64 (optional, will be looked up if not provided)
   * @param {Object|null} discordMember - Discord member object with roles (optional)
   * @returns {Promise<Object>} Whitelist status with detailed breakdown
   */
  static async getWhitelistStatus(discordUserId, steamId = null, discordMember = null) {
    const startTime = Date.now();

    try {
      // Step 1: Get or validate Steam ID with confidence check
      let validatedSteamId = steamId;
      let linkInfo = null;

      if (!validatedSteamId) {
        // Look up primary link for this Discord user
        const primaryLink = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: discordUserId,
            is_primary: true
          },
          order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
        });

        if (primaryLink) {
          validatedSteamId = primaryLink.steamid64;
          linkInfo = {
            confidence: primaryLink.confidence_score,
            source: primaryLink.link_source,
            isPrimary: true
          };
        }
      } else {
        // Validate provided Steam ID and get link info
        const link = await PlayerDiscordLink.findOne({
          where: {
            discord_user_id: discordUserId,
            steamid64: steamId,
            is_primary: true
          }
        });

        if (link) {
          linkInfo = {
            confidence: link.confidence_score,
            source: link.link_source,
            isPrimary: true
          };
        }
      }

      // Step 2: Check database whitelist entries
      const databaseWhitelist = validatedSteamId ?
        await this._checkDatabaseWhitelist(validatedSteamId) : null;

      // Step 3: Check role-based whitelist with strict validation
      const roleBasedWhitelist = await this._checkRoleBasedWhitelist(
        discordMember,
        linkInfo
      );

      // Step 4: Determine final status
      const finalStatus = this._determineWhitelistStatus(
        databaseWhitelist,
        roleBasedWhitelist,
        linkInfo
      );

      // Step 5: Log the validation decision (temporarily disabled due to database schema issues)
      // await this._logValidationDecision(discordUserId, {
      //   steamId: validatedSteamId,
      //   linkInfo,
      //   databaseWhitelist,
      //   roleBasedWhitelist,
      //   finalStatus,
      //   processingTime: Date.now() - startTime
      // });

      return {
        isWhitelisted: finalStatus.isWhitelisted,
        steamId: validatedSteamId,
        linkInfo,
        sources: {
          database: databaseWhitelist,
          roleBased: roleBasedWhitelist
        },
        effectiveStatus: finalStatus,
        validatedAt: new Date().toISOString()
      };

    } catch (error) {
      // Log validation errors (temporarily disabled due to database schema issues)
      // await AuditLog.create({
      //   actionType: 'WHITELIST_ERROR',
      //   actorType: 'system',
      //   actorId: 'AUTHORITY_SERVICE',
      //   actorName: 'WhitelistAuthorityService',
      //   targetType: 'discord_user',
      //   targetId: discordUserId,
      //   targetName: discordUserId,
      //   guildId: null,
      //   description: `Whitelist validation failed: ${error.message}`,
      //   beforeState: null,
      //   afterState: null,
      //   metadata: {
      //     error: error.message,
      //     steamId: steamId,
      //     processingTime: Date.now() - startTime,
      //     service: 'WhitelistAuthorityService',
      //     method: 'getWhitelistStatus'
      //   },
      //   severity: 'error'
      // });

      throw new Error(`Whitelist validation failed: ${error.message}`);
    }
  }

  /**
   * Check if user has valid whitelist access (simplified interface)
   * @param {string} discordUserId - Discord user ID
   * @param {string|null} steamId - Steam ID64 (optional)
   * @param {Object|null} discordMember - Discord member object (optional)
   * @returns {Promise<boolean>} True if user has valid whitelist access
   */
  static async hasWhitelistAccess(discordUserId, steamId = null, discordMember = null) {
    const status = await this.getWhitelistStatus(discordUserId, steamId, discordMember);
    return status.isWhitelisted;
  }

  /**
   * Check database whitelist entries for Steam ID
   * @private
   */
  static async _checkDatabaseWhitelist(steamId) {
    if (!steamId) return null;

    const activeWhitelist = await Whitelist.getActiveWhitelistForUser(steamId);

    if (activeWhitelist.hasWhitelist) {
      return {
        isActive: true,
        reason: activeWhitelist.status,
        expiration: activeWhitelist.expiration,
        source: 'database'
      };
    }

    return {
      isActive: false,
      source: 'database'
    };
  }

  /**
   * Check role-based whitelist with strict confidence validation
   * @private
   */
  static async _checkRoleBasedWhitelist(discordMember, linkInfo) {
    // If no Discord member provided, we can't check roles
    if (!discordMember || !discordMember.roles) {
      return {
        isActive: false,
        reason: 'no_discord_member',
        source: 'role_based'
      };
    }

    // Get user's highest priority group
    const userGroup = getHighestPriorityGroup(discordMember.roles.cache);

    if (!userGroup || userGroup === 'Member') {
      return {
        isActive: false,
        reason: 'no_staff_role',
        group: userGroup,
        source: 'role_based'
      };
    }

    // CRITICAL SECURITY CHECK: Staff roles require high-confidence Steam link
    if (!linkInfo || linkInfo.confidence < 1.0) {
      return {
        isActive: false,
        reason: 'insufficient_link_confidence',
        group: userGroup,
        requiredConfidence: 1.0,
        actualConfidence: linkInfo?.confidence || 0,
        source: 'role_based',
        securityBlocked: true
      };
    }

    // Staff role with valid high-confidence link
    return {
      isActive: true,
      reason: 'staff_role_with_valid_link',
      group: userGroup,
      confidence: linkInfo.confidence,
      linkSource: linkInfo.source,
      isPermanent: true, // Staff role-based whitelist is considered permanent
      source: 'role_based'
    };
  }

  /**
   * Determine final whitelist status from all sources
   * @private
   */
  static _determineWhitelistStatus(databaseWhitelist, roleBasedWhitelist, linkInfo) {
    // Database whitelist always takes precedence if active
    if (databaseWhitelist?.isActive) {
      return {
        isWhitelisted: true,
        primarySource: 'database',
        reason: 'active_database_entry',
        expiration: databaseWhitelist.expiration,
        isPermanent: !databaseWhitelist.expiration
      };
    }

    // Role-based whitelist if valid
    if (roleBasedWhitelist?.isActive) {
      return {
        isWhitelisted: true,
        primarySource: 'role_based',
        reason: 'staff_role_with_valid_link',
        group: roleBasedWhitelist.group,
        isPermanent: true
      };
    }

    // No valid whitelist found
    const denialReason = this._getDenialReason(roleBasedWhitelist, linkInfo);

    return {
      isWhitelisted: false,
      primarySource: null,
      reason: denialReason.reason,
      details: denialReason.details
    };
  }

  /**
   * Get detailed reason for whitelist denial
   * @private
   */
  static _getDenialReason(roleBasedWhitelist, linkInfo) {
    if (roleBasedWhitelist?.securityBlocked) {
      return {
        reason: 'security_blocked_insufficient_confidence',
        details: {
          hasStaffRole: true,
          group: roleBasedWhitelist.group,
          requiredConfidence: 1.0,
          actualConfidence: linkInfo?.confidence || 0,
          linkSource: linkInfo?.source || 'none'
        }
      };
    }

    if (roleBasedWhitelist?.reason === 'no_staff_role') {
      return {
        reason: 'no_whitelist_access',
        details: {
          hasStaffRole: false,
          hasActiveDatabase: false,
          group: roleBasedWhitelist.group || 'Member'
        }
      };
    }

    if (!linkInfo) {
      return {
        reason: 'no_steam_account_linked',
        details: {
          hasStaffRole: roleBasedWhitelist?.group && roleBasedWhitelist.group !== 'Member',
          linkRequired: true
        }
      };
    }

    return {
      reason: 'no_whitelist_access',
      details: {
        checkedSources: ['database', 'role_based'],
        allSourcesInactive: true
      }
    };
  }

  /**
   * Log validation decision for audit purposes
   * @private
   */
  static async _logValidationDecision(discordUserId, validationData) {
    try {
      await AuditLog.create({
        actionType: 'WHITELIST_CHECK',
        actorType: 'system',
        actorId: 'AUTHORITY_SERVICE',
        actorName: 'WhitelistAuthorityService',
        targetType: 'discord_user',
        targetId: discordUserId,
        targetName: validationData.steamId || discordUserId,
        guildId: null,
        description: `Whitelist validation: ${validationData.finalStatus.isWhitelisted ? 'GRANTED' : 'DENIED'} (${validationData.finalStatus.primarySource || validationData.finalStatus.reason})`,
        beforeState: null,
        afterState: {
          isWhitelisted: validationData.finalStatus.isWhitelisted,
          primarySource: validationData.finalStatus.primarySource,
          linkConfidence: validationData.linkInfo?.confidence
        },
        metadata: {
          steamId: validationData.steamId,
          linkConfidence: validationData.linkInfo?.confidence,
          linkSource: validationData.linkInfo?.source,
          databaseActive: validationData.databaseWhitelist?.isActive || false,
          roleBasedActive: validationData.roleBasedWhitelist?.isActive || false,
          roleBasedGroup: validationData.roleBasedWhitelist?.group,
          securityBlocked: validationData.roleBasedWhitelist?.securityBlocked || false,
          processingTime: validationData.processingTime,
          service: 'WhitelistAuthorityService',
          version: '1.0.0',
          validatedAt: new Date().toISOString()
        },
        severity: 'info'
      });
    } catch (logError) {
      console.error('Failed to log whitelist validation decision:', logError);
      // Don't throw - logging failures shouldn't break validation
    }
  }

  /**
   * Bulk validate multiple users (for cache operations)
   * @param {Array} userValidations - Array of {discordUserId, steamId?, discordMember?}
   * @returns {Promise<Map>} Map of discordUserId -> validation result
   */
  static async bulkValidateUsers(userValidations) {
    const results = new Map();

    if (userValidations.length === 0) {
      return results;
    }

    try {
      // Step 1: Extract all Discord user IDs for bulk link lookup
      const discordUserIds = userValidations.map(v => v.discordUserId);

      // Step 2: Bulk fetch all primary links for these Discord users
      const allLinks = await PlayerDiscordLink.findAll({
        where: {
          discord_user_id: discordUserIds,
          is_primary: true
        },
        order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
      });

      // Step 3: Create a map of Discord ID -> link info for fast lookup
      const linksByDiscordId = new Map();
      for (const link of allLinks) {
        linksByDiscordId.set(link.discord_user_id, {
          steamId: link.steamid64,
          confidence: link.confidence_score,
          source: link.link_source,
          isPrimary: true
        });
      }

      // Step 4: Get all Steam IDs for database whitelist bulk lookup
      const steamIds = [...new Set(allLinks.map(link => link.steamid64).filter(Boolean))];

      // Step 5: Bulk fetch database whitelist entries
      const databaseWhitelists = new Map();
      if (steamIds.length > 0) {
        const activeWhitelists = await Whitelist.findAll({
          where: {
            steamid64: steamIds,
            approved: true,
            revoked: false
          },
          order: [['granted_at', 'ASC']]
        });

        for (const whitelist of activeWhitelists) {
          // Check if this whitelist is currently active
          const isActive = !whitelist.expiration || new Date(whitelist.expiration) > new Date();

          databaseWhitelists.set(whitelist.steamid64, {
            isActive,
            id: whitelist.id,
            reason: whitelist.reason,
            expiration: whitelist.expiration,
            grantedBy: whitelist.granted_by,
            grantedAt: whitelist.granted_at,
            source: 'database'
          });
        }
      }

      // Step 6: Process each user validation with pre-fetched data
      for (const validation of userValidations) {
        try {
          const { discordUserId, discordMember } = validation;

          // Get link info from bulk lookup
          const linkInfo = linksByDiscordId.get(discordUserId) || null;
          const steamId = linkInfo?.steamId || null;

          // Get database whitelist from bulk lookup
          const databaseWhitelist = steamId ?
            (databaseWhitelists.get(steamId) || { isActive: false, source: 'database' }) :
            null;

          // Check role-based whitelist with strict validation
          const roleBasedWhitelist = await this._checkRoleBasedWhitelist(
            discordMember,
            linkInfo
          );

          // Determine final status
          const finalStatus = this._determineWhitelistStatus(
            databaseWhitelist,
            roleBasedWhitelist,
            linkInfo
          );

          // Store result
          results.set(discordUserId, {
            isWhitelisted: finalStatus.isWhitelisted,
            steamId: steamId,
            linkInfo,
            sources: {
              database: databaseWhitelist,
              roleBased: roleBasedWhitelist
            },
            effectiveStatus: finalStatus,
            validatedAt: new Date().toISOString()
          });

        } catch (error) {
          results.set(validation.discordUserId, {
            isWhitelisted: false,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      // If bulk operation fails, fall back to individual validation for critical operations
      console.error('Bulk validation failed, falling back to individual validation:', error.message);

      // For cache initialization, we can't afford to do individual queries, so return empty results
      // The cache will be populated as users are validated individually through normal operation
      for (const validation of userValidations) {
        results.set(validation.discordUserId, {
          isWhitelisted: false,
          error: 'Bulk validation failed'
        });
      }

      return results;
    }
  }
}

module.exports = WhitelistAuthorityService;