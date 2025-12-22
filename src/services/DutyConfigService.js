const { DutyTrackingConfig, DEFAULT_CONFIG } = require('../database/models/DutyTrackingConfig');
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('DutyConfigService');

// Cache for config values (to reduce database reads)
const configCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache

class DutyConfigService {
  constructor() {
    this.initialized = false;
  }

  // ============================================
  // Cache Management
  // ============================================

  getCacheKey(guildId) {
    return `config_${guildId}`;
  }

  getFromCache(guildId) {
    const key = this.getCacheKey(guildId);
    const cached = configCache.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    return null;
  }

  setInCache(guildId, data) {
    const key = this.getCacheKey(guildId);
    configCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidateCache(guildId) {
    const key = this.getCacheKey(guildId);
    configCache.delete(key);
  }

  // ============================================
  // Configuration Access
  // ============================================

  /**
   * Get all configuration for a guild (with defaults filled in)
   */
  async getConfig(guildId) {
    // Check cache first
    const cached = this.getFromCache(guildId);
    if (cached) {
      return cached;
    }

    const config = await DutyTrackingConfig.getGuildConfig(guildId);
    this.setInCache(guildId, config);
    return config;
  }

  /**
   * Get a single config value
   */
  async getValue(guildId, key) {
    const config = await this.getConfig(guildId);
    return config[key]?.value;
  }

  /**
   * Check if a feature is enabled
   */
  async isEnabled(guildId, key) {
    const config = await this.getConfig(guildId);
    const item = config[key];

    if (!item) return false;

    // Check if the feature itself is enabled
    if (!item.enabled) return false;

    // For tracking features, also check the parent toggle
    if (key.startsWith('track_')) {
      return item.value === true;
    }

    return true;
  }

  /**
   * Get point value for an activity
   */
  async getPointValue(guildId, activityType) {
    const key = `points_${activityType}`;
    const value = await this.getValue(guildId, key);
    return value ?? 0;
  }

  /**
   * Get auto-timeout settings
   */
  async getTimeoutSettings(guildId) {
    const config = await this.getConfig(guildId);

    return {
      enabled: config.auto_timeout_enabled?.value ?? true,
      hours: config.auto_timeout_hours?.value ?? 8,
      warningMinutes: config.auto_timeout_warning_minutes?.value ?? 30,
      extendOnActivity: config.auto_timeout_extend_on_activity?.value ?? true
    };
  }

  /**
   * Get coverage settings
   */
  async getCoverageSettings(guildId) {
    const config = await this.getConfig(guildId);

    return {
      lowThreshold: config.coverage_low_threshold?.value ?? 2,
      snapshotIntervalMinutes: config.coverage_snapshot_interval_minutes?.value ?? 60
    };
  }

  /**
   * Get tracked voice channels
   */
  async getTrackedVoiceChannels(guildId) {
    const value = await this.getValue(guildId, 'tracked_voice_channels');
    return Array.isArray(value) ? value : [];
  }

  /**
   * Get ticket channel pattern
   */
  async getTicketChannelPattern(guildId) {
    return await this.getValue(guildId, 'ticket_channel_pattern') || 'ticket-*';
  }

  /**
   * Check if a channel matches the ticket pattern
   */
  async isTicketChannel(guildId, channelName) {
    const pattern = await this.getTicketChannelPattern(guildId);

    // Convert pattern to regex (support wildcards)
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\\\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(channelName);
  }

  /**
   * Check if a voice channel should be tracked
   */
  async isTrackedVoiceChannel(guildId, channelId) {
    const trackedChannels = await this.getTrackedVoiceChannels(guildId);

    // If no channels configured, track all voice channels
    if (trackedChannels.length === 0) {
      return true;
    }

    return trackedChannels.includes(channelId);
  }

  // ============================================
  // Configuration Updates
  // ============================================

  /**
   * Update a config value
   */
  async setValue(guildId, key, value, changedBy, changedByName = null) {
    try {
      await DutyTrackingConfig.setValue(guildId, key, value, changedBy, changedByName);
      this.invalidateCache(guildId);

      logger.info(`Config updated: ${key}`, {
        guildId,
        key,
        newValue: value,
        changedBy
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to update config: ${key}`, {
        guildId,
        key,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle a feature on/off
   */
  async setEnabled(guildId, key, enabled, changedBy, changedByName = null) {
    try {
      await DutyTrackingConfig.setEnabled(guildId, key, enabled, changedBy, changedByName);
      this.invalidateCache(guildId);

      logger.info(`Config ${enabled ? 'enabled' : 'disabled'}: ${key}`, {
        guildId,
        key,
        enabled,
        changedBy
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to toggle config: ${key}`, {
        guildId,
        key,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk update multiple config values
   */
  async updateMultiple(guildId, updates, changedBy, changedByName = null) {
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const result = await this.setValue(guildId, key, value, changedBy, changedByName);
      results.push({ key, ...result });
    }

    return results;
  }

  // ============================================
  // Audit & Transparency
  // ============================================

  /**
   * Get config change audit log
   */
  async getAuditLog(guildId, limit = 50) {
    return DutyTrackingConfig.getAuditLog(guildId, limit);
  }

  /**
   * Get config categories for UI organization
   */
  getCategories() {
    return DutyTrackingConfig.getCategories();
  }

  /**
   * Get default config metadata (for displaying in UI)
   */
  getDefaultConfig() {
    return DEFAULT_CONFIG;
  }

  /**
   * Get config formatted for API response
   */
  async getConfigForApi(guildId) {
    const config = await this.getConfig(guildId);
    const categories = this.getCategories();

    // Group config by category
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

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize default config for a guild (if not exists)
   */
  async initializeGuildConfig(guildId) {
    const created = await DutyTrackingConfig.initializeGuildConfig(guildId);

    if (created.length > 0) {
      logger.info(`Initialized ${created.length} default config values for guild`, {
        guildId,
        keys: created
      });
    }

    return created;
  }
}

// Singleton instance
let instance = null;

function getDutyConfigService() {
  if (!instance) {
    instance = new DutyConfigService();
  }
  return instance;
}

module.exports = { DutyConfigService, getDutyConfigService };
