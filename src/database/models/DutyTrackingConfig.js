const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

// Default configuration values - visible and transparent
const DEFAULT_CONFIG = {
  // Auto-timeout settings
  auto_timeout_enabled: { value: true, type: 'boolean', category: 'timeout', label: 'Enable auto-timeout' },
  auto_timeout_hours: { value: 8, type: 'number', category: 'timeout', label: 'Timeout after (hours)' },
  auto_timeout_warning_minutes: { value: 30, type: 'number', category: 'timeout', label: 'Warning before (minutes)' },
  auto_timeout_extend_on_activity: { value: true, type: 'boolean', category: 'timeout', label: 'Extend timeout on activity' },

  // What activities are tracked (checkboxes)
  track_voice_presence: { value: true, type: 'boolean', category: 'tracking', label: 'Track voice channel presence' },
  track_ticket_responses: { value: true, type: 'boolean', category: 'tracking', label: 'Track ticket responses' },
  track_admin_cam: { value: false, type: 'boolean', category: 'tracking', label: 'Track admin cam usage', requiresSquadJS: true },
  track_ingame_chat: { value: false, type: 'boolean', category: 'tracking', label: 'Track in-game chat', requiresSquadJS: true },

  // Point values (editable)
  points_base_per_minute: { value: 1, type: 'number', category: 'points', label: 'Points per minute on duty' },
  points_voice_per_minute: { value: 0.5, type: 'number', category: 'points', label: 'Points per minute in voice' },
  points_ticket_response: { value: 5, type: 'number', category: 'points', label: 'Points per ticket response' },
  points_admin_cam: { value: 3, type: 'number', category: 'points', label: 'Points per admin cam use', requiresSquadJS: true },
  points_ingame_chat: { value: 1, type: 'number', category: 'points', label: 'Points per in-game message', requiresSquadJS: true },

  // Coverage thresholds
  coverage_low_threshold: { value: 2, type: 'number', category: 'coverage', label: 'Low coverage threshold (admins)' },
  coverage_snapshot_interval_minutes: { value: 60, type: 'number', category: 'coverage', label: 'Snapshot interval (minutes)' },

  // Tracked voice channels (array of channel IDs) - empty means track all
  tracked_voice_channels: { value: [], type: 'json', category: 'channels', label: 'Tracked voice channels (empty = all)' },

  // Excluded voice channels (array of channel IDs) - e.g., AFK channel
  excluded_voice_channels: { value: [], type: 'json', category: 'channels', label: 'Excluded voice channels (e.g., AFK)' },

  // Ticket channel pattern
  ticket_channel_pattern: { value: 'ticket-*', type: 'string', category: 'channels', label: 'Ticket channel pattern' }
};

const DutyTrackingConfig = sequelize.define('DutyTrackingConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'guild_id',
    comment: 'Discord guild ID'
  },

  configKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'config_key',
    comment: 'Configuration key name'
  },

  configValue: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'config_value',
    comment: 'Configuration value (JSON stringified for complex values)'
  },

  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this config option is enabled'
  },

  updatedBy: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'updated_by',
    comment: 'Discord user ID who last updated this config'
  },

  updatedByName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'updated_by_name',
    comment: 'Cached username of who last updated'
  }
}, {
  tableName: 'duty_tracking_config',
  timestamps: true,
  indexes: [
    {
      name: 'idx_duty_config_guild_key',
      unique: true,
      fields: ['guild_id', 'config_key']
    },
    {
      name: 'idx_duty_config_guild',
      fields: ['guild_id']
    }
  ],
  comment: 'Duty tracking configuration (transparent settings)'
});

// Config Audit model for tracking changes
const DutyTrackingConfigAudit = sequelize.define('DutyTrackingConfigAudit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },

  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'guild_id',
    comment: 'Discord guild ID'
  },

  configKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'config_key',
    comment: 'Configuration key that was changed'
  },

  oldValue: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'old_value',
    comment: 'Previous value (null for new configs)'
  },

  newValue: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'new_value',
    comment: 'New value'
  },

  changedBy: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'changed_by',
    comment: 'Discord user ID who made the change'
  },

  changedByName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'changed_by_name',
    comment: 'Cached username of who made the change'
  },

  changeType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'update',
    field: 'change_type',
    comment: 'Type: create, update, enable, disable'
  }
}, {
  tableName: 'duty_tracking_config_audit',
  timestamps: true,
  updatedAt: false, // Audit log doesn't need updatedAt
  indexes: [
    {
      name: 'idx_duty_config_audit_guild',
      fields: ['guild_id']
    },
    {
      name: 'idx_duty_config_audit_time',
      fields: ['createdAt']
    },
    {
      name: 'idx_duty_config_audit_guild_time',
      fields: ['guild_id', 'createdAt']
    }
  ],
  comment: 'Audit log for duty tracking configuration changes'
});

// ============================================
// Static Methods - DutyTrackingConfig
// ============================================

// Get default config metadata
DutyTrackingConfig.getDefaultConfig = function() {
  return DEFAULT_CONFIG;
};

