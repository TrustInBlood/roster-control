const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requirePermission } = require('../middleware/auth');
const { discordRoleService } = require('../../services/DiscordRoleService');
const { AuditLog, DiscordRoleGroup, DiscordRole } = require('../../database/models');

const logger = createServiceLogger('DiscordRolesAPI');

/**
 * GET /api/v1/discordroles
 * List all configured Discord roles with their group info
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const roles = await discordRoleService.getAllRoles();
    const groups = await discordRoleService.getAllGroups();

    // Enrich roles with Discord info
    const discordClient = global.discordClient;
    let enrichedRoles = roles;

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildRoles = await guild.roles.fetch();

        enrichedRoles = roles.map(role => {
          const discordRole = guildRoles.get(role.role_id);
          const group = groups.find(g => g.id === role.group_id);
          return {
            id: role.id,
            roleId: role.role_id,
            roleKey: role.role_key,
            roleName: discordRole?.name || role.role_name,
            description: role.description,
            groupId: role.group_id,
            groupKey: group?.group_key || null,
            groupName: group?.display_name || null,
            isSystemRole: role.is_system_role,
            discordPosition: discordRole?.position ?? 0,
            color: discordRole?.hexColor || '#99AAB5',
            createdBy: role.created_by,
            createdAt: role.created_at,
            updatedBy: role.updated_by,
            updatedAt: role.updated_at
          };
        });

        // Sort by Discord position (highest first)
        enrichedRoles.sort((a, b) => b.discordPosition - a.discordPosition);
      }
    }

    res.json({
      roles: enrichedRoles,
      groups: groups.map(g => ({
        id: g.id,
        groupKey: g.group_key,
        displayName: g.display_name,
        description: g.description,
        displayOrder: g.display_order,
        color: g.color,
        isSystemGroup: g.is_system_group,
        securityCritical: g.security_critical,
        roleCount: roles.filter(r => r.group_id === g.id).length
      }))
    });
  } catch (error) {
    logger.error('Failed to fetch Discord roles', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch Discord roles' });
  }
});

/**
 * GET /api/v1/discordroles/groups
 * List all role groups
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/groups', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const groups = await discordRoleService.getAllGroups();
    const roles = await discordRoleService.getAllRoles();

    const groupsWithCounts = groups.map(g => ({
      id: g.id,
      groupKey: g.group_key,
      displayName: g.display_name,
      description: g.description,
      displayOrder: g.display_order,
      color: g.color,
      isSystemGroup: g.is_system_group,
      securityCritical: g.security_critical,
      roleCount: roles.filter(r => r.group_id === g.id).length,
      createdBy: g.created_by,
      createdAt: g.created_at,
      updatedBy: g.updated_by,
      updatedAt: g.updated_at
    }));

    res.json({ groups: groupsWithCounts });
  } catch (error) {
    logger.error('Failed to fetch Discord role groups', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch Discord role groups' });
  }
});

/**
 * GET /api/v1/discordroles/groups/:groupId
 * Get a specific group with its roles
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/groups/:groupId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await discordRoleService.getGroupById(parseInt(groupId));

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const allRoles = await discordRoleService.getAllRoles();
    const groupRoles = allRoles.filter(r => r.group_id === group.id);

    // Enrich with Discord info
    const discordClient = global.discordClient;
    let enrichedRoles = groupRoles;

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildRoles = await guild.roles.fetch();

        enrichedRoles = groupRoles.map(role => {
          const discordRole = guildRoles.get(role.role_id);
          return {
            id: role.id,
            roleId: role.role_id,
            roleKey: role.role_key,
            roleName: discordRole?.name || role.role_name,
            description: role.description,
            isSystemRole: role.is_system_role,
            discordPosition: discordRole?.position ?? 0,
            color: discordRole?.hexColor || '#99AAB5'
          };
        });

        enrichedRoles.sort((a, b) => b.discordPosition - a.discordPosition);
      }
    }

    res.json({
      group: {
        id: group.id,
        groupKey: group.group_key,
        displayName: group.display_name,
        description: group.description,
        displayOrder: group.display_order,
        color: group.color,
        isSystemGroup: group.is_system_group,
        securityCritical: group.security_critical
      },
      roles: enrichedRoles
    });
  } catch (error) {
    logger.error('Failed to fetch Discord role group', { error: error.message, groupId: req.params.groupId });
    res.status(500).json({ error: 'Failed to fetch Discord role group' });
  }
});

/**
 * POST /api/v1/discordroles/groups
 * Create a new custom group
 * Requires: MANAGE_PERMISSIONS
 * Body: { groupKey: string, displayName: string, description?: string, color?: string, displayOrder?: number }
 */
