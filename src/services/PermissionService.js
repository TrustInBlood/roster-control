const { createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');

const logger = createServiceLogger('PermissionService');

// Lazy-load RolePermission model to avoid circular dependency issues
let RolePermission = null;
function getRolePermissionModel() {
  if (!RolePermission) {
    RolePermission = require('../database/models').RolePermission;
  }
  return RolePermission;
}

// Load environment-specific Discord roles for default seeding
const {
  DISCORD_ROLES,
  getAllAdminRoles,
  getAllStaffRoles
} = loadConfig('discordRoles');

// Permission definitions with metadata
const PERMISSION_DEFINITIONS = {
  VIEW_WHITELIST: {
    description: 'View whitelist entries',
    critical: false
  },
  GRANT_WHITELIST: {
    description: 'Grant new whitelist entries',
    critical: false
  },
  REVOKE_WHITELIST: {
    description: 'Revoke whitelist entries',
    critical: false
  },
  VIEW_MEMBERS: {
    description: 'View member list',
    critical: false
  },
  ADD_MEMBER: {
    description: 'Add new members',
    critical: false
  },
  BULK_IMPORT: {
    description: 'Bulk import operations',
    critical: false
  },
  VIEW_DUTY: {
    description: 'View duty statistics',
    critical: false
  },
  VIEW_AUDIT: {
    description: 'View audit logs',
    critical: false
  },
  VIEW_SECURITY: {
    description: 'View security reports',
    critical: false
  },
  MANAGE_SESSIONS: {
    description: 'Manage user sessions',
    critical: true
  },
  EXPORT_DATA: {
    description: 'Export data',
    critical: false
  },
  MANAGE_PERMISSIONS: {
    description: 'Manage role permissions',
    critical: true
  }
};

// Default permission mappings (used for initial seeding)
// Maps permission name to an array of role IDs
function getDefaultPermissions() {
  return {
    VIEW_WHITELIST: [
      ...getAllStaffRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    GRANT_WHITELIST: [
      ...getAllStaffRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    REVOKE_WHITELIST: [
      ...getAllAdminRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    VIEW_MEMBERS: [
      DISCORD_ROLES.APPLICATIONS,
      ...getAllStaffRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    ADD_MEMBER: [
      DISCORD_ROLES.APPLICATIONS,
      DISCORD_ROLES.SUPER_ADMIN
    ],
    BULK_IMPORT: [
      ...getAllAdminRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    VIEW_DUTY: [
      ...getAllAdminRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    VIEW_AUDIT: [
      ...getAllAdminRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    VIEW_SECURITY: [
      ...getAllAdminRoles(),
      DISCORD_ROLES.SUPER_ADMIN
    ],
    MANAGE_SESSIONS: [
      DISCORD_ROLES.SUPER_ADMIN
    ],
    EXPORT_DATA: [
      DISCORD_ROLES.SUPER_ADMIN
    ],
    MANAGE_PERMISSIONS: [
      DISCORD_ROLES.SUPER_ADMIN
    ]
  };
}

class PermissionService {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.initialized = false;
  }

  /**
   * Initialize the service and seed defaults if needed
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.seedDefaultPermissions();
      this.initialized = true;
      logger.info('PermissionService initialized');
    } catch (error) {
      logger.error('Failed to initialize PermissionService', { error: error.message });
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
   * Invalidate the cache
   */
  invalidateCache() {
    this.cache = null;
    this.cacheTimestamp = null;
    logger.debug('Permission cache invalidated');
  }

  /**
   * Get permission mappings from cache or database
   * @returns {Promise<Object>} Map of permission_name -> role_id[]
   */
  async getPermissionMappings() {
    if (this.isCacheValid()) {
      return this.cache;
    }

    try {
      const dbMappings = await getRolePermissionModel().getAllPermissionMappings();

      // If database is empty, seed defaults and return them
      if (Object.keys(dbMappings).length === 0) {
        logger.info('No permissions in database, seeding defaults...');
        await this.seedDefaultPermissions();
        // Return defaults directly since we just seeded them
        const defaults = getDefaultPermissions();
        this.cache = defaults;
        this.cacheTimestamp = Date.now();
        return defaults;
      }

      // Convert to simple roleId arrays for quick lookup
      const mappings = {};
      for (const [permName, roles] of Object.entries(dbMappings)) {
        mappings[permName] = roles.map(r => r.roleId);
      }

      // Fill in any missing permissions with defaults (for new permissions added later)
      const defaults = getDefaultPermissions();
      for (const permName of Object.keys(PERMISSION_DEFINITIONS)) {
        if (!mappings[permName] || mappings[permName].length === 0) {
          mappings[permName] = defaults[permName] || [];
        }
      }

      this.cache = mappings;
      this.cacheTimestamp = Date.now();
      logger.debug('Permission cache refreshed from database');

      return mappings;
    } catch (error) {
      logger.error('Failed to load permissions from database, using defaults', { error: error.message });
      // Fallback to defaults if database fails
      return getDefaultPermissions();
    }
  }

  /**
   * Get role IDs for a specific permission
   * @param {string} permissionName - Permission name
   * @returns {Promise<string[]>} Array of role IDs
   */
  async getRolesForPermission(permissionName) {
    const mappings = await this.getPermissionMappings();
    return mappings[permissionName] || [];
  }

  /**
   * Check if a user has a specific permission
   * @param {string[]} userRoles - Array of user's role IDs
   * @param {string} permissionName - Permission to check
   * @returns {Promise<boolean>}
   */
  async hasPermission(userRoles, permissionName) {
    if (!userRoles || userRoles.length === 0) return false;

    const requiredRoles = await this.getRolesForPermission(permissionName);
    if (!requiredRoles || requiredRoles.length === 0) return false;

    return userRoles.some(roleId => requiredRoles.includes(roleId));
  }

  /**
   * Get all permissions a user has
   * @param {string[]} userRoles - Array of user's role IDs
   * @returns {Promise<string[]>} Array of permission names
   */
  async getUserPermissions(userRoles) {
    if (!userRoles || userRoles.length === 0) return [];

    const mappings = await this.getPermissionMappings();
    const permissions = [];

    for (const [permName, roleIds] of Object.entries(mappings)) {
      if (userRoles.some(roleId => roleIds.includes(roleId))) {
        permissions.push(permName);
      }
    }

    return permissions;
  }

  /**
   * Set roles for a permission
   * @param {string} permissionName - Permission name
   * @param {Array<{roleId: string, roleName: string}>} roles - Roles to assign
   * @param {string} grantedBy - Discord user ID who made the change
   * @returns {Promise<void>}
   */
  async setRolesForPermission(permissionName, roles, grantedBy) {
    // Validate permission exists
    if (!PERMISSION_DEFINITIONS[permissionName]) {
      throw new Error(`Unknown permission: ${permissionName}`);
    }

    // Critical permission protection
    if (PERMISSION_DEFINITIONS[permissionName].critical && roles.length === 0) {
      throw new Error(`Cannot remove all roles from critical permission: ${permissionName}`);
    }

    await getRolePermissionModel().setRolesForPermission(permissionName, roles, grantedBy);
    this.invalidateCache();

    logger.info('Permission updated', {
      permission: permissionName,
      roleCount: roles.length,
      grantedBy
    });
  }

  /**
   * Get all permission definitions with current role assignments
   * @returns {Promise<Object[]>}
   */
  async getAllPermissionsWithRoles() {
    const dbMappings = await getRolePermissionModel().getAllPermissionMappings();

    const result = [];
    for (const [permName, definition] of Object.entries(PERMISSION_DEFINITIONS)) {
      const roles = dbMappings[permName] || [];
      result.push({
        name: permName,
        description: definition.description,
        critical: definition.critical,
        roles: roles.map(r => ({
          id: r.roleId,
          name: r.roleName,
          grantedBy: r.grantedBy,
          grantedAt: r.grantedAt
        }))
      });
    }

    return result;
  }

  /**
   * Seed default permissions if table is empty
   * @returns {Promise<boolean>} True if seeding occurred
   */
  async seedDefaultPermissions() {
    const count = await getRolePermissionModel().count();

    if (count > 0) {
      logger.debug('Permissions already seeded, skipping');
      return false;
    }

    logger.info('Seeding default permissions...');
    const defaults = getDefaultPermissions();

    for (const [permName, roleIds] of Object.entries(defaults)) {
      // Filter out duplicates and invalid IDs
      const uniqueRoleIds = [...new Set(roleIds)].filter(Boolean);

      const roles = uniqueRoleIds.map(roleId => ({
        roleId,
        roleName: this.getRoleNameFromId(roleId)
      }));

      await getRolePermissionModel().setRolesForPermission(permName, roles, null);
    }

    logger.info('Default permissions seeded successfully');
    return true;
  }

  /**
   * Get role name from ID (helper for seeding)
   * @param {string} roleId - Discord role ID
   * @returns {string|null}
   */
  getRoleNameFromId(roleId) {
    // Reverse lookup from DISCORD_ROLES
    for (const [name, id] of Object.entries(DISCORD_ROLES)) {
      if (id === roleId) {
        // Convert SUPER_ADMIN to "Super Admin"
        return name.split('_').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      }
    }
    return null;
  }

  /**
   * Get permission definitions
   * @returns {Object}
   */
  getPermissionDefinitions() {
    return PERMISSION_DEFINITIONS;
  }

  /**
   * Check if a permission is critical
   * @param {string} permissionName - Permission name
   * @returns {boolean}
   */
  isCriticalPermission(permissionName) {
    return PERMISSION_DEFINITIONS[permissionName]?.critical || false;
  }
}

// Export singleton instance
const permissionService = new PermissionService();

module.exports = {
  permissionService,
  PERMISSION_DEFINITIONS,
  getDefaultPermissions
};
