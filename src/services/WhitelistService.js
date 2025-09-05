const express = require('express');
const { Group, Whitelist, PlayerDiscordLink } = require('../database/models');

class WhitelistService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.cache = new Map();
    this.lastUpdate = new Map();
    
    this.cacheRefreshSeconds = config.cache.refreshSeconds;
    this.preferEosID = config.identifiers.preferEosID;
    this.logConnections = config.logging.logConnections;
    this.logCacheHits = config.logging.logCacheHits;
    
    this.logger.info('WhitelistService initialized', {
      cacheRefreshSeconds: this.cacheRefreshSeconds,
      preferEosID: this.preferEosID,
      logConnections: this.logConnections
    });

    this.setupCleanupInterval();
  }

  setupCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, this.cacheRefreshSeconds * 1000);
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
    // Filter whitelist entries by checking PlayerDiscordLink confidence scores
    const filteredEntries = [];
    
    for (const entry of entries) {
      // Check if this Steam ID has a linked Discord account with sufficient confidence
      const links = await PlayerDiscordLink.findAll({
        where: { 
          steamid64: entry.steamid64,
          is_primary: true
        },
        order: [['confidence_score', 'DESC']]
      });
      
      // If there are any links with sufficient confidence, include this entry
      if (links.length > 0 && links[0].confidence_score >= minConfidence) {
        filteredEntries.push(entry);
        this.logger.debug('Including staff whitelist entry', {
          steamid64: entry.steamid64,
          confidence: links[0].confidence_score,
          linkSource: links[0].link_source
        });
      } else if (links.length > 0) {
        this.logger.warn('Excluding staff whitelist entry due to insufficient confidence', {
          steamid64: entry.steamid64,
          highestConfidence: links[0].confidence_score,
          requiredConfidence: minConfidence,
          linkSource: links[0].link_source
        });
      } else {
        // No Discord link at all - exclude from staff whitelist
        this.logger.debug('Excluding staff whitelist entry - no Discord link', {
          steamid64: entry.steamid64
        });
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
        const reason = entry.reason || '';

        let line = `Admin=${identifier}:${groupName}`;
        
        if (username || discordUsername) {
          line += ` // ${username}`;
          if (discordUsername) {
            line += ` ${discordUsername}`;
          }
        }
        
        content += line + '\n';
      });
    }

    if (grouplessEntries.length > 0) {
      grouplessEntries.forEach(entry => {
        const identifier = this.getIdentifier(entry);
        const username = entry.username || '';
        const discordUsername = entry.discord_username || '';
        const reason = entry.reason || '';

        let line = `Admin=${identifier}:`;
        
        if (username || discordUsername) {
          line += ` // ${username}`;
          if (discordUsername) {
            line += ` ${discordUsername}`;
          }
        }
        
        content += line + '\n';
      });
    }

    return content;
  }

  getIdentifier(entry) {
    if (this.preferEosID && entry.eosID) {
      return entry.eosID;
    }
    return entry.steamid64;
  }

  setupRoutes(app) {
    const whitelistPaths = this.config.paths;

    app.get(whitelistPaths.staff, async (req, res) => {
      try {
        const content = await this.getCachedWhitelist('staff');
        res.set({
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `public, max-age=${this.cacheRefreshSeconds}`,
          'X-Content-Length': content.length
        });
        res.send(content);
        
        if (this.logConnections) {
          this.logger.info('Served staff whitelist', { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve staff whitelist', { 
          error: error.message,
          ip: req.ip 
        });
        res.status(500).send('Internal Server Error');
      }
    });

    app.get(whitelistPaths.whitelist, async (req, res) => {
      try {
        const content = await this.getCachedWhitelist('whitelist');
        res.set({
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `public, max-age=${this.cacheRefreshSeconds}`,
          'X-Content-Length': content.length
        });
        res.send(content);
        
        if (this.logConnections) {
          this.logger.info('Served general whitelist', { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            contentLength: content.length
          });
        }
      } catch (error) {
        this.logger.error('Failed to serve general whitelist', { 
          error: error.message,
          ip: req.ip 
        });
        res.status(500).send('Internal Server Error');
      }
    });

    this.logger.info('Whitelist routes configured', { paths: whitelistPaths });
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
  }
}

module.exports = WhitelistService;