router.post('/groups', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { groupKey, displayName, description, color, displayOrder } = req.body;

    if (!groupKey || !displayName) {
      return res.status(400).json({ error: 'groupKey and displayName are required' });
    }

    // Check for duplicate group key
    const existing = await discordRoleService.getGroupByKey(groupKey);
    if (existing) {
      return res.status(409).json({ error: 'Group key already exists' });
    }

    const group = await discordRoleService.createGroup({
      groupKey,
      displayName,
      description,
      color,
      displayOrder: displayOrder || 100
    }, req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_GROUP_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role_group',
      targetId: String(group.id),
      targetName: displayName,
      description: `Created Discord role group: ${displayName}`,
      details: JSON.stringify({ groupKey, displayName, description, color }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role group created', { groupKey, displayName, createdBy: req.user.username });

    res.status(201).json({
      success: true,
      group: {
        id: group.id,
        groupKey: group.group_key,
        displayName: group.display_name,
        description: group.description,
        displayOrder: group.display_order,
        color: group.color,
        isSystemGroup: group.is_system_group,
        securityCritical: group.security_critical
      }
    });
  } catch (error) {
    logger.error('Failed to create Discord role group', { error: error.message });
    res.status(500).json({ error: 'Failed to create Discord role group' });
  }
});

/**
 * PUT /api/v1/discordroles/groups/:groupId
 * Update a group
 * Requires: MANAGE_PERMISSIONS
 */
router.put('/groups/:groupId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupKey, displayName, description, color, displayOrder, securityCritical } = req.body;

    const group = await discordRoleService.getGroupById(parseInt(groupId));
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check for duplicate group key if changing
    if (groupKey && groupKey !== group.group_key) {
      const existing = await discordRoleService.getGroupByKey(groupKey);
      if (existing) {
        return res.status(409).json({ error: 'Group key already exists' });
      }
    }

    const updated = await discordRoleService.updateGroup(parseInt(groupId), {
      groupKey,
      displayName,
      description,
      color,
      displayOrder,
      securityCritical
    }, req.user.id);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update group' });
    }

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_GROUP_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role_group',
      targetId: groupId,
      targetName: displayName || group.display_name,
      description: `Updated Discord role group: ${displayName || group.display_name}`,
      details: JSON.stringify({ previous: group, changes: req.body }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role group updated', { groupId, updatedBy: req.user.username });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update Discord role group', { error: error.message, groupId: req.params.groupId });
    res.status(500).json({ error: 'Failed to update Discord role group' });
  }
});

/**
 * DELETE /api/v1/discordroles/groups/:groupId
 * Delete a group (if not system group)
 * Requires: MANAGE_PERMISSIONS
 */
router.delete('/groups/:groupId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await discordRoleService.getGroupById(parseInt(groupId));
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const result = await discordRoleService.deleteGroup(parseInt(groupId), req.user.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_GROUP_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role_group',
      targetId: groupId,
      targetName: group.display_name,
      description: `Deleted Discord role group: ${group.display_name}`,
      details: JSON.stringify({ deleted: group }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role group deleted', { groupId, displayName: group.display_name, deletedBy: req.user.username });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete Discord role group', { error: error.message, groupId: req.params.groupId });
    res.status(500).json({ error: 'Failed to delete Discord role group' });
  }
});

/**
 * GET /api/v1/discordroles/:roleId
 * Get a specific role
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const role = await discordRoleService.getRoleById(roleId);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const group = role.group_id ? await discordRoleService.getGroupById(role.group_id) : null;

    // Enrich with Discord info
    let enrichedRole = {
      id: role.id,
      roleId: role.role_id,
      roleKey: role.role_key,
      roleName: role.role_name,
      description: role.description,
      groupId: role.group_id,
      groupKey: group?.group_key || null,
      groupName: group?.display_name || null,
      isSystemRole: role.is_system_role
    };

    const discordClient = global.discordClient;
    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          enrichedRole.roleName = discordRole.name;
          enrichedRole.discordPosition = discordRole.position;
          enrichedRole.color = discordRole.hexColor;
        }
      }
    }

    res.json({ role: enrichedRole });
  } catch (error) {
    logger.error('Failed to fetch Discord role', { error: error.message, roleId: req.params.roleId });
    res.status(500).json({ error: 'Failed to fetch Discord role' });
  }
});

/**
 * POST /api/v1/discordroles
 * Add a new role entry
 * Requires: MANAGE_PERMISSIONS
 * Body: { roleId: string, roleKey: string, groupId?: number, description?: string }
 */
