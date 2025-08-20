const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Server = sequelize.define('Server', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  
  // Server ID - Unique identifier for the Squad server
  serverId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique server identifier (e.g., server1, squad-main, etc.)'
  },
  
  // Server Name - Human-readable name
  serverName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Human-readable server name'
  },
  
  // Server Description
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Server description or notes'
  },
  
  // SquadJS Connection Details
  squadjsHost: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'SquadJS host/IP address'
  },
  
  squadjsPort: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'SquadJS port number'
  },
  
  squadjsPassword: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'SquadJS authentication password (encrypted)'
  },
  
  // BattleMetrics Integration
  battlemetricsServerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'BattleMetrics server ID for API calls'
  },
  
  // RCON Connection Details
  rconHost: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'RCON host/IP address'
  },
  
  rconPort: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'RCON port number'
  },
  
  rconPassword: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'RCON password (encrypted)'
  },
  
  // Server Status
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this server is currently active'
  },
  
  isOnline: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Current server online status'
  },
  
  lastOnline: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when server was last online'
  },
  
  // Server Configuration
  maxPlayers: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Maximum player capacity'
  },
  
  currentPlayers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Current player count'
  },
  
  // Discord Integration
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Discord guild/server ID this server belongs to'
  },
  
  // Roster/Whitelist Settings
  whitelistEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether whitelist is enabled on this server'
  },
  
  autoWhitelistSync: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether to automatically sync whitelist changes'
  },
  
  // Server Priority/Ordering
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Server priority for ordering (higher = more important)'
  },
  
  // Connection Health
  lastHealthCheck: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last health check'
  },
  
  healthStatus: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'offline',
    comment: 'Current health status of the server'
  },
  
  // Statistics
  totalConnections: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total number of player connections to this server'
  },
  
  totalPlaytime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total playtime across all players (in minutes)'
  },
  
  // Configuration metadata
  config: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional server configuration (JSON format)'
  },
  
  // Notes
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Admin notes about this server'
  }
}, {
  // Table name
  tableName: 'servers',
  
  // Timestamps (createdAt, updatedAt)
  timestamps: true,
  
  // Indexes for performance
  indexes: [
    {
      name: 'idx_servers_server_id',
      fields: ['serverId']
    },
    {
      name: 'idx_servers_guild_id',
      fields: ['guildId']
    },
    {
      name: 'idx_servers_active',
      fields: ['isActive']
    },
    {
      name: 'idx_servers_online',
      fields: ['isOnline']
    },
    {
      name: 'idx_servers_health',
      fields: ['healthStatus']
    },
    {
      name: 'idx_servers_priority',
      fields: ['priority']
    },
    {
      name: 'idx_servers_battlemetrics',
      fields: ['battlemetricsServerId']
    },
    {
      name: 'idx_servers_last_online',
      fields: ['lastOnline']
    },
    {
      name: 'idx_servers_whitelist',
      fields: ['whitelistEnabled']
    },
    {
      // Composite index for guild server queries
      name: 'idx_servers_guild_active',
      fields: ['guildId', 'isActive']
    },
    {
      // Composite index for priority ordering
      name: 'idx_servers_guild_priority',
      fields: ['guildId', 'priority', 'isActive']
    }
  ],
  
  // Comment for the table
  comment: 'Squad server configuration and status tracking'
});

// Instance methods
Server.prototype.updateStatus = async function(isOnline, playerCount = null) {
  this.isOnline = isOnline;
  this.lastHealthCheck = new Date();
  
  if (isOnline) {
    this.lastOnline = new Date();
    this.healthStatus = 'healthy';
  } else {
    this.healthStatus = 'offline';
  }
  
  if (playerCount !== null) {
    this.currentPlayers = playerCount;
  }
  
  return await this.save();
};

Server.prototype.updatePlayerCount = async function(playerCount) {
  this.currentPlayers = playerCount;
  this.lastHealthCheck = new Date();
  return await this.save();
};

Server.prototype.addConnection = async function() {
  this.totalConnections += 1;
  return await this.save();
};

Server.prototype.addPlaytime = async function(minutes) {
  this.totalPlaytime += minutes;
  return await this.save();
};

Server.prototype.updateHealth = async function(healthStatus) {
  this.healthStatus = healthStatus;
  this.lastHealthCheck = new Date();
  return await this.save();
};

Server.prototype.getConnectionString = function() {
  if (!this.squadjsHost || !this.squadjsPort) return null;
  return `${this.squadjsHost}:${this.squadjsPort}`;
};

Server.prototype.getRconConnectionString = function() {
  if (!this.rconHost || !this.rconPort) return null;
  return `${this.rconHost}:${this.rconPort}`;
};

// Static methods
Server.findByServerId = function(serverId) {
  return this.findOne({ where: { serverId } });
};

Server.findByBattlemetricsId = function(battlemetricsServerId) {
  return this.findOne({ where: { battlemetricsServerId } });
};

Server.getActiveServers = function(guildId = null) {
  const where = { isActive: true };
  if (guildId) where.guildId = guildId;
  return this.findAll({ 
    where,
    order: [['priority', 'DESC'], ['serverName', 'ASC']]
  });
};

Server.getOnlineServers = function(guildId = null) {
  const where = { isActive: true, isOnline: true };
  if (guildId) where.guildId = guildId;
  return this.findAll({ 
    where,
    order: [['priority', 'DESC'], ['currentPlayers', 'DESC']]
  });
};

Server.getWhitelistEnabledServers = function(guildId = null) {
  const where = { isActive: true, whitelistEnabled: true };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};

Server.getUnhealthyServers = function(guildId = null) {
  const where = { 
    isActive: true, 
    healthStatus: { [Op.in]: ['warning', 'critical', 'offline'] }
  };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};

Server.getServersByGuild = function(guildId) {
  return this.findAll({ 
    where: { guildId },
    order: [['priority', 'DESC'], ['serverName', 'ASC']]
  });
};

Server.getRecentlyOffline = function(hours = 24, guildId = null) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { 
    isActive: true,
    isOnline: false,
    lastOnline: { [Op.gte]: cutoff }
  };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};

module.exports = Server;