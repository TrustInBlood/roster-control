const { Whitelist, PlayerDiscordLink, AuditLog } = require('../database/models');
const { getHighestPriorityGroup, squadGroups } = require('../utils/environment');
const { getAllTrackedRoles } = squadGroups;

/**
 * RoleWhitelistSyncService - Synchronizes Discord roles to database whitelist entries
 *
 * This service is the bridge between Discord roles and the unified database whitelist system.
 * It automatically creates, updates, and revokes database entries when Discord roles change.
 *
 * Core responsibilities:
 * - Create whitelist entries when users get staff/member roles
 * - Revoke whitelist entries when users lose roles
 * - Handle bulk initialization from Discord guild
 * - Maintain data consistency between Discord and database
 */
class RoleWhitelistSyncService {
  constructor(logger, discordClient = null) {
    this.logger = logger;
    this.discordClient = discordClient;
    this.trackedRoles = getAllTrackedRoles();
    this.processingUsers = new Set(); // Prevent duplicate processing

    this.logger.info('RoleWhitelistSyncService initialized', {
      trackedRoles: this.trackedRoles.length
    });
  }

  /**
   * Sync a single user's Discord roles to database whitelist entries
   * @param {string} discordUserId - Discord user ID
   * @param {string|null} newGroup - New group name, or null to remove
   * @param {Object} memberData - Discord member data
   * @param {Object} options - Sync options
   */
  async syncUserRole(discordUserId, newGroup, memberData = null, options = {}) {
    const {
      source = 'role_sync',
      skipNotification = false,
      metadata = {}
    } = options;

    // Prevent duplicate processing
    const processingKey = `${discordUserId}:${newGroup}`;
    if (this.processingUsers.has(processingKey)) {
      this.logger.debug('Skipping duplicate role sync', { discordUserId, newGroup });
      return { success: true, reason: 'duplicate_processing_skipped' };
    }

    this.processingUsers.add(processingKey);

    try {
      this.logger.debug('Starting role sync', { discordUserId, newGroup, source });

      // Step 1: Find user's primary Steam link
      const primaryLink = await PlayerDiscordLink.findOne({
        where: {
          discord_user_id: discordUserId,
          is_primary: true
        },
        order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
      });

      if (!primaryLink || !primaryLink.steamid64) {
        // User has no Steam link - create/update unlinked entry for staff
        if (newGroup && newGroup !== 'Member') {
          await this._handleUnlinkedStaff(discordUserId, newGroup, memberData, source);
        }
        return {
          success: true,
          reason: 'no_steam_link',
          hasStaffRole: newGroup && newGroup !== 'Member'
        };
      }

      // IMPORTANT: Check for and upgrade any existing unlinked placeholder entries
      // This handles cases where a user got a role before linking their Steam account
      await this._upgradeUnlinkedEntries(discordUserId, primaryLink.steamid64, source);

      // Step 2: Check if user meets confidence requirements for staff roles
      if (newGroup && newGroup !== 'Member' && primaryLink.confidence_score < 1.0) {
        this.logger.warn('SECURITY: Blocking staff whitelist due to insufficient link confidence', {
          discordUserId,
          steamId: primaryLink.steamid64,
          group: newGroup,
          confidence: primaryLink.confidence_score,
          required: 1.0
        });

        // Create a disabled entry for audit purposes only
        await this._createSecurityBlockedEntry(
          discordUserId,
          primaryLink.steamid64,
          newGroup,
          memberData,
          source,
          { insufficientConfidence: true, actualConfidence: primaryLink.confidence_score }
        );

        return {
          success: false,
          reason: 'security_blocked_insufficient_confidence',
          steamId: primaryLink.steamid64,
          confidence: primaryLink.confidence_score,
          requiredConfidence: 1.0
        };
      }

      // Step 3: Handle role-based whitelist entry
      if (newGroup) {
        // User gained a role - create/update database entry
        await this._createRoleBasedEntry(
          discordUserId,
          primaryLink.steamid64,
          newGroup,
          memberData,
          source
        );
      } else {
        // User lost all tracked roles - revoke role-based entries
        await this._revokeRoleBasedEntries(
          discordUserId,
          primaryLink.steamid64,
          memberData,
          source
        );
      }

      // Step 4: Log the sync operation
      await this._logRoleSync(discordUserId, newGroup, primaryLink.steamid64, source, metadata);

      return {
        success: true,
        steamId: primaryLink.steamid64,
        group: newGroup,
        confidence: primaryLink.confidence_score
      };

    } catch (error) {
      this.logger.error('Role sync failed', {
        discordUserId,
        newGroup,
        source,
        error: error.message
      });

      // Log the error to audit trail
      try {
        await AuditLog.create({
          actionType: 'ROLE_SYNC_ERROR',
          actorType: 'system',
          actorId: 'ROLE_SYNC_SERVICE',
          actorName: 'RoleWhitelistSyncService',
          targetType: 'discord_user',
          targetId: discordUserId,
          targetName: memberData?.user?.tag || discordUserId,
          guildId: memberData?.guild?.id || null,
          description: `Role sync failed: ${error.message}`,
          beforeState: null,
          afterState: null,
          metadata: {
            error: error.message,
            newGroup,
            source,
            ...metadata
          },
          severity: 'error'
        });
      } catch (logError) {
        this.logger.error('Failed to log role sync error', { logError: logError.message });
      }

      return {
        success: false,
        error: error.message
      };

    } finally {
      // Clean up processing set after delay
      setTimeout(() => {
        this.processingUsers.delete(processingKey);
      }, 5000);
    }
  }

