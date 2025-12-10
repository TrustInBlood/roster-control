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
const infoPosts = loadConfig('infoPosts');

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
  infoPosts,

  // Commonly used destructured exports
  getHighestPriorityGroup: squadGroups.getHighestPriorityGroup,
  CHANNELS: channels.CHANNELS,
  DISCORD_ROLES: discordRoles.DISCORD_ROLES,
  INFO_POSTS: infoPosts.INFO_POSTS
};