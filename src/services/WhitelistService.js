const { Whitelist, PlayerDiscordLink } = require('../database/models');
const { Op } = require('sequelize');

const { squadGroups, getSquadGroupService } = require('../utils/environment');
const WhitelistAuthorityService = require('./WhitelistAuthorityService');

class WhitelistService {
  constructor(logger, config, discordClient = null) {
    this.logger = logger;
    this.config = config;
    this.discordClient = discordClient; // Optional Discord client
    this.cache = new Map();
    this.lastUpdate = new Map();

    this.cacheRefreshSeconds = config.cache.refreshSeconds;
    this.preferEosID = config.identifiers.preferEosID;
    this.logConnections = config.logging.logConnections;
    this.logCacheHits = config.logging.logCacheHits;

    this.logger.info('WhitelistService initialized (unified database mode)', {
      cacheRefreshSeconds: this.cacheRefreshSeconds,
      preferEosID: this.preferEosID,
      logConnections: this.logConnections
    });

    this.setupCleanupInterval();

    // Pre-warm the cache
    setTimeout(() => {
      this.prewarmCache();
    }, 5000);
  }

  setupCleanupInterval() {
    // Clean up expired cache entries
    setInterval(() => {
      this.cleanupExpiredCache();
    }, this.cacheRefreshSeconds * 1000);
  }

  async prewarmCache() {
    this.logger.info('Pre-warming whitelist cache...');
    try {
      // Pre-warm all cache types
      await Promise.all([
        this.getCachedWhitelist('staff'),
        this.getCachedWhitelist('whitelist')
      ]);
      this.logger.info('Cache pre-warming completed successfully');
    } catch (error) {
      this.logger.error('Failed to pre-warm cache', { error: error.message });
    }
  }

