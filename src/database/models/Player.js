const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Player = sequelize.define('Player', {
  // Auto-increment primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Auto-increment primary key'
  },
  
  // Steam ID - Unique Steam identifier
  steamId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    comment: 'Steam ID (Steam64 format)'
  },
  
  // EOS ID - Epic Online Services identifier (important for Squad)
  eosId: {
    type: DataTypes.STRING(34),
    allowNull: false,
    unique: true,
    comment: 'Epic Online Services ID (EOS)'
  },
  
  // Username - Current player name
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Current player username'
  },
  
  // Roster Status - Boolean indicating whitelist status
  rosterStatus: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether player is on the whitelist/roster'
  },
  
  // Last Seen - Timestamp of last activity
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last player activity'
  },
  
  // Last Server - ID of the last server the player was on
  lastServerId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'ID of the last server the player was on'
  },
  
  // Join Count - Number of times player has joined
  joinCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total number of times player has joined servers'
  },
  
  // Total Play Time - Cumulative play time in minutes
  totalPlayTime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total play time in minutes'
  },
  
  // Notes - Admin notes about the player
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Admin notes about the player'
  }
}, {
  // Table name
  tableName: 'players',
  
  // Timestamps (createdAt, updatedAt)
  timestamps: true,
  
  // Indexes for performance
  indexes: [
    {
      name: 'idx_players_steam_id',
      fields: ['steamId']
    },
    {
      name: 'idx_players_eos_id',
      fields: ['eosId']
    },
    {
      name: 'idx_players_username',
      fields: ['username']
    },
    {
      name: 'idx_players_roster_status',
      fields: ['rosterStatus']
    },
    {
      name: 'idx_players_last_seen',
      fields: ['lastSeen']
    },
    {
      name: 'idx_players_last_server',
      fields: ['lastServerId']
    }
  ],
  
  // Comment for the table
  comment: 'Player roster and activity tracking'
});

// Instance methods
Player.prototype.updateActivity = async function(serverId) {
  this.lastSeen = new Date();
  this.lastServerId = serverId;
  this.joinCount += 1;
  return await this.save();
};

Player.prototype.addPlayTime = async function(minutes) {
  this.totalPlayTime += minutes;
  return await this.save();
};

// Static methods
Player.findBySteamId = function(steamId) {
  return this.findOne({ where: { steamId } });
};

Player.findByEosId = function(eosId) {
  return this.findOne({ where: { eosId } });
};

Player.findByUsername = function(username) {
  return this.findOne({ where: { username } });
};

Player.getRosterMembers = function() {
  return this.findAll({ where: { rosterStatus: true } });
};

Player.getActivePlayers = function(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.findAll({ 
    where: { 
      lastSeen: { [Op.gte]: cutoff } 
    } 
  });
};

module.exports = Player;
