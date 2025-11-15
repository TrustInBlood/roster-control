const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const StaffRoleArchive = sequelize.define('StaffRoleArchive', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
      comment: 'Auto-increment primary key'
    },

    // Discord user information
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Discord user ID whose staff roles were removed'
    },

    discord_username: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Discord username at time of removal'
    },

    discord_display_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Discord display name at time of removal'
    },

    // Removed roles information
    removed_roles: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Array of removed role objects with {id, name, priority, group}'
    },

    highest_role_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Name of highest priority role removed (for quick reference)'
    },

    highest_role_group: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Group of highest priority role (HeadAdmin, SquadAdmin, Moderator, etc.)'
    },

    // Removal details
    removal_reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'Unlinked account',
      comment: 'Reason for role removal'
    },

    removal_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'scrub_unlinked',
      comment: 'Type of removal (scrub_unlinked, manual, disciplinary, etc.)'
    },

    removed_by_user_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord ID of admin who approved the removal'
    },

    removed_by_username: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Username of admin who approved the removal'
    },

    scrub_approval_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Approval ID from scrub preview command (if applicable)'
    },

    // Link status at time of removal
    prior_link_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Link status at removal (no_link, low_confidence, insufficient_confidence)'
    },

    prior_confidence_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'Confidence score at time of removal (if link existed)'
    },

    prior_steam_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Steam ID64 at time of removal (if link existed)'
    },

    // Restoration eligibility
    restore_eligible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether user is eligible for role restoration upon linking'
    },

    restore_expiry: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When restoration eligibility expires (null = no expiry)'
    },

    restored: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether roles have been restored'
    },

    restored_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When roles were restored'
    },

    restored_by_user_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Discord ID of admin who approved restoration'
    },

    // Additional metadata
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the removal/restoration'
    },

    // Notes
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes about this archive entry'
    },

    // Timestamps
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When the roles were removed'
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When this record was last updated'
    }
  }, {
    tableName: 'staff_role_archives',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      {
        name: 'idx_staff_archive_discord_user_id',
        fields: ['discord_user_id']
      },
      {
        name: 'idx_staff_archive_removed_by',
        fields: ['removed_by_user_id']
      },
      {
        name: 'idx_staff_archive_removal_type',
        fields: ['removal_type']
      },
      {
        name: 'idx_staff_archive_prior_link_status',
        fields: ['prior_link_status']
      },
      {
        name: 'idx_staff_archive_restore_eligible',
        fields: ['restore_eligible']
      },
      {
        name: 'idx_staff_archive_restored',
        fields: ['restored']
      },
      {
        name: 'idx_staff_archive_created_at',
        fields: ['created_at']
      },
      {
        name: 'idx_staff_archive_approval_id',
        fields: ['scrub_approval_id']
      },
      {
        // Composite index for active restoration candidates
        name: 'idx_staff_archive_restore_lookup',
        fields: ['discord_user_id', 'restore_eligible', 'restored']
      },
      {
        // Composite index for scrub operations
        name: 'idx_staff_archive_scrub_date',
        fields: ['removal_type', 'created_at']
      }
    ],
    comment: 'Archive of staff roles removed during scrubbing operations'
  });

  // Instance methods
  StaffRoleArchive.prototype.isEligibleForRestore = function() {
    if (!this.restore_eligible || this.restored) {
      return false;
    }

    if (this.restore_expiry && new Date() > new Date(this.restore_expiry)) {
      return false;
    }

    return true;
  };

  StaffRoleArchive.prototype.getHighestRole = function() {
    if (!this.removed_roles || this.removed_roles.length === 0) {
      return null;
    }

    // Roles should already be sorted by priority, but just in case
    const sorted = this.removed_roles.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sorted[0];
  };

  StaffRoleArchive.prototype.getRoleNames = function() {
    if (!this.removed_roles || this.removed_roles.length === 0) {
      return [];
    }

    return this.removed_roles.map(role => role.name);
  };

  StaffRoleArchive.prototype.getFormattedRemovalDate = function() {
    return new Date(this.created_at).toLocaleString();
  };

  // Static methods
  StaffRoleArchive.createArchive = async function(archiveData) {
    try {
      const archive = await this.create({
        ...archiveData,
        created_at: new Date(),
        updated_at: new Date()
      });
      return archive;
    } catch (error) {
      const { console: loggerConsole } = require('../../utils/logger');
      loggerConsole.error('Failed to create staff role archive entry:', error);
      throw error;
    }
  };

  StaffRoleArchive.findByDiscordId = async function(discordUserId) {
    return await this.findAll({
      where: { discord_user_id: discordUserId },
      order: [['created_at', 'DESC']]
    });
  };

  StaffRoleArchive.findLatestByDiscordId = async function(discordUserId) {
    return await this.findOne({
      where: { discord_user_id: discordUserId },
      order: [['created_at', 'DESC']]
    });
  };

  StaffRoleArchive.findEligibleForRestore = async function(discordUserId) {
    return await this.findAll({
      where: {
        discord_user_id: discordUserId,
        restore_eligible: true,
        restored: false,
        [Op.or]: [
          { restore_expiry: null },
          { restore_expiry: { [Op.gt]: new Date() } }
        ]
      },
      order: [['created_at', 'DESC']]
    });
  };

  StaffRoleArchive.findByApprovalId = async function(approvalId) {
    return await this.findAll({
      where: { scrub_approval_id: approvalId },
      order: [['created_at', 'ASC']]
    });
  };

  StaffRoleArchive.findByRemovalType = async function(removalType, limit = 100) {
    return await this.findAll({
      where: { removal_type: removalType },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  StaffRoleArchive.findRecentRemovals = async function(hours = 24, limit = 100) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await this.findAll({
      where: {
        created_at: { [Op.gte]: cutoff }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  };

  StaffRoleArchive.markAsRestored = async function(archiveId, restoredBy) {
    const archive = await this.findByPk(archiveId);
    if (!archive) {
      throw new Error('Archive entry not found');
    }

    archive.restored = true;
    archive.restored_at = new Date();
    archive.restored_by_user_id = restoredBy.userId;
    archive.updated_at = new Date();

    if (archive.metadata) {
      archive.metadata.restored_by_username = restoredBy.username;
    } else {
      archive.metadata = { restored_by_username: restoredBy.username };
    }

    await archive.save();
    return archive;
  };

  StaffRoleArchive.getStatistics = async function(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [total, eligible, restored] = await Promise.all([
      this.count({
        where: { created_at: { [Op.gte]: cutoff } }
      }),
      this.count({
        where: {
          created_at: { [Op.gte]: cutoff },
          restore_eligible: true,
          restored: false
        }
      }),
      this.count({
        where: {
          created_at: { [Op.gte]: cutoff },
          restored: true
        }
      })
    ]);

    return {
      total,
      eligible,
      restored,
      notEligible: total - eligible - restored
    };
  };

  return StaffRoleArchive;
};
