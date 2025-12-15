const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SquadRolePermission = sequelize.define('SquadRolePermission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    role_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: 'Discord role ID (unique - each role is its own group)'
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Cached Discord role name for display'
    },
    group_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Squad group name (defaults to role name if not set)'
    },
    permissions: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Comma-separated Squad permissions'
    },
    created_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Discord user ID who added this role'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When role was added'
    },
    updated_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Discord user ID who last modified'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When role was last modified'
    }
  }, {
    tableName: 'squad_role_permissions',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['role_id'], unique: true },
      { fields: ['group_name'] }
    ]
  });

  /**
   * Get all role configurations
   * @returns {Promise<Array>} Array of role configs
   */
  SquadRolePermission.getAllMappings = async function() {
    const entries = await this.findAll({
      order: [['role_name', 'ASC']]
    });

    return entries.map(entry => ({
      roleId: entry.role_id,
      roleName: entry.role_name,
      groupName: entry.group_name || entry.role_name,
      permissions: entry.permissions ? entry.permissions.split(',').filter(p => p.trim()) : [],
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      updatedBy: entry.updated_by,
      updatedAt: entry.updated_at
    }));
  };

  /**
   * Get configuration for a specific Discord role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<Object|null>} Role config or null
   */
  SquadRolePermission.getByRoleId = async function(roleId) {
    const entry = await this.findOne({
      where: { role_id: roleId }
    });

    if (!entry) return null;

    return {
      roleId: entry.role_id,
      roleName: entry.role_name,
      groupName: entry.group_name || entry.role_name,
      permissions: entry.permissions ? entry.permissions.split(',').filter(p => p.trim()) : [],
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      updatedBy: entry.updated_by,
      updatedAt: entry.updated_at
    };
  };

  /**
   * Get group name for a specific Discord role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<string|null>} Group name or null
   */
  SquadRolePermission.getGroupNameByRoleId = async function(roleId) {
    const entry = await this.findOne({
      where: { role_id: roleId },
      attributes: ['role_name', 'group_name']
    });

    if (!entry) return null;
    return entry.group_name || entry.role_name;
  };

  /**
   * Get all tracked Discord role IDs (roles with Squad permissions)
   * @returns {Promise<string[]>} Array of role IDs
   */
  SquadRolePermission.getTrackedRoleIds = async function() {
    const entries = await this.findAll({
      attributes: ['role_id']
    });
    return entries.map(e => e.role_id);
  };

  /**
   * Check if a role ID is tracked
   * @param {string} roleId - Discord role ID
   * @returns {Promise<boolean>}
   */
  SquadRolePermission.isTrackedRole = async function(roleId) {
    const count = await this.count({
      where: { role_id: roleId }
    });
    return count > 0;
  };

  /**
   * Set permissions for a Discord role (create or update)
   * @param {string} roleId - Discord role ID
   * @param {Object} data - Role data
   * @param {string} [data.roleName] - Discord role name
   * @param {string} [data.groupName] - Squad group name
   * @param {string[]} data.permissions - Array of permission strings
   * @param {string} [updatedBy] - Discord user ID who made the change
   * @returns {Promise<Object>} Updated/created role config
   */
  SquadRolePermission.setRolePermissions = async function(roleId, data, updatedBy = null) {
    const permissionsString = Array.isArray(data.permissions)
      ? data.permissions.join(',')
      : data.permissions;

    const [entry, created] = await this.findOrCreate({
      where: { role_id: roleId },
      defaults: {
        role_name: data.roleName || null,
        group_name: data.groupName || null,
        permissions: permissionsString,
        created_by: updatedBy,
        created_at: new Date(),
        updated_by: updatedBy,
        updated_at: new Date()
      }
    });

    if (!created) {
      // Update existing entry
      await entry.update({
        role_name: data.roleName !== undefined ? data.roleName : entry.role_name,
        group_name: data.groupName !== undefined ? data.groupName : entry.group_name,
        permissions: permissionsString,
        updated_by: updatedBy,
        updated_at: new Date()
      });
    }

    return {
      roleId: entry.role_id,
      roleName: entry.role_name,
      groupName: entry.group_name || entry.role_name,
      permissions: entry.permissions ? entry.permissions.split(',').filter(p => p.trim()) : [],
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      updatedBy: entry.updated_by,
      updatedAt: entry.updated_at,
      isNew: created
    };
  };

  /**
   * Remove a role from the system
   * @param {string} roleId - Discord role ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  SquadRolePermission.removeRole = async function(roleId) {
    const deleted = await this.destroy({
      where: { role_id: roleId }
    });
    return deleted > 0;
  };

  /**
   * Update cached role name for a role
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - New role name
   * @returns {Promise<boolean>} True if updated
   */
  SquadRolePermission.updateRoleName = async function(roleId, roleName) {
    const [updated] = await this.update(
      { role_name: roleName, updated_at: new Date() },
      { where: { role_id: roleId } }
    );
    return updated > 0;
  };

  /**
   * Get all mappings as SQUAD_GROUPS format for backward compatibility
   * Returns format: { GroupName: { permissions: string, discordRoles: string[] } }
   * @returns {Promise<Object>}
   */
  SquadRolePermission.getSquadGroupsFormat = async function() {
    const entries = await this.findAll();
    const groups = {};

    for (const entry of entries) {
      const groupName = entry.group_name || entry.role_name || `Role_${entry.role_id}`;

      // Each role is its own group in 1:1 mapping
      groups[groupName] = {
        permissions: entry.permissions || '',
        discordRoles: [entry.role_id]
      };
    }

    return groups;
  };

  /**
   * Bulk create/update from config format
   * @param {Object} squadGroups - SQUAD_GROUPS format object
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<number>} Number of roles created/updated
   */
  SquadRolePermission.seedFromConfig = async function(squadGroups, createdBy = null) {
    const transaction = await sequelize.transaction();
    let count = 0;

    try {
      for (const [groupName, groupData] of Object.entries(squadGroups)) {
        for (const roleId of groupData.discordRoles) {
          await this.findOrCreate({
            where: { role_id: roleId },
            defaults: {
              role_name: groupName, // Use group name as initial role name
              group_name: groupName,
              permissions: groupData.permissions,
              created_by: createdBy,
              created_at: new Date(),
              updated_by: createdBy,
              updated_at: new Date()
            },
            transaction
          });
          count++;
        }
      }

      await transaction.commit();
      return count;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  return SquadRolePermission;
};