  /**
   * Create or update a role-based whitelist entry
   * @private
   */
  async _createRoleBasedEntry(discordUserId, steamId, groupName, memberData, source, flags = {}) {
    // Check if user already has an active role-based entry
    const existingEntry = await Whitelist.findOne({
      where: {
        discord_user_id: discordUserId,
        source: 'role',
        revoked: false
      },
      order: [['createdAt', 'DESC']]
    });

    const userData = {
      type: groupName === 'Member' ? 'whitelist' : 'staff',
      steamid64: steamId,
      discord_user_id: discordUserId,
      discord_username: memberData?.user?.tag || '',
      username: memberData?.displayName || memberData?.user?.username || '',
      source: 'role',
      role_name: groupName,
      approved: true,
      revoked: false,
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      reason: `Role-based access: ${groupName}`,
      // Role-based entries have no expiration (permanent while role is held)
      expiration: null,
      duration_value: null,
      duration_type: null,
      metadata: {
        roleSync: true,
        syncSource: source,
        discordGuildId: memberData?.guild?.id,
        syncedAt: new Date().toISOString(),
        ...flags
      }
    };

    if (existingEntry) {
      // Update existing entry if group changed
      if (existingEntry.role_name !== groupName) {
        await existingEntry.update({
          role_name: groupName,
          type: userData.type,
          reason: userData.reason,
          username: userData.username,
          discord_username: userData.discord_username,
          metadata: {
            ...existingEntry.metadata,
            ...userData.metadata,
            updated: true,
            previousRole: existingEntry.role_name
          }
        });

        this.logger.info('Updated existing role-based whitelist entry', {
          discordUserId,
          steamId,
          previousGroup: existingEntry.role_name,
          newGroup: groupName
        });
      } else {
        this.logger.debug('Role-based entry already exists and is current', {
          discordUserId,
          steamId,
          groupName
        });
      }
    } else {
      // Create new entry
      await Whitelist.create(userData);

      this.logger.info('Created new role-based whitelist entry', {
        discordUserId,
        steamId,
        groupName,
        type: userData.type
      });
    }
  }

  /**
   * Revoke role-based whitelist entries for a user
   * @private
   */
  async _revokeRoleBasedEntries(discordUserId, steamId, memberData, source) {
    // Find all active role-based entries for this user
    const roleEntries = await Whitelist.findAll({
      where: {
        discord_user_id: discordUserId,
        source: 'role',
        revoked: false
      }
    });

    if (roleEntries.length === 0) {
      this.logger.debug('No role-based entries to revoke', { discordUserId, steamId });
      return;
    }

    // Revoke all role-based entries
    for (const entry of roleEntries) {
      await entry.update({
        revoked: true,
        revoked_by: 'SYSTEM',
        revoked_at: new Date(),
        revoked_reason: 'Discord role removed - automatic revocation',
        metadata: {
          ...entry.metadata,
          revokedByRoleSync: true,
          revokedSource: source,
          revokedAt: new Date().toISOString()
        }
      });

      this.logger.info('Revoked role-based whitelist entry', {
        discordUserId,
        steamId,
        roleName: entry.role_name,
        entryId: entry.id
      });
    }
  }

