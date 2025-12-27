const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requirePermission } = require('../middleware/auth');
const { squadGroupService, SQUAD_PERMISSIONS } = require('../../services/SquadGroupService');
const { AuditLog, Whitelist } = require('../../database/models');
const { getHighestPriorityGroupAsync } = require('../../utils/environment');

const logger = createServiceLogger('SquadGroupsAPI');

// Staff-level permissions (anything beyond just reserve slot)
const STAFF_PERMISSIONS = ['ban', 'cameraman', 'canseeadminchat', 'changemap', 'chat', 'cheat', 'forceteamchange', 'immune', 'kick', 'startvote', 'teamchange', 'balance'];

/**
 * Determine if a group should be 'staff' or 'whitelist' type based on permissions
 * @param {string} groupName - The group name to check
 * @returns {Promise<string>} 'staff' or 'whitelist'
 */
async function getGroupType(groupName) {
  try {
    const configs = await squadGroupService.getAllRoleConfigs();
    const config = configs.find(c => c.groupName === groupName);

    if (!config) return 'whitelist'; // Default to whitelist if not found

    const perms = Array.isArray(config.permissions) ? config.permissions : config.permissions.split(',');
    const hasStaffPerms = perms.some(p => STAFF_PERMISSIONS.includes(p.trim()));

    return hasStaffPerms ? 'staff' : 'whitelist';
  } catch {
    return 'whitelist'; // Default to whitelist on error
  }
}

/**
 * Sync all members with a specific Discord role to update their whitelist entries
 * Called when a Squad Group is created or group name is updated
 * @param {string} roleId - Discord role ID
 * @param {string} newGroupName - The new group name for this role
 * @returns {Promise<{synced: number, updated: number, errors: number}>}
 */
async function syncMembersWithRole(roleId, newGroupName) {
  const discordClient = global.discordClient;
  if (!discordClient) {
    logger.warn('Cannot sync members - Discord client not available');
    return { synced: 0, updated: 0, errors: 0 };
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.warn('Cannot sync members - Guild not found');
    return { synced: 0, updated: 0, errors: 0 };
  }

  // Fetch all members (may need to fetch if not cached)
  await guild.members.fetch().catch(() => null);

  // Find members with this role
  const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId));

  logger.info('Syncing members with role', {
    roleId,
    newGroupName,
    memberCount: membersWithRole.size
  });

  let synced = 0;
  let updated = 0;
  let errors = 0;

  for (const [, member] of membersWithRole) {
    try {
      // Determine the member's highest priority group considering all their roles
      const highestGroup = await getHighestPriorityGroupAsync(member.roles.cache, guild);

      if (!highestGroup) {
        continue; // No tracked roles
      }

      // Check if member has an existing whitelist entry that needs updating
      const existingEntry = await Whitelist.findOne({
        where: {
          discord_user_id: member.user.id,
          source: 'role',
          revoked: false
        }
      });

      if (existingEntry && existingEntry.role_name !== highestGroup) {
        // Update the entry to reflect the new highest priority group
        const entryType = await getGroupType(highestGroup);
        await existingEntry.update({
          role_name: highestGroup,
          type: entryType,
          reason: `Role-based access: ${highestGroup}`,
          metadata: {
            ...existingEntry.metadata,
            updatedBySquadGroupChange: true,
            previousGroup: existingEntry.role_name,
            updatedAt: new Date().toISOString()
          }
        });

        logger.debug('Updated whitelist entry for member', {
          discordUserId: member.user.id,
          previousGroup: existingEntry.role_name,
          newGroup: highestGroup
        });

        updated++;
      }

      synced++;
    } catch (error) {
      logger.error('Failed to sync member', {
        discordUserId: member.user.id,
        error: error.message
      });
      errors++;
    }
  }

  // Invalidate whitelist cache if any updates were made
  if (updated > 0 && global.whitelistServices?.whitelistService) {
    global.whitelistServices.whitelistService.invalidateCache();
    logger.info('Whitelist cache invalidated after squad group sync');
  }

  logger.info('Member sync completed', { roleId, newGroupName, synced, updated, errors });

  return { synced, updated, errors };
}

/**
 * Sync ALL members who have ANY tracked role
 * Recalculates everyone's highest priority group
 * @returns {Promise<{synced: number, updated: number, errors: number}>}
 */
