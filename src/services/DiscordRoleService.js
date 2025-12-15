const { createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');

const logger = createServiceLogger('DiscordRoleService');

// Lazy-load models to avoid circular dependency issues
let DiscordRoleGroup = null;
let DiscordRole = null;

function getModels() {
  if (!DiscordRoleGroup || !DiscordRole) {
    const models = require('../database/models');
    DiscordRoleGroup = models.DiscordRoleGroup;
    DiscordRole = models.DiscordRole;
  }
  return { DiscordRoleGroup, DiscordRole };
}

// Role key to group key mapping for seeding
const ROLE_GROUP_MAPPING = {
  // Admin roles
  SUPER_ADMIN: 'admin_roles',
  EXECUTIVE_ADMIN: 'admin_roles',
  HEAD_ADMIN: 'admin_roles',
  SENIOR_ADMIN: 'admin_roles',
  OG_ADMIN: 'admin_roles',
  SQUAD_ADMIN: 'admin_roles',

  // Staff roles (non-admin staff)
  MODERATOR: 'staff_roles',
  STAFF: 'staff_roles',
  TICKET_SUPPORT: 'staff_roles',
  APPLICATIONS: 'staff_roles',

  // Duty roles
  ON_DUTY: 'duty_roles',
  TUTOR_ON_DUTY: 'duty_roles',

  // Tutor roles
  TUTOR: 'tutor_roles',
  TUTOR_LEAD: 'tutor_roles',

  // Specialty roles
  TUTOR_HELICOPTER: 'specialty_roles',
  TUTOR_ARMOR: 'specialty_roles',
  TUTOR_INFANTRY: 'specialty_roles',
  TUTOR_EXPERT: 'specialty_roles',

  // Whitelist award roles
  DONATOR: 'whitelist_award_roles',
  FIRST_RESPONDER: 'whitelist_award_roles',
  SERVICE_MEMBER: 'whitelist_award_roles',

  // Member roles
  MEMBER: 'member_roles'
};

class DiscordRoleService {
  constructor() {
    this.rolesCache = null;
    this.groupsCache = null;
    this.cacheTimestamp = null;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.initialized = false;
  }

  /**
   * Initialize the service and seed defaults if needed
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.seedFromConfigIfEmpty();
      this.initialized = true;
      logger.info('DiscordRoleService initialized');
    } catch (error) {
      logger.error('Failed to initialize DiscordRoleService', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if cache is valid
   * @returns {boolean}
   */
  isCacheValid() {
    if (!this.rolesCache || !this.groupsCache || !this.cacheTimestamp) return false;
    return (Date.now() - this.cacheTimestamp) < this.cacheTTL;
  }

  /**
   * Invalidate the cache
   */
  invalidateCache() {
    this.rolesCache = null;
    this.groupsCache = null;
    this.cacheTimestamp = null;
    logger.debug('Discord role cache invalidated');
  }

  // ============ Role Queries ============

  /**
   * Get all roles from cache or database
   * @returns {Promise<Array>}
   */
  async getAllRoles() {
    if (this.isCacheValid() && this.rolesCache) {
      return this.rolesCache;
    }

    try {
      const { DiscordRole: DR } = getModels();
      const roles = await DR.getAllRoles();

      this.rolesCache = roles;
      if (!this.cacheTimestamp) this.cacheTimestamp = Date.now();
      logger.debug('Discord roles cache refreshed', { count: roles.length });

      return roles;
    } catch (error) {
      logger.error('Failed to load Discord roles', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a role by Discord role ID
   * @param {string} roleId - Discord role snowflake ID
   * @returns {Promise<Object|null>}
   */
  async getRoleById(roleId) {
    const roles = await this.getAllRoles();
    return roles.find(r => r.role_id === roleId) || null;
  }

  /**
   * Get a role by its key
   * @param {string} roleKey - Role key (e.g., 'MEMBER')
   * @returns {Promise<Object|null>}
   */
  async getRoleByKey(roleKey) {
    const roles = await this.getAllRoles();
    return roles.find(r => r.role_key === roleKey) || null;
  }

  /**
   * Get Discord role ID by key
   * @param {string} roleKey - Role key (e.g., 'MEMBER')
   * @returns {Promise<string|null>}
   */
  async getRoleIdByKey(roleKey) {
    const role = await this.getRoleByKey(roleKey);
    return role ? role.role_id : null;
  }

  /**
   * Get all roles in a specific group
   * @param {string} groupKey - Group key (e.g., 'admin_roles')
   * @returns {Promise<Array>}
   */
  async getRolesByGroup(groupKey) {
    const group = await this.getGroupByKey(groupKey);
    if (!group) return [];

    const roles = await this.getAllRoles();
    return roles.filter(r => r.group_id === group.id);
  }

  /**
   * Get role IDs by group key
   * @param {string} groupKey - Group key
   * @returns {Promise<string[]>}
   */
  async getRoleIdsByGroup(groupKey) {
    const roles = await this.getRolesByGroup(groupKey);
    return roles.map(r => r.role_id);
  }

  // ============ Group Queries ============

  /**
   * Get all groups from cache or database
   * @returns {Promise<Array>}
   */
  async getAllGroups() {
    if (this.isCacheValid() && this.groupsCache) {
      return this.groupsCache;
    }

    try {
      const { DiscordRoleGroup: DRG } = getModels();
      const groups = await DRG.getAllGroups();

      this.groupsCache = groups;
      if (!this.cacheTimestamp) this.cacheTimestamp = Date.now();
      logger.debug('Discord groups cache refreshed', { count: groups.length });

      return groups;
    } catch (error) {
      logger.error('Failed to load Discord groups', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a group by its key
   * @param {string} groupKey - Group key (e.g., 'admin_roles')
   * @returns {Promise<Object|null>}
   */
  async getGroupByKey(groupKey) {
    const groups = await this.getAllGroups();
    return groups.find(g => g.group_key === groupKey) || null;
  }

  /**
   * Get a group by ID
   * @param {number} groupId - Group ID
   * @returns {Promise<Object|null>}
   */
  async getGroupById(groupId) {
    const groups = await this.getAllGroups();
    return groups.find(g => g.id === groupId) || null;
  }

  // ============ Helper Function Replacements ============

  /**
   * Get all admin role IDs
   * @returns {Promise<string[]>}
   */
  async getAllAdminRoles() {
    const roleIds = await this.getRoleIdsByGroup('admin_roles');

    // SECURITY: If no admin roles are configured, return a special marker
    if (roleIds.length === 0) {
      logger.error('CRITICAL: No admin roles configured! Admin commands will be disabled.');
      return ['NO_ADMIN_ROLES_CONFIGURED'];
    }

    return roleIds;
  }

  /**
   * Get all staff role IDs (admins + staff)
   * @returns {Promise<string[]>}
   */
  async getAllStaffRoles() {
    const adminRoles = await this.getRoleIdsByGroup('admin_roles');
    const staffRoles = await this.getRoleIdsByGroup('staff_roles');
    const combined = [...new Set([...adminRoles, ...staffRoles])];

    // SECURITY: If no staff roles are configured, return a special marker
    if (combined.length === 0) {
      logger.error('CRITICAL: No staff roles configured! Staff commands will be disabled.');
      return ['NO_STAFF_ROLES_CONFIGURED'];
    }

    return combined;
  }

  /**
   * Get all tutor role IDs
   * @returns {Promise<string[]>}
   */
  async getAllTutorRoles() {
    return this.getRoleIdsByGroup('tutor_roles');
  }

  /**
   * Get all specialty role IDs
   * @returns {Promise<string[]>}
   */
  async getAllSpecialtyRoles() {
    return this.getRoleIdsByGroup('specialty_roles');
  }

  /**
   * Get all whitelist award role IDs
   * @returns {Promise<string[]>}
   */
  async getAllWhitelistAwardRoles() {
    return this.getRoleIdsByGroup('whitelist_award_roles');
  }

  /**
   * Get all member role IDs
   * @returns {Promise<string[]>}
   */
  async getAllMemberRoles() {
    return this.getRoleIdsByGroup('member_roles');
  }

  // ============ CRUD Operations ============

  /**
   * Create a new role entry
   * @param {Object} data - Role data
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<Object>}
   */
  async createRole(data, createdBy = null) {
    const { DiscordRole: DR } = getModels();
    const role = await DR.createRole(data, createdBy);
    this.invalidateCache();
    logger.info('Discord role created', { roleKey: data.roleKey, createdBy });
    return role;
  }

  /**
   * Update a role
   * @param {string} roleId - Discord role ID
   * @param {Object} data - Update data
   * @param {string} [updatedBy] - Discord user ID
   * @returns {Promise<boolean>}
   */
  async updateRole(roleId, data, updatedBy = null) {
    const { DiscordRole: DR } = getModels();
    const updated = await DR.updateRole(roleId, data, updatedBy);
    if (updated) {
      this.invalidateCache();
      logger.info('Discord role updated', { roleId, updatedBy });
    }
    return updated;
  }

  /**
   * Update cached role name (called when Discord role is renamed)
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - New role name
   * @returns {Promise<boolean>}
   */
  async updateRoleName(roleId, roleName) {
    const { DiscordRole: DR } = getModels();
    const updated = await DR.updateRoleName(roleId, roleName);
    if (updated) {
      this.invalidateCache();
    }
    return updated;
  }

  /**
   * Delete a role
   * @param {string} roleId - Discord role ID
   * @param {string} [deletedBy] - Discord user ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteRole(roleId, deletedBy = null) {
    const { DiscordRole: DR } = getModels();
    const result = await DR.deleteRole(roleId);
    if (result.success) {
      this.invalidateCache();
      logger.info('Discord role deleted', { roleId, deletedBy });
    }
    return result;
  }

  /**
   * Create a new group
   * @param {Object} data - Group data
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<Object>}
   */
  async createGroup(data, createdBy = null) {
    const { DiscordRoleGroup: DRG } = getModels();
    const group = await DRG.createGroup(data, createdBy);
    this.invalidateCache();
    logger.info('Discord role group created', { groupKey: data.groupKey, createdBy });
    return group;
  }

  /**
   * Update a group
   * @param {number} groupId - Group ID
   * @param {Object} data - Update data
   * @param {string} [updatedBy] - Discord user ID
   * @returns {Promise<boolean>}
   */
  async updateGroup(groupId, data, updatedBy = null) {
    const { DiscordRoleGroup: DRG } = getModels();
    const updated = await DRG.updateGroup(groupId, data, updatedBy);
    if (updated) {
      this.invalidateCache();
      logger.info('Discord role group updated', { groupId, updatedBy });
    }
    return updated;
  }

  /**
   * Delete a group
   * @param {number} groupId - Group ID
   * @param {string} [deletedBy] - Discord user ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteGroup(groupId, deletedBy = null) {
    const { DiscordRoleGroup: DRG } = getModels();
    const result = await DRG.deleteGroup(groupId);
    if (result.success) {
      this.invalidateCache();
      logger.info('Discord role group deleted', { groupId, deletedBy });
    }
    return result;
  }

  // ============ Seeding ============

  /**
   * Seed from config file if database is empty
   * @returns {Promise<boolean>} True if seeding occurred
   */
  async seedFromConfigIfEmpty() {
    try {
      const { DiscordRoleGroup: DRG, DiscordRole: DR } = getModels();

      // Check if groups exist
      const groupCount = await DRG.count();

      if (groupCount === 0) {
        logger.info('Seeding Discord role groups from defaults...');
        const groupsSeeded = await DRG.seedDefaultGroups(null);
        logger.info('Discord role groups seeded', { count: groupsSeeded });
      }

      // Check if roles exist
      const roleCount = await DR.count();

      if (roleCount === 0) {
        logger.info('Seeding Discord roles from config...');

        // Load config
        let discordRolesConfig;
        try {
          discordRolesConfig = loadConfig('discordRoles');
        } catch {
          logger.warn('Could not load discordRoles config, skipping role seeding');
          return false;
        }

        const discordRoles = discordRolesConfig.DISCORD_ROLES;
        if (!discordRoles) {
          logger.warn('No DISCORD_ROLES in config, skipping role seeding');
          return false;
        }

        // Build group ID mapping
        const groups = await DRG.getAllGroups();
        const groupIdMap = {};
        for (const [roleKey, groupKey] of Object.entries(ROLE_GROUP_MAPPING)) {
          const group = groups.find(g => g.group_key === groupKey);
          if (group) {
            groupIdMap[roleKey] = group.id;
          }
        }

        // Seed roles
        const rolesSeeded = await DR.seedFromConfig(discordRoles, groupIdMap, null);
        logger.info('Discord roles seeded', { count: rolesSeeded });

        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to seed Discord roles', { error: error.message });
      throw error;
    }
  }

  /**
   * Force reseed from config (destructive - deletes existing data)
   * @param {string} [resetBy] - Discord user ID who initiated reset
   * @returns {Promise<{groups: number, roles: number}>}
   */
  async reseedFromConfig(resetBy = null) {
    const { DiscordRoleGroup: DRG, DiscordRole: DR } = getModels();

    // Delete all roles first (due to FK constraint)
    await DR.destroy({ where: {}, truncate: true });

    // Delete all groups
    await DRG.destroy({ where: {}, truncate: true });

    // Seed groups
    const groupsSeeded = await DRG.seedDefaultGroups(resetBy);

    // Load and seed roles
    let rolesSeeded = 0;
    try {
      const discordRolesConfig = loadConfig('discordRoles');
      const discordRoles = discordRolesConfig.DISCORD_ROLES;

      if (discordRoles) {
        const groups = await DRG.getAllGroups();
        const groupIdMap = {};
        for (const [roleKey, groupKey] of Object.entries(ROLE_GROUP_MAPPING)) {
          const group = groups.find(g => g.group_key === groupKey);
          if (group) {
            groupIdMap[roleKey] = group.id;
          }
        }

        rolesSeeded = await DR.seedFromConfig(discordRoles, groupIdMap, resetBy);
      }
    } catch (error) {
      logger.warn('Could not load discordRoles config during reseed', { error: error.message });
    }

    this.invalidateCache();
    logger.info('Discord roles reseeded from config', { groups: groupsSeeded, roles: rolesSeeded, resetBy });

    return { groups: groupsSeeded, roles: rolesSeeded };
  }

  // ============ Backward Compatibility ============

  /**
   * Get DISCORD_ROLES-like object for backward compatibility
   * @returns {Promise<Object>}
   */
  async getDiscordRolesObject() {
    const roles = await this.getAllRoles();
    const result = {};

    for (const role of roles) {
      result[role.role_key] = role.role_id;
    }

    return result;
  }
}

// Export singleton instance
const discordRoleService = new DiscordRoleService();

module.exports = {
  discordRoleService,
  ROLE_GROUP_MAPPING
};
