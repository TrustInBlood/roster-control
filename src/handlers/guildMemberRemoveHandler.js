const { Whitelist, AuditLog } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');
const notificationService = require('../services/NotificationService');

const logger = createServiceLogger('GuildMemberRemoveHandler');

/**
 * Handles when a user leaves the Discord server
 * Automatically revokes all their whitelist entries
 * @param {GuildMember} member - The member who left
 */
async function handleGuildMemberRemove(member) {
  try {
    const discordUserId = member.user.id;
    const discordUsername = member.user.tag;
    const guildId = member.guild.id;

    logger.info('User left Discord server, revoking role-based whitelist entries', {
      discordUserId,
      discordUsername,
      guildId
    });

    // Find all active ROLE-BASED whitelist entries for this Discord user
    // Manual grants (donations, seeding, etc.) are preserved
    const activeEntries = await Whitelist.findAll({
      where: {
        discord_user_id: discordUserId,
        source: 'role',
        revoked: false
      }
    });

    if (activeEntries.length === 0) {
      logger.debug('No active role-based whitelist entries to revoke', {
        discordUserId,
        discordUsername
      });
      return;
    }

    // Track revoked entries for logging
    const revokedEntries = [];
    const revokedAt = new Date();

    // Revoke all active entries
    for (const entry of activeEntries) {
      await entry.update({
        revoked: true,
        revoked_by: 'SYSTEM',
        revoked_at: revokedAt,
        revoked_reason: 'Left Discord server - role-based access removed',
        metadata: {
          ...entry.metadata,
          autoRevokedOnLeave: true,
          leftGuildAt: revokedAt.toISOString(),
          previousSource: entry.source,
          previousRole: entry.role_name
        }
      });

      revokedEntries.push({
        id: entry.id,
        steamid64: entry.steamid64,
        source: entry.source,
        role_name: entry.role_name,
        type: entry.type
      });

      logger.info('Revoked role-based whitelist entry', {
        discordUserId,
        discordUsername,
        entryId: entry.id,
        steamid64: entry.steamid64,
        roleName: entry.role_name
      });
    }

    // Log to audit trail
    await AuditLog.create({
      actionType: 'WHITELIST_AUTO_REVOKE',
      actorType: 'system',
      actorId: 'GUILD_MEMBER_REMOVE',
      actorName: 'GuildMemberRemoveHandler',
      targetType: 'discord_user',
      targetId: discordUserId,
      targetName: discordUsername,
      guildId: guildId,
      description: `Auto-revoked ${revokedEntries.length} role-based whitelist ${revokedEntries.length === 1 ? 'entry' : 'entries'} when user left Discord server`,
      beforeState: null,
      afterState: null,
      metadata: {
        revokedCount: revokedEntries.length,
        revokedEntries: revokedEntries,
        reason: 'Left Discord server - role-based access removed',
        note: 'Manual grants (donations, seeding, etc.) preserved',
        leftAt: revokedAt.toISOString()
      },
      severity: 'info'
    });

    // Send notification to whitelist channel
    try {
      const steamIds = revokedEntries.map(e => e.steamid64).filter((v, i, a) => a.indexOf(v) === i);
      const roleNames = [...new Set(revokedEntries.map(e => e.role_name).filter(Boolean))];

      await notificationService.sendNotification('whitelist', {
        content: `**Role-Based Whitelist Auto-Revocation**\n` +
          `User **${discordUsername}** left the Discord server.\n` +
          `Automatically revoked **${revokedEntries.length}** role-based whitelist ${revokedEntries.length === 1 ? 'entry' : 'entries'}.\n\n` +
          `**Steam IDs:** ${steamIds.join(', ')}\n` +
          `**Previous Roles:** ${roleNames.join(', ')}\n` +
          `**Note:** Manual grants (donations, seeding, etc.) were preserved.`
      });
    } catch (notificationError) {
      logger.error('Failed to send whitelist revocation notification', {
        error: notificationError.message,
        discordUserId,
        discordUsername
      });
    }

    // Invalidate whitelist cache if available
    if (global.whitelistServices?.whitelistService) {
      global.whitelistServices.whitelistService.invalidateCache();
      logger.debug('Invalidated whitelist cache after member removal');
    }

    logger.info('Successfully revoked role-based whitelist entries for departed user', {
      discordUserId,
      discordUsername,
      revokedCount: revokedEntries.length,
      note: 'Manual grants preserved'
    });

  } catch (error) {
    logger.error('Failed to handle guild member removal', {
      error: error.message,
      stack: error.stack,
      userId: member.user.id,
      userTag: member.user.tag,
      guildId: member.guild.id
    });

    // Try to log the error to audit trail
    try {
      await AuditLog.create({
        actionType: 'WHITELIST_AUTO_REVOKE_ERROR',
        actorType: 'system',
        actorId: 'GUILD_MEMBER_REMOVE',
        actorName: 'GuildMemberRemoveHandler',
        targetType: 'discord_user',
        targetId: member.user.id,
        targetName: member.user.tag,
        guildId: member.guild.id,
        description: `Failed to auto-revoke role-based whitelist entries: ${error.message}`,
        beforeState: null,
        afterState: null,
        metadata: {
          error: error.message,
          stack: error.stack
        },
        severity: 'error'
      });
    } catch (logError) {
      logger.error('Failed to log error to audit trail', { error: logError.message });
    }
  }
}

module.exports = {
  handleGuildMemberRemove
};
