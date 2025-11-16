const { PlayerDiscordLink, StaffRoleArchive, AuditLog } = require('../database/models');
const { getAllStaffRoles } = require('../../config/discordRoles');
const { getHighestPriorityGroup } = require('../utils/environment');
const { createServiceLogger } = require('../utils/logger');

/**
 * StaffScrubService
 * Handles removal of staff roles with archiving for potential restoration
 */
class StaffScrubService {
  constructor(discordClient) {
    this.client = discordClient;
    this.logger = createServiceLogger('StaffScrubService');
    this.REQUIRED_CONFIDENCE = 1.0;
  }

  /**
   * Identify staff members without sufficient confidence links
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Staff members to scrub {toRemove, hasValidLink, stats}
   */
  async identifyUnlinkedStaff(guildId) {
    try {
      this.logger.info(`Identifying staff without sufficient confidence in guild ${guildId}`);

      const guild = await this.client.guilds.fetch(guildId);
      const staffRoleIds = getAllStaffRoles();

      this.logger.info(`Staff role IDs: ${staffRoleIds.length} roles`);

      // Fetch all members (with timeout for large guilds)
      const members = await guild.members.fetch({ timeout: 60000 });

      const categorized = {
        toRemove: [],
        hasValidLink: [],
        stats: {
          totalMembers: members.size,
          withStaffRole: 0,
          noLink: 0,
          lowConfidence: 0,
          validLink: 0,
          byRole: {}
        }
      };

      for (const [userId, member] of members) {
        // Check if member has any staff role
        const staffRoles = member.roles.cache
          .filter(role => staffRoleIds.includes(role.id))
          .map(role => ({ id: role.id, name: role.name }));

        if (staffRoles.length === 0) {
          continue; // Skip members without staff roles
        }

        categorized.stats.withStaffRole++;

        // Determine highest priority role
        const highestRole = getHighestPriorityGroup(staffRoles.map(r => r.name));

        // Check Steam account link and confidence
        const link = await PlayerDiscordLink.findByDiscordId(userId);

        if (!link) {
          // No link at all
          categorized.toRemove.push({
            userId,
            username: member.user.username,
            displayName: member.displayName || member.user.username,
            roles: staffRoles,
            highestRole,
            linkStatus: 'no_link',
            confidence: null,
            steamId: null,
            joinedAt: member.joinedAt
          });

          categorized.stats.noLink++;

          // Track by role
          if (!categorized.stats.byRole[highestRole]) {
            categorized.stats.byRole[highestRole] = { noLink: 0, lowConfidence: 0, valid: 0 };
          }
          categorized.stats.byRole[highestRole].noLink++;
        } else {
          const confidence = parseFloat(link.confidence_score);

          if (confidence < this.REQUIRED_CONFIDENCE) {
            // Has link but insufficient confidence
            categorized.toRemove.push({
              userId,
              username: member.user.username,
              displayName: member.displayName || member.user.username,
              roles: staffRoles,
              highestRole,
              linkStatus: 'insufficient_confidence',
              confidence,
              steamId: link.steam_id,
              joinedAt: member.joinedAt
            });

            categorized.stats.lowConfidence++;

            // Track by role
            if (!categorized.stats.byRole[highestRole]) {
              categorized.stats.byRole[highestRole] = { noLink: 0, lowConfidence: 0, valid: 0 };
            }
            categorized.stats.byRole[highestRole].lowConfidence++;
          } else {
            // Valid link with sufficient confidence
            categorized.hasValidLink.push({
              userId,
              username: member.user.username,
              displayName: member.displayName || member.user.username,
              roles: staffRoles,
              highestRole,
              linkStatus: 'valid',
              confidence,
              steamId: link.steam_id
            });

            categorized.stats.validLink++;

            // Track by role
            if (!categorized.stats.byRole[highestRole]) {
              categorized.stats.byRole[highestRole] = { noLink: 0, lowConfidence: 0, valid: 0 };
            }
            categorized.stats.byRole[highestRole].valid++;
          }
        }
      }

      this.logger.info('Staff identification complete:', categorized.stats);

      return categorized;
    } catch (error) {
      this.logger.error('Error identifying unlinked staff:', error);
      throw error;
    }
  }

