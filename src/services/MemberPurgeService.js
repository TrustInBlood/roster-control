const { createServiceLogger } = require('../utils/logger');
const { getMemberCacheService } = require('./MemberCacheService');
const { getRoleArchiveService } = require('./RoleArchiveService');
const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { DISCORD_ROLES, getAllAdminRoles } = require('../utils/environment').loadConfig('discordRoles');

/**
 * MemberPurgeService - Temporary service for one-time member purge operation
 *
 * Identifies members without linked Steam accounts and removes their roles:
 * - MEMBER role
 * - All staff roles (STAFF, MODERATOR, TICKET_SUPPORT)
 * - All admin roles
 *
 * Preserves:
 * - DONATOR, FIRST_RESPONDER, SERVICE_MEMBER (whitelist award roles)
 *
 * Archives removed roles for 30-day restoration via /linkid
 */
class MemberPurgeService {
  constructor(discordClient) {
    this.logger = createServiceLogger('MemberPurgeService');
    this.discordClient = discordClient;
    this.memberCacheService = getMemberCacheService();
    this.roleArchiveService = getRoleArchiveService(discordClient);

    // Roles to potentially remove (MEMBER + staff + admin)
    this.rolesToRemove = [
      DISCORD_ROLES.MEMBER,
      DISCORD_ROLES.STAFF,
      DISCORD_ROLES.MODERATOR,
      DISCORD_ROLES.TICKET_SUPPORT,
      ...getAllAdminRoles()
    ].filter(Boolean);

    // Roles to NEVER touch
    this.preservedRoles = [
      DISCORD_ROLES.DONATOR,
      DISCORD_ROLES.FIRST_RESPONDER,
      DISCORD_ROLES.SERVICE_MEMBER
    ].filter(Boolean);

    this.logger.info('MemberPurgeService initialized', {
      rolesToRemove: this.rolesToRemove.length,
      preservedRoles: this.preservedRoles.length
    });
  }

  /**
   * Generate preview of members who will be affected by purge
   * @param {Guild} guild - Discord guild
   * @param {number} limit - Max users to return in preview (default 30)
   * @returns {Promise<{affectedUsers: Array, totalAffected: number, stats: Object}>}
   */
  async generatePreview(guild, limit = 30) {
    this.logger.info('Generating purge preview', { guildId: guild.id, limit });

    try {
      // Get all members with the MEMBER role
      const membersWithRole = await this.memberCacheService.getMembersByRole(
        guild,
        DISCORD_ROLES.MEMBER
      );

      this.logger.info(`Found ${membersWithRole.size} members with MEMBER role`);

      // Get all Discord user IDs that have linked accounts
      const linkedUserIds = await PlayerDiscordLink.findAll({
        attributes: ['discord_user_id'],
        where: {
          is_primary: true
        },
        raw: true
      });

      const linkedSet = new Set(linkedUserIds.map(l => l.discord_user_id));
      this.logger.info(`Found ${linkedSet.size} users with linked Steam accounts`);

      // Filter to members WITHOUT linked accounts
      const affectedMembers = [];
      for (const [memberId, member] of membersWithRole) {
        if (!linkedSet.has(memberId)) {
          affectedMembers.push(member);
        }
      }

      this.logger.info(`Found ${affectedMembers.length} members without linked accounts`);

      // Build preview data for each affected member
      const affectedUsers = [];
      const stats = {
        totalAffected: affectedMembers.length,
        membersOnly: 0,
        withStaffRoles: 0,
        withAdminRoles: 0,
        withNicknames: 0,
        roleRemovalCounts: {}
      };

      // Process up to limit for preview
      const previewMembers = affectedMembers.slice(0, limit);

      for (const member of previewMembers) {
        const userData = this._buildUserPreviewData(member);
        affectedUsers.push(userData);

        // Update stats
        if (userData.hasAdminRoles) {
          stats.withAdminRoles++;
        } else if (userData.hasStaffRoles) {
          stats.withStaffRoles++;
        } else {
          stats.membersOnly++;
        }

        if (userData.hasNickname) {
          stats.withNicknames++;
        }

        // Count role removals
        for (const role of userData.rolesToRemove) {
          stats.roleRemovalCounts[role.name] = (stats.roleRemovalCounts[role.name] || 0) + 1;
        }
      }

      // Calculate totals for all affected (not just preview)
      for (const member of affectedMembers.slice(limit)) {
        const userData = this._buildUserPreviewData(member);
        if (userData.hasAdminRoles) {
          stats.withAdminRoles++;
        } else if (userData.hasStaffRoles) {
          stats.withStaffRoles++;
        } else {
          stats.membersOnly++;
        }
        if (userData.hasNickname) {
          stats.withNicknames++;
        }
      }

      this.logger.info('Preview generated', {
        previewCount: affectedUsers.length,
        totalAffected: stats.totalAffected,
        withStaffRoles: stats.withStaffRoles,
        withAdminRoles: stats.withAdminRoles
      });

      return {
        affectedUsers,
        totalAffected: stats.totalAffected,
        moreAffected: Math.max(0, stats.totalAffected - limit),
        stats
      };

    } catch (error) {
      this.logger.error('Failed to generate preview', { error: error.message });
      throw error;
    }
  }

