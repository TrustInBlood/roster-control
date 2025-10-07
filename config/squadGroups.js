/**
 * Squad server group definitions and Discord role mappings
 * Higher priority numbers take precedence when a user has multiple roles
 */

const { DISCORD_ROLES, getAllAdminRoles, getAllMemberRoles } = require('./discordRoles');

const SQUAD_GROUPS = {
  // Head Admin - Full server control
  HeadAdmin: {
    priority: 300,
    permissions: 'cameraman,canseeadminchat,chat,forceteamchange,immune,reserve,teamchange,balance,manageserver,config',
    discordRoles: [
      DISCORD_ROLES.EXECUTIVE_ADMIN,
      DISCORD_ROLES.HEAD_ADMIN
    ]
  },
  
  // Squad Admin - Core admin permissions
  SquadAdmin: {
    priority: 200,
    permissions: 'balance,cameraman,canseeadminchat,chat,forceteamchange,immune,reserve',
    discordRoles: [
      DISCORD_ROLES.SENIOR_ADMIN,
      DISCORD_ROLES.OG_ADMIN,
      DISCORD_ROLES.SQUAD_ADMIN
    ]
  },
  
  // Moderator - Basic admin permissions
  Moderator: {
    priority: 100,
    permissions: 'canseeadminchat,chat,reserve',
    discordRoles: [
      DISCORD_ROLES.MODERATOR
    ]
  },
  
  // Member - Whitelist only, no Squad permissions
  Member: {
    priority: 0,
    permissions: 'reserve',
    discordRoles: [
      // Add member role IDs when you have them configured
      DISCORD_ROLES.MEMBER,
    ]
  }
};

/**
 * Get all tracked Discord role IDs
 * @returns {string[]} Array of all Discord role IDs that grant whitelist access
 */
function getAllTrackedRoles() {
  const roles = [];
  Object.values(SQUAD_GROUPS).forEach(group => {
    roles.push(...group.discordRoles);
  });
  return [...new Set(roles)]; // Remove duplicates
}

/**
 * Get the highest priority group for a set of Discord roles
 * @param {Collection} roleCache Discord role cache from member.roles.cache
 * @returns {string|null} Group name with highest priority, or null if no tracked roles
 */
function getHighestPriorityGroup(roleCache) {
  let highestGroup = null;
  let highestPriority = -1;
  
  for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
    // Check if user has any of the Discord roles for this group
    const hasRole = groupData.discordRoles.some(roleId => roleCache.has(roleId));
    
    if (hasRole && groupData.priority > highestPriority) {
      highestGroup = groupName;
      highestPriority = groupData.priority;
    }
  }
  
  return highestGroup;
}

/**
 * Get the Squad group for a specific Discord role ID
 * @param {string} roleId Discord role ID
 * @returns {string|null} Group name, or null if role is not tracked
 */
function getGroupByRoleId(roleId) {
  for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
    if (groupData.discordRoles.includes(roleId)) {
      return groupName;
    }
  }
  return null;
}

/**
 * Check if a role ID is tracked for whitelist purposes
 * @param {string} roleId Discord role ID
 * @returns {boolean} True if role grants whitelist access
 */
function isTrackedRole(roleId) {
  return getAllTrackedRoles().includes(roleId);
}

module.exports = {
  SQUAD_GROUPS,
  getAllTrackedRoles,
  getHighestPriorityGroup,
  getGroupByRoleId,
  isTrackedRole
};