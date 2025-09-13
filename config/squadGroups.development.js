/**
 * Development Environment Squad Groups Configuration
 * For Testing Zone Discord server
 */

const { DISCORD_ROLES } = require('./discordRoles.development');

const SQUAD_GROUPS = {
  // Head Admin - Full server control (for testing)
  HeadAdmin: {
    priority: 300,
    permissions: 'ban,cameraman,canseeadminchat,changemap,chat,forceteamchange,immune,kick,reserve,startvote,teamchange,balance,manageserver,config',
    discordRoles: [
      DISCORD_ROLES.EXECUTIVE_ADMIN,  // "Admin" role for now
      // DISCORD_ROLES.HEAD_ADMIN     // Add when you create "Test Head Admin" role
    ].filter(Boolean)
  },
  
  // Squad Admin - Core admin permissions (for testing)
  SquadAdmin: {
    priority: 200,
    permissions: 'balance,ban,cameraman,canseeadminchat,changemap,chat,forceteamchange,immune,kick,startvote,reserve,teamchange',
    discordRoles: [
      // DISCORD_ROLES.SENIOR_ADMIN,  // Add when you create test roles
      // DISCORD_ROLES.OG_ADMIN,
      // DISCORD_ROLES.SQUAD_ADMIN
    ].filter(Boolean)
  },
  
  // Moderator - Basic admin permissions (for testing)
  Moderator: {
    priority: 100,
    permissions: 'canseeadminchat,chat,reserve',
    discordRoles: [
      // DISCORD_ROLES.MODERATOR      // Add when you create "Test Moderator" role
    ].filter(Boolean)
  },
  
  // Member - Whitelist only, no Squad permissions
  Member: {
    priority: 0,
    permissions: 'reserve',
    discordRoles: [
      DISCORD_ROLES.MEMBER,           // "Test Member" role
    ].filter(Boolean)
  }
};

// Same helper functions as production
function getAllTrackedRoles() {
  const roles = [];
  Object.values(SQUAD_GROUPS).forEach(group => {
    roles.push(...group.discordRoles);
  });
  return [...new Set(roles)];
}

function getHighestPriorityGroup(roleCache) {
  let highestGroup = null;
  let highestPriority = -1;
  
  for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
    const hasRole = groupData.discordRoles.some(roleId => roleCache.has(roleId));
    
    if (hasRole && groupData.priority > highestPriority) {
      highestGroup = groupName;
      highestPriority = groupData.priority;
    }
  }
  
  return highestGroup;
}

function getGroupByRoleId(roleId) {
  for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
    if (groupData.discordRoles.includes(roleId)) {
      return groupName;
    }
  }
  return null;
}

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