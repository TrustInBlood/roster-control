const { RoleArchive, AuditLog } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');

/**
 * RoleArchiveService - Manages archiving and restoration of Discord roles
 *
 * This service handles:
 * - Archiving roles before removal (for purge or inactive status)
 * - Restoring roles when users link their Steam accounts via /linkid
 * - Cleanup of expired archives
 *
 * Designed to support both one-time purge operations and future inactive member management.
 */
class RoleArchiveService {
  constructor(discordClient = null) {
    this.logger = createServiceLogger('RoleArchiveService');
    this.discordClient = discordClient;

    this.logger.info('RoleArchiveService initialized');
  }

  /**
   * Set the Discord client (for late initialization)
   * @param {Client} client - Discord.js client
   */
  setDiscordClient(client) {
    this.discordClient = client;
  }

  /**
   * Archive roles for a user before removal
   * @param {GuildMember} member - Discord guild member
   * @param {Array<{id: string, name: string}>} roles - Roles being removed
   * @param {string} reason - Reason for removal (purge_unlinked, inactive, manual)
   * @param {Object} removedBy - {userId, username} of admin who initiated (null for system)
   * @param {number} expiryDays - Days until archive expires (default 30)
   * @returns {Promise<{success: boolean, archive?: RoleArchive, error?: string}>}
   */
  async archiveUserRoles(member, roles, reason, removedBy = null, expiryDays = 30) {
    try {
      if (!roles || roles.length === 0) {
        return { success: false, error: 'No roles to archive' };
      }

      const archive = await RoleArchive.archiveRoles(
        member.id,
        member.user.username,
        member.displayName,
        roles,
        reason,
        removedBy,
        expiryDays,
        member.nickname // Store nickname for restoration
      );

      this.logger.info('Archived roles for user', {
        discordUserId: member.id,
        username: member.user.username,
        roleCount: roles.length,
        roleNames: roles.map(r => r.name),
        reason,
        expiresAt: archive.expires_at,
        archiveId: archive.id
      });

      // Log to AuditLog
      await AuditLog.create({
        actionType: 'ROLES_ARCHIVED',
        actorType: removedBy ? 'admin' : 'system',
        actorId: removedBy?.userId || 'system',
        actorName: removedBy?.username || 'System',
        targetType: 'discord_user',
        targetId: member.id,
        targetName: member.user.username,
        description: `Archived ${roles.length} role(s) for ${member.user.username}: ${roles.map(r => r.name).join(', ')}`,
        metadata: {
          archiveId: archive.id,
          roles: roles,
          reason,
          expiresAt: archive.expires_at.toISOString()
        },
        success: true,
        severity: 'info'
      });

      return { success: true, archive };
    } catch (error) {
      this.logger.error('Failed to archive roles', {
        discordUserId: member.id,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore roles from archive for a user
   * Called when user successfully links their Steam account via /linkid
   * @param {string} discordUserId - Discord user ID
   * @param {Guild} guild - Discord guild
   * @param {string} restoredByUserId - Who triggered the restoration (usually self)
   * @returns {Promise<{success: boolean, restoredRoles?: Array, archive?: RoleArchive, error?: string}>}
   */
  async restoreUserRoles(discordUserId, guild, restoredByUserId = null) {
    try {
      // Find active archive
      const archive = await RoleArchive.findActiveArchive(discordUserId);

      if (!archive) {
        this.logger.debug('No active archive found for user', { discordUserId });
        return { success: true, restoredRoles: [], message: 'No archived roles to restore' };
      }

      if (!archive.canRestore()) {
        return {
          success: false,
          error: archive.isExpired() ? 'Archive has expired' : 'Archive already restored'
        };
      }

      // Fetch member
      let member;
      try {
        member = await guild.members.fetch(discordUserId);
      } catch (error) {
        if (error.code === 10007) { // Unknown Member
          return { success: false, error: 'User is no longer in the server' };
        }
        throw error;
      }

      // Get role IDs from archive
      const roleIds = archive.getRoleIds();
      const roleNames = archive.getRoleNames();
      const restoredRoles = [];
      const failedRoles = [];

      // Restore each role
      for (const roleId of roleIds) {
        try {
          const role = guild.roles.cache.get(roleId);
          if (!role) {
            failedRoles.push({ id: roleId, reason: 'Role no longer exists' });
            continue;
          }

          // Check if member already has the role
          if (member.roles.cache.has(roleId)) {
            this.logger.debug('Member already has role', { roleId, roleName: role.name });
            restoredRoles.push({ id: roleId, name: role.name, alreadyHad: true });
            continue;
          }

          // Add the role
          await member.roles.add(roleId, 'Role restoration from archive after Steam account link');
          restoredRoles.push({ id: roleId, name: role.name, restored: true });

          this.logger.debug('Restored role', {
            discordUserId,
            roleId,
            roleName: role.name
          });
        } catch (error) {
          this.logger.warn('Failed to restore role', {
            discordUserId,
            roleId,
            error: error.message
          });
          failedRoles.push({ id: roleId, reason: error.message });
        }
      }

      // Restore nickname if one was archived
      let nicknameRestored = false;
      if (archive.previous_nickname) {
        try {
          await member.setNickname(archive.previous_nickname, 'Nickname restoration from archive after Steam account link');
          nicknameRestored = true;
          this.logger.debug('Restored nickname', {
            discordUserId,
            nickname: archive.previous_nickname
          });
        } catch (nickError) {
          // May fail if bot lacks permission or user is server owner
          this.logger.warn('Failed to restore nickname', {
            discordUserId,
            nickname: archive.previous_nickname,
            error: nickError.message
          });
        }
      }

      // Mark archive as restored
      await RoleArchive.markRestored(archive.id, restoredByUserId || discordUserId);

      this.logger.info('Restored roles from archive', {
        discordUserId,
        username: member.user.username,
        archiveId: archive.id,
        restoredCount: restoredRoles.filter(r => r.restored).length,
        failedCount: failedRoles.length,
        nicknameRestored
      });

      // Log to AuditLog
      await AuditLog.create({
        actionType: 'ROLES_RESTORED',
        actorType: 'user',
        actorId: restoredByUserId || discordUserId,
        actorName: member.user.username,
        targetType: 'discord_user',
        targetId: discordUserId,
        targetName: member.user.username,
        description: `Restored ${restoredRoles.length} role(s) from archive: ${roleNames.join(', ')}${nicknameRestored ? ' (nickname restored)' : ''}`,
        metadata: {
          archiveId: archive.id,
          originalArchiveDate: archive.created_at,
          restoredRoles,
          failedRoles,
          nicknameRestored,
          previousNickname: archive.previous_nickname || null
        },
        success: failedRoles.length === 0,
        severity: 'info'
      });

      return {
        success: true,
        restoredRoles,
        failedRoles,
        archive,
        nicknameRestored,
        restoredNickname: nicknameRestored ? archive.previous_nickname : null
      };
    } catch (error) {
      this.logger.error('Failed to restore roles', {
        discordUserId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get active archive for a user
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<RoleArchive|null>}
   */
  async getArchiveForUser(discordUserId) {
    return await RoleArchive.findActiveArchive(discordUserId);
  }

  /**
   * Get all archives for a user (including expired/restored)
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<Array<RoleArchive>>}
   */
  async getArchiveHistoryForUser(discordUserId) {
    return await RoleArchive.getHistoryForUser(discordUserId);
  }

  /**
   * Cleanup expired archives
   * Should be called periodically (e.g., daily) to remove old records
   * @returns {Promise<{deleted: number}>}
   */
  async cleanupExpiredArchives() {
    try {
      const expiredArchives = await RoleArchive.getExpiredArchives();

      if (expiredArchives.length === 0) {
        this.logger.debug('No expired archives to cleanup');
        return { deleted: 0 };
      }

      // Log before deletion
      for (const archive of expiredArchives) {
        this.logger.info('Deleting expired archive', {
          archiveId: archive.id,
          discordUserId: archive.discord_user_id,
          username: archive.discord_username,
          expiredAt: archive.expires_at,
          roleCount: archive.removed_roles?.length || 0
        });
      }

      // Delete expired archives
      const { count } = await RoleArchive.destroy({
        where: {
          id: expiredArchives.map(a => a.id)
        }
      });

      this.logger.info('Cleaned up expired archives', { deleted: count });

      return { deleted: count };
    } catch (error) {
      this.logger.error('Failed to cleanup expired archives', {
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  RoleArchiveService,

  /**
   * Get singleton instance of RoleArchiveService
   * @param {Client} discordClient - Optional Discord client
   * @returns {RoleArchiveService}
   */
  getRoleArchiveService(discordClient = null) {
    if (!instance) {
      instance = new RoleArchiveService(discordClient);
    } else if (discordClient && !instance.discordClient) {
      instance.setDiscordClient(discordClient);
    }
    return instance;
  }
};
