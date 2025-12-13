const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requirePermission } = require('../middleware/auth');
const { permissionService, PERMISSION_DEFINITIONS } = require('../../services/PermissionService');
const { AuditLog } = require('../../database/models');

const logger = createServiceLogger('PermissionsAPI');

/**
 * GET /api/v1/permissions
 * List all permissions with their assigned roles
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const permissions = await permissionService.getAllPermissionsWithRoles();

    res.json({ permissions });
  } catch (error) {
    logger.error('Failed to fetch permissions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

/**
 * GET /api/v1/permissions/roles
 * Get available Discord roles for assignment
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

    // Filter and map roles (exclude @everyone and managed/bot roles)
    const availableRoles = roles
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position
      }))
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    res.json({ roles: availableRoles });
  } catch (error) {
    logger.error('Failed to fetch Discord roles', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch Discord roles' });
  }
});

/**
 * GET /api/v1/permissions/definitions
 * Get permission definitions (names, descriptions, critical status)
 * Requires: MANAGE_PERMISSIONS
 */
router.get('/definitions', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const definitions = Object.entries(PERMISSION_DEFINITIONS).map(([name, def]) => ({
      name,
      description: def.description,
      critical: def.critical
    }));

    res.json({ definitions });
  } catch (error) {
    logger.error('Failed to fetch permission definitions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch permission definitions' });
  }
});

/**
 * PUT /api/v1/permissions/:permissionName
 * Update roles assigned to a permission
 * Requires: MANAGE_PERMISSIONS
 * Body: { roleIds: string[] } - Array of role IDs
 */
router.put('/:permissionName', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { permissionName } = req.params;
    const { roleIds } = req.body;

    // Validate permission exists
    if (!PERMISSION_DEFINITIONS[permissionName]) {
      return res.status(404).json({ error: `Unknown permission: ${permissionName}` });
    }

    // Validate roleIds is an array
    if (!Array.isArray(roleIds)) {
      return res.status(400).json({ error: 'roleIds must be an array' });
    }

    // Critical permission protection
    if (PERMISSION_DEFINITIONS[permissionName].critical && roleIds.length === 0) {
      return res.status(400).json({
        error: `Cannot remove all roles from critical permission: ${permissionName}`,
        code: 'CRITICAL_PERMISSION_PROTECTED'
      });
    }

    // Get Discord client to fetch role names
    const discordClient = global.discordClient;
    let roleMap = new Map();

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildRoles = await guild.roles.fetch();
        guildRoles.forEach(role => {
          roleMap.set(role.id, role.name);
        });
      }
    }

    // Build roles array with names
    const roles = roleIds.map(roleId => ({
      roleId,
      roleName: roleMap.get(roleId) || null
    }));

    // Get previous roles for audit log
    const previousRoles = await permissionService.getRolesForPermission(permissionName);

    // Update permission
    await permissionService.setRolesForPermission(permissionName, roles, req.user.id);

    // Create audit log entry
    await AuditLog.create({
      actionType: 'PERMISSION_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'permission',
      targetId: permissionName,
      targetName: permissionName,
      description: `Updated roles for permission ${permissionName}`,
      details: JSON.stringify({
        previousRoles,
        newRoles: roleIds,
        changeCount: {
          added: roleIds.filter(id => !previousRoles.includes(id)).length,
          removed: previousRoles.filter(id => !roleIds.includes(id)).length
        }
      }),
      severity: PERMISSION_DEFINITIONS[permissionName].critical ? 'high' : 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Fetch updated permission data
    const allPermissions = await permissionService.getAllPermissionsWithRoles();
    const updatedPermission = allPermissions.find(p => p.name === permissionName);

    logger.info('Permission updated', {
      permission: permissionName,
      roleCount: roleIds.length,
      updatedBy: req.user.username
    });

    res.json({
      success: true,
      permission: updatedPermission
    });
  } catch (error) {
    logger.error('Failed to update permission', {
      permission: req.params.permissionName,
      error: error.message
    });

    if (error.message.includes('Cannot remove all roles from critical permission')) {
      return res.status(400).json({
        error: error.message,
        code: 'CRITICAL_PERMISSION_PROTECTED'
      });
    }

    res.status(500).json({ error: 'Failed to update permission' });
  }
});

/**
 * POST /api/v1/permissions/seed
 * Re-seed default permissions (admin utility)
 * Requires: MANAGE_PERMISSIONS
 * Note: This is destructive - it will reset all permissions to defaults
 */
router.post('/seed', requirePermission('MANAGE_PERMISSIONS'), async (req, res) => {
  try {
    const { confirm } = req.body;

    if (confirm !== 'RESET_ALL_PERMISSIONS') {
      return res.status(400).json({
        error: 'Confirmation required. Send { confirm: "RESET_ALL_PERMISSIONS" } to proceed.'
      });
    }

    // Clear existing permissions
    const { RolePermission } = require('../../database/models');
    await RolePermission.destroy({ where: {} });

    // Re-seed defaults
    await permissionService.seedDefaultPermissions();
    permissionService.invalidateCache();

    // Create audit log
    await AuditLog.create({
      actionType: 'PERMISSION_RESET',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'system',
      targetId: 'permissions',
      targetName: 'All Permissions',
      description: 'Reset all permissions to default values',
      details: JSON.stringify({ action: 'reset_to_defaults' }),
      severity: 'critical',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.warn('Permissions reset to defaults', { by: req.user.username });

    res.json({ success: true, message: 'Permissions reset to defaults' });
  } catch (error) {
    logger.error('Failed to reset permissions', { error: error.message });
    res.status(500).json({ error: 'Failed to reset permissions' });
  }
});

module.exports = router;
