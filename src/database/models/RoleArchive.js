const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const RoleArchive = sequelize.define('RoleArchive', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    discord_username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discord_display_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    previous_nickname: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: 'Nickname at time of removal for restoration'
    },
    removed_roles: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Array of {id, name} objects'
    },
    removal_reason: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'purge_unlinked, inactive, manual'
    },
    removal_source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'web'
    },
    removed_by_user_id: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    removed_by_username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    restored: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    restored_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    restored_by_user_id: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'role_archives',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['discord_user_id'] },
      { fields: ['expires_at'] },
      { fields: ['restored'] },
      { fields: ['removal_reason'] },
      { fields: ['discord_user_id', 'restored', 'expires_at'] }
    ]
  });

  /**
   * Archive roles for a user before removal
   * @param {string} discordUserId - Discord user ID
   * @param {string} username - Discord username
   * @param {string} displayName - Discord display name
   * @param {Array<{id: string, name: string}>} roles - Roles being removed
   * @param {string} reason - Reason for removal (purge_unlinked, inactive, manual)
   * @param {Object} removedBy - {userId, username} of admin who initiated (null for system)
   * @param {number} expiryDays - Days until archive expires (default 30)
   * @param {string|null} nickname - User's nickname at time of removal (for restoration)
   * @returns {Promise<RoleArchive>}
   */
  RoleArchive.archiveRoles = async function(discordUserId, username, displayName, roles, reason, removedBy = null, expiryDays = 30, nickname = null) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    return await this.create({
      discord_user_id: discordUserId,
      discord_username: username,
      discord_display_name: displayName,
      previous_nickname: nickname,
      removed_roles: roles,
      removal_reason: reason,
      removal_source: removedBy ? 'web' : 'system',
      removed_by_user_id: removedBy?.userId || null,
      removed_by_username: removedBy?.username || null,
      expires_at: expiresAt,
      restored: false,
      metadata: {
        archived_at: new Date().toISOString(),
        role_count: roles.length
      }
    });
  };

  /**
   * Find active (non-expired, non-restored) archive for a user
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<RoleArchive|null>}
   */
  RoleArchive.findActiveArchive = async function(discordUserId) {
    return await this.findOne({
      where: {
        discord_user_id: discordUserId,
        restored: false,
        expires_at: {
          [Op.gt]: new Date()
        }
      },
      order: [['created_at', 'DESC']]
    });
  };

  /**
   * Get all expired archives that haven't been cleaned up
   * @returns {Promise<Array<RoleArchive>>}
   */
  RoleArchive.getExpiredArchives = async function() {
    return await this.findAll({
      where: {
        restored: false,
        expires_at: {
          [Op.lt]: new Date()
        }
      }
    });
  };

  /**
   * Mark an archive as restored
   * @param {number} archiveId - Archive ID
   * @param {string} restoredByUserId - Discord user ID who restored
   * @returns {Promise<[number, Array<RoleArchive>]>}
   */
  RoleArchive.markRestored = async function(archiveId, restoredByUserId) {
    return await this.update(
      {
        restored: true,
        restored_at: new Date(),
        restored_by_user_id: restoredByUserId
      },
      {
        where: { id: archiveId }
      }
    );
  };

  /**
   * Get archive history for a user
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<Array<RoleArchive>>}
   */
  RoleArchive.getHistoryForUser = async function(discordUserId) {
    return await this.findAll({
      where: { discord_user_id: discordUserId },
      order: [['created_at', 'DESC']]
    });
  };

  // Instance methods

  /**
   * Check if this archive has expired
   * @returns {boolean}
   */
  RoleArchive.prototype.isExpired = function() {
    return new Date() > this.expires_at;
  };

  /**
   * Get array of role IDs from the archive
   * @returns {Array<string>}
   */
  RoleArchive.prototype.getRoleIds = function() {
    if (!this.removed_roles || !Array.isArray(this.removed_roles)) {
      return [];
    }
    return this.removed_roles.map(role => role.id);
  };

  /**
   * Get array of role names from the archive
   * @returns {Array<string>}
   */
  RoleArchive.prototype.getRoleNames = function() {
    if (!this.removed_roles || !Array.isArray(this.removed_roles)) {
      return [];
    }
    return this.removed_roles.map(role => role.name);
  };

  /**
   * Check if this archive can be restored
   * @returns {boolean}
   */
  RoleArchive.prototype.canRestore = function() {
    return !this.restored && !this.isExpired();
  };

  return RoleArchive;
};
