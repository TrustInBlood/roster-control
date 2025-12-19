const { logger } = require('../utils/logger');

class WhitelistCacheService {
  constructor(config = {}) {
    this.logger = logger.child({ service: 'WhitelistCacheService' });
    this.cache = new Map();
    this.lastUpdate = new Map();
    this.combinedCache = null;
    this.combinedCacheTime = 0;
    this.cleanupIntervalId = null;
    this.refreshIntervalId = null;

    this.cacheRefreshSeconds = config.cacheRefreshSeconds || 30;
    this.logCacheHits = config.logCacheHits || false;

    this.logger.info('WhitelistCacheService initialized', {
      cacheRefreshSeconds: this.cacheRefreshSeconds,
      logCacheHits: this.logCacheHits
    });

    this.setupCleanupInterval();
  }

  setupCleanupInterval() {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredCache();
    }, this.cacheRefreshSeconds * 1000);

    this.refreshIntervalId = setInterval(() => {
      this.refreshCombinedCache();
    }, (this.cacheRefreshSeconds - 5) * 1000);
  }

  shutdown() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    this.cache.clear();
    this.lastUpdate.clear();
    this.combinedCache = null;
    this.logger.info('WhitelistCacheService shutdown complete');
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

  isCacheValid(type) {
    const now = Date.now();
    const lastUpdateTime = this.lastUpdate.get(type) || 0;
    return this.cache.has(type) && (now - lastUpdateTime) < (this.cacheRefreshSeconds * 1000);
  }

  isCombinedCacheValid() {
    const now = Date.now();
    return this.combinedCache !== null && (now - this.combinedCacheTime) < (this.cacheRefreshSeconds * 1000);
  }

  getCached(type) {
    if (this.isCacheValid(type)) {
      if (this.logCacheHits) {
        const now = Date.now();
        const age = now - this.lastUpdate.get(type);
        this.logger.debug('Serving cached whitelist', { type, age });
      }
      return this.cache.get(type);
    }
    return null;
  }

  getCombinedCached() {
    if (this.isCombinedCacheValid()) {
      if (this.logCacheHits) {
        const now = Date.now();
        const age = now - this.combinedCacheTime;
        this.logger.debug('Serving cached combined whitelist', { age });
      }
      return this.combinedCache;
    }
    return null;
  }

  setCached(type, content) {
    this.cache.set(type, content);
    this.lastUpdate.set(type, Date.now());

    this.logger.debug('Cache updated', {
      type,
      contentLength: content.length
    });
  }

  setCombinedCached(content) {
    this.combinedCache = content;
    this.combinedCacheTime = Date.now();

    this.logger.debug('Combined cache updated', {
      contentLength: content.length
    });
  }

  invalidateCache(type = null) {
    if (type) {
      this.cache.delete(type);
      this.lastUpdate.delete(type);
      this.logger.info('Cache invalidated', { type });
    } else {
      const types = Array.from(this.cache.keys());
      this.cache.clear();
      this.lastUpdate.clear();
      this.combinedCache = null;
      this.combinedCacheTime = 0;
      this.logger.info('All caches invalidated', { types });
    }
  }

  async refreshCombinedCache() {
    try {
      this.combinedCache = null;
      this.combinedCacheTime = 0;
      this.logger.debug('Background cache refresh initiated');
    } catch (error) {
      this.logger.error('Background cache refresh failed', { error: error.message });
    }
  }

  getCacheStats() {
    const now = Date.now();
    const stats = {
      individual: {},
      combined: null
    };

    for (const [type, timestamp] of this.lastUpdate.entries()) {
      stats.individual[type] = {
        age: now - timestamp,
        valid: this.isCacheValid(type),
        size: this.cache.get(type)?.length || 0
      };
    }

    if (this.combinedCache) {
      stats.combined = {
        age: now - this.combinedCacheTime,
        valid: this.isCombinedCacheValid(),
        size: this.combinedCache.length
      };
    }

    return stats;
  }
}

module.exports = WhitelistCacheService;