  cleanupExpiredCache() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, timestamp] of this.lastUpdate.entries()) {
      if (now - timestamp > (this.cacheRefreshSeconds * 1000)) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.lastUpdate.delete(key);
    });

    if (expiredKeys.length > 0) {
      this.logger.debug('Cleaned up expired cache entries', { count: expiredKeys.length });
    }
  }

  async getCachedWhitelist(type) {
    const now = Date.now();
    const lastUpdateTime = this.lastUpdate.get(type) || 0;
    
    if (this.cache.has(type) && (now - lastUpdateTime) < (this.cacheRefreshSeconds * 1000)) {
      if (this.logCacheHits) {
        this.logger.debug('Serving cached whitelist', { type, age: now - lastUpdateTime });
      }
      return this.cache.get(type);
    }

    this.logger.info('Refreshing whitelist cache', { type });
    
    try {
      let entries = await Whitelist.getActiveEntries(type);
      
      // For staff whitelist, filter by confidence score
      if (type === 'staff') {
        entries = await this.filterByConfidence(entries, 1.0);
        this.logger.info('Filtered staff whitelist by confidence', { 
          originalCount: (await Whitelist.getActiveEntries(type)).length,
          filteredCount: entries.length,
          requiredConfidence: 1.0
        });
      }

      // All entries are now managed through the unified database system
      
      const formattedContent = await this.formatWhitelistContent(entries);
      
      this.cache.set(type, formattedContent);
      this.lastUpdate.set(type, now);
      
      this.logger.info('Whitelist cache updated', { 
        type, 
        entryCount: entries.length,
        contentLength: formattedContent.length
      });
      
      return formattedContent;
    } catch (error) {
      this.logger.error('Failed to refresh whitelist cache', { type, error: error.message });
      
      if (this.cache.has(type)) {
        this.logger.warn('Serving stale cache due to error', { type });
        return this.cache.get(type);
      }
      
      throw error;
    }
  }

  async filterByConfidence(entries, minConfidence) {
    // Filter whitelist entries using optimized bulk database queries
    const filteredEntries = [];

    if (entries.length === 0) {
      return filteredEntries;
    }

    // Extract all Steam IDs for bulk query
    const steamIds = entries.map(entry => entry.steamid64);
    const entryBySteamId = new Map();
    entries.forEach(entry => entryBySteamId.set(entry.steamid64, entry));

    try {
      // Single bulk query to get all relevant links
      const links = await PlayerDiscordLink.findAll({
        where: {
          steamid64: steamIds,
          is_primary: true,
          confidence_score: {
            [Op.gte]: minConfidence
          }
        },
        order: [['confidence_score', 'DESC']]
      });

      // Create lookup map for quick access
      const linkBySteamId = new Map();
      links.forEach(link => {
        if (!linkBySteamId.has(link.steamid64) ||
            link.confidence_score > linkBySteamId.get(link.steamid64).confidence_score) {
          linkBySteamId.set(link.steamid64, link);
        }
      });

      // Filter entries based on link confidence
      for (const entry of entries) {
        const link = linkBySteamId.get(entry.steamid64);

        if (link && link.confidence_score >= minConfidence) {
          filteredEntries.push(entry);
          this.logger.debug('Including staff whitelist entry (optimized bulk validation)', {
            steamid64: entry.steamid64,
            confidence: link.confidence_score,
            linkSource: link.link_source,
            validationMethod: 'bulk_optimized'
          });
        } else {
          this.logger.debug('Excluding staff whitelist entry due to insufficient confidence', {
            steamid64: entry.steamid64,
            hasLink: !!link,
            actualConfidence: link?.confidence_score || 0,
            requiredConfidence: minConfidence,
            linkSource: link?.link_source || 'none'
          });
        }
      }

      this.logger.info('Bulk confidence filtering completed', {
        totalEntries: entries.length,
        linkedEntries: links.length,
        filteredEntries: filteredEntries.length,
        excludedEntries: entries.length - filteredEntries.length,
        requiredConfidence: minConfidence,
        queryOptimization: 'single_bulk_query'
      });

    } catch (error) {
      this.logger.error('Failed to perform bulk confidence filtering, falling back to individual queries', {
        error: error.message,
        entryCount: entries.length
      });

      // Fallback to individual queries only if bulk query fails
      for (const entry of entries) {
        try {
          const link = await PlayerDiscordLink.findOne({
            where: {
              steamid64: entry.steamid64,
              is_primary: true
            },
            order: [['confidence_score', 'DESC']]
          });

          if (link && link.confidence_score >= minConfidence) {
            filteredEntries.push(entry);
            this.logger.debug('Including staff whitelist entry (fallback validation)', {
              steamid64: entry.steamid64,
              confidence: link.confidence_score,
              linkSource: link.link_source
            });
          }
        } catch (linkError) {
          this.logger.warn('Failed to check link for entry', {
            steamid64: entry.steamid64,
            error: linkError.message
          });
        }
      }
    }

    return filteredEntries;
  }


  async formatWhitelistContent(entries) {
    // Return default message if no entries
    if (!entries || entries.length === 0) {
      return '/////////////////////////////////\n////// No entries \n/////////////////////////////////\n';
    }

    const groupMap = new Map();
    const grouplessEntries = [];

    entries.forEach(entry => {
      if (entry.group) {
        const groupName = entry.group.group_name;
        if (!groupMap.has(groupName)) {
          groupMap.set(groupName, {
            permissions: entry.group.permissions,
            entries: []
          });
        }
        groupMap.get(groupName).entries.push(entry);
      } else {
        grouplessEntries.push(entry);
      }
    });

    let content = '';

    for (const [groupName, groupData] of groupMap.entries()) {
      content += `Group=${groupName}:${groupData.permissions || ''}\n`;
      
      groupData.entries.forEach(entry => {
        const identifier = this.getIdentifier(entry);
        const username = entry.username || '';
        const discordUsername = entry.discord_username || '';

        let line = `Admin=${identifier}:${groupName}`;

        // Format: // in-game-name discord-display-name
        if (username || discordUsername) {
          line += ' //';

          // If we have in-game name, show it first
          if (username) {
            line += ` ${username}`;
          }

          // If we have Discord name and it's different from in-game name (or no in-game name), show it
          if (discordUsername && (!username || discordUsername !== username)) {
            line += ` ${discordUsername}`;
          }
        }

        content += line + '\n';
      });
    }

    if (grouplessEntries.length > 0) {
      this.logger.warn('Skipping groupless/invalid whitelist entries', {
        count: grouplessEntries.length,
        steamIds: grouplessEntries.map(e => e.steamid64)
      });

      // Note: We intentionally skip groupless entries as they likely represent:
      // - Old/inactive entries that should be cleaned up
      // - Invalid imports with missing group data
      // - Entries that were revoked but not properly marked as revoked
      //
      // These entries won't appear in the whitelist output, effectively deactivating them
    }

    return content;
  }

  getIdentifier(entry) {
    if (this.preferEosID && entry.eosID) {
      return entry.eosID;
    }
    return entry.steamid64;
  }

  async getCombinedWhitelist() {
    // Check if we have a valid cached version
    const now = Date.now();
    if (this.combinedCache && (now - this.combinedCacheTime) < (this.cacheRefreshSeconds * 1000)) {
      if (this.logCacheHits) {
        this.logger.debug('Serving cached combined whitelist', { age: now - this.combinedCacheTime });
      }
      return this.combinedCache;
    }

    // Generate new combined whitelist
    this.logger.info('Refreshing combined whitelist cache');

    try {
      // Get all whitelist data sources (without group definitions to avoid duplication)
      // Only use role-based cache if it's been initialized, otherwise skip role-based sections for performance
      const useRoleBasedCache = this.roleBasedCache && this.roleBasedCache.isReady();

      let staffContent, membersContent;

      if (useRoleBasedCache) {
        // Use fast role-based cache
        [staffContent, membersContent] = await Promise.all([
          this.roleBasedCache.getCachedStaffWithoutGroups(),
          this.roleBasedCache.getCachedMembersWithoutGroups()
        ]);
      } else {
        // Role-based cache not available - fetch role-based entries from database
        this.logger.debug('Role-based cache not ready, fetching role-based entries from database');
        [staffContent, membersContent] = await Promise.all([
          this.getRoleBasedStaffContent(),
          this.getRoleBasedMembersContent()
        ]);
      }

      // Always get database whitelist (this is already fast due to our optimizations)
      const generalContent = await this.getCachedWhitelist('whitelist');

      // Build comprehensive whitelist with group definitions first
      let combinedContent = '';

      // Header comment
      combinedContent += '//////////////////////////////////\n';
      combinedContent += '// Comprehensive Squad Whitelist\n';
      combinedContent += '// Generated: ' + new Date().toISOString() + '\n';
      combinedContent += '//////////////////////////////////\n\n';

      // Group definitions (order by Discord role position: highest to lowest)
      combinedContent += '// Group Definitions\n';

      // Try to get group definitions from database service
      try {
        const squadGroupService = getSquadGroupService();
        const roleConfigs = await squadGroupService.getAllRoleConfigs();

        // Enrich with Discord role position if client available
        let enrichedConfigs = roleConfigs;
        if (this.discordClient) {
          const guildId = process.env.DISCORD_GUILD_ID;
          const guild = await this.discordClient.guilds.fetch(guildId).catch(() => null);
          if (guild) {
            const guildRoles = await guild.roles.fetch();
            enrichedConfigs = roleConfigs.map(config => {
              const discordRole = guildRoles.get(config.roleId);
              return {
                ...config,
                discordPosition: discordRole?.position ?? 0
              };
            });
            // Sort by Discord position (highest first)
            enrichedConfigs.sort((a, b) => b.discordPosition - a.discordPosition);
          }
        }

        // Generate group definitions from database
        for (const config of enrichedConfigs) {
          const permString = Array.isArray(config.permissions) ? config.permissions.join(',') : config.permissions;
          combinedContent += `Group=${config.groupName}:${permString}\n`;
        }
      } catch (error) {
        // Fallback to config file if database unavailable
        this.logger.warn('Failed to load groups from database, using config fallback', { error: error.message });
        const sortedGroups = Object.entries(squadGroups.SQUAD_GROUPS)
          .sort(([, a], [, b]) => b.priority - a.priority);

        for (const [groupName, groupData] of sortedGroups) {
          combinedContent += `Group=${groupName}:${groupData.permissions}\n`;
        }
      }
      combinedContent += '\n';

      // Staff Section (role-based and database staff)
      combinedContent += '// Staff (Role-based + Database)\n';
      if (staffContent && !staffContent.includes('No entries')) {
        combinedContent += staffContent;
        if (!staffContent.endsWith('\n')) combinedContent += '\n';
      }
      combinedContent += '\n';

      // Role-based Whitelist Section (non-staff Discord roles with whitelist access)
      combinedContent += '// Role-based Whitelist\n';
      if (membersContent && !membersContent.includes('No entries')) {
        combinedContent += membersContent;
        if (!membersContent.endsWith('\n')) combinedContent += '\n';
      }
      combinedContent += '\n';

      // General Whitelist Section (database-only whitelist entries)
      combinedContent += '// General Whitelist (Database)\n';
      if (generalContent && !generalContent.includes('No entries')) {
        combinedContent += generalContent;
        if (!generalContent.endsWith('\n')) combinedContent += '\n';
      }

      // Footer
      combinedContent += '\n//////////////////////////////////\n';
      combinedContent += '// End of Whitelist\n';
      combinedContent += '//////////////////////////////////\n';

      // Update cache
      this.combinedCache = combinedContent;
      this.combinedCacheTime = now;

      this.logger.info('Combined whitelist cache updated', {
        contentLength: combinedContent.length
      });

      return combinedContent;

    } catch (error) {
      this.logger.error('Failed to generate combined whitelist', { error: error.message });

      // If we have stale cache, use it
      if (this.combinedCache) {
        this.logger.warn('Serving stale combined cache due to error');
        return this.combinedCache;
      }

      return '//////////////////////////////////\n// Error generating whitelist\n//////////////////////////////////\n';
    }
  }

  setupRoutes(app) {

    // Combined comprehensive whitelist endpoint - all groups and users in one file
    app.get('/combined', async (req, res) => {
      try {
        const content = await this.getCombinedWhitelist();
        
        res.set({
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `public, max-age=${this.cacheRefreshSeconds}`,
          'X-Content-Length': content.length
        });
        res.send(content);
        
        if (this.logConnections) {
          this.logger.info('Served combined whitelist', { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve combined whitelist', { 
          error: error.message,
          ip: req.ip 
        });
        res.status(500).send('Internal Server Error');
      }
    });




    this.logger.info('Whitelist routes configured', {
      paths: { combined: '/combined' }
    });
  }

  async invalidateCache(type = null) {
    if (type) {
      this.cache.delete(type);
      this.lastUpdate.delete(type);
      this.logger.info('Cache invalidated', { type });
    } else {
      this.cache.clear();
      this.lastUpdate.clear();
      this.logger.info('All cache invalidated');
    }

    // Always invalidate combined cache when any component changes
    this.combinedCache = null;
    this.combinedCacheTime = 0;
    this.logger.debug('Combined cache invalidated');
  }

  /**
   * Get role-based staff entries from database (fallback when cache not available)
   */
  async getRoleBasedStaffContent() {
    try {
      const staffEntries = await Whitelist.findAll({
        where: {
          source: 'role',
          type: 'staff',
          approved: true,
          revoked: false
        },
        order: [['role_name', 'ASC'], ['steamid64', 'ASC']]
      });

      return this.formatRoleBasedEntries(staffEntries);
    } catch (error) {
      this.logger.error('Failed to fetch role-based staff content', { error: error.message });
      return '';
    }
  }

  /**
   * Get role-based member entries from database (fallback when cache not available)
   */
  async getRoleBasedMembersContent() {
    try {
      const memberEntries = await Whitelist.findAll({
        where: {
          source: 'role',
          type: 'whitelist',
          approved: true,
          revoked: false
        },
        order: [['steamid64', 'ASC']]
      });

      return this.formatRoleBasedEntries(memberEntries);
    } catch (error) {
      this.logger.error('Failed to fetch role-based members content', { error: error.message });
      return '';
    }
  }

  /**
   * Format role-based entries for whitelist output
   */
  formatRoleBasedEntries(entries) {
    if (!entries || entries.length === 0) {
      return '';
    }

    // Deduplicate entries by Steam ID - keep only the most recent entry for each user
    const entriesBySteamId = new Map();
    for (const entry of entries) {
      // Skip entries without Steam IDs (unlinked users)
      if (!entry.steamid64 || entry.steamid64 === '00000000000000000') {
        continue;
      }

      const existing = entriesBySteamId.get(entry.steamid64);
      if (!existing || new Date(entry.createdAt) > new Date(existing.createdAt)) {
        entriesBySteamId.set(entry.steamid64, entry);
      }
    }

    // Log if duplicates were found
    const duplicateCount = entries.filter(e => e.steamid64 && e.steamid64 !== '00000000000000000').length - entriesBySteamId.size;
    if (duplicateCount > 0) {
      this.logger.warn('Deduplicated role-based entries during whitelist generation', {
        originalCount: entries.length,
        deduplicatedCount: entriesBySteamId.size,
        duplicatesRemoved: duplicateCount
      });
    }

    let content = '';
    for (const entry of entriesBySteamId.values()) {
      const groupName = entry.role_name || 'Member';
      const comment = entry.username ? ` // ${entry.username}` : '';
      content += `Admin=${entry.steamid64}:${groupName}${comment}\n`;
    }

    return content;
  }
}

module.exports = WhitelistService;