  /**
   * Build preview data for a single member
   * @private
   */
  _buildUserPreviewData(member) {
    const currentRoles = [];
    const rolesToRemove = [];
    let hasStaffRoles = false;
    let hasAdminRoles = false;

    const adminRoleIds = getAllAdminRoles();
    const staffRoleIds = [
      DISCORD_ROLES.STAFF,
      DISCORD_ROLES.MODERATOR,
      DISCORD_ROLES.TICKET_SUPPORT
    ].filter(Boolean);

    // Check each role the member has
    for (const [roleId, role] of member.roles.cache) {
      // Skip @everyone
      if (role.name === '@everyone') continue;

      currentRoles.push({
        id: roleId,
        name: role.name,
        color: role.hexColor
      });

      // Check if this role should be removed
      if (this.rolesToRemove.includes(roleId)) {
        rolesToRemove.push({
          id: roleId,
          name: role.name
        });

        if (adminRoleIds.includes(roleId)) {
          hasAdminRoles = true;
        } else if (staffRoleIds.includes(roleId)) {
          hasStaffRoles = true;
        }
      }
    }

    return {
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      nickname: member.nickname, // Server nickname (null if none)
      hasNickname: !!member.nickname,
      avatarURL: member.user.displayAvatarURL({ size: 64 }),
      currentRoles,
      rolesToRemove,
      hasStaffRoles,
      hasAdminRoles,
      joinedAt: member.joinedAt?.toISOString()
    };
  }

  /**
   * Execute the purge operation
   * @param {Guild} guild - Discord guild
   * @param {string} actorId - Discord user ID of admin executing purge
   * @param {string} actorName - Username of admin executing purge
   * @param {number} limit - Max users to process in this batch (default 30)
   * @returns {Promise<{success: boolean, results: Object}>}
   */
  async executePurge(guild, actorId, actorName, limit = 30) {
    this.logger.warn('EXECUTING MEMBER PURGE', { actorId, actorName, guildId: guild.id, batchLimit: limit });

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      nicknamesReset: 0,
      dmsSent: 0,
      dmsFailed: 0,
      errors: [],
      affectedUsers: []
    };

    try {
      // Get affected members for this batch (same limit as preview)
      const { affectedUsers, totalAffected } = await this.generatePreview(guild, limit);

      this.logger.info(`Processing ${totalAffected} members for purge`);

      // Log purge execution start
      await AuditLog.create({
        actionType: 'MEMBER_PURGE_STARTED',
        actorType: 'admin',
        actorId: actorId,
        actorName: actorName,
        targetType: 'guild',
        targetId: guild.id,
        targetName: guild.name,
        description: `Member purge started - ${totalAffected} members to process`,
        metadata: {
          totalAffected,
          timestamp: new Date().toISOString()
        },
        success: true,
        severity: 'warning'
      });

      // Process each affected member
      for (const userData of affectedUsers) {
        results.processed++;

        try {
          // Fetch fresh member data
          let member;
          try {
            member = await guild.members.fetch(userData.id);
          } catch (error) {
            if (error.code === 10007) { // Unknown Member
              this.logger.warn(`Member ${userData.username} left server, skipping`);
              continue;
            }
            throw error;
          }

          // Archive roles before removal
          const archiveResult = await this.roleArchiveService.archiveUserRoles(
            member,
            userData.rolesToRemove,
            'purge_unlinked',
            { userId: actorId, username: actorName },
            30 // 30 days expiry
          );

          if (!archiveResult.success) {
            this.logger.warn(`Failed to archive roles for ${userData.username}`, {
              error: archiveResult.error
            });
          }

          // Remove roles from Discord
          const roleIdsToRemove = userData.rolesToRemove.map(r => r.id);
          await member.roles.remove(roleIdsToRemove, 'Member purge - no Steam account linked');

          // Reset nickname if they have one
          let nicknameReset = false;
          const previousNickname = member.nickname;
          if (member.nickname) {
            try {
              await member.setNickname(null, 'Member purge - nickname reset');
              nicknameReset = true;
              results.nicknamesReset++;
              this.logger.debug(`Reset nickname for ${userData.username}`, {
                previousNickname
              });
            } catch (nickError) {
              // May fail if bot lacks permission or user is server owner
              this.logger.warn(`Failed to reset nickname for ${userData.username}`, {
                error: nickError.message
              });
            }
          }

          results.successful++;
          results.affectedUsers.push({
            id: userData.id,
            username: userData.username,
            rolesRemoved: userData.rolesToRemove.map(r => r.name),
            nicknameReset,
            previousNickname
          });

          this.logger.info(`Purged member ${userData.username}`, {
            rolesRemoved: userData.rolesToRemove.length,
            nicknameReset
          });

          // Send DM notification
          const dmResult = await this.sendRemovalNotification(
            member,
            userData.rolesToRemove,
            archiveResult.archive?.expires_at
          );

          if (dmResult.sent) {
            results.dmsSent++;
          } else {
            results.dmsFailed++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: userData.id,
            username: userData.username,
            error: error.message
          });

          this.logger.error(`Failed to process ${userData.username}`, {
            error: error.message
          });
        }
      }

