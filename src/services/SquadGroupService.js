const { createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');

const logger = createServiceLogger('SquadGroupService');

// Lazy-load SquadRolePermission model to avoid circular dependency issues
let SquadRolePermission = null;
function getSquadRolePermissionModel() {
  if (!SquadRolePermission) {
    SquadRolePermission = require('../database/models').SquadRolePermission;
  }
  return SquadRolePermission;
}

// Predefined Squad permissions with metadata
const SQUAD_PERMISSIONS = [
  { id: 'balance', label: 'Balance', description: 'Team balance and swap commands' },
  { id: 'ban', label: 'Ban', description: 'Ban players from the server' },
  { id: 'cameraman', label: 'Cameraman', description: 'Access to cameraman mode for spectating' },
  { id: 'canseeadminchat', label: 'Can See Admin Chat', description: 'View admin chat messages in-game' },
  { id: 'changemap', label: 'Change Map', description: 'Change the current map' },
  { id: 'chat', label: 'Chat', description: 'Send chat messages in-game' },
  { id: 'forceteamchange', label: 'Force Team Change', description: 'Force players to change teams' },
  { id: 'immune', label: 'Immune', description: 'Immune to kicks and bans' },
  { id: 'kick', label: 'Kick', description: 'Kick players from the server' },
  { id: 'reserve', label: 'Reserve Slot', description: 'Reserved slot access when server is full' },
  { id: 'startvote', label: 'Start Vote', description: 'Start server votes' },
  { id: 'teamchange', label: 'Team Change', description: 'Change own team freely' }
];

// Get default squad groups from config file for seeding
function getDefaultSquadGroups() {
  try {
    const squadGroups = loadConfig('squadGroups');
    return squadGroups.SQUAD_GROUPS || {};
  } catch (error) {
    logger.error('Failed to load squadGroups config for defaults', { error: error.message });
    return {};
  }
}

class SquadGroupService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.initialized = false;
    this.whitelistService = null; // Will be set during initialization
  }

  /**
   * Set the whitelist service reference for cache invalidation
   * @param {Object} whitelistService - WhitelistService instance
   */
  setWhitelistService(whitelistService) {
    this.whitelistService = whitelistService;
    logger.debug('WhitelistService reference set for cache invalidation');
  }

  /**
   * Initialize the service and seed defaults if needed
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.seedFromConfigIfEmpty();
      this.initialized = true;
      logger.info('SquadGroupService initialized');
    } catch (error) {
      logger.error('Failed to initialize SquadGroupService', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if cache is valid
   * @returns {boolean}
   */
  isCacheValid() {
    if (!this.cache || !this.cacheTimestamp) return false;
    return (Date.now() - this.cacheTimestamp) < this.cacheTTL;
  }

  /**
   * Invalidate the cache and optionally trigger whitelist regeneration
   */
  invalidateCache() {
    this.cache = null;
    this.cacheTimestamp = null;
    logger.debug('Squad group cache invalidated');

    // Trigger whitelist regeneration if service is available
    if (this.whitelistService && typeof this.whitelistService.invalidateCache === 'function') {
      this.whitelistService.invalidateCache();
      logger.debug('Whitelist cache invalidated due to squad group change');
    }
  }

  /**
   * Get all role configurations from cache or database
   * @returns {Promise<Array>} Array of role configs
   */
  async getAllRoleConfigs() {
    if (this.isCacheValid()) {
      return this.cache;
    }

    try {
      const configs = await getSquadRolePermissionModel().getAllMappings();

      // If database is empty, seed from config and return
      if (configs.length === 0) {
        logger.info('No squad groups in database, seeding from config...');
        await this.seedFromConfigIfEmpty();
        const seededConfigs = await getSquadRolePermissionModel().getAllMappings();
        this.cache = seededConfigs;
        this.cacheTimestamp = Date.now();
        return seededConfigs;
      }

      this.cache = configs;
      this.cacheTimestamp = Date.now();
      logger.debug('Squad group cache refreshed from database', { count: configs.length });

      return configs;
    } catch (error) {
      logger.error('Failed to load squad groups from database, using config fallback', { error: error.message });
      // Fallback to config file
      return this.getConfigFallback();
    }
  }

  /**
   * Get config fallback from squadGroups.js
   * @returns {Array}
   */
  getConfigFallback() {
    const squadGroups = getDefaultSquadGroups();
    const configs = [];

    for (const [groupName, groupData] of Object.entries(squadGroups)) {
      for (const roleId of groupData.discordRoles) {
        configs.push({
          roleId,
          roleName: groupName,
          groupName,
          permissions: groupData.permissions ? groupData.permissions.split(',') : [],
          createdBy: null,
          createdAt: null,
          updatedBy: null,
          updatedAt: null
        });
      }
    }

    return configs;
  }

  /**
   * Get all tracked Discord role IDs (roles with Squad permissions)
   * @returns {Promise<string[]>}
   */
  async getAllTrackedRoles() {
    try {
      const configs = await this.getAllRoleConfigs();
      return configs.map(c => c.roleId);
    } catch (error) {
      logger.error('Failed to get tracked roles, using config fallback', { error: error.message });
      const squadGroups = getDefaultSquadGroups();
      const roles = [];
      for (const groupData of Object.values(squadGroups)) {
        roles.push(...groupData.discordRoles);
      }
      return [...new Set(roles)];
    }
  }

  /**
   * Check if a role ID is tracked
   * @param {string} roleId - Discord role ID
   * @returns {Promise<boolean>}
   */
  async isTrackedRole(roleId) {
    const trackedRoles = await this.getAllTrackedRoles();
    return trackedRoles.includes(roleId);
  }

  /**
   * Get group name for a specific Discord role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<string|null>}
   */
  async getGroupByRoleId(roleId) {
    try {
      const configs = await this.getAllRoleConfigs();
      const config = configs.find(c => c.roleId === roleId);
      return config ? config.groupName : null;
    } catch (error) {
      logger.error('Failed to get group by role ID', { error: error.message, roleId });
      return null;
    }
  }

  /**
   * Get the highest priority group for a user based on their Discord roles
   * Uses Discord role position for priority (higher position = higher priority)
   *
   * @param {Collection} roleCache - Discord member's role cache (from member.roles.cache)
   * @param {Guild} [guild] - Discord guild (optional, for fetching role positions)
   * @returns {Promise<string|null>} Group name with highest priority, or null if no tracked roles
   */
  async getHighestPriorityGroup(roleCache, _guild = null) {
    try {
      const trackedRoles = await this.getAllTrackedRoles();

      // Filter user's roles to only tracked ones
      const userTrackedRoles = roleCache.filter(r => trackedRoles.includes(r.id));

      if (userTrackedRoles.size === 0) {
        return null;
      }

      // Sort by Discord position (higher position = more priority)
      const sorted = [...userTrackedRoles.values()].sort((a, b) => b.position - a.position);

      // Get the group name for the highest position role
      const highestRole = sorted[0];
      return await this.getGroupByRoleId(highestRole.id);
    } catch (error) {
      logger.error('Failed to get highest priority group', { error: error.message });
      return null;
    }
  }

  /**
   * Get configuration for a specific role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<Object|null>}
   */
  async getRoleConfig(roleId) {
    try {
      const configs = await this.getAllRoleConfigs();
      return configs.find(c => c.roleId === roleId) || null;
    } catch (error) {
      logger.error('Failed to get role config', { error: error.message, roleId });
      return null;
    }
  }

  /**
   * Set permissions for a Discord role (create or update)
   * @param {string} roleId - Discord role ID
   * @param {Object} data - Role data
   * @param {string} [data.roleName] - Discord role name
   * @param {string} [data.groupName] - Squad group name
   * @param {string[]} data.permissions - Array of permission IDs
   * @param {string} [updatedBy] - Discord user ID who made the change
   * @returns {Promise<Object>}
   */
  async setRolePermissions(roleId, data, updatedBy = null) {
    // Validate permissions
    const validPermissions = SQUAD_PERMISSIONS.map(p => p.id);
    const invalidPerms = data.permissions.filter(p => !validPermissions.includes(p));
    if (invalidPerms.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
    }

    const result = await getSquadRolePermissionModel().setRolePermissions(roleId, data, updatedBy);
    this.invalidateCache();

    logger.info('Squad role permissions updated', {
      roleId,
      groupName: data.groupName || data.roleName,
      permissionCount: data.permissions.length,
      updatedBy,
      isNew: result.isNew
    });

    return result;
  }

  /**
   * Remove a role from the system
   * @param {string} roleId - Discord role ID
   * @param {string} [removedBy] - Discord user ID who removed
   * @returns {Promise<boolean>}
   */
  async removeRole(roleId, removedBy = null) {
    const deleted = await getSquadRolePermissionModel().removeRole(roleId);

    if (deleted) {
      this.invalidateCache();
      logger.info('Squad role removed', { roleId, removedBy });
    }

    return deleted;
  }

  /**
   * Get the predefined Squad permissions list
   * @returns {Array}
   */
  getSquadPermissionsList() {
    return SQUAD_PERMISSIONS;
  }

  /**
   * Get all role configs in SQUAD_GROUPS format for backward compatibility
   * @returns {Promise<Object>}
   */
  async getSquadGroupsFormat() {
    try {
      return await getSquadRolePermissionModel().getSquadGroupsFormat();
    } catch (error) {
      logger.error('Failed to get SQUAD_GROUPS format, using config fallback', { error: error.message });
      return getDefaultSquadGroups();
    }
  }

  /**
   * Seed from config file if database is empty
   * @returns {Promise<boolean>} True if seeding occurred
   */
  async seedFromConfigIfEmpty() {
    try {
      const count = await getSquadRolePermissionModel().count();

      if (count > 0) {
        logger.debug('Squad groups already seeded, skipping');
        return false;
      }

      const squadGroups = getDefaultSquadGroups();
      if (Object.keys(squadGroups).length === 0) {
        logger.warn('No squad groups in config file to seed');
        return false;
      }

      logger.info('Seeding squad groups from config file...');
      const seededCount = await getSquadRolePermissionModel().seedFromConfig(squadGroups, null);
      logger.info('Squad groups seeded successfully', { count: seededCount });

      return true;
    } catch (error) {
      logger.error('Failed to seed squad groups', { error: error.message });
      throw error;
    }
  }

  /**
   * Force reseed from config (destructive - deletes existing data)
   * @param {string} [resetBy] - Discord user ID who initiated reset
   * @returns {Promise<number>} Number of roles seeded
   */
  async reseedFromConfig(resetBy = null) {
    // Delete all existing entries
    await getSquadRolePermissionModel().destroy({ where: {}, truncate: true });

    // Seed from config
    const squadGroups = getDefaultSquadGroups();
    const count = await getSquadRolePermissionModel().seedFromConfig(squadGroups, resetBy);

    this.invalidateCache();
    logger.info('Squad groups reseeded from config', { count, resetBy });

    return count;
  }

  /**
   * Update cached role name for a role (called when Discord role is renamed)
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - New role name
   * @returns {Promise<boolean>}
   */
  async updateRoleName(roleId, roleName) {
    const updated = await getSquadRolePermissionModel().updateRoleName(roleId, roleName);
    if (updated) {
      this.invalidateCache();
    }
    return updated;
  }
}

// Export singleton instance
const squadGroupService = new SquadGroupService();

module.exports = {
  squadGroupService,
  SQUAD_PERMISSIONS,
  getDefaultSquadGroups
};
