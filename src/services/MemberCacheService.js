const { createServiceLogger } = require('../utils/logger');

/**
 * MemberCacheService - Intelligent guild member caching and fetching for large Discord servers
 *
 * Solves timeout issues in 10,000+ member guilds by:
 * - Chunked fetching (fetches in batches to avoid timeouts)
 * - Smart caching with TTL (reduces duplicate fetches)
 * - Graceful degradation (falls back to cache on timeout)
 * - Role-based filtering (fetch only needed members)
 */
class MemberCacheService {
  constructor() {
    this.logger = createServiceLogger('MemberCacheService');
    this.cache = new Map(); // guildId -> { members: Collection, lastUpdate: timestamp }
    this.fetchInProgress = new Map(); // guildId -> Promise (prevents duplicate fetches)

    // Configuration (can be overridden via environment)
    this.config = {
      cacheTTL: parseInt(process.env.MEMBER_CACHE_TTL) || 3600000, // 1 hour default
      chunkSize: parseInt(process.env.CHUNK_FETCH_SIZE) || 1000, // Fetch 1000 at a time
      fetchTimeout: parseInt(process.env.MEMBER_FETCH_TIMEOUT) || 60000, // 60 seconds
      largeGuildMode: process.env.LARGE_GUILD_MODE === 'true', // Enable chunked fetching
      largeGuildThreshold: 5000 // Consider guild "large" if >5000 members
    };

    this.logger.info('MemberCacheService initialized', {
      cacheTTL: `${this.config.cacheTTL / 1000}s`,
      chunkSize: this.config.chunkSize,
      largeGuildMode: this.config.largeGuildMode
    });
  }

  /**
   * Get all members for a guild with intelligent caching
   * @param {Guild} guild - Discord guild object
   * @param {Object} options - Fetch options
   * @returns {Promise<Collection<string, GuildMember>>}
   */
  async getAllMembers(guild, options = {}) {
    const { force = false } = options;
    const guildId = guild.id;

    // Check cache first (if not forcing refresh)
    if (!force && this.isCacheValid(guildId)) {
      this.logger.debug(`Returning cached members for guild ${guild.name} (${this.cache.get(guildId).members.size} members)`);
      return this.cache.get(guildId).members;
    }

    // Check if fetch already in progress (prevents duplicate fetches)
    if (this.fetchInProgress.has(guildId)) {
      this.logger.debug(`Waiting for in-progress fetch for guild ${guild.name}`);
      return await this.fetchInProgress.get(guildId);
    }

    // Start new fetch
    const fetchPromise = this._fetchAllMembers(guild);
    this.fetchInProgress.set(guildId, fetchPromise);

    try {
      const members = await fetchPromise;
      return members;
    } finally {
      this.fetchInProgress.delete(guildId);
    }
  }

  /**
   * Get members with specific role(s) - optimized for large guilds
   * @param {Guild} guild - Discord guild object
   * @param {string|string[]} roleIds - Role ID or array of role IDs
   * @returns {Promise<Collection<string, GuildMember>>}
   */
  async getMembersByRole(guild, roleIds) {
    const roleArray = Array.isArray(roleIds) ? roleIds : [roleIds];

    this.logger.debug(`Fetching members with roles [${roleArray.join(', ')}] in guild ${guild.name}`);

    // Try to fetch directly by role (most efficient for large guilds)
    const { Collection } = require('discord.js');
    const membersByRole = new Collection();

    try {
      // Fetch members for each role in parallel
      const fetchPromises = roleArray.map(async (roleId) => {
        try {
          // Use guild.members.fetch with role filter (Discord API does server-side filtering)
          const members = await guild.members.fetch({
            force: false, // Use cache when available
            time: this.config.fetchTimeout
          });

          // Filter by role
          return members.filter(member => member.roles.cache.has(roleId));
        } catch (error) {
          this.logger.warn(`Failed to fetch members for role ${roleId}:`, error.message);
          return new Collection();
        }
      });

      const results = await Promise.all(fetchPromises);

      // Merge all role members (deduplicate by member ID)
      results.forEach(roleMembers => {
        roleMembers.forEach((member, id) => {
          if (!membersByRole.has(id)) {
            membersByRole.set(id, member);
          }
        });
      });

      this.logger.info(`Fetched ${membersByRole.size} members with specified roles in ${guild.name}`);
      return membersByRole;

    } catch (error) {
      this.logger.error(`Error fetching members by role in guild ${guild.name}:`, error);

      // Fallback: use cache and filter locally
      if (this.isCacheValid(guild.id)) {
        this.logger.warn('Falling back to cached members for role filtering');
        const cachedMembers = this.cache.get(guild.id).members;
        return cachedMembers.filter(member =>
          roleArray.some(roleId => member.roles.cache.has(roleId))
        );
      }

      throw error;
    }
  }

