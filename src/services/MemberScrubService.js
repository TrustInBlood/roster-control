const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { getAllMemberRoles, getAllWhitelistAwardRoles } = require('../../config/discordRoles');
const { createServiceLogger } = require('../utils/logger');

/**
 * MemberScrubService
 * Handles removal of Member role from unlinked Discord users
 */
class MemberScrubService {
  constructor(discordClient) {
    this.client = discordClient;
    this.logger = createServiceLogger('MemberScrubService');
  }

  /**
   * Identify all Discord members without Steam account links
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Categorized members {toRemove, hasLink, stats}
   */
  async identifyUnlinkedMembers(guildId) {
    try {
      this.logger.info(`Identifying unlinked members in guild ${guildId}`);

      const guild = await this.client.guilds.fetch(guildId);
      const memberRoleIds = getAllMemberRoles();
      const whitelistAwardRoleIds = getAllWhitelistAwardRoles();
      const allTargetRoleIds = [...memberRoleIds, ...whitelistAwardRoleIds];

      this.logger.info(`Target role IDs: ${allTargetRoleIds.length} roles`);

      // Fetch all members (with timeout for large guilds)
      const members = await guild.members.fetch({ timeout: 60000 });

      const categorized = {
        toRemove: [],
        hasLink: [],
        stats: {
          totalMembers: 0,
          withMemberRole: 0,
          hasLink: 0,
          noLink: 0,
          rolesToRemove: {
            member: 0,
            donator: 0,
            firstResponder: 0,
            serviceMember: 0
          }
        }
      };

      categorized.stats.totalMembers = members.size;

      for (const [userId, member] of members) {
        // Check if member has any target role
        const hasAnyTargetRole = member.roles.cache.some(role =>
          allTargetRoleIds.includes(role.id)
        );

        if (!hasAnyTargetRole) {
          continue; // Skip members without target roles
        }

        categorized.stats.withMemberRole++;

        // Check if user has a Steam account link
        const link = await PlayerDiscordLink.findByDiscordId(userId);

        if (!link) {
          // No link - candidate for removal
          const userRoles = member.roles.cache
            .filter(role => allTargetRoleIds.includes(role.id))
            .map(role => ({ id: role.id, name: role.name }));

          categorized.toRemove.push({
            userId,
            username: member.user.username,
            displayName: member.displayName || member.user.username,
            roles: userRoles,
            joinedAt: member.joinedAt,
            hasLink: false
          });

          categorized.stats.noLink++;

          // Track which specific roles will be removed
          userRoles.forEach(role => {
            if (memberRoleIds.includes(role.id)) {
              categorized.stats.rolesToRemove.member++;
            } else if (role.name === 'Donator') {
              categorized.stats.rolesToRemove.donator++;
            } else if (role.name === 'First Responder') {
              categorized.stats.rolesToRemove.firstResponder++;
            } else if (role.name === 'Service Member') {
              categorized.stats.rolesToRemove.serviceMember++;
            }
          });
        } else {
          // Has link - keep roles
          categorized.hasLink.push({
            userId,
            username: member.user.username,
            displayName: member.displayName || member.user.username,
            steamId: link.steam_id,
            confidence: parseFloat(link.confidence_score),
            hasLink: true
          });

          categorized.stats.hasLink++;
        }
      }

      this.logger.info('Member identification complete:', categorized.stats);

      return categorized;
    } catch (error) {
      this.logger.error('Error identifying unlinked members:', error);
      throw error;
    }
  }

  /**
   * Generate member scrub preview report
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Report with counts and data
   */
  async generateMemberScrubReport(guildId) {
    try {
      this.logger.info('Generating member scrub report');

      const categorized = await this.identifyUnlinkedMembers(guildId);

      const report = {
        timestamp: new Date().toISOString(),
        guildId,
        summary: {
          totalMembers: categorized.stats.totalMembers,
          withMemberRole: categorized.stats.withMemberRole,
          hasLink: categorized.stats.hasLink,
          toRemove: categorized.toRemove.length
        },
        breakdown: {
          rolesToRemove: categorized.stats.rolesToRemove
        },
        toRemove: categorized.toRemove,
        sampleToRemove: categorized.toRemove.slice(0, 20), // First 20 for preview
        hasLink: categorized.hasLink
      };

      this.logger.info('Member scrub report generated:', report.summary);

      return report;
    } catch (error) {
      this.logger.error('Error generating member scrub report:', error);
      throw error;
    }
  }