async function syncAllMembers() {
  const discordClient = global.discordClient;
  if (!discordClient) {
    logger.warn('Cannot sync members - Discord client not available');
    return { synced: 0, updated: 0, errors: 0 };
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    logger.warn('Cannot sync members - Guild not found');
    return { synced: 0, updated: 0, errors: 0 };
  }

  // Get all tracked role IDs
  const trackedRoles = await squadGroupService.getAllTrackedRoles();
  if (trackedRoles.length === 0) {
    logger.warn('No tracked roles configured');
    return { synced: 0, updated: 0, errors: 0 };
  }

  // Fetch all members
  await guild.members.fetch().catch(() => null);

  // Find members with ANY tracked role
  const membersWithTrackedRoles = guild.members.cache.filter(m =>
    m.roles.cache.some(r => trackedRoles.includes(r.id))
  );

  logger.info('Syncing all members with tracked roles', {
    trackedRoleCount: trackedRoles.length,
    memberCount: membersWithTrackedRoles.size
  });

  let synced = 0;
  let updated = 0;
  let errors = 0;

  for (const [, member] of membersWithTrackedRoles) {
    try {
      const highestGroup = await getHighestPriorityGroupAsync(member.roles.cache, guild);

      if (!highestGroup) {
        continue;
      }

      const existingEntry = await Whitelist.findOne({
        where: {
          discord_user_id: member.user.id,
          source: 'role',
          revoked: false
        }
      });

      if (existingEntry) {
        const entryType = await getGroupType(highestGroup);
        const needsGroupUpdate = existingEntry.role_name !== highestGroup;
        const needsTypeUpdate = existingEntry.type !== entryType;

        if (needsGroupUpdate || needsTypeUpdate) {
          await existingEntry.update({
            role_name: highestGroup,
            type: entryType,
            reason: `Role-based access: ${highestGroup}`,
            metadata: {
              ...existingEntry.metadata,
              updatedByFullSync: true,
              previousGroup: needsGroupUpdate ? existingEntry.role_name : undefined,
              previousType: needsTypeUpdate ? existingEntry.type : undefined,
              updatedAt: new Date().toISOString()
            }
          });

          logger.debug('Updated whitelist entry', {
            discordUserId: member.user.id,
            previousGroup: needsGroupUpdate ? existingEntry.role_name : highestGroup,
            newGroup: highestGroup,
            previousType: needsTypeUpdate ? existingEntry.type : entryType,
            newType: entryType
          });

          updated++;
        }
      }

      synced++;
    } catch (error) {
      logger.error('Failed to sync member', {
        discordUserId: member.user.id,
        error: error.message
      });
      errors++;
    }
  }

  if (updated > 0 && global.whitelistServices?.whitelistService) {
    global.whitelistServices.whitelistService.invalidateCache();
    logger.info('Whitelist cache invalidated after full sync');
  }

  logger.info('Full member sync completed', { synced, updated, errors });

  return { synced, updated, errors };
}

/**
 * GET /api/v1/squadgroups
 * List all configured roles with their Squad permissions
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const roleConfigs = await squadGroupService.getAllRoleConfigs();

    // Enrich with Discord role info (position, color)
    const discordClient = global.discordClient;
    let enrichedConfigs = roleConfigs;

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildRoles = await guild.roles.fetch();

        enrichedConfigs = roleConfigs.map(config => {
          const discordRole = guildRoles.get(config.roleId);
          return {
            ...config,
            roleName: discordRole?.name || config.roleName,
            discordPosition: discordRole?.position ?? 0,
            color: discordRole?.hexColor || '#99AAB5'
          };
        });

        // Sort by Discord position (highest first)
        enrichedConfigs.sort((a, b) => b.discordPosition - a.discordPosition);
      }
    }

    res.json({
      roleConfigs: enrichedConfigs,
      squadPermissions: SQUAD_PERMISSIONS
    });
  } catch (error) {
    logger.error('Failed to fetch squad groups', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch squad groups' });
  }
});

/**
 * GET /api/v1/squadgroups/permissions
 * Get predefined Squad permissions list
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/permissions', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    res.json({ permissions: SQUAD_PERMISSIONS });
  } catch (error) {
    logger.error('Failed to fetch squad permissions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch squad permissions' });
  }
});

/**
 * GET /api/v1/squadgroups/roles
 * Get available Discord roles for assignment
 * Shows which roles are already configured
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/roles', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const discordClient = global.discordClient;
    if (!discordClient) {
      return res.status(503).json({ error: 'Discord client not available' });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return res.status(503).json({ error: 'Could not fetch guild' });
    }

    // Fetch all roles from the guild
    const roles = await guild.roles.fetch();

    // Get currently configured role IDs
    const configuredRoles = await squadGroupService.getAllTrackedRoles();

    // Filter and map roles (exclude @everyone and managed/bot roles)
    const availableRoles = roles
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        isConfigured: configuredRoles.includes(role.id)
      }))
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    res.json({ roles: availableRoles });
  } catch (error) {
    logger.error('Failed to fetch Discord roles', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch Discord roles' });
  }
});

/**
 * GET /api/v1/squadgroups/:roleId
 * Get configuration for a specific role
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const config = await squadGroupService.getRoleConfig(roleId);

    if (!config) {
      return res.status(404).json({ error: 'Role not configured' });
    }

    // Enrich with Discord role info
    const discordClient = global.discordClient;
    let enrichedConfig = config;

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          enrichedConfig = {
            ...config,
            roleName: discordRole.name,
            discordPosition: discordRole.position,
            color: discordRole.hexColor
          };
        }
      }
    }

    res.json({ roleConfig: enrichedConfig });
  } catch (error) {
    logger.error('Failed to fetch role config', { error: error.message, roleId: req.params.roleId });
    res.status(500).json({ error: 'Failed to fetch role configuration' });
  }
});

/**
 * POST /api/v1/squadgroups
 * Add a new role with Squad permissions
 * Requires: MANAGE_PERMISSIONS
 * Body: { roleId: string, groupName?: string, permissions: string[] }
 */
