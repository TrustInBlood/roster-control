const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

// Default configuration values with metadata
const DEFAULT_CONFIG = {
  // Cache settings
  cache_refresh_seconds: { value: 60, type: 'number', category: 'cache', label: 'Cache refresh interval (seconds)' },
  cache_cleanup_interval: { value: 300000, type: 'number', category: 'cache', label: 'Cache cleanup interval (ms)' },

  // Identifier preferences
  prefer_eos_id: { value: false, type: 'boolean', category: 'identifiers', label: 'Prefer EOS ID over Steam ID' },

  // Verification settings
  verification_code_length: { value: 6, type: 'number', category: 'verification', label: 'Verification code length' },
  verification_expiration_minutes: { value: 5, type: 'number', category: 'verification', label: 'Code expiration (minutes)' },
  verification_cleanup_interval: { value: 300000, type: 'number', category: 'verification', label: 'Cleanup interval (ms)' },

  // Connection settings
  reconnection_attempts: { value: 10, type: 'number', category: 'connection', label: 'Max reconnection attempts' },
  reconnection_delay: { value: 5000, type: 'number', category: 'connection', label: 'Base reconnection delay (ms)' },
  connection_timeout: { value: 10000, type: 'number', category: 'connection', label: 'Connection timeout (ms)' },

  // Logging settings
  log_level: { value: 'info', type: 'string', category: 'logging', label: 'Log level' },
  log_connections: { value: true, type: 'boolean', category: 'logging', label: 'Log connections' },
  log_cache_hits: { value: false, type: 'boolean', category: 'logging', label: 'Log cache hits' },
  log_squadjs_events: { value: true, type: 'boolean', category: 'logging', label: 'Log SquadJS events' }
};

const ConnectionConfig = sequelize.define('ConnectionConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  configKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
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
  tableName: 'connection_config',
  timestamps: true,
  indexes: [
    { name: 'idx_connection_config_key', unique: true, fields: ['config_key'] }
  ],
  comment: 'Connection and integration settings (key-value config)'
});

// Audit model
const ConnectionConfigAudit = sequelize.define('ConnectionConfigAudit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  entityType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'entity_type',
    comment: 'Entity type: config or server'
  },
  entityId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'entity_id',
    comment: 'server_key or config_key'
  },
  action: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Action: create, update, delete, enable, disable'
  },
  oldValue: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'old_value',
    comment: 'Previous state (JSON)'
  },
  newValue: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'new_value',
    comment: 'New state (JSON)'
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
  }
}, {
  tableName: 'connection_config_audit',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { name: 'idx_conn_audit_entity_type', fields: ['entity_type'] },
    { name: 'idx_conn_audit_time', fields: ['createdAt'] },
    { name: 'idx_conn_audit_entity_time', fields: ['entity_type', 'createdAt'] }
  ],
  comment: 'Audit log for connection config and server changes'
});

// ============================================
// Static Methods - ConnectionConfig
// ============================================

ConnectionConfig.getDefaultConfig = function() {
  return DEFAULT_CONFIG;
};

// Get all config (with defaults filled in)
ConnectionConfig.getConfig = async function() {
  const dbConfigs = await this.findAll();

  const config = {};
  for (const [key, meta] of Object.entries(DEFAULT_CONFIG)) {
    config[key] = {
      value: meta.value,
      enabled: true,
      type: meta.type,
      category: meta.category,
      label: meta.label,
      isDefault: true,
      updatedBy: null,
      updatedByName: null,
      updatedAt: null
    };
  }

  for (const dbConfig of dbConfigs) {
    if (config[dbConfig.configKey]) {
      const meta = DEFAULT_CONFIG[dbConfig.configKey];
      let value = dbConfig.configValue;

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
ConnectionConfig.getValue = async function(key) {
  const config = await this.getConfig();
  return config[key]?.value ?? DEFAULT_CONFIG[key]?.value;
};

// Set a config value
ConnectionConfig.setValue = async function(key, value, changedBy, changedByName = null) {
  if (!DEFAULT_CONFIG[key]) {
    throw new Error(`Unknown config key: ${key}`);
  }

  const meta = DEFAULT_CONFIG[key];

  let serializedValue;
  if (meta.type === 'json') {
    serializedValue = JSON.stringify(value);
  } else {
    serializedValue = String(value);
  }

  const existing = await this.findOne({
    where: { configKey: key }
  });

  const oldValue = existing?.configValue ?? null;
  const changeType = existing ? 'update' : 'create';

  await this.upsert({
    configKey: key,
    configValue: serializedValue,
    enabled: true,
    updatedBy: changedBy,
    updatedByName: changedByName
  });

  await ConnectionConfigAudit.create({
    entityType: 'config',
    entityId: key,
    action: changeType,
    oldValue,
    newValue: serializedValue,
    changedBy,
    changedByName
  });
};

// Get config categories for UI
ConnectionConfig.getCategories = function() {
  return {
    cache: { label: 'Cache', description: 'Whitelist cache and cleanup settings' },
    identifiers: { label: 'Identifiers', description: 'Player identifier preferences' },
    verification: { label: 'Verification', description: 'In-game account linking verification' },
    connection: { label: 'Connection', description: 'SquadJS reconnection and timeout settings' },
    logging: { label: 'Logging', description: 'Logging verbosity settings' }
  };
};

// Get audit log (both config and server changes)
ConnectionConfig.getAuditLog = async function(limit = 50) {
  return ConnectionConfigAudit.findAll({
    order: [['createdAt', 'DESC']],
    limit
  });
};

// Initialize default config (seed missing keys)
ConnectionConfig.initializeConfig = async function() {
  const existing = await this.findAll();
  const existingKeys = new Set(existing.map(c => c.configKey));
  const created = [];

  for (const [key, meta] of Object.entries(DEFAULT_CONFIG)) {
    if (!existingKeys.has(key)) {
      const serializedValue = meta.type === 'json'
        ? JSON.stringify(meta.value)
        : String(meta.value);

      await this.create({
        configKey: key,
        configValue: serializedValue,
        enabled: true,
        updatedByName: 'System'
      });

      created.push(key);
    }
  }

  return created;
};

module.exports = { ConnectionConfig, ConnectionConfigAudit, DEFAULT_CONFIG };
