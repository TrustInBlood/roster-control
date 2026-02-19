const { ConnectionConfig, ConnectionConfigAudit } = require('../database/models/ConnectionConfig');
const { SquadJSServer } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('ConnectionConfigService');

const CACHE_TTL = 60 * 1000; // 1 minute

class ConnectionConfigService {
  constructor() {
    this.configCache = null;
    this.configCacheTimestamp = 0;
    this.serversCache = null;
    this.serversCacheTimestamp = 0;
    this.changeCallbacks = new Set();
  }

  // ============================================
  // Cache Management
  // ============================================

  getConfigFromCache() {
    if (this.configCache && Date.now() - this.configCacheTimestamp < CACHE_TTL) {
      return this.configCache;
    }
    return null;
  }

  setConfigInCache(data) {
    this.configCache = data;
    this.configCacheTimestamp = Date.now();
  }

  invalidateConfigCache() {
    this.configCache = null;
    this.configCacheTimestamp = 0;
  }

  getServersFromCache() {
    if (this.serversCache && Date.now() - this.serversCacheTimestamp < CACHE_TTL) {
      return this.serversCache;
    }
    return null;
  }

  setServersInCache(data) {
    this.serversCache = data;
    this.serversCacheTimestamp = Date.now();
  }

  invalidateServersCache() {
    this.serversCache = null;
    this.serversCacheTimestamp = 0;
  }

  // ============================================
  // Config Key-Value Access
  // ============================================

  async getConfig() {
    const cached = this.getConfigFromCache();
    if (cached) return cached;

    const config = await ConnectionConfig.getConfig();
    this.setConfigInCache(config);
    return config;
  }

  async getValue(key) {
    const config = await this.getConfig();
    return config[key]?.value;
  }

  async setValue(key, value, changedBy, changedByName = null) {
    await ConnectionConfig.setValue(key, value, changedBy, changedByName);
    this.invalidateConfigCache();
    logger.info(`Config updated: ${key}`, { key, newValue: value, changedBy });
  }

  async updateMultiple(updates, changedBy, changedByName = null) {
    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      try {
        await this.setValue(key, value, changedBy, changedByName);
        results.push({ key, success: true });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }
    return results;
  }

  // ============================================
  // Server CRUD
  // ============================================

  async getServers() {
    const cached = this.getServersFromCache();
    if (cached) return cached;

    const servers = await SquadJSServer.getAll();
    this.setServersInCache(servers);
    return servers;
  }

  async getEnabledServers() {
    const servers = await this.getServers();
    return servers.filter(s => s.enabled && s.token);
  }

  async getServer(serverKey) {
    return SquadJSServer.getByKey(serverKey);
  }

  async createServer(data, changedBy, changedByName = null) {
    // Auto-assign displayOrder to end of list if not provided
    if (data.displayOrder === undefined || data.displayOrder === null) {
      const maxOrder = await SquadJSServer.max('displayOrder') || 0;
      data.displayOrder = maxOrder + 1;
    }

    const server = await SquadJSServer.create({
      ...data,
      createdBy: changedBy,
      createdByName: changedByName,
      updatedBy: changedBy,
      updatedByName: changedByName
    });

    await ConnectionConfigAudit.create({
      entityType: 'server',
      entityId: server.serverKey,
      action: 'create',
      oldValue: null,
      newValue: JSON.stringify(this.sanitizeServerForAudit(server)),
      changedBy,
      changedByName
    });

    this.invalidateServersCache();
    this.notifyServersChanged();
    logger.info('Server created', { serverKey: server.serverKey, name: server.name, changedBy });
    return server;
  }

  async updateServer(serverKey, data, changedBy, changedByName = null) {
    const server = await SquadJSServer.getByKey(serverKey);
    if (!server) {
      throw new Error(`Server not found: ${serverKey}`);
    }

    const oldData = this.sanitizeServerForAudit(server);

    await server.update({
      ...data,
      updatedBy: changedBy,
      updatedByName: changedByName
    });

    await ConnectionConfigAudit.create({
      entityType: 'server',
      entityId: serverKey,
      action: 'update',
      oldValue: JSON.stringify(oldData),
      newValue: JSON.stringify(this.sanitizeServerForAudit(server)),
      changedBy,
      changedByName
    });

    this.invalidateServersCache();
    this.notifyServersChanged();
    logger.info('Server updated', { serverKey, changedBy });
    return server;
  }

