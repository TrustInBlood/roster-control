const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Admin = sequelize.define('Admin', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  
  // Discord User ID - Primary identifier
  discordUserId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    comment: 'Discord user ID (unique identifier)'
  },
  
  // Discord Username - Current username for display
  discordUsername: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Current Discord username'
  },
  
  // Discord Display Name - Server nickname or global display name
  displayName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Server nickname or display name'
  },
  
  // Guild ID - Which Discord server this admin belongs to
  guildId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Discord guild/server ID'
  },
  
  // Admin Level - Role or permission level
  adminLevel: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'admin',
    comment: 'Admin permission level'
  },
  
  // Active Status - Whether the admin is still active
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this admin is still active'
  },
  
  // Permissions - JSON field for storing specific permissions
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Specific permissions for this admin (JSON format)'
  },
  
  // Notes - Admin notes about this user
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Administrative notes about this admin'
  },
  
  // Last Seen - When this admin was last active
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last admin activity'
  }
}, {
  // Table name
  tableName: 'admins',
  
  // Timestamps (createdAt, updatedAt)
  timestamps: true,
  
  // Indexes for performance
  indexes: [
    {
      name: 'idx_admins_discord_user_id',
      fields: ['discordUserId']
    },
    {
      name: 'idx_admins_guild_id',
      fields: ['guildId']
    },
    {
      name: 'idx_admins_active',
      fields: ['isActive']
    },
    {
      name: 'idx_admins_admin_level',
      fields: ['adminLevel']
    },
    {
      name: 'idx_admins_last_seen',
      fields: ['lastSeen']
    },
    {
      // Composite index for active admins per guild
      name: 'idx_admins_guild_active',
      fields: ['guildId', 'isActive']
    }
  ],
  
  // Comment for the table
  comment: 'Discord admin information and permissions'
});

// Instance methods
Admin.prototype.updateActivity = async function() {
  this.lastSeen = new Date();
  return await this.save();
};

// Static methods
Admin.findByDiscordId = function(discordUserId, guildId = null) {
  const where = { discordUserId };
  if (guildId) where.guildId = guildId;
  return this.findOne({ where });
};

Admin.findByUsername = function(discordUsername, guildId = null) {
  const where = { discordUsername };
  if (guildId) where.guildId = guildId;
  return this.findOne({ where });
};

Admin.getActiveAdmins = function(guildId = null) {
  const where = { isActive: true };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};

Admin.getAdminsByLevel = function(adminLevel, guildId = null) {
  const where = { adminLevel, isActive: true };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};

Admin.getRecentlyActive = function(hours = 24, guildId = null) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { 
    lastSeen: { [Op.gte]: cutoff },
    isActive: true
  };
  if (guildId) where.guildId = guildId;
  return this.findAll({ where });
};


module.exports = Admin;