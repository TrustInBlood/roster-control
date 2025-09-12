const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const Whitelist = sequelize.define('Whitelist', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['staff', 'whitelist']]
      }
    },
    steamid64: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    eosID: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discord_username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    group_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'groups',
        key: 'id'
      }
    },
    approved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    expiration: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    duration_value: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'The numeric duration value (e.g., 6 for 6 months)'
    },
    duration_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'The duration unit: "months", "days"'
    },
    granted_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord ID of the admin who granted this whitelist'
    },
    granted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this whitelist entry was granted'
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this whitelist entry has been revoked'
    },
    revoked_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord ID of the admin who revoked this whitelist'
    },
    revoked_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for revoking this whitelist entry'
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this whitelist entry was revoked'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata (e.g., BattleMetrics import data, migration info)'
    }
  }, {
    tableName: 'whitelists',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    indexes: [
      {
        fields: ['type', 'approved']
      },
      {
        fields: ['steamid64']
      },
      {
        fields: ['eosID']
      }
    ]
  });

  // Note: Associations are defined in src/database/associations.js

  Whitelist.getActiveEntries = async function(type) {
    // Get all users with active whitelist entries (using stacking logic)
    const activeUsers = new Map();
    
    // Get all approved, non-revoked entries for this type
    const allEntries = await this.findAll({
      where: {
        type: type,
        approved: true,
        revoked: false
      },
      order: [['steamid64', 'ASC'], ['granted_at', 'ASC']]
    });

    // Group by steamid64 and check if each user has active whitelist
    const userGroups = new Map();
    for (const entry of allEntries) {
      if (!userGroups.has(entry.steamid64)) {
        userGroups.set(entry.steamid64, []);
      }
      userGroups.get(entry.steamid64).push(entry);
    }

    // For each user, check if they have active whitelist using stacking logic
    for (const [steamid64, entries] of userGroups) {
      const whitelistStatus = await this.getActiveWhitelistForUser(steamid64);
      
      if (whitelistStatus.hasWhitelist) {
        // Use the most recent entry for display info, but include group info
        const latestEntry = entries[entries.length - 1];
        
        // For now, add group info manually to avoid association issues
        if (latestEntry.group_id) {
          try {
            const { Group } = require('./index');
            const group = await Group.findByPk(latestEntry.group_id);
            latestEntry.group = group;
          } catch (error) {
            console.error('Failed to load group for entry:', error.message);
          }
        }
        
        activeUsers.set(steamid64, latestEntry);
      }
    }

    return Array.from(activeUsers.values());
  };

  Whitelist.updateDiscordUsername = async function(steamid64, eosID, discordUsername) {
    const whereClause = {
      [Op.or]: []
    };

    if (steamid64) {
      whereClause[Op.or].push({ steamid64 });
    }
    if (eosID) {
      whereClause[Op.or].push({ eosID });
    }

    if (whereClause[Op.or].length === 0) {
      return 0;
    }

    const [updatedCount] = await this.update(
      { discord_username: discordUsername },
      { where: whereClause }
    );

    return updatedCount;
  };

  // Get active whitelist status for a user (combines all active entries by stacking durations)
  Whitelist.getActiveWhitelistForUser = async function(steamid64) {
    const activeEntries = await this.findAll({
      where: {
        steamid64: steamid64,
        approved: true,
        revoked: false
      },
      order: [['granted_at', 'ASC']]
    });

    if (activeEntries.length === 0) {
      return { hasWhitelist: false, status: 'No whitelist', expiration: null };
    }

    // Check for permanent whitelist (any entry without duration)
    const hasPermanent = activeEntries.some(entry => !entry.duration_value || !entry.duration_type);
    if (hasPermanent) {
      return { hasWhitelist: true, status: 'Active (permanent)', expiration: null };
    }

    // Calculate stacked expiration by adding all durations from earliest grant date
    const earliestEntry = activeEntries[0]; // Already sorted by granted_at ASC
    let stackedExpiration = new Date(earliestEntry.granted_at);

    // Add up all the durations
    let totalMonths = 0;
    let totalDays = 0;

    activeEntries.forEach(entry => {
      if (entry.duration_type === 'months') {
        totalMonths += entry.duration_value;
      } else if (entry.duration_type === 'days') {
        totalDays += entry.duration_value;
      }
    });

    // Apply the stacked duration
    if (totalMonths > 0) {
      stackedExpiration.setMonth(stackedExpiration.getMonth() + totalMonths);
    }
    if (totalDays > 0) {
      stackedExpiration.setDate(stackedExpiration.getDate() + totalDays);
    }

    const now = new Date();
    
    if (stackedExpiration > now) {
      return { hasWhitelist: true, status: 'Active', expiration: stackedExpiration };
    } else {
      return { hasWhitelist: false, status: 'Expired', expiration: stackedExpiration };
    }
  };

  // Get all whitelist history for a user
  Whitelist.getUserHistory = async function(steamid64) {
    return await this.findAll({
      where: { steamid64: steamid64 },
      order: [['granted_at', 'DESC']],
      include: [{
        model: sequelize.models.Group,
        as: 'group',
        required: false
      }]
    });
  };

  // Grant a new whitelist entry
  Whitelist.grantWhitelist = async function({
    steamid64,
    eosID = null,
    username = null,
    discord_username = null,
    reason,
    duration_value,
    duration_type,
    granted_by,
    note = null,
    metadata = null
  }) {
    const granted_at = new Date();
    let expiration = null;

    // Calculate expiration date based on duration
    if (duration_value && duration_type) {
      expiration = new Date(granted_at);
      if (duration_type === 'months') {
        expiration.setMonth(expiration.getMonth() + duration_value);
      } else if (duration_type === 'days') {
        expiration.setDate(expiration.getDate() + duration_value);
      }
    }

    // Ensure default whitelist group exists and get its ID
    const { ensureDefaultWhitelistGroup } = require('../../utils/ensureDefaultGroup');
    const whitelistGroup = await ensureDefaultWhitelistGroup();

    return await this.create({
      type: 'whitelist',
      steamid64,
      eosID,
      username,
      discord_username,
      reason: note ? `${reason}: ${note}` : reason,
      duration_value,
      duration_type,
      granted_by,
      granted_at,
      expiration,
      approved: true,
      revoked: false,
      group_id: whitelistGroup.id,
      metadata
    });
  };

  // Revoke active whitelist entries for a user
  Whitelist.revokeWhitelist = async function(steamid64, reason, revoked_by) {
    const revoked_at = new Date();
    
    const [updatedCount] = await this.update(
      {
        revoked: true,
        revoked_by,
        revoked_reason: reason,
        revoked_at
      },
      {
        where: {
          steamid64: steamid64,
          approved: true,
          revoked: false
        }
      }
    );

    return updatedCount;
  };

  // Extend whitelist by adding a new entry
  Whitelist.extendWhitelist = async function(steamid64, months, granted_by) {
    const user = await this.findOne({
      where: { steamid64: steamid64 },
      order: [['granted_at', 'DESC']]
    });

    if (!user) {
      throw new Error('User not found in whitelist system');
    }

    return await this.grantWhitelist({
      steamid64,
      eosID: user.eosID,
      username: user.username,
      discord_username: user.discord_username,
      reason: 'extension',
      duration_value: months,
      duration_type: 'months',
      granted_by
    });
  };

  return Whitelist;
};