  /**
   * Upgrade any existing unlinked placeholder entries when user gets a proper Steam link
   * @private
   */
  async _upgradeUnlinkedEntries(discordUserId, steamId, source) {
    try {
      // Find all unlinked placeholder entries for this user
      const unlinkedEntries = await Whitelist.findAll({
        where: {
          discord_user_id: discordUserId,
          steamid64: '00000000000000000', // Placeholder Steam ID
          source: 'role',
          approved: false,
          revoked: false
        }
      });

      if (unlinkedEntries.length === 0) {
        return; // No unlinked entries to upgrade
      }

      this.logger.info('Upgrading unlinked placeholder entries to proper role-based entries', {
        discordUserId,
        steamId,
        count: unlinkedEntries.length
      });

      // Update each placeholder entry with the real Steam ID and approve it
      for (const entry of unlinkedEntries) {
        await entry.update({
          steamid64: steamId,
          approved: true,
          reason: `Role-based access: ${entry.role_name}`,
          metadata: {
            ...entry.metadata,
            upgraded: true,
            upgradedAt: new Date().toISOString(),
            upgradedFrom: 'unlinked_placeholder',
            upgradeSource: source,
            previousSteamId: '00000000000000000'
          }
        });

        this.logger.info('Upgraded unlinked entry to proper role-based entry', {
          discordUserId,
          steamId,
          roleName: entry.role_name,
          entryId: entry.id
        });
      }

    } catch (error) {
      this.logger.error('Failed to upgrade unlinked entries', {
        discordUserId,
        steamId,
        error: error.message
      });
      // Don't throw - this is not critical enough to fail the sync
    }
  }

  /**
   * Handle unlinked staff members (those with staff roles but no Steam link)
   * @private
   */
  async _handleUnlinkedStaff(discordUserId, groupName, memberData, source) {
    // Create a placeholder entry for tracking purposes
    // This won't grant actual whitelist access but helps with auditing
    await Whitelist.create({
      type: 'staff',
      steamid64: '00000000000000000', // Placeholder Steam ID for unlinked users
      discord_user_id: discordUserId,
      discord_username: memberData?.user?.tag || '',
      username: memberData?.displayName || memberData?.user?.username || '',
      source: 'role',
      role_name: groupName,
      approved: false, // Not approved since no Steam link
      revoked: false,
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      reason: `Unlinked staff role: ${groupName}`,
      expiration: null,
      metadata: {
        roleSync: true,
        unlinkedStaff: true,
        syncSource: source,
        requiresSteamLink: true,
        discordGuildId: memberData?.guild?.id,
        syncedAt: new Date().toISOString()
      }
    });

    this.logger.warn('Created placeholder entry for unlinked staff', {
      discordUserId,
      groupName,
      reason: 'no_steam_link'
    });
  }

  /**
   * Bulk sync all guild members to database
   * @param {string} guildId - Discord guild ID
   * @param {Object} options - Sync options
   */
  async bulkSyncGuild(guildId, options = {}) {
    const { dryRun = false, batchSize = 50 } = options;

    if (!this.discordClient) {
      throw new Error('Discord client not available for bulk sync');
    }

    this.logger.info('Starting bulk guild role sync', { guildId, dryRun, batchSize });

    try {
      // Fetch guild and all members
      const guild = await this.discordClient.guilds.fetch(guildId);
      const members = await guild.members.fetch();

      this.logger.info('Fetched guild members for sync', {
        guildId,
        memberCount: members.size
      });

      // Filter members who have tracked roles
      const membersWithRoles = [];
      for (const [memberId, member] of members) {
        if (member.user.bot) continue; // Skip bots

        const userGroup = getHighestPriorityGroup(member.roles.cache);
        if (userGroup) {
          membersWithRoles.push({
            discordUserId: memberId,
            group: userGroup,
            member: member
          });
        }
      }

      this.logger.info('Found members with tracked roles', {
        guildId,
        totalMembers: members.size,
        membersWithRoles: membersWithRoles.length
      });

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          totalMembers: members.size,
          membersToSync: membersWithRoles.length,
          groups: membersWithRoles.reduce((acc, m) => {
            acc[m.group] = (acc[m.group] || 0) + 1;
            return acc;
          }, {})
        };
      }