// Get all config for a guild (with defaults)
DutyTrackingConfig.getGuildConfig = async function(guildId) {
  const dbConfigs = await this.findAll({
    where: { guildId }
  });

  // Start with defaults
  const config = {};
  for (const [key, meta] of Object.entries(DEFAULT_CONFIG)) {
    config[key] = {
      value: meta.value,
      enabled: true,
      type: meta.type,
      category: meta.category,
      label: meta.label,
      requiresSquadJS: meta.requiresSquadJS || false,
      isDefault: true,
      updatedBy: null,
      updatedByName: null,
      updatedAt: null
    };
  }

  // Override with database values
  for (const dbConfig of dbConfigs) {
    if (config[dbConfig.configKey]) {
      const meta = DEFAULT_CONFIG[dbConfig.configKey];
      let value = dbConfig.configValue;

      // Parse value based on type
      if (meta.type === 'boolean') {
        value = value === 'true' || value === true;
      } else if (meta.type === 'number') {
        value = parseFloat(value);
      } else if (meta.type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          value = meta.value;
        }
      }

      config[dbConfig.configKey] = {
        ...config[dbConfig.configKey],
        value,
        enabled: dbConfig.enabled,
        isDefault: false,
        updatedBy: dbConfig.updatedBy,
        updatedByName: dbConfig.updatedByName,
        updatedAt: dbConfig.updatedAt
      };
    }
  }

  return config;
};

// Get a single config value
DutyTrackingConfig.getValue = async function(guildId, key) {
  const config = await this.getGuildConfig(guildId);
  return config[key]?.value ?? DEFAULT_CONFIG[key]?.value;
};

// Check if a feature is enabled
DutyTrackingConfig.isEnabled = async function(guildId, key) {
  const config = await this.getGuildConfig(guildId);
  return config[key]?.enabled ?? true;
};

// Set a config value
DutyTrackingConfig.setValue = async function(guildId, key, value, changedBy, changedByName = null) {
  if (!DEFAULT_CONFIG[key]) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const meta = DEFAULT_CONFIG[key];

  // Serialize value
  let serializedValue;
  if (meta.type === 'json') {
    serializedValue = JSON.stringify(value);
  } else {
    serializedValue = String(value);
  }

  // Get old value for audit
  const existing = await this.findOne({
    where: { guildId, configKey: key }
  });

  const oldValue = existing?.configValue ?? null;
  const changeType = existing ? 'update' : 'create';

  // Upsert config
  const [config] = await this.upsert({
    guildId,
    configKey: key,
    configValue: serializedValue,
    enabled: true,
    updatedBy: changedBy,
    updatedByName: changedByName
  });

  // Create audit log entry
  await DutyTrackingConfigAudit.create({
    guildId,
    configKey: key,
    oldValue,
    newValue: serializedValue,
    changedBy,
    changedByName,
    changeType
  });

  return config;
};

// Toggle enabled status
DutyTrackingConfig.setEnabled = async function(guildId, key, enabled, changedBy, changedByName = null) {
  if (!DEFAULT_CONFIG[key]) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const existing = await this.findOne({
    where: { guildId, configKey: key }
  });

  const oldEnabled = existing?.enabled ?? true;

  if (existing) {
    await existing.update({
      enabled,
      updatedBy: changedBy,
      updatedByName: changedByName
    });
  } else {
    // Create with default value
    const meta = DEFAULT_CONFIG[key];
    const serializedValue = meta.type === 'json'
      ? JSON.stringify(meta.value)
      : String(meta.value);

    await this.create({
      guildId,
      configKey: key,
      configValue: serializedValue,
      enabled,
      updatedBy: changedBy,
      updatedByName: changedByName
    });
  }

  // Create audit log entry
  await DutyTrackingConfigAudit.create({
    guildId,
    configKey: key,
    oldValue: String(oldEnabled),
    newValue: String(enabled),
    changedBy,
    changedByName,
    changeType: enabled ? 'enable' : 'disable'
  });
};

// Get config categories (for UI organization)
DutyTrackingConfig.getCategories = function() {
  return {
    timeout: { label: 'Auto-Timeout', description: 'Automatic session timeout settings' },
    tracking: { label: 'Activity Tracking', description: 'What activities to track for points' },
    points: { label: 'Point Values', description: 'How many points each activity awards' },
    coverage: { label: 'Coverage Settings', description: 'Server coverage tracking settings' },
    channels: { label: 'Channel Configuration', description: 'Voice and ticket channel settings' }
  };
};

// Get audit log for a guild
DutyTrackingConfig.getAuditLog = async function(guildId, limit = 50) {
  return DutyTrackingConfigAudit.findAll({
    where: { guildId },
    order: [['createdAt', 'DESC']],
    limit
  });
};

// Initialize default config for a guild (doesn't overwrite existing)
DutyTrackingConfig.initializeGuildConfig = async function(guildId) {
  const existing = await this.findAll({
    where: { guildId }
  });

  const existingKeys = new Set(existing.map(c => c.configKey));
  const created = [];

  for (const [key, meta] of Object.entries(DEFAULT_CONFIG)) {
    if (!existingKeys.has(key)) {
      const serializedValue = meta.type === 'json'
        ? JSON.stringify(meta.value)
        : String(meta.value);

      await this.create({
        guildId,
        configKey: key,
        configValue: serializedValue,
        enabled: true,
        updatedBy: null,
        updatedByName: 'System'
      });

      created.push(key);
    }
  }

  return created;
};

module.exports = { DutyTrackingConfig, DutyTrackingConfigAudit, DEFAULT_CONFIG };