router.post('/', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId, roleKey, groupId, description } = req.body;

    if (!roleId || !roleKey) {
      return res.status(400).json({ error: 'roleId and roleKey are required' });
    }

    // Check for duplicates
    const existingById = await discordRoleService.getRoleById(roleId);
    if (existingById) {
      return res.status(409).json({ error: 'Role ID already exists' });
    }

    const existingByKey = await discordRoleService.getRoleByKey(roleKey);
    if (existingByKey) {
      return res.status(409).json({ error: 'Role key already exists' });
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

    const role = await discordRoleService.createRole({
      roleId,
      roleKey,
      roleName,
      groupId: groupId || null,
      description
    }, req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role',
      targetId: roleId,
      targetName: roleName || roleKey,
      description: `Added Discord role: ${roleName || roleKey}`,
      details: JSON.stringify({ roleId, roleKey, groupId, description }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role created', { roleId, roleKey, createdBy: req.user.username });

    res.status(201).json({
      success: true,
      role: {
        id: role.id,
        roleId: role.role_id,
        roleKey: role.role_key,
        roleName: role.role_name,
        groupId: role.group_id,
        description: role.description,
        isSystemRole: role.is_system_role
      }
    });
  } catch (error) {
    logger.error('Failed to create Discord role', { error: error.message });
    res.status(500).json({ error: 'Failed to create Discord role' });
  }
});

/**
 * PUT /api/v1/discordroles/:roleId
 * Update a role
 * Requires: MANAGE_PERMISSIONS
 */
router.put('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;
    const { roleKey, groupId, description } = req.body;

    const role = await discordRoleService.getRoleById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check for duplicate key if changing
    if (roleKey && roleKey !== role.role_key) {
      const existingByKey = await discordRoleService.getRoleByKey(roleKey);
      if (existingByKey) {
        return res.status(409).json({ error: 'Role key already exists' });
      }
    }

    const updated = await discordRoleService.updateRole(roleId, {
      roleKey,
      groupId,
      description
    }, req.user.id);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update role' });
    }

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role',
      targetId: roleId,
      targetName: role.role_name || role.role_key,
      description: `Updated Discord role: ${role.role_name || role.role_key}`,
      details: JSON.stringify({ previous: role, changes: req.body }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role updated', { roleId, updatedBy: req.user.username });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update Discord role', { error: error.message, roleId: req.params.roleId });
    res.status(500).json({ error: 'Failed to update Discord role' });
  }
});

/**
 * DELETE /api/v1/discordroles/:roleId
 * Delete a role (if not system role)
 * Requires: MANAGE_PERMISSIONS
 */
router.delete('/:roleId', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { roleId } = req.params;

    const role = await discordRoleService.getRoleById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const result = await discordRoleService.deleteRole(roleId, req.user.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'discord_role',
      targetId: roleId,
      targetName: role.role_name || role.role_key,
      description: `Deleted Discord role: ${role.role_name || role.role_key}`,
      details: JSON.stringify({ deleted: role }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Discord role deleted', { roleId, roleName: role.role_name, deletedBy: req.user.username });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete Discord role', { error: error.message, roleId: req.params.roleId });
    res.status(500).json({ error: 'Failed to delete Discord role' });
  }
});

/**
 * GET /api/v1/discordroles/available
 * Get Discord roles that are not yet tracked
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/available/list', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
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
    const guildRoles = await guild.roles.fetch();

    // Get currently tracked role IDs
    const trackedRoles = await discordRoleService.getAllRoles();
    const trackedIds = trackedRoles.map(r => r.role_id);

    // Filter to available (not tracked, not @everyone, not managed)
    const availableRoles = guildRoles
      .filter(role => !role.managed && role.id !== guild.id && !trackedIds.includes(role.id))
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position
      }))
      .sort((a, b) => b.position - a.position);

    res.json({ roles: availableRoles });
  } catch (error) {
    logger.error('Failed to fetch available Discord roles', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch available Discord roles' });
  }
});

/**
 * POST /api/v1/discordroles/seed
 * Re-seed Discord roles from config file
 * Requires: MANAGE_PERMISSIONS
 */
router.post('/seed', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { confirm } = req.body;

    if (confirm !== 'RESET_ALL_DISCORDROLES') {
      return res.status(400).json({
        error: 'Confirmation required. Send { confirm: "RESET_ALL_DISCORDROLES" } to proceed.'
      });
    }

    const result = await discordRoleService.reseedFromConfig(req.user.id);

    // Create audit log
    await AuditLog.create({
      actionType: 'DISCORD_ROLE_RESET',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'system',
      targetId: 'discord_roles',
      targetName: 'All Discord Roles',
      description: 'Reset all Discord roles to config defaults',
      details: JSON.stringify({ action: 'reset_to_config', ...result }),
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.warn('Discord roles reset to config defaults', {
      ...result,
      by: req.user.username
    });

    res.json({
      success: true,
      message: `Discord roles reset to config defaults (${result.groups} groups, ${result.roles} roles seeded)`
    });
  } catch (error) {
    logger.error('Failed to reset Discord roles', { error: error.message });
    res.status(500).json({ error: 'Failed to reset Discord roles' });
  }
});

module.exports = router;