      // Process in batches
      const results = [];
      for (let i = 0; i < membersWithRoles.length; i += batchSize) {
        const batch = membersWithRoles.slice(i, i + batchSize);

        this.logger.info('Processing batch', {
          batchNumber: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          totalBatches: Math.ceil(membersWithRoles.length / batchSize)
        });

        // Process batch concurrently
        const batchPromises = batch.map(({ discordUserId, group, member }) =>
          this.syncUserRole(discordUserId, group, member, {
            source: 'bulk_sync',
            skipNotification: true,
            metadata: { bulkSync: true, guildId }
          }).catch(error => ({
            discordUserId,
            success: false,
            error: error.message
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to avoid overwhelming the database
        if (i + batchSize < membersWithRoles.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const withoutSteamLinks = results.filter(r => r.success && r.reason === 'no_steam_link').length;
      const staffWithoutLinks = results.filter(r => r.success && r.reason === 'no_steam_link' && r.hasStaffRole).length;

      this.logger.info('Bulk guild sync completed', {
        guildId,
        totalProcessed: results.length,
        successful,
        failed,
        withoutSteamLinks,
        staffWithoutLinks
      });

      return {
        success: true,
        totalProcessed: results.length,
        successful,
        failed,
        withoutSteamLinks,
        staffWithoutLinks,
        results
      };

    } catch (error) {
      this.logger.error('Bulk guild sync failed', {
        guildId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get sync status for a Discord user
   * @param {string} discordUserId - Discord user ID
   */
  async getSyncStatus(discordUserId) {
    const roleEntries = await Whitelist.findAll({
      where: {
        discord_user_id: discordUserId,
        source: 'role'
      },
      order: [['createdAt', 'DESC']]
    });

    const primaryLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: discordUserId,
        is_primary: true
      }
    });

    return {
      discordUserId,
      hasSteamLink: !!primaryLink,
      steamId: primaryLink?.steamid64 || null,
      linkConfidence: primaryLink?.confidence_score || 0,
      roleEntries: roleEntries.map(entry => ({
        id: entry.id,
        roleName: entry.role_name,
        type: entry.type,
        approved: entry.approved,
        revoked: entry.revoked,
        createdAt: entry.createdAt,
        revokedAt: entry.revoked_at
      }))
    };
  }

  /**
   * Log role sync operation to audit trail
   * @private
   */
  async _logRoleSync(discordUserId, newGroup, steamId, source, metadata) {
    try {
      await AuditLog.create({
        actionType: 'ROLE_SYNC',
        actorType: 'system',
        actorId: 'ROLE_SYNC_SERVICE',
        actorName: 'RoleWhitelistSyncService',
        targetType: 'discord_user',
        targetId: discordUserId,
        targetName: steamId || discordUserId,
        guildId: metadata.discordGuildId || null,
        description: `Role sync: ${newGroup || 'no group'} (${source})`,
        beforeState: null,
        afterState: {
          group: newGroup,
          steamId
        },
        metadata: {
          steamId,
          source,
          hasLink: !!steamId,
          ...metadata
        },
        severity: 'info'
      });
    } catch (error) {
      this.logger.error('Failed to log role sync', { error: error.message });
    }
  }

  /**
   * Create a security-blocked entry for audit purposes
   * This creates a revoked entry to track access attempts that were blocked due to insufficient confidence
   * @param {string} discordUserId - Discord user ID
   * @param {string} steamId - Steam ID64
   * @param {string} groupName - Role group name
   * @param {Object} memberData - Discord member data
   * @param {string} source - Source of the sync
   * @param {Object} flags - Additional flags/metadata
   */
  async _createSecurityBlockedEntry(discordUserId, steamId, groupName, memberData, source, flags = {}) {
    const userData = {
      type: 'staff', // Would have been staff access
      steamid64: steamId,
      discord_user_id: discordUserId,
      discord_username: memberData?.user?.tag || '',
      username: memberData?.displayName || memberData?.user?.username || '',
      source: 'role',
      role_name: groupName,
      approved: false, // SECURITY: Not approved due to low confidence
      revoked: true,   // SECURITY: Immediately revoked for security
      granted_by: 'SYSTEM',
      granted_at: new Date(),
      revoked_by: 'SECURITY_SYSTEM',
      revoked_at: new Date(),
      revoked_reason: `Security block: insufficient link confidence (${flags.actualConfidence}/1.0)`,
      reason: `SECURITY BLOCKED: Role-based access denied for ${groupName}`,
      expiration: null,
      duration_value: null,
      duration_type: null,
      metadata: {
        roleSync: true,
        source,
        syncedAt: new Date().toISOString(),
        securityBlocked: true,
        blockReason: 'insufficient_confidence',
        actualConfidence: flags.actualConfidence,
        requiredConfidence: 1.0,
        ...flags
      }
    };

    const blockedEntry = await Whitelist.create(userData);

    this.logger.warn('SECURITY: Created security-blocked entry for audit trail', {
      discordUserId,
      steamId,
      group: groupName,
      confidence: flags.actualConfidence,
      entryId: blockedEntry.id
    });

    return blockedEntry;
  }
}

module.exports = RoleWhitelistSyncService;