  /**
   * Remove Member role from unlinked users
   * @param {Array} userIds - Discord user IDs to scrub
   * @param {Object} options - { approvalId, executedBy, guildId }
   * @returns {Promise<Object>} { successful: [], failed: [], stats: {} }
   */
  async executeMemberScrub(userIds, options = {}) {
    try {
      const { approvalId = null, executedBy = null, guildId } = options;

      this.logger.info(`Starting member scrub for ${userIds.length} users`, {
        approvalId,
        executedBy: executedBy?.userId
      });

      if (!guildId) {
        throw new Error('guildId is required for member scrub execution');
      }

      const guild = await this.client.guilds.fetch(guildId);
      const memberRoleIds = getAllMemberRoles();
      const whitelistAwardRoleIds = getAllWhitelistAwardRoles();
      const allTargetRoleIds = [...memberRoleIds, ...whitelistAwardRoleIds];

      const results = {
        successful: [],
        failed: [],
        total: userIds.length,
        startTime: new Date()
      };

      for (const userId of userIds) {
        try {
          // Verify user still lacks link
          const link = await PlayerDiscordLink.findByDiscordId(userId);

          if (link) {
            this.logger.warn(`User ${userId} now has a link, skipping removal`);
            results.failed.push({
              userId,
              reason: 'user_now_has_link',
              error: 'User gained a link since preview was generated'
            });
            continue;
          }

          // Fetch member
          const member = await guild.members.fetch(userId);

          if (!member) {
            this.logger.warn(`User ${userId} not found in guild, skipping`);
            results.failed.push({
              userId,
              reason: 'user_not_found',
              error: 'User not found in guild'
            });
            continue;
          }

          // Get roles to remove
          const rolesToRemove = member.roles.cache
            .filter(role => allTargetRoleIds.includes(role.id))
            .map(role => ({ id: role.id, name: role.name }));

          if (rolesToRemove.length === 0) {
            this.logger.warn(`User ${userId} has no target roles, skipping`);
            results.failed.push({
              userId,
              username: member.user.username,
              reason: 'no_roles_to_remove',
              error: 'User has no member/award roles'
            });
            continue;
          }

          // Remove all target roles
          for (const role of rolesToRemove) {
            await member.roles.remove(role.id, `Member scrub - Unlinked account (Approval: ${approvalId})`);
          }

          // Log to AuditLog
          await AuditLog.logAction({
            actionType: 'MEMBER_SCRUB',
            actorType: executedBy ? 'user' : 'system',
            actorId: executedBy?.userId || 'SYSTEM',
            actorName: executedBy?.username || 'System',
            targetType: 'discord_user',
            targetId: userId,
            targetName: member.user.username,
            guildId,
            description: `Removed member roles from unlinked user`,
            metadata: {
              approvalId,
              removedRoles: rolesToRemove,
              reason: 'no_steam_link'
            },
            success: true,
            severity: 'info'
          });

          results.successful.push({
            userId,
            username: member.user.username,
            displayName: member.displayName || member.user.username,
            removedRoles: rolesToRemove
          });

          this.logger.info(`Successfully removed roles from user ${userId} (${member.user.username})`);
        } catch (userError) {
          this.logger.error(`Failed to scrub user ${userId}:`, userError);

          // Log failure to AuditLog
          await AuditLog.logAction({
            actionType: 'MEMBER_SCRUB',
            actorType: executedBy ? 'user' : 'system',
            actorId: executedBy?.userId || 'SYSTEM',
            actorName: executedBy?.username || 'System',
            targetType: 'discord_user',
            targetId: userId,
            targetName: 'Unknown',
            guildId,
            description: `Failed to remove member roles from unlinked user`,
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

      this.logger.info('Member scrub complete:', {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        durationSec: Math.round(results.durationMs / 1000)
      });

      return results;
    } catch (error) {
      this.logger.error('Error during member scrub execution:', error);
      throw error;
    }
  }

  /**
   * Send notification DM to removed member
   * @param {string} userId - Discord user ID
   * @param {Object} info - Removal context {removedRoles, approvalId}
   * @returns {Promise<boolean>} Success status
   */
  async notifyRemovedMember(userId, info) {
    try {
      this.logger.info(`Sending removal notification to user ${userId}`);

      const user = await this.client.users.fetch(userId);

      if (!user) {
        this.logger.warn(`User ${userId} not found, cannot send notification`);
        return false;
      }

      const roleNames = info.removedRoles.map(r => r.name).join(', ');

      const message = {
        embeds: [{
          title: 'Member Roles Removed',
          description: `Your member roles have been removed because your Discord account is not linked to a Steam account.`,
          color: 0xFF9900, // Orange
          fields: [
            {
              name: 'Removed Roles',
              value: roleNames || 'Member',
              inline: false
            },
            {
              name: 'Why was this done?',
              value: 'All members must link their Steam accounts to maintain member status and server access.',
              inline: false
            },
            {
              name: 'How to restore your roles',
              value: '1. Link your Steam account using the `/linkid` command in Discord\n2. Your roles will be automatically restored once linked',
              inline: false
            },
            {
              name: 'Need help?',
              value: 'Contact a staff member if you need assistance linking your Steam account.',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: `Approval ID: ${info.approvalId || 'N/A'}`
          }
        }]
      };

      await user.send(message);

      this.logger.info(`Notification sent successfully to user ${userId}`);
      return true;
    } catch (error) {
      // DM failures are non-critical (user may have DMs disabled)
      this.logger.warn(`Failed to send notification to user ${userId}:`, error.message);
      return false;
    }
  }
}

module.exports = MemberScrubService;