      // Log purge completion
      await AuditLog.create({
        actionType: 'MEMBER_PURGE_EXECUTED',
        actorType: 'admin',
        actorId: actorId,
        actorName: actorName,
        targetType: 'guild',
        targetId: guild.id,
        targetName: guild.name,
        description: `Member purge completed - ${results.successful}/${results.processed} successful`,
        metadata: {
          processed: results.processed,
          successful: results.successful,
          failed: results.failed,
          dmsSent: results.dmsSent,
          dmsFailed: results.dmsFailed,
          errors: results.errors.slice(0, 10), // Only store first 10 errors
          timestamp: new Date().toISOString()
        },
        success: results.failed === 0,
        severity: 'warning'
      });

      this.logger.warn('MEMBER PURGE COMPLETE', {
        processed: results.processed,
        successful: results.successful,
        failed: results.failed
      });

      return {
        success: true,
        results
      };

    } catch (error) {
      this.logger.error('Member purge failed', { error: error.message });

      await AuditLog.create({
        actionType: 'MEMBER_PURGE_FAILED',
        actorType: 'admin',
        actorId: actorId,
        actorName: actorName,
        targetType: 'guild',
        targetId: guild.id,
        targetName: guild.name,
        description: `Member purge failed: ${error.message}`,
        metadata: {
          error: error.message,
          results,
          timestamp: new Date().toISOString()
        },
        success: false,
        severity: 'error'
      });

      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Send DM notification to user about role removal
   * @param {GuildMember} member - Discord guild member
   * @param {Array} removedRoles - Array of {id, name} objects
   * @param {Date} expiresAt - When role restoration expires
   * @returns {Promise<{sent: boolean, error?: string}>}
   */
  async sendRemovalNotification(member, removedRoles, expiresAt) {
    try {
      const roleNames = removedRoles.map(r => r.name);
      const hasStaffRoles = roleNames.some(name =>
        ['Staff', 'Moderator', 'Ticket Support', 'Squad Admin', 'OG Admin',
          'Senior Admin', 'Head Admin', 'Executive Admin', 'Super Admin'].includes(name)
      );

      const expiryTimestamp = expiresAt
        ? `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
        : 'in 30 days';

      const embed = {
        color: 0xff4444,
        title: 'Roles Removed - Action Required',
        description: hasStaffRoles
          ? 'Your **Member role** and **staff roles** have been removed because your Discord account is not linked to a Steam account.'
          : 'Your **Member role** has been removed because your Discord account is not linked to a Steam account.',
        fields: [
          {
            name: 'Roles Removed',
            value: roleNames.join(', '),
            inline: false
          },
          {
            name: 'How to Restore Your Roles',
            value: '1. Go to the B&B Discord server\n2. Use the `/linkid` command\n3. Enter your Steam ID64 (17 digits starting with 7656119)\n4. Your roles will be automatically restored!',
            inline: false
          },
          {
            name: 'Time Limit',
            value: `You have until ${expiryTimestamp} to link your account and restore your roles.`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'B&B - Roster Control System'
        }
      };

      await member.send({ embeds: [embed] });

      this.logger.debug(`DM sent to ${member.user.username}`);
      return { sent: true };

    } catch (error) {
      // User has DMs disabled or blocked the bot
      this.logger.debug(`Failed to DM ${member.user.username}: ${error.message}`);
      return { sent: false, error: error.message };
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  MemberPurgeService,

  /**
   * Get singleton instance of MemberPurgeService
   * @param {Client} discordClient - Discord client (required on first call)
   * @returns {MemberPurgeService}
   */
  getMemberPurgeService(discordClient = null) {
    if (!instance && discordClient) {
      instance = new MemberPurgeService(discordClient);
    }
    return instance;
  }
};