  /**
   * Generate staff scrub preview report
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Detailed report
   */
  async generateStaffScrubReport(guildId) {
    try {
      this.logger.info('Generating staff scrub report');

      const categorized = await this.identifyUnlinkedStaff(guildId);

      const report = {
        timestamp: new Date().toISOString(),
        guildId,
        summary: {
          totalMembers: categorized.stats.totalMembers,
          withStaffRole: categorized.stats.withStaffRole,
          toRemove: categorized.toRemove.length,
          validLink: categorized.stats.validLink
        },
        breakdown: {
          noLink: categorized.stats.noLink,
          lowConfidence: categorized.stats.lowConfidence,
          byRole: categorized.stats.byRole
        },
        toRemove: categorized.toRemove,
        sampleToRemove: categorized.toRemove.slice(0, 20), // First 20 for preview
        hasValidLink: categorized.hasValidLink
      };

      this.logger.info('Staff scrub report generated:', report.summary);

      return report;
    } catch (error) {
      this.logger.error('Error generating staff scrub report:', error);
      throw error;
    }
  }

  /**
   * Archive staff roles before removal
   * @param {string} userId - Discord user ID
   * @param {Array} roles - Roles to archive [{id, name}]
   * @param {Object} context - Removal context {approvalId, executedBy, guildId, linkStatus, confidence, steamId}
   * @returns {Promise<Object>} Archive entry
   */
  async archiveStaffRoles(userId, roles, context) {
    try {
      this.logger.info(`Archiving staff roles for user ${userId}`);

      const { approvalId, executedBy, guildId, linkStatus, confidence, steamId } = context;

      // Fetch member info
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);

      // Determine highest priority role
      const highestRole = getHighestPriorityGroup(roles.map(r => r.name));

      // Create archive entry
      const archiveData = {
        discord_user_id: userId,
        discord_username: member.user.username,
        discord_display_name: member.displayName || member.user.username,
        removed_roles: roles,
        highest_role_name: highestRole,
        highest_role_group: highestRole,
        removal_reason: linkStatus === 'no_link'
          ? 'No Steam account linked to Discord account'
          : `Insufficient link confidence (${confidence.toFixed(2)} < ${this.REQUIRED_CONFIDENCE})`,
        removal_type: 'scrub_unlinked',
        removed_by_user_id: executedBy?.userId || null,
        removed_by_username: executedBy?.username || null,
        scrub_approval_id: approvalId,
        prior_link_status: linkStatus,
        prior_confidence_score: confidence,
        prior_steam_id: steamId,
        restore_eligible: true,
        restore_expiry: null, // No expiry by default
        metadata: {
          scrubbedAt: new Date().toISOString(),
          memberJoinedAt: member.joinedAt?.toISOString()
        }
      };

      const archive = await StaffRoleArchive.createArchive(archiveData);

      // Log to AuditLog
      await AuditLog.logAction({
        actionType: 'STAFF_ARCHIVE_CREATED',
        actorType: executedBy ? 'user' : 'system',
        actorId: executedBy?.userId || 'SYSTEM',
        actorName: executedBy?.username || 'System',
        targetType: 'discord_user',
        targetId: userId,
        targetName: member.user.username,
        guildId,
        description: `Archived staff roles before removal`,
        metadata: {
          approvalId,
          archiveId: archive.id,
          roles,
          highestRole,
          linkStatus,
          confidence
        },
        success: true,
        severity: 'info'
      });

      this.logger.info(`Staff roles archived for user ${userId}, archive ID: ${archive.id}`);

      return archive;
    } catch (error) {
      this.logger.error(`Error archiving staff roles for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Execute staff role removal with archiving
   * @param {Array} userIds - Discord user IDs
   * @param {Object} options - { approvalId, executedBy, guildId, staffData }
   * @returns {Promise<Object>} Results {successful: [], failed: [], archived: []}
   */
  async executeStaffScrub(userIds, options = {}) {
    try {
      const { approvalId = null, executedBy = null, guildId, staffData = [] } = options;

      this.logger.info(`Starting staff scrub for ${userIds.length} users`, {
        approvalId,
        executedBy: executedBy?.userId
      });

      if (!guildId) {
        throw new Error('guildId is required for staff scrub execution');
      }

      const guild = await this.client.guilds.fetch(guildId);
      const staffRoleIds = getAllStaffRoles();

      const results = {
        successful: [],
        failed: [],
        archived: [],
        total: userIds.length,
        startTime: new Date()
      };

      for (const userId of userIds) {
        try {
          // Get staff data for this user (from preview)
          const userStaffData = staffData.find(s => s.userId === userId);

          if (!userStaffData) {
            this.logger.warn(`No staff data found for user ${userId}, skipping`);
            results.failed.push({
              userId,
              reason: 'no_staff_data',
              error: 'User not found in preview data'
            });
            continue;
          }

          // Verify user still lacks sufficient confidence
          const link = await PlayerDiscordLink.findByDiscordId(userId);
          const confidence = link ? parseFloat(link.confidence_score) : 0;

          if (link && confidence >= this.REQUIRED_CONFIDENCE) {
            this.logger.warn(`User ${userId} now has sufficient confidence, skipping removal`);
            results.failed.push({
              userId,
              username: userStaffData.username,
              reason: 'user_now_has_confidence',
              error: `User gained sufficient confidence (${confidence.toFixed(2)}) since preview`
            });
            continue;
          }

          // Fetch member
          const member = await guild.members.fetch(userId);

          if (!member) {
            this.logger.warn(`User ${userId} not found in guild, skipping`);
            results.failed.push({
              userId,
              username: userStaffData.username,
              reason: 'user_not_found',
              error: 'User not found in guild'
            });
            continue;
          }

          // Get current staff roles
          const currentStaffRoles = member.roles.cache
            .filter(role => staffRoleIds.includes(role.id))
            .map(role => ({ id: role.id, name: role.name }));

          if (currentStaffRoles.length === 0) {
            this.logger.warn(`User ${userId} has no staff roles, skipping`);
            results.failed.push({
              userId,
              username: member.user.username,
              reason: 'no_staff_roles',
              error: 'User has no staff roles'
            });
            continue;
          }

          // Archive roles BEFORE removal
          const archive = await this.archiveStaffRoles(userId, currentStaffRoles, {
            approvalId,
            executedBy,
            guildId,
            linkStatus: link ? 'insufficient_confidence' : 'no_link',
            confidence: link ? parseFloat(link.confidence_score) : null,
            steamId: link ? link.steam_id : null
          });

          results.archived.push({
            userId,
            username: member.user.username,
            archiveId: archive.id,
            roles: currentStaffRoles
          });

          // Remove all staff roles
          for (const role of currentStaffRoles) {
            await member.roles.remove(role.id, `Staff scrub - Insufficient link confidence (Approval: ${approvalId})`);
          }

          // Log to AuditLog
          await AuditLog.logAction({
            actionType: 'STAFF_SCRUB',
            actorType: executedBy ? 'user' : 'system',
            actorId: executedBy?.userId || 'SYSTEM',
            actorName: executedBy?.username || 'System',
            targetType: 'discord_user',
            targetId: userId,
            targetName: member.user.username,
            guildId,
            description: `Removed staff roles from user with insufficient link confidence`,
            metadata: {
              approvalId,
              archiveId: archive.id,
              removedRoles: currentStaffRoles,
              linkStatus: link ? 'insufficient_confidence' : 'no_link',
              confidence: link ? parseFloat(link.confidence_score) : null,
              requiredConfidence: this.REQUIRED_CONFIDENCE
            },
            success: true,
            severity: 'info'
          });

          results.successful.push({
            userId,
            username: member.user.username,
            displayName: member.displayName || member.user.username,
            removedRoles: currentStaffRoles,
            archiveId: archive.id
          });

          this.logger.info(`Successfully removed staff roles from user ${userId} (${member.user.username}), archive ID: ${archive.id}`);
        } catch (userError) {
          this.logger.error(`Failed to scrub staff user ${userId}:`, userError);

          // Log failure to AuditLog
          await AuditLog.logAction({
            actionType: 'STAFF_SCRUB',
            actorType: executedBy ? 'user' : 'system',
            actorId: executedBy?.userId || 'SYSTEM',
            actorName: executedBy?.username || 'System',
            targetType: 'discord_user',
            targetId: userId,
            targetName: 'Unknown',
            guildId,
            description: `Failed to remove staff roles`,
            metadata: {
              approvalId,
              error: userError.message
            },
            success: false,
            severity: 'warning',
            errorMessage: userError.message
          });

          results.failed.push({
            userId,
            reason: 'removal_error',
            error: userError.message
          });
        }
      }

      results.endTime = new Date();
      results.durationMs = results.endTime - results.startTime;

      this.logger.info('Staff scrub complete:', {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        archived: results.archived.length,
        durationSec: Math.round(results.durationMs / 1000)
      });

      return results;
    } catch (error) {
      this.logger.error('Error during staff scrub execution:', error);
      throw error;
    }
  }

  /**
   * Restore staff roles from archive
   * @param {string} userId - Discord user ID
   * @param {number} archiveId - Archive entry ID (optional, uses latest if not provided)
   * @param {Object} restoredBy - Admin info {userId, username}
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Restoration result
   */
  async restoreStaffRoles(userId, archiveId, restoredBy, guildId) {
    try {
      this.logger.info(`Restoring staff roles for user ${userId}, archive ID: ${archiveId || 'latest'}`);

      // Verify user now has sufficient confidence
      const link = await PlayerDiscordLink.findByDiscordId(userId);

      if (!link) {
        throw new Error('User still has no Steam account link');
      }

      const confidence = parseFloat(link.confidence_score);

      if (confidence < this.REQUIRED_CONFIDENCE) {
        throw new Error(`User confidence (${confidence.toFixed(2)}) is still below required threshold (${this.REQUIRED_CONFIDENCE})`);
      }

      // Get archive entry
      let archive;
      if (archiveId) {
        archive = await StaffRoleArchive.findByPk(archiveId);
      } else {
        archive = await StaffRoleArchive.findLatestByDiscordId(userId);
      }

      if (!archive) {
        throw new Error('No archive entry found for user');
      }

      // Verify archive belongs to this user
      if (archive.discord_user_id !== userId) {
        throw new Error('Archive entry does not belong to this user');
      }

      // Check eligibility
      if (!archive.isEligibleForRestore()) {
        throw new Error(`Archive entry is not eligible for restoration (restored: ${archive.restored}, eligible: ${archive.restore_eligible})`);
      }

      // Fetch member and guild
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);

      if (!member) {
        throw new Error('User not found in guild');
      }

      // Restore roles
      const rolesToRestore = archive.removed_roles;
      const restoredRoles = [];
      const failedRoles = [];

      for (const roleData of rolesToRestore) {
        try {
          // Check if role still exists
          const role = guild.roles.cache.get(roleData.id);

          if (!role) {
            this.logger.warn(`Role ${roleData.name} (${roleData.id}) no longer exists, skipping`);
            failedRoles.push({ ...roleData, reason: 'role_not_found' });
            continue;
          }

          // Add role back to member
          await member.roles.add(roleData.id, `Staff role restoration - Archive ID: ${archive.id}`);

          restoredRoles.push(roleData);
          this.logger.info(`Restored role ${roleData.name} to user ${userId}`);
        } catch (roleError) {
          this.logger.error(`Failed to restore role ${roleData.name}:`, roleError);
          failedRoles.push({ ...roleData, reason: roleError.message });
        }
      }

      // Mark archive as restored
      await archive.update({
        restored: true,
        restored_at: new Date(),
        restored_by_user_id: restoredBy.userId,
        metadata: {
          ...archive.metadata,
          restoredAt: new Date().toISOString(),
          restoredBy: restoredBy.username,
          restoredRoles,
          failedRoles,
          newConfidence: confidence
        }
      });

      // Log to AuditLog
      await AuditLog.logAction({
        actionType: 'STAFF_ROLES_RESTORED',
        actorType: 'user',
        actorId: restoredBy.userId,
        actorName: restoredBy.username,
        targetType: 'discord_user',
        targetId: userId,
        targetName: member.user.username,
        guildId,
        description: `Restored staff roles from archive`,
        metadata: {
          archiveId: archive.id,
          restoredRoles,
          failedRoles,
          oldConfidence: archive.prior_confidence_score,
          newConfidence: confidence,
          steamId: link.steam_id
        },
        success: true,
        severity: 'info'
      });

      this.logger.info(`Staff roles restored for user ${userId}, ${restoredRoles.length} roles restored, ${failedRoles.length} failed`);

      return {
        success: true,
        userId,
        username: member.user.username,
        archiveId: archive.id,
        restoredRoles,
        failedRoles,
        totalRestored: restoredRoles.length,
        totalFailed: failedRoles.length
      };
    } catch (error) {
      this.logger.error(`Error restoring staff roles for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Send notification to removed staff member
   * @param {string} userId - Discord user ID
   * @param {Object} archiveInfo - Archive details {archiveId, removedRoles, linkStatus, confidence}
   * @returns {Promise<boolean>} Success status
   */
  async notifyRemovedStaff(userId, archiveInfo) {
    try {
      this.logger.info(`Sending staff removal notification to user ${userId}`);

      const user = await this.client.users.fetch(userId);

      if (!user) {
        this.logger.warn(`User ${userId} not found, cannot send notification`);
        return false;
      }

      const roleNames = archiveInfo.removedRoles.map(r => r.name).join(', ');
      const confidenceText = archiveInfo.confidence !== null
        ? `Your current link confidence is ${archiveInfo.confidence.toFixed(2)}, but ${this.REQUIRED_CONFIDENCE} is required for staff roles.`
        : 'You do not have a Steam account linked to your Discord account.';

      const message = {
        embeds: [{
          title: 'Staff Roles Removed',
          description: `Your staff roles have been removed due to insufficient Steam account link confidence.`,
          color: 0xFF0000, // Red
          fields: [
            {
              name: 'Removed Roles',
              value: roleNames,
              inline: false
            },
            {
              name: 'Reason',
              value: confidenceText,
              inline: false
            },
            {
              name: 'How to restore your roles',
              value: archiveInfo.linkStatus === 'no_link'
                ? '1. Link your Steam account using the `/linkid` command\n2. Verify your account in-game to reach 1.0 confidence\n3. Contact a Head Admin for role restoration'
                : '1. Verify your Steam account in-game to reach 1.0 confidence\n2. Contact a Head Admin for role restoration',
              inline: false
            },
            {
              name: 'Archive ID',
              value: `Your roles have been archived (ID: ${archiveInfo.archiveId}) and can be restored once you meet the requirements.`,
              inline: false
            },
            {
              name: 'Need help?',
              value: 'Contact a Head Admin or Executive Admin for assistance.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString()
        }]
      };

      await user.send(message);

      this.logger.info(`Staff removal notification sent successfully to user ${userId}`);
      return true;
    } catch (error) {
      // DM failures are non-critical (user may have DMs disabled)
      this.logger.warn(`Failed to send staff removal notification to user ${userId}:`, error.message);
      return false;
    }
  }
}

module.exports = StaffScrubService;
