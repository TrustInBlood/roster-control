const { DataTypes, Op } = require('sequelize');
const { console: loggerConsole } = require('../../utils/logger');

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
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'manual',
      validate: {
        isIn: [['role', 'manual', 'import', 'donation']]
      },
      comment: 'Source of the whitelist: "role", "manual", "import", "donation"'
    },
    role_name: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord role name that granted access (for role-based entries)'
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord user ID for role-based tracking'
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
      },
      {
        fields: ['source', 'revoked']
      },
      {
        fields: ['discord_user_id', 'revoked']
      },
      {
        fields: ['role_name']
      },
      {
        fields: ['discord_user_id', 'source', 'revoked']
      }
    ]
  });

  // Note: Associations are defined in src/database/associations.js

  Whitelist.getActiveEntries = async function(type) {
    // Get all approved, non-revoked entries for this type
    const allEntries = await this.findAll({
      where: {
        type: type,
        approved: true,
        revoked: false
      },
      order: [['steamid64', 'ASC'], ['granted_at', 'ASC']]
    });

    if (allEntries.length === 0) {
      return [];
    }

    // Group by steamid64
    const userGroups = new Map();
    for (const entry of allEntries) {
      if (!userGroups.has(entry.steamid64)) {
        userGroups.set(entry.steamid64, []);
      }
      userGroups.get(entry.steamid64).push(entry);
    }

    // Process each user's entries using the same stacking logic as getActiveWhitelistForUser
    const activeUsers = new Map();
    const now = new Date();

    for (const [steamid64, entries] of userGroups) {
      // Check for permanent whitelist (any entry with null duration)
      const hasPermanent = entries.some(entry =>
        (entry.duration_value === null && entry.duration_type === null));

      if (hasPermanent) {
        // User has permanent access - use the most recent entry for display
        const latestEntry = entries[entries.length - 1];
        activeUsers.set(steamid64, latestEntry);
        continue;
      }

      // Filter out entries that have already expired individually
      const validEntries = [];

      entries.forEach(entry => {
        // Skip entries with 0 duration (these are expired)
        if (entry.duration_value === 0) return;

        // Calculate individual expiration date
        const grantedDate = new Date(entry.granted_at);
        const entryExpiration = new Date(grantedDate);

        if (entry.duration_type === 'days') {
          entryExpiration.setDate(entryExpiration.getDate() + entry.duration_value);
        } else if (entry.duration_type === 'months') {
          entryExpiration.setMonth(entryExpiration.getMonth() + entry.duration_value);
        }

        // Only include entries that haven't expired yet
        if (entryExpiration > now) {
          validEntries.push(entry);
        }
      });

      if (validEntries.length === 0) {
        // All entries have expired - don't include this user
        continue;
      }

      // Stack durations from valid entries to ensure user still has active access
      const earliestEntry = validEntries.sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at))[0];
      let stackedExpiration = new Date(earliestEntry.granted_at);

      // Add up all valid durations
      let totalMonths = 0;
      let totalDays = 0;

      validEntries.forEach(entry => {
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

      // Check if the stacked expiration is still in the future
      if (stackedExpiration > now) {
        // User has active stacked whitelist - use the most recent entry for display
        const latestEntry = entries[entries.length - 1];
        activeUsers.set(steamid64, latestEntry);
      }
    }

    const finalEntries = Array.from(activeUsers.values());

    // Bulk load group information for all entries at once
    await this._addGroupInfoToEntries(finalEntries);

    return finalEntries;
  };

  // Helper method to bulk add group info to multiple entries
  Whitelist._addGroupInfoToEntries = async function(entries) {
    if (entries.length === 0) {
      return;
    }

    try {
      // Get all unique group IDs from the entries
      const groupIds = [...new Set(entries.map(entry => entry.group_id).filter(Boolean))];

      if (groupIds.length === 0) {
        return;
      }

      // Bulk fetch all groups at once
      const { Group } = require('./index');
      const groups = await Group.findAll({
        where: {
          id: groupIds
        }
      });

      // Create a map for quick lookup
      const groupsById = new Map();
      for (const group of groups) {
        groupsById.set(group.id, group);
      }

      // Assign group info to each entry
      for (const entry of entries) {
        if (entry.group_id && groupsById.has(entry.group_id)) {
          entry.group = groupsById.get(entry.group_id);
        }
      }

    } catch (error) {
      loggerConsole.error('Failed to bulk load group info for entries:', error.message);
    }
  };

  // Helper method to add group info to a single entry (legacy method)
  Whitelist._addGroupInfoToEntry = async function(entry) {
    if (entry.group_id) {
      try {
        const { Group } = require('./index');
        const group = await Group.findByPk(entry.group_id);
        entry.group = group;
      } catch (error) {
        loggerConsole.error('Failed to load group for entry:', error.message);
      }
    }
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

    // Check for permanent whitelist (any entry with null duration, but not 0 duration which means expired)
    const hasPermanent = activeEntries.some(entry => 
      (entry.duration_value === null && entry.duration_type === null));
    if (hasPermanent) {
      return { hasWhitelist: true, status: 'Active (permanent)', expiration: null };
    }

    // Filter out entries that have already expired individually, then stack the rest
    const now = new Date();
    const validEntries = [];

    // First, determine which entries are still individually valid
    activeEntries.forEach(entry => {
      // Skip entries with 0 duration (these are expired)
      if (entry.duration_value === 0) return;
      
      // Calculate individual expiration date
      const grantedDate = new Date(entry.granted_at);
      const entryExpiration = new Date(grantedDate);
      
      if (entry.duration_type === 'days') {
        entryExpiration.setDate(entryExpiration.getDate() + entry.duration_value);
      } else if (entry.duration_type === 'months') {
        entryExpiration.setMonth(entryExpiration.getMonth() + entry.duration_value);
      }
      
      // Only include entries that haven't expired yet
      if (entryExpiration > now) {
        validEntries.push(entry);
      }
    });

    if (validEntries.length === 0) {
      // All entries have expired - find most recent expiration for display
      let mostRecentExpiration = null;
      activeEntries.forEach(entry => {
        const grantedDate = new Date(entry.granted_at);
        const entryExpiration = new Date(grantedDate);
        
        if (entry.duration_type === 'days') {
          entryExpiration.setDate(entryExpiration.getDate() + entry.duration_value);
        } else if (entry.duration_type === 'months') {
          entryExpiration.setMonth(entryExpiration.getMonth() + entry.duration_value);
        }
        
        if (!mostRecentExpiration || entryExpiration > mostRecentExpiration) {
          mostRecentExpiration = entryExpiration;
        }
      });
      
      return { hasWhitelist: false, status: 'Expired', expiration: mostRecentExpiration };
    }

    // Stack durations from valid entries only
    const earliestEntry = validEntries.sort((a, b) => new Date(a.granted_at) - new Date(b.granted_at))[0];
    let stackedExpiration = new Date(earliestEntry.granted_at);

    // Add up all valid durations
    let totalMonths = 0;
    let totalDays = 0;

    validEntries.forEach(entry => {
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

    return { hasWhitelist: true, status: 'Active', expiration: stackedExpiration };
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

    // DEPRECATED: expiration field is no longer used as authoritative source
    // All code should calculate expiration from duration_value + duration_type + granted_at
    // Setting to NULL to make it clear this field is not maintained
    //
    // Rationale:
    // - The expiration field becomes stale after stacking (when new entries are added)
    // - All validation code now calculates expiration on-the-fly from duration fields
    // - Keeping this field would require updating ALL user entries on every grant (expensive)
    // - Setting to NULL prevents confusion about which field is authoritative
    const expiration = null;

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
          revoked: false,
          source: { [require('sequelize').Op.ne]: 'role' } // Exclude role-based entries
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