router.post('/', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId, groupName, permissions } = req.body;

    // Validate required fields
    if (!roleId) {
      return res.status(400).json({ error: 'roleId is required' });
    }

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'permissions must be a non-empty array' });
    }

    // Check if role is already configured
    const existingConfig = await squadGroupService.getRoleConfig(roleId);
    if (existingConfig) {
      return res.status(409).json({
        error: 'Role is already configured',
        code: 'ROLE_ALREADY_EXISTS'
      });
    }

    // Get Discord role name
    let roleName = null;
    const discordClient = global.discordClient;
    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          roleName = discordRole.name;
        }
      }
    }

    // Create the role config
    const result = await squadGroupService.setRolePermissions(roleId, {
      roleName,
      groupName: groupName || roleName,
      permissions
    }, req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'SQUAD_GROUP_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'squad_group',
      targetId: roleId,
      targetName: groupName || roleName || roleId,
      description: `Added Squad group for role ${roleName || roleId}`,
      details: JSON.stringify({
        roleId,
        roleName,
        groupName: groupName || roleName,
        permissions
      }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Squad group created', {
      roleId,
      groupName: groupName || roleName,
      permissionCount: permissions.length,
      createdBy: req.user.username
    });

    // Sync all members with this role to create/update their whitelist entries
    const syncResult = await syncMembersWithRole(roleId, groupName || roleName);

    res.status(201).json({
      success: true,
      roleConfig: result,
      sync: syncResult
    });
  } catch (error) {
    logger.error('Failed to create squad group', { error: error.message });

    if (error.message.includes('Invalid permissions')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create squad group' });
  }
});

/**
 * PUT /api/v1/squadgroups/:roleId
 * Update permissions for an existing role
 * Requires: MANAGE_PERMISSIONS
 * Body: { groupName?: string, permissions: string[] }
 */
router.put('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { groupName, permissions } = req.body;

    // Validate permissions array
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions must be an array' });
    }

    // Get existing config for audit log
    const existingConfig = await squadGroupService.getRoleConfig(roleId);
    if (!existingConfig) {
      return res.status(404).json({ error: 'Role not configured' });
    }

    // Get Discord role name
    let roleName = existingConfig.roleName;
    const discordClient = global.discordClient;
    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          roleName = discordRole.name;
        }
      }
    }

    // Update the role config
    const result = await squadGroupService.setRolePermissions(roleId, {
      roleName,
      groupName: groupName !== undefined ? groupName : existingConfig.groupName,
      permissions
    }, req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'SQUAD_GROUP_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'squad_group',
      targetId: roleId,
      targetName: groupName || roleName || roleId,
      description: `Updated Squad group for role ${roleName || roleId}`,
      details: JSON.stringify({
        previous: {
          groupName: existingConfig.groupName,
          permissions: existingConfig.permissions
        },
        new: {
          groupName: groupName !== undefined ? groupName : existingConfig.groupName,
          permissions
        },
        changeCount: {
          added: permissions.filter(p => !existingConfig.permissions.includes(p)).length,
          removed: existingConfig.permissions.filter(p => !permissions.includes(p)).length
        }
      }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Squad group updated', {
      roleId,
      groupName: groupName || roleName,
      permissionCount: permissions.length,
      updatedBy: req.user.username
    });

    // Sync all members with this role to update their whitelist entries
    // This ensures changes propagate even if just permissions changed
    const newGroupName = groupName !== undefined ? groupName : existingConfig.groupName;
    const syncResult = await syncMembersWithRole(roleId, newGroupName);

    res.json({
      success: true,
      roleConfig: result,
      sync: syncResult
    });
  } catch (error) {
    logger.error('Failed to update squad group', {
      roleId: req.params.roleId,
      error: error.message
    });

    if (error.message.includes('Invalid permissions')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to update squad group' });
  }
});

