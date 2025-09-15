const { PlayerDiscordLink } = require('../database/models');

const { squadGroups } = require('../utils/environment');
const { SQUAD_GROUPS, getHighestPriorityGroup } = squadGroups;

class RoleBasedWhitelistCache {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    
    // Cache structure for role-based entries
    this.roleCache = {
      staff: {
        HeadAdmin: new Map(), // steamId -> {username, discord_username, discordId}
        SquadAdmin: new Map(),
        Moderator: new Map()
      },
      members: new Map(), // steamId -> {username, discord_username, discordId}
      unlinkedStaff: {
        HeadAdmin: new Map(), // discordId -> {username, discord_username}
        SquadAdmin: new Map(),
        Moderator: new Map()
      }
    };
    
    // Cache content strings
    this.cachedContent = {
      staff: '',
      members: '',
      lastUpdate: {
        staff: 0,
        members: 0
      }
    };
    
    this.cacheRefreshSeconds = config.cache.refreshSeconds || 60;
    this.isInitialized = false; // Track if cache has been populated from Discord

    this.logger.info('RoleBasedWhitelistCache initialized');
  }
  
  /**
   * Add a user to the appropriate cache based on their group
   * @param {string} steamId Steam ID of the user
   * @param {string} groupName Squad group name
   * @param {Object} userData User data (username, discord_username, discordId)
   */
  addUser(steamId, groupName, userData = {}) {
    if (!steamId || !groupName) return;
    
    // Remove from all caches first
    this.removeUser(steamId);
    
    if (groupName === 'Member') {
      this.roleCache.members.set(steamId, userData);
      this.logger.debug('Added member to cache', { steamId, ...userData });
    } else if (this.roleCache.staff[groupName]) {
      this.roleCache.staff[groupName].set(steamId, userData);
      this.logger.debug('Added staff to cache', { steamId, group: groupName, ...userData });
    }
    
    // Invalidate cached content
    this.invalidateCache(groupName === 'Member' ? 'members' : 'staff');
  }
  
  /**
   * Remove a user from all caches
   * @param {string} steamId Steam ID to remove
   */
  removeUser(steamId) {
    // Remove from members
    if (this.roleCache.members.delete(steamId)) {
      this.invalidateCache('members');
      this.logger.debug('Removed member from cache', { steamId });
    }
    
    // Remove from all staff groups
    for (const [groupName, cache] of Object.entries(this.roleCache.staff)) {
      if (cache.delete(steamId)) {
        this.invalidateCache('staff');
        this.logger.debug('Removed staff from cache', { steamId, group: groupName });
      }
    }
  }
  
  /**
   * Add unlinked staff member to cache
   * @param {string} discordId Discord user ID
   * @param {string} groupName Squad group name
   * @param {Object} userData User data (username, discord_username)
   */
  addUnlinkedStaff(discordId, groupName, userData = {}) {
    if (!discordId || !groupName || groupName === 'Member') return;
    
    // Remove from all unlinked staff caches first
    this.removeUnlinkedStaff(discordId);
    
    if (this.roleCache.unlinkedStaff[groupName]) {
      this.roleCache.unlinkedStaff[groupName].set(discordId, userData);
      this.logger.debug('Added unlinked staff to cache', { discordId, group: groupName, ...userData });
    }
  }
  
  /**
   * Remove unlinked staff from all caches
   * @param {string} discordId Discord user ID to remove
   */
  removeUnlinkedStaff(discordId) {
    for (const [groupName, cache] of Object.entries(this.roleCache.unlinkedStaff)) {
      if (cache.delete(discordId)) {
        this.logger.debug('Removed unlinked staff from cache', { discordId, group: groupName });
      }
    }
  }
  
  /**
   * Update user's role based on Discord role changes
   * @param {string} discordId Discord user ID
   * @param {string|null} newGroup New group name, or null to remove
   * @param {Object} memberData Discord member data for unlinked users
   */
  async updateUserRole(discordId, newGroup, memberData = null) {
    try {
      // Get Steam ID from Discord ID
      const link = await PlayerDiscordLink.findOne({
        where: { discord_user_id: discordId, is_primary: true }
      });
      
      if (link) {
        // User has linked account - handle normally
        const steamId = link.steamid64;
        
        // Remove from unlinked staff cache since they're now linked
        this.removeUnlinkedStaff(discordId);
        
        if (newGroup) {
          // Add/update user in appropriate cache
          const userData = {
            username: link.steam_username || '',
            discord_username: link.discord_username || '',
            discordId: discordId
          };
          this.addUser(steamId, newGroup, userData);
        } else {
          // Remove user from all caches
          this.removeUser(steamId);
        }
        
        this.logger.info('Updated role-based whitelist for linked user', { 
          discordId, 
          steamId, 
          newGroup: newGroup || 'none' 
        });
        
      } else {
        // User has no linked account - track as unlinked staff if they have staff roles
        if (newGroup && newGroup !== 'Member' && memberData) {
          const userData = {
            username: memberData.displayName || memberData.user?.username || '',
            discord_username: memberData.user?.username || ''
          };
          this.addUnlinkedStaff(discordId, newGroup, userData);
          
          this.logger.info('Added unlinked staff to cache', { 
            discordId, 
            newGroup,
            username: userData.username
          });
        } else {
          // Remove from unlinked staff cache
          this.removeUnlinkedStaff(discordId);
          
          this.logger.debug('Removed from unlinked staff cache', { 
            discordId, 
            newGroup: newGroup || 'none' 
          });
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to update user role', { 
        discordId, 
        error: error.message 
      });
    }
  }
  
  /**
   * Get cached staff content
   * @returns {string} Formatted staff content
   */
  async getCachedStaff() {
    const now = Date.now();
    
    // Check if cache is still valid
    if (this.cachedContent.staff && 
        (now - this.cachedContent.lastUpdate.staff) < (this.cacheRefreshSeconds * 1000)) {
      return this.cachedContent.staff;
    }
    
    // Regenerate cache
    this.cachedContent.staff = this.formatStaffContent();
    this.cachedContent.lastUpdate.staff = now;
    
    return this.cachedContent.staff;
  }
  
  /**
   * Get cached members content
   * @returns {string} Formatted members content
   */
  async getCachedMembers() {
    const now = Date.now();
    
    // Check if cache is still valid
    if (this.cachedContent.members && 
        (now - this.cachedContent.lastUpdate.members) < (this.cacheRefreshSeconds * 1000)) {
      return this.cachedContent.members;
    }
    
    // Regenerate cache
    this.cachedContent.members = this.formatMembersContent();
    this.cachedContent.lastUpdate.members = now;
    
    return this.cachedContent.members;
  }

  /**
   * Get cached staff content without group definitions (for combined endpoint)
   * @returns {string} Formatted staff content without group definitions
   */
  async getCachedStaffWithoutGroups() {
    return this.formatStaffContentWithoutGroups();
  }

  /**
   * Get cached members content without group definitions (for combined endpoint)
   * @returns {string} Formatted members content without group definitions
   */
  async getCachedMembersWithoutGroups() {
    return this.formatMembersContentWithoutGroups();
  }
  
  /**
   * Format staff entries in Squad server format
   * @returns {string} Formatted content
   */
  formatStaffContent() {
    let hasEntries = false;
    
    // Check if we have any staff entries
    for (const cache of Object.values(this.roleCache.staff)) {
      if (cache.size > 0) {
        hasEntries = true;
        break;
      }
    }
    
    if (!hasEntries) {
      return '/////////////////////////////////\n////// No entries \n/////////////////////////////////\n';
    }
    
    let content = '';
    
    // Add group definitions
    for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
      if (groupName === 'Member') continue; // Skip member group
      if (!groupData.permissions) continue; // Skip groups without permissions
      
      content += `Group=${groupName}:${groupData.permissions}\n`;
    }
    
    // Add admin entries for each group
    for (const [groupName, cache] of Object.entries(this.roleCache.staff)) {
      for (const [steamId, userData] of cache) {
        let line = `Admin=${steamId}:${groupName}`;
        
        // Add comment with username info
        // Format: // in-game-name discord-display-name
        if (userData.username || userData.discord_username) {
          line += ' //';

          // If we have in-game name, show it first
          if (userData.username) {
            line += ` ${userData.username}`;
          }

          // If we have Discord name and it's different from in-game name (or no in-game name), show it
          if (userData.discord_username && (!userData.username || userData.discord_username !== userData.username)) {
            line += ` ${userData.discord_username}`;
          }
        }
        
        content += line + '\n';
      }
    }
    
    return content;
  }

  /**
   * Format staff entries without group definitions (for combined endpoint)
   * @returns {string} Formatted content without group definitions
   */
  formatStaffContentWithoutGroups() {
    let hasEntries = false;
    
    // Check if we have any staff entries
    for (const cache of Object.values(this.roleCache.staff)) {
      if (cache.size > 0) {
        hasEntries = true;
        break;
      }
    }
    
    if (!hasEntries) {
      return '';
    }
    
    let content = '';
    
    // Add admin entries for each group (no group definitions)
    for (const [groupName, cache] of Object.entries(this.roleCache.staff)) {
      for (const [steamId, userData] of cache) {
        let line = `Admin=${steamId}:${groupName}`;
        
        // Add comment with username info
        // Format: // in-game-name discord-display-name
        if (userData.username || userData.discord_username) {
          line += ' //';

          // If we have in-game name, show it first
          if (userData.username) {
            line += ` ${userData.username}`;
          }

          // If we have Discord name and it's different from in-game name (or no in-game name), show it
          if (userData.discord_username && (!userData.username || userData.discord_username !== userData.username)) {
            line += ` ${userData.discord_username}`;
          }
        }
        
        content += line + '\n';
      }
    }
    
    return content;
  }
  
  /**
   * Format member entries in Squad whitelist format
   * @returns {string} Formatted content
   */
  formatMembersContent() {
    if (this.roleCache.members.size === 0) {
      return '/////////////////////////////////\n////// No entries \n/////////////////////////////////\n';
    }
    
    let content = '';
    
    // Add group definition first
    content += 'Group=Member:reserve\n';
    
    for (const [steamId, userData] of this.roleCache.members) {
      // Use proper Squad whitelist format: Admin=steamid:groupname
      let line = `Admin=${steamId}:Member`;
      
      // Add comment with username info
      // Format: // in-game-name discord-display-name
      if (userData.username || userData.discord_username) {
        line += ' //';

        // If we have in-game name, show it first
        if (userData.username) {
          line += ` ${userData.username}`;
        }

        // If we have Discord name and it's different from in-game name (or no in-game name), show it
        if (userData.discord_username && (!userData.username || userData.discord_username !== userData.username)) {
          line += ` ${userData.discord_username}`;
        }
      }
      
      content += line + '\n';
    }
    
    return content;
  }

  /**
   * Format member entries without group definitions (for combined endpoint)
   * @returns {string} Formatted content without group definitions
   */
  formatMembersContentWithoutGroups() {
    if (this.roleCache.members.size === 0) {
      return '';
    }
    
    let content = '';
    
    // Add member entries without group definition
    for (const [steamId, userData] of this.roleCache.members) {
      let line = `Admin=${steamId}:Member`;
      
      // Add comment with username info
      // Format: // in-game-name discord-display-name
      if (userData.username || userData.discord_username) {
        line += ' //';

        // If we have in-game name, show it first
        if (userData.username) {
          line += ` ${userData.username}`;
        }

        // If we have Discord name and it's different from in-game name (or no in-game name), show it
        if (userData.discord_username && (!userData.username || userData.discord_username !== userData.username)) {
          line += ` ${userData.discord_username}`;
        }
      }
      
      content += line + '\n';
    }
    
    return content;
  }
  
  /**
   * Check if a user has role-based whitelist access
   * @param {string} steamId Steam ID to check
   * @returns {Object|null} { group: string, isStaff: boolean } or null
   */
  getUserRoleStatus(steamId) {
    // Check staff groups (highest priority first)
    for (const [groupName, cache] of Object.entries(this.roleCache.staff)) {
      if (cache.has(steamId)) {
        return { group: groupName, isStaff: true };
      }
    }
    
    // Check members
    if (this.roleCache.members.has(steamId)) {
      return { group: 'Member', isStaff: false };
    }
    
    return null;
  }
  
  /**
   * Invalidate cached content
   * @param {string} type 'staff' or 'members'
   */
  invalidateCache(type) {
    if (type === 'staff' || type === 'all') {
      this.cachedContent.staff = '';
      this.cachedContent.lastUpdate.staff = 0;
    }
    if (type === 'members' || type === 'all') {
      this.cachedContent.members = '';
      this.cachedContent.lastUpdate.members = 0;
    }
  }
  
  /**
   * Get total count of cached users
   * @returns {Object} { staff: number, members: number, unlinkedStaff: number, total: number }
   */
  getTotalCount() {
    let staffCount = 0;
    for (const cache of Object.values(this.roleCache.staff)) {
      staffCount += cache.size;
    }
    
    let unlinkedStaffCount = 0;
    for (const cache of Object.values(this.roleCache.unlinkedStaff)) {
      unlinkedStaffCount += cache.size;
    }
    
    const memberCount = this.roleCache.members.size;
    
    return {
      staff: staffCount,
      members: memberCount,
      unlinkedStaff: unlinkedStaffCount,
      total: staffCount + memberCount
    };
  }
  
  /**
   * Get unlinked staff members for manual linking
   * @returns {Array} Array of unlinked staff members with their roles
   */
  getUnlinkedStaff() {
    const unlinkedStaff = [];
    
    for (const [groupName, cache] of Object.entries(this.roleCache.unlinkedStaff)) {
      for (const [discordId, userData] of cache) {
        unlinkedStaff.push({
          discordId,
          group: groupName,
          username: userData.username,
          discord_username: userData.discord_username
        });
      }
    }
    
    return unlinkedStaff.sort((a, b) => {
      // Sort by group priority (HeadAdmin first) then by username
      const groupPriority = { HeadAdmin: 3, SquadAdmin: 2, Moderator: 1 };
      const aPriority = groupPriority[a.group] || 0;
      const bPriority = groupPriority[b.group] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      return a.username.localeCompare(b.username);
    });
  }
  
  /**
   * Initialize cache from Discord guild members
   * @param {Guild} guild Discord guild object
   */
  async initializeFromGuild(guild) {
    this.logger.info('Initializing role-based whitelist cache from guild');

    try {
      // Clear all existing caches to prevent stale data
      this.roleCache.staff.HeadAdmin.clear();
      this.roleCache.staff.SquadAdmin.clear();
      this.roleCache.staff.Moderator.clear();
      this.roleCache.members.clear();
      this.roleCache.unlinkedStaff.HeadAdmin.clear();
      this.roleCache.unlinkedStaff.SquadAdmin.clear();
      this.roleCache.unlinkedStaff.Moderator.clear();

      // Invalidate cached content
      this.invalidateCache('all');

      const members = await guild.members.fetch();
      let processedCount = 0;

      for (const [memberId, member] of members) {
        // Check if member has any tracked roles
        const highestGroup = getHighestPriorityGroup(member.roles.cache);

        if (highestGroup) {
          // Get Steam ID link
          const link = await PlayerDiscordLink.findOne({
            where: { discord_user_id: memberId, is_primary: true }
          });

          if (link) {
            const userData = {
              username: link.steam_username || '',
              discord_username: member.user.username || '',
              discordId: memberId
            };

            this.addUser(link.steamid64, highestGroup, userData);
            processedCount++;
          } else if (highestGroup !== 'Member') {
            // Track unlinked staff members
            const userData = {
              username: member.displayName || member.user.username || '',
              discord_username: member.user.username || ''
            };

            this.addUnlinkedStaff(memberId, highestGroup, userData);
            processedCount++;
          }
        }
      }

      const counts = this.getTotalCount();
      this.isInitialized = true; // Mark cache as ready
      this.logger.info('Role-based whitelist cache initialized', {
        processed: processedCount,
        ...counts
      });

    } catch (error) {
      this.logger.error('Failed to initialize role-based cache', {
        error: error.message
      });
    }
  }

  /**
   * Check if cache has been initialized from Discord guild
   * @returns {boolean} True if cache is ready
   */
  isReady() {
    return this.isInitialized;
  }
}

module.exports = RoleBasedWhitelistCache;