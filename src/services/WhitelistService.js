const { Whitelist } = require('../database/models');
const WhitelistCacheService = require('./WhitelistCacheService');
const WhitelistFilterService = require('./WhitelistFilterService');
const WhitelistFormatterService = require('./WhitelistFormatterService');
const { logger } = require('../utils/logger');

class WhitelistService {
  constructor(logger_deprecated, config, roleBasedCache = null, discordClient = null) {
    this.logger = logger.child({ service: 'WhitelistService' });
    this.config = config;
    this.roleBasedCache = roleBasedCache;
    this.discordClient = discordClient;

    this.cacheService = new WhitelistCacheService({
      cacheRefreshSeconds: config.cache.refreshSeconds,
      logCacheHits: config.logging.logCacheHits
    });

    this.filterService = new WhitelistFilterService();

    this.formatterService = new WhitelistFormatterService({
      preferEosID: config.identifiers.preferEosID,
      includeComments: config.formatting?.includeComments !== false
    });

    this.logConnections = config.logging.logConnections;

    this.logger.info('WhitelistService initialized', {
      cacheRefreshSeconds: config.cache.refreshSeconds,
      preferEosID: config.identifiers.preferEosID,
      logConnections: this.logConnections
    });

    this.prewarmCache();
  }

  async prewarmCache() {
    setTimeout(async () => {
      this.logger.info('Pre-warming whitelist cache...');
      try {
        await this.getCombinedWhitelist();
        this.logger.info('Cache pre-warming completed successfully');
      } catch (error) {
        this.logger.error('Failed to pre-warm cache', { error: error.message });
      }
    }, 10000);
  }

  async getCachedWhitelist(type) {
    const cached = this.cacheService.getCached(type);
    if (cached !== null) {
      return cached;
    }

    this.logger.info('Refreshing whitelist cache', { type });

    try {
      let entries = await Whitelist.getActiveEntries(type);

      if (type === 'staff') {
        entries = await this.filterService.filterByConfidence(entries, 1.0);
        this.logger.info('Filtered staff whitelist by confidence', {
          originalCount: (await Whitelist.getActiveEntries(type)).length,
          filteredCount: entries.length,
          requiredConfidence: 1.0
        });
      }

      entries = await this.filterService.filterRoleBasedUsers(entries, this.discordClient);

      const formattedContent = await this.formatterService.formatWhitelistContent(entries);

      this.cacheService.setCached(type, formattedContent);

      this.logger.info('Whitelist cache updated', {
        type,
        entryCount: entries.length,
        contentLength: formattedContent.length
      });

      return formattedContent;

    } catch (error) {
      this.logger.error('Failed to refresh whitelist cache', { type, error: error.message });

      const staleCache = this.cacheService.getCached(type);
      if (staleCache !== null) {
        this.logger.warn('Serving stale cache due to error', { type });
        return staleCache;
      }

      throw error;
    }
  }

  async getCombinedWhitelist() {
    const cached = this.cacheService.getCombinedCached();
    if (cached !== null) {
      return cached;
    }

    this.logger.info('Generating combined whitelist...');

    try {
      const types = ['admin', 'staff', 'member'];
      const whitelistContents = {};

      for (const type of types) {
        try {
          whitelistContents[type] = await this.getCachedWhitelist(type);
        } catch (error) {
          this.logger.error(`Failed to get ${type} whitelist for combined list`, {
            type,
            error: error.message
          });
          whitelistContents[type] = '';
        }
      }

      const combinedContent = await this.formatterService.formatCombinedContent(whitelistContents);

      this.cacheService.setCombinedCached(combinedContent);

      this.logger.info('Combined whitelist generated', {
        totalLength: combinedContent.length,
        sections: Object.keys(whitelistContents).length
      });

      return combinedContent;

    } catch (error) {
      this.logger.error('Failed to generate combined whitelist', { error: error.message });

      const staleCache = this.cacheService.getCombinedCached();
      if (staleCache !== null) {
        this.logger.warn('Serving stale combined cache due to error');
        return staleCache;
      }

      throw error;
    }
  }

  async invalidateCache(type = null) {
    this.cacheService.invalidateCache(type);

    if (this.roleBasedCache && typeof this.roleBasedCache.invalidateCache === 'function') {
      try {
        await this.roleBasedCache.invalidateCache();
        this.logger.info('Role-based cache invalidated');
      } catch (error) {
        this.logger.error('Failed to invalidate role-based cache', { error: error.message });
      }
    }
  }

  getCacheStats() {
    return this.cacheService.getCacheStats();
  }

  validateConfiguration() {
    const issues = [];

    if (!this.config.cache?.refreshSeconds || this.config.cache.refreshSeconds < 10) {
      issues.push('Cache refresh seconds should be at least 10 seconds');
    }

    if (!this.config.identifiers) {
      issues.push('Missing identifiers configuration');
    }

    if (!this.config.logging) {
      issues.push('Missing logging configuration');
    }

    return issues;
  }

  getServiceStatus() {
    return {
      cacheService: {
        stats: this.cacheService.getCacheStats(),
        refreshSeconds: this.cacheService.cacheRefreshSeconds
      },
      filterService: {
        available: !!this.filterService
      },
      formatterService: {
        available: !!this.formatterService,
        preferEosID: this.formatterService.preferEosID
      },
      discordClient: {
        available: !!this.discordClient
      },
      roleBasedCache: {
        available: !!this.roleBasedCache
      }
    };
  }

  setupRoutes(app) {
    const router = require('express').Router();

    router.get('/admin', async (req, res) => {
      try {
        const content = await this.getCachedWhitelist('admin');
        res.type('text/plain').send(content);

        if (this.logConnections) {
          this.logger.info('Admin whitelist served', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve admin whitelist', { error: error.message });
        res.status(500).send('Internal Server Error');
      }
    });

    router.get('/staff', async (req, res) => {
      try {
        const content = await this.getCachedWhitelist('staff');
        res.type('text/plain').send(content);

        if (this.logConnections) {
          this.logger.info('Staff whitelist served', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve staff whitelist', { error: error.message });
        res.status(500).send('Internal Server Error');
      }
    });

    router.get('/member', async (req, res) => {
      try {
        const content = await this.getCachedWhitelist('member');
        res.type('text/plain').send(content);

        if (this.logConnections) {
          this.logger.info('Member whitelist served', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve member whitelist', { error: error.message });
        res.status(500).send('Internal Server Error');
      }
    });

    router.get('/combined', async (req, res) => {
      try {
        const content = await this.getCombinedWhitelist();
        res.type('text/plain').send(content);

        if (this.logConnections) {
          this.logger.info('Combined whitelist served', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve combined whitelist', { error: error.message });
        res.status(500).send('Internal Server Error');
      }
    });

    router.get('/status', async (req, res) => {
      try {
        const status = this.getServiceStatus();
        res.json(status);
      } catch (error) {
        this.logger.error('Failed to get service status', { error: error.message });
        res.status(500).json({ error: 'Failed to get service status' });
      }
    });

    app.use('/whitelist', router);

    this.logger.info('Whitelist HTTP routes registered', {
      endpoints: ['/admin', '/staff', '/member', '/combined', '/status']
    });
  }
}

module.exports = WhitelistService;