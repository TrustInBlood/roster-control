const { Whitelist, PlayerDiscordLink, AuditLog } = require('../database/models');

/**
 * WhitelistAuthorityService - Single source of truth for all whitelist validation decisions
 *
 * This service centralizes all whitelist validation logic using the unified database approach.
 * All whitelist access is determined by database entries only - no role-based checking.
 *
 * SECURITY REQUIREMENTS:
 * - All whitelist validation comes from database entries
 * - Role-based access is handled by RoleWhitelistSyncService writing to database
 * - All validation decisions are logged for audit purposes
 * - Maintains confidence score validation for security
 */
class WhitelistAuthorityService {
  /**
   * Get comprehensive whitelist status for a user
   * @param {string} discordUserId - Discord user ID
   * @param {string|null} steamId - Steam ID64 (optional, will be looked up if not provided)
   * @param {Object|null} discordMember - Discord member object (unused in unified system)
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

      // Step 2: Check database for whitelist entries (only source of truth)
      const whitelistStatus = await this._checkDatabaseWhitelist(discordUserId, validatedSteamId);

      // Step 3: Determine final status based on database only
      const finalStatus = this._determineWhitelistStatus(whitelistStatus, linkInfo);

      // Step 4: Log the validation decision
      await this._logValidationDecision(discordUserId, {
        steamId: validatedSteamId,
        linkInfo,
        whitelistStatus,
        finalStatus,
        processingTime: Date.now() - startTime
      });

      return {
        isWhitelisted: finalStatus.isWhitelisted,
        steamId: validatedSteamId,
        linkInfo,
        whitelistEntries: whitelistStatus.entries,
        effectiveStatus: finalStatus,
        validatedAt: new Date().toISOString()
      };

    } catch (error) {
      // Log validation errors
      await AuditLog.create({
        actionType: 'WHITELIST_ERROR',
        actorType: 'system',
        actorId: 'AUTHORITY_SERVICE',
        actorName: 'WhitelistAuthorityService',
        targetType: 'discord_user',
        targetId: discordUserId,
        targetName: discordUserId,
        guildId: null,
        description: `Whitelist validation failed: ${error.message}`,
        beforeState: null,
        afterState: null,
        metadata: {
          error: error.message,
          steamId: steamId,
          processingTime: Date.now() - startTime,
          service: 'WhitelistAuthorityService',
          method: 'getWhitelistStatus'
        },
        severity: 'error'
      });

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
   * Check database whitelist entries for user (unified approach)
   * @private
   */
  static async _checkDatabaseWhitelist(discordUserId, steamId) {
    const whereConditions = {
      approved: true,
      revoked: false
    };

    // Check for entries by Discord ID (role-based) or Steam ID (manual grants)
    const orConditions = [];
    if (discordUserId) {
      orConditions.push({ discord_user_id: discordUserId });
    }
    if (steamId) {
      orConditions.push({ steamid64: steamId });
    }

    if (orConditions.length === 0) {
      return {
        hasAccess: false,
        entries: [],
        reason: 'no_identifiers'
      };
    }

    whereConditions[require('sequelize').Op.or] = orConditions;

    // Get all active whitelist entries for this user
    const entries = await Whitelist.findAll({
      where: whereConditions,
      order: [['granted_at', 'ASC']]
    });

    if (entries.length === 0) {
      return {
        hasAccess: false,
        entries: [],
        reason: 'no_entries_found'
      };
    }

    // Check for active entries (considering expiration and stacking)
    const now = new Date();
    const activeEntries = [];
    let hasPermamentAccess = false;

    for (const entry of entries) {
      // Check if entry has expired
      if (entry.expiration && new Date(entry.expiration) <= now) {
        continue; // Skip expired entries
      }

      // Check if this is a permanent entry (no expiration)
      if (!entry.expiration) {
        hasPermamentAccess = true;
      }

      activeEntries.push(entry);
    }

    // Process stacking logic for temporary entries
    let effectiveExpiration = null;
    if (!hasPermamentAccess && activeEntries.length > 0) {
      // Calculate stacked expiration from earliest entry
      const entriesWithDuration = activeEntries.filter(e => e.duration_value && e.duration_type);
      if (entriesWithDuration.length > 0) {
        const earliestEntry = entriesWithDuration.sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at))[0];
        let stackedExpiration = new Date(earliestEntry.granted_at);

        // Add up all durations
        let totalMonths = 0;
        let totalDays = 0;
        entriesWithDuration.forEach(entry => {
          if (entry.duration_type === 'months') {
            totalMonths += entry.duration_value;
          } else if (entry.duration_type === 'days') {
            totalDays += entry.duration_value;
          }
        });

        stackedExpiration.setMonth(stackedExpiration.getMonth() + totalMonths);
        stackedExpiration.setDate(stackedExpiration.getDate() + totalDays);

        effectiveExpiration = stackedExpiration;
      }
    }

    return {
      hasAccess: activeEntries.length > 0,
      entries: activeEntries,
      isPermanent: hasPermamentAccess,
      expiration: effectiveExpiration,
      reason: activeEntries.length > 0 ? 'active_entries_found' : 'all_entries_expired'
    };
  }


  /**
   * Determine final whitelist status from database only
   * @private
   */
  static _determineWhitelistStatus(whitelistStatus, linkInfo) {
    if (whitelistStatus.hasAccess) {
      return {
        isWhitelisted: true,
        primarySource: 'database',
        reason: 'active_database_entry',
        expiration: whitelistStatus.expiration,
        isPermanent: whitelistStatus.isPermanent,
        entryCount: whitelistStatus.entries.length
      };
    }

    // No valid whitelist found
    const denialReason = this._getDenialReason(whitelistStatus, linkInfo);

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
  static _getDenialReason(whitelistStatus, linkInfo) {
    if (whitelistStatus.reason === 'no_identifiers') {
      return {
        reason: 'no_identifiers_provided',
        details: {
          hasDiscordId: false,
          hasSteamId: false,
          requiresAtLeastOne: true
        }
      };
    }

    if (whitelistStatus.reason === 'no_entries_found') {
      return {
        reason: 'no_whitelist_entries',
        details: {
          hasLink: !!linkInfo,
          linkConfidence: linkInfo?.confidence || 0,
          databaseChecked: true
        }
      };
    }

    if (whitelistStatus.reason === 'all_entries_expired') {
      return {
        reason: 'whitelist_expired',
        details: {
          hadEntries: true,
          allExpired: true,
          entryCount: whitelistStatus.entries.length
        }
      };
    }

    return {
      reason: 'no_whitelist_access',
      details: {
        checkedSource: 'database',
        statusReason: whitelistStatus.reason
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
        description: `Whitelist validation: ${validationData.finalStatus.isWhitelisted ? 'GRANTED' : 'DENIED'} (${validationData.finalStatus.reason})`,
        beforeState: null,
        afterState: {
          isWhitelisted: validationData.finalStatus.isWhitelisted,
          primarySource: validationData.finalStatus.primarySource,
          linkConfidence: validationData.linkInfo?.confidence,
          entryCount: validationData.finalStatus.entryCount || 0
        },
        metadata: {
          steamId: validationData.steamId,
          linkConfidence: validationData.linkInfo?.confidence,
          linkSource: validationData.linkInfo?.source,
          databaseEntries: validationData.whitelistStatus?.entries?.length || 0,
          isPermanent: validationData.finalStatus.isPermanent || false,
          expiration: validationData.finalStatus.expiration,
          processingTime: validationData.processingTime,
          service: 'WhitelistAuthorityService',
          version: '2.0.0',
          unifiedSystem: true,
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
   * Bulk validate multiple users (simplified for database-only approach)
   * @param {Array} userValidations - Array of {discordUserId, steamId?}
   * @returns {Promise<Map>} Map of discordUserId -> validation result
   */
  static async bulkValidateUsers(userValidations) {
    const results = new Map();

    if (userValidations.length === 0) {
      return results;
    }

    try {
      // Step 1: Extract all Discord user IDs and Steam IDs
      const discordUserIds = userValidations.map(v => v.discordUserId);
      const providedSteamIds = userValidations.map(v => v.steamId).filter(Boolean);

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
      const allSteamIds = [...new Set([
        ...allLinks.map(link => link.steamid64),
        ...providedSteamIds
      ].filter(Boolean))];

      // Step 5: Bulk fetch all whitelist entries
      const allWhitelists = new Map();
      if (allSteamIds.length > 0 || discordUserIds.length > 0) {
        const whereConditions = {
          approved: true,
          revoked: false
        };

        const orConditions = [];
        if (allSteamIds.length > 0) {
          orConditions.push({ steamid64: allSteamIds });
        }
        if (discordUserIds.length > 0) {
          orConditions.push({ discord_user_id: discordUserIds });
        }

        if (orConditions.length > 0) {
          whereConditions[require('sequelize').Op.or] = orConditions;

          const whitelistEntries = await Whitelist.findAll({
            where: whereConditions,
            order: [['granted_at', 'ASC']]
          });

          // Group entries by user (Steam ID or Discord ID)
          for (const entry of whitelistEntries) {
            const key = entry.discord_user_id || entry.steamid64;
            if (!allWhitelists.has(key)) {
              allWhitelists.set(key, []);
            }
            allWhitelists.get(key).push(entry);
          }
        }
      }

      // Step 6: Process each user validation with pre-fetched data
      for (const validation of userValidations) {
        try {
          const { discordUserId, steamId } = validation;

          // Get link info from bulk lookup
          const linkInfo = linksByDiscordId.get(discordUserId) || null;
          const validatedSteamId = steamId || linkInfo?.steamId || null;

          // Get whitelist entries from bulk lookup
          const userEntries = [
            ...(allWhitelists.get(discordUserId) || []),
            ...(validatedSteamId ? (allWhitelists.get(validatedSteamId) || []) : [])
          ];

          // Process entries to determine status
          const whitelistStatus = this._processWhitelistEntries(userEntries);

          // Determine final status
          const finalStatus = this._determineWhitelistStatus(whitelistStatus, linkInfo);

          // Store result
          results.set(discordUserId, {
            isWhitelisted: finalStatus.isWhitelisted,
            steamId: validatedSteamId,
            linkInfo,
            whitelistEntries: whitelistStatus.entries,
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
      console.error('Bulk validation failed:', error.message);

      // Return error results for all users
      for (const validation of userValidations) {
        results.set(validation.discordUserId, {
          isWhitelisted: false,
          error: 'Bulk validation failed'
        });
      }

      return results;
    }
  }

  /**
   * Process whitelist entries to determine access status
   * @private
   */
  static _processWhitelistEntries(entries) {
    if (entries.length === 0) {
      return {
        hasAccess: false,
        entries: [],
        reason: 'no_entries_found'
      };
    }

    // Check for active entries (considering expiration)
    const now = new Date();
    const activeEntries = entries.filter(entry => {
      return !entry.expiration || new Date(entry.expiration) > now;
    });

    if (activeEntries.length === 0) {
      return {
        hasAccess: false,
        entries: entries,
        reason: 'all_entries_expired'
      };
    }

    // Check for permanent access
    const hasPermamentAccess = activeEntries.some(entry => !entry.expiration);

    // Calculate effective expiration for temporary entries
    let effectiveExpiration = null;
    if (!hasPermamentAccess) {
      const entriesWithDuration = activeEntries.filter(e => e.duration_value && e.duration_type);
      if (entriesWithDuration.length > 0) {
        const earliestEntry = entriesWithDuration.sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at))[0];
        let stackedExpiration = new Date(earliestEntry.granted_at);

        // Add up all durations
        let totalMonths = 0;
        let totalDays = 0;
        entriesWithDuration.forEach(entry => {
          if (entry.duration_type === 'months') {
            totalMonths += entry.duration_value;
          } else if (entry.duration_type === 'days') {
            totalDays += entry.duration_value;
          }
        });

        stackedExpiration.setMonth(stackedExpiration.getMonth() + totalMonths);
        stackedExpiration.setDate(stackedExpiration.getDate() + totalDays);

        effectiveExpiration = stackedExpiration;
      }
    }

    return {
      hasAccess: true,
      entries: activeEntries,
      isPermanent: hasPermamentAccess,
      expiration: effectiveExpiration,
      reason: 'active_entries_found'
    };
  }
}

module.exports = WhitelistAuthorityService;