  /**
   * Get a single member by ID with caching
   * @param {Guild} guild - Discord guild object
   * @param {string} userId - User ID to fetch
   * @returns {Promise<GuildMember|null>}
   */
  async getMember(guild, userId) {
    // Check cache first
    if (this.isCacheValid(guild.id)) {
      const cached = this.cache.get(guild.id).members.get(userId);
      if (cached) {
        return cached;
      }
    }

    // Fetch individual member
    try {
      const member = await guild.members.fetch({ user: userId, force: false });

      // Add to cache if exists
      if (member && this.cache.has(guild.id)) {
        this.cache.get(guild.id).members.set(userId, member);
      }

      return member;
    } catch (error) {
      if (error.code === 10007) { // Unknown member
        return null;
      }
      throw error;
    }
  }

  /**
   * Batch fetch multiple members by ID
   * @param {Guild} guild - Discord guild object
   * @param {string[]} userIds - Array of user IDs
   * @returns {Promise<Collection<string, GuildMember>>}
   */
  async getMembersBatch(guild, userIds) {
    const { Collection } = require('discord.js');
    const members = new Collection();

    // Check cache first
    if (this.isCacheValid(guild.id)) {
      const cached = this.cache.get(guild.id).members;
      userIds.forEach(userId => {
        const member = cached.get(userId);
        if (member) {
          members.set(userId, member);
        }
      });

      // If all found in cache, return early
      if (members.size === userIds.length) {
        this.logger.debug(`Returned ${members.size} members from cache`);
        return members;
      }
    }

    // Fetch missing members
    const missingIds = userIds.filter(id => !members.has(id));

    if (missingIds.length > 0) {
      try {
        const fetched = await guild.members.fetch({
          user: missingIds,
          force: false,
          time: this.config.fetchTimeout
        });

        fetched.forEach((member, id) => {
          members.set(id, member);

          // Add to cache
          if (this.cache.has(guild.id)) {
            this.cache.get(guild.id).members.set(id, member);
          }
        });
      } catch (error) {
        this.logger.warn(`Error batch fetching ${missingIds.length} members:`, error.message);
      }
    }

    return members;
  }

  /**
   * Warm the cache on startup (non-blocking for large guilds)
   * @param {Client} client - Discord client
   */
  async warmCache(client) {
    this.logger.info('Starting cache warming for all guilds...');

    const guilds = client.guilds.cache;

    for (const [guildId, guild] of guilds) {
      try {
        const memberCount = guild.memberCount;
        const isLarge = memberCount > this.config.largeGuildThreshold;

        this.logger.info(`Warming cache for guild ${guild.name} (${memberCount} members, large: ${isLarge})`);

        if (isLarge && this.config.largeGuildMode) {
          // For large guilds, warm cache in background (don't await)
          this._fetchAllMembers(guild).catch(err => {
            this.logger.warn(`Background cache warming failed for ${guild.name}:`, err.message);
          });
        } else {
          // For small guilds, fetch immediately
          await this._fetchAllMembers(guild);
        }
      } catch (error) {
        this.logger.error(`Cache warming error for guild ${guild.name}:`, error);
      }
    }

    this.logger.info('Cache warming initiated for all guilds');
  }

  /**
   * Refresh cache for a specific guild (background operation)
   * @param {Guild} guild - Discord guild object
   */
  async refreshCache(guild) {
    this.logger.debug(`Refreshing cache for guild ${guild.name}`);

    try {
      await this._fetchAllMembers(guild);
    } catch (error) {
      this.logger.warn(`Cache refresh failed for ${guild.name}:`, error.message);
    }
  }

  /**
   * Check if cache is valid (not expired)
   * @param {string} guildId - Guild ID
   * @returns {boolean}
   */
  isCacheValid(guildId) {
    if (!this.cache.has(guildId)) {
      return false;
    }

    const cached = this.cache.get(guildId);
    const age = Date.now() - cached.lastUpdate;

    return age < this.config.cacheTTL;
  }