  async deleteServer(serverKey, changedBy, changedByName = null) {
    const server = await SquadJSServer.getByKey(serverKey);
    if (!server) {
      throw new Error(`Server not found: ${serverKey}`);
    }

    const oldData = this.sanitizeServerForAudit(server);

    await server.destroy();

    await ConnectionConfigAudit.create({
      entityType: 'server',
      entityId: serverKey,
      action: 'delete',
      oldValue: JSON.stringify(oldData),
      newValue: null,
      changedBy,
      changedByName
    });

    this.invalidateServersCache();
    this.notifyServersChanged();
    logger.info('Server deleted', { serverKey, changedBy });
  }

  // ============================================
  // Change Notification (for live reload)
  // ============================================

  onServersChanged(callback) {
    this.changeCallbacks.add(callback);
  }

  offServersChanged(callback) {
    this.changeCallbacks.delete(callback);
  }

  notifyServersChanged() {
    for (const callback of this.changeCallbacks) {
      try {
        callback();
      } catch (error) {
        logger.error('Error in servers changed callback', { error: error.message });
      }
    }
  }

  // ============================================
  // Compatibility Bridge
  // ============================================

  async getWhitelistConfigCompat() {
    const config = await this.getConfig();
    const servers = await this.getEnabledServers();

    return {
      http: {
        port: process.env.HTTP_PORT || 3001,
        host: '0.0.0.0'
      },
      paths: {},
      cache: {
        refreshSeconds: config.cache_refresh_seconds?.value ?? 60,
        cleanupIntervalMs: config.cache_cleanup_interval?.value ?? 300000
      },
      identifiers: {
        preferEosID: config.prefer_eos_id?.value ?? false
      },
      verification: {
        codeLength: config.verification_code_length?.value ?? 6,
        expirationMinutes: config.verification_expiration_minutes?.value ?? 5,
        cleanupIntervalMs: config.verification_cleanup_interval?.value ?? 300000
      },
      squadjs: {
        servers: servers.map(s => ({
          id: s.serverKey,
          name: s.name,
          host: s.host,
          port: s.port,
          gamePort: s.gamePort,
          token: s.token,
          enabled: s.enabled,
          seedThreshold: s.seedThreshold
        })),
        connection: {
          reconnectionAttempts: config.reconnection_attempts?.value ?? 10,
          reconnectionDelay: config.reconnection_delay?.value ?? 5000,
          timeout: config.connection_timeout?.value ?? 10000
        }
      },
      logging: {
        level: config.log_level?.value ?? 'info',
        logConnections: config.log_connections?.value ?? true,
        logCacheHits: config.log_cache_hits?.value ?? false,
        logSquadJSEvents: config.log_squadjs_events?.value ?? true
      }
    };
  }

  // ============================================
  // API Formatting
  // ============================================

  async getConfigForApi() {
    const config = await this.getConfig();
    const categories = ConnectionConfig.getCategories();

    const grouped = {};
    for (const [categoryId, categoryMeta] of Object.entries(categories)) {
      grouped[categoryId] = {
        ...categoryMeta,
        items: {}
      };
    }

    for (const [key, item] of Object.entries(config)) {
      const category = item.category;
      if (grouped[category]) {
        grouped[category].items[key] = item;
      }
    }

    return {
      config,
      categories: grouped
    };
  }

  getCategories() {
    return ConnectionConfig.getCategories();
  }

  getDefaultConfig() {
    return ConnectionConfig.getDefaultConfig();
  }

  // ============================================
  // Audit
  // ============================================

  async getAuditLog(limit = 50) {
    return ConnectionConfig.getAuditLog(limit);
  }

  // ============================================
  // Helpers
  // ============================================

  sanitizeServerForAudit(server) {
    return {
      serverKey: server.serverKey,
      name: server.name,
      host: server.host,
      port: server.port,
      gamePort: server.gamePort,
      enabled: server.enabled,
      seedThreshold: server.seedThreshold,
      displayOrder: server.displayOrder
      // Token intentionally omitted from audit logs
    };
  }
}

// Singleton
let instance = null;

function getConnectionConfigService() {
  if (!instance) {
    instance = new ConnectionConfigService();
  }
  return instance;
}

module.exports = { ConnectionConfigService, getConnectionConfigService };