/**
 * DELETE /api/v1/squadgroups/:roleId
 * Remove a role from the Squad groups system
 * Requires: MANAGE_PERMISSIONS
 */
router.delete('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;

    // Get existing config for audit log
    const existingConfig = await squadGroupService.getRoleConfig(roleId);
    if (!existingConfig) {
      return res.status(404).json({ error: 'Role not configured' });
    }

    // Delete the role config
    const deleted = await squadGroupService.removeRole(roleId, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Create audit log
    await AuditLog.create({
      actionType: 'SQUAD_GROUP_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'squad_group',
      targetId: roleId,
      targetName: existingConfig.groupName || existingConfig.roleName || roleId,
      description: `Removed Squad group for role ${existingConfig.roleName || roleId}`,
      details: JSON.stringify({
        removed: existingConfig
      }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Squad group removed', {
      roleId,
      groupName: existingConfig.groupName,
      removedBy: req.user.username
    });

    // Sync members who had this role - they may need to be reassigned to their next highest group
    const syncResult = await syncMembersWithRole(roleId, null);

    res.json({
      success: true,
      message: `Squad group for ${existingConfig.roleName || roleId} removed`,
      sync: syncResult
    });
  } catch (error) {
    logger.error('Failed to remove squad group', {
      roleId: req.params.roleId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to remove squad group' });
  }
});

/**
 * POST /api/v1/squadgroups/seed
 * Re-seed Squad groups from config file (admin utility)
 * Requires: MANAGE_PERMISSIONS
 * Note: This is destructive - it will reset all Squad groups to config defaults
 */
router.post('/seed', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { confirm } = req.body;

    if (confirm !== 'RESET_ALL_SQUADGROUPS') {
      return res.status(400).json({
        error: 'Confirmation required. Send { confirm: "RESET_ALL_SQUADGROUPS" } to proceed.'
      });
    }

    // Re-seed from config
    const count = await squadGroupService.reseedFromConfig(req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'SQUAD_GROUP_RESET',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'system',
      targetId: 'squad_groups',
      targetName: 'All Squad Groups',
      description: 'Reset all Squad groups to config defaults',
      details: JSON.stringify({ action: 'reset_to_config', rolesSeeded: count }),
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.warn('Squad groups reset to config defaults', {
      count,
      by: req.user.username
    });

    res.json({
      success: true,
      message: `Squad groups reset to config defaults (${count} roles seeded)`
    });
  } catch (error) {
    logger.error('Failed to reset squad groups', { error: error.message });
    res.status(500).json({ error: 'Failed to reset squad groups' });
  }
});

/**
 * POST /api/v1/squadgroups/sync
 * Sync all members with tracked roles to update their whitelist entries
 * Requires: MANAGE_PERMISSIONS
 */
router.post('/sync', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    logger.info('Manual full sync requested', { by: req.user.username });

    const syncResult = await syncAllMembers();

    // Create audit log
    await AuditLog.create({
      actionType: 'SQUAD_GROUP_SYNC',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'system',
      targetId: 'squad_groups',
      targetName: 'All Members',
      description: `Manual sync: ${syncResult.updated} entries updated`,
      details: JSON.stringify(syncResult),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: `Sync completed: ${syncResult.synced} members checked, ${syncResult.updated} updated`,
      ...syncResult
    });
  } catch (error) {
    logger.error('Failed to sync squad groups', { error: error.message });
    res.status(500).json({ error: 'Failed to sync squad groups' });
  }
});

module.exports = router;
