/**
 * Centralized environment detection and configuration loading utility
 * 
 * This module provides a single source of truth for environment detection
 * and automatically loads environment-specific configuration files.
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV !== 'development'; // Default to production

/**
 * Get environment-specific configuration path
 * @param {string} configName - Base config name (e.g., 'squadGroups', 'channels', 'discordRoles')
 * @returns {string} - Path to environment-specific config
 */
function getConfigPath(configName) {
  const basePath = '../../config/';
  return isDevelopment ? `${basePath}${configName}.development` : `${basePath}${configName}`;
}

/**
 * Load environment-specific configuration
 * @param {string} configName - Base config name (e.g., 'squadGroups', 'channels', 'discordRoles')
 * @returns {object} - Environment-specific configuration
 */
function loadConfig(configName) {
  const configPath = getConfigPath(configName);
  return require(configPath);
}

/**
 * Load specific exports from environment-specific configuration
 * @param {string} configName - Base config name
 * @param {string|string[]} exports - Export name(s) to destructure
 * @returns {object} - Destructured exports
 */
function loadConfigExports(configName, exports) {
  const config = loadConfig(configName);
  
  if (typeof exports === 'string') {
    return { [exports]: config[exports] };
  }
  
  if (Array.isArray(exports)) {
    const result = {};
    exports.forEach(exportName => {
      result[exportName] = config[exportName];
    });
    return result;
  }
  
  return config;
}

// Pre-loaded common configurations for convenience
const squadGroups = loadConfig('squadGroups');
const channels = loadConfig('channels');
const discordRoles = loadConfig('discordRoles');

// Lazy-load SquadGroupService to avoid circular dependency
let _squadGroupService = null;
function getSquadGroupService() {
  if (!_squadGroupService) {
    _squadGroupService = require('../services/SquadGroupService').squadGroupService;
  }
  return _squadGroupService;
}

module.exports = {
  // Environment flags
  isDevelopment,
  isProduction,

  // Configuration loading utilities
  getConfigPath,
  loadConfig,
  loadConfigExports,

  // Pre-loaded configurations
  squadGroups,
  channels,
  discordRoles,

  // Commonly used destructured exports (sync - from config file)
  getHighestPriorityGroup: squadGroups.getHighestPriorityGroup,
  getAllTrackedRoles: squadGroups.getAllTrackedRoles,
  getGroupByRoleId: squadGroups.getGroupByRoleId,
  isTrackedRole: squadGroups.isTrackedRole,
  CHANNELS: channels.CHANNELS,
  DISCORD_ROLES: discordRoles.DISCORD_ROLES,

  // SquadGroupService (database-backed, async)
  getSquadGroupService,

  // Async helper functions (use database with fallback to config)
  getHighestPriorityGroupAsync: async (roleCache, guild) => {
    return getSquadGroupService().getHighestPriorityGroup(roleCache, guild);
  },
  getAllTrackedRolesAsync: async () => {
    return getSquadGroupService().getAllTrackedRoles();
  },
  getGroupByRoleIdAsync: async (roleId) => {
    return getSquadGroupService().getGroupByRoleId(roleId);
  },
  isTrackedRoleAsync: async (roleId) => {
    return getSquadGroupService().isTrackedRole(roleId);
  }
};