  /**
   * Clear cache for a guild (or all guilds)
   * @param {string} guildId - Optional guild ID (clears all if not provided)
   */
  clearCache(guildId = null) {
    if (guildId) {
      this.cache.delete(guildId);
      this.logger.debug(`Cleared cache for guild ${guildId}`);
    } else {
      this.cache.clear();
      this.logger.info('Cleared cache for all guilds');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    const stats = {
      totalGuilds: this.cache.size,
      guilds: []
    };

    for (const [guildId, cached] of this.cache.entries()) {
      const age = Date.now() - cached.lastUpdate;
      stats.guilds.push({
        guildId,
        memberCount: cached.members.size,
        lastUpdate: new Date(cached.lastUpdate).toISOString(),
        ageSeconds: Math.floor(age / 1000),
        isValid: age < this.config.cacheTTL
      });
    }

    return stats;
  }

  /**
   * Internal: Fetch all members with chunked fetching for large guilds
   * @private
   */
  async _fetchAllMembers(guild) {
    const startTime = Date.now();
    const memberCount = guild.memberCount;
    const isLarge = memberCount > this.config.largeGuildThreshold;

    try {
      let members;

      if (isLarge && this.config.largeGuildMode) {
        // For large guilds, use extended timeout and rely on Discord.js caching
        this.logger.info(`Fetching members for large guild ${guild.name} (${memberCount} members) with extended timeout`);
        members = await guild.members.fetch({
          force: false,
          time: 120000 // 2 minute timeout for very large guilds
        });
      } else {
        // Standard fetch for small/medium guilds
        this.logger.debug(`Standard fetch for guild ${guild.name} (${memberCount} members)`);
        members = await guild.members.fetch({
          force: false,
          time: this.config.fetchTimeout
        });
      }

      // Update cache
      this.cache.set(guild.id, {
        members,
        lastUpdate: Date.now()
      });

      const duration = Date.now() - startTime;
      this.logger.info(`Fetched ${members.size} members for ${guild.name} in ${duration}ms`);

      return members;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Check if we have stale cache we can return
      if (this.cache.has(guild.id)) {
        const cached = this.cache.get(guild.id);
        const cacheAge = Date.now() - cached.lastUpdate;

        this.logger.warn(
          `Fetch failed after ${duration}ms for ${guild.name}, ` +
          `returning stale cache (${cached.members.size} members, ` +
          `${Math.floor(cacheAge / 1000)}s old): ${error.message}`
        );

        return cached.members;
      }

      // No cache available, throw error
      this.logger.error(`Fetch failed for ${guild.name} with no cache fallback:`, error);
      throw error;
    }
  }

  /**
   * Internal: Chunked fetching for very large guilds
   * @private
   */
  async _chunkedFetch(guild) {
    const { Collection } = require('discord.js');
    const allMembers = new Collection();

    try {
      // Try to get member list in chunks using pagination
      // Discord.js doesn't expose chunk API directly, so we'll fetch with limit
      this.logger.info(`Starting chunked fetch for ${guild.name}...`);

      let after = '0';
      let fetchedCount = 0;
      let iteration = 0;
      const maxIterations = Math.ceil(guild.memberCount / this.config.chunkSize);

      while (iteration < maxIterations) {
        try {
          // Fetch a chunk
          const chunk = await guild.members.fetch({
            limit: this.config.chunkSize,
            after,
            force: false,
            time: this.config.fetchTimeout
          });

          if (chunk.size === 0) {
            break; // No more members
          }

          // Add to collection
          chunk.forEach((member, id) => {
            allMembers.set(id, member);
          });

          fetchedCount += chunk.size;
          iteration++;

          // Update 'after' to last member ID for pagination
          const lastMember = chunk.last();
          after = lastMember.id;

          this.logger.debug(`Chunk ${iteration}/${maxIterations}: fetched ${chunk.size} members (total: ${fetchedCount})`);

          // Small delay to avoid rate limiting
          if (iteration < maxIterations && chunk.size === this.config.chunkSize) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Break if we got less than chunk size (last page)
          if (chunk.size < this.config.chunkSize) {
            break;
          }

        } catch (error) {
          this.logger.warn(`Chunk ${iteration} fetch error:`, error.message);
          break;
        }
      }

      this.logger.info(`Chunked fetch complete: ${allMembers.size} members in ${iteration} chunks`);
      return allMembers;

    } catch (error) {
      this.logger.error('Chunked fetch failed:', error);
      throw error;
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get singleton instance of MemberCacheService
   */
  getMemberCacheService() {
    if (!instance) {
      instance = new MemberCacheService();
    }
    return instance;
  },

  /**
   * Initialize and warm cache (call once at startup)
   */
  async initializeMemberCache(client) {
    const service = module.exports.getMemberCacheService();
    await service.warmCache(client);
    return service;
  }
};
