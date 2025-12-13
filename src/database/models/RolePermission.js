const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RolePermission = sequelize.define('RolePermission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    permission_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Permission identifier (e.g., VIEW_WHITELIST)'
    },
    role_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Discord role ID'
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Cached role name for display'
    },
    granted_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Discord user ID who granted this permission'
    },
    granted_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When permission was granted'
    }
  }, {
    tableName: 'role_permissions',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['permission_name'] },
      { fields: ['role_id'] },
      {
        fields: ['permission_name', 'role_id'],
        unique: true
      }
    ]
  });

  /**
   * Get all role IDs that have a specific permission
   * @param {string} permissionName - Permission name to look up
   * @returns {Promise<string[]>} Array of role IDs
   */
  RolePermission.getRolesForPermission = async function(permissionName) {
    const entries = await this.findAll({
      where: { permission_name: permissionName },
      attributes: ['role_id']
    });
    return entries.map(e => e.role_id);
  };

  /**
   * Get all permissions with their assigned roles
   * @returns {Promise<Object>} Map of permission_name -> role_id[]
   */
  RolePermission.getAllPermissionMappings = async function() {
    const entries = await this.findAll({
      order: [['permission_name', 'ASC'], ['role_name', 'ASC']]
    });

    const mappings = {};
    for (const entry of entries) {
      if (!mappings[entry.permission_name]) {
        mappings[entry.permission_name] = [];
      }
      mappings[entry.permission_name].push({
        roleId: entry.role_id,
        roleName: entry.role_name,
        grantedBy: entry.granted_by,
        grantedAt: entry.granted_at
      });
    }
    return mappings;
  };

  /**
   * Set roles for a permission (replaces existing)
   * @param {string} permissionName - Permission name
   * @param {Array<{roleId: string, roleName: string}>} roles - Roles to assign
   * @param {string} grantedBy - Discord user ID who made the change
   * @returns {Promise<void>}
   */
  RolePermission.setRolesForPermission = async function(permissionName, roles, grantedBy) {
    const transaction = await sequelize.transaction();

    try {
      // Delete existing entries for this permission
      await this.destroy({
        where: { permission_name: permissionName },
        transaction
      });

      // Create new entries
      const entries = roles.map(role => ({
        permission_name: permissionName,
        role_id: role.roleId,
        role_name: role.roleName || null,
        granted_by: grantedBy,
        granted_at: new Date()
      }));

      if (entries.length > 0) {
        await this.bulkCreate(entries, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  /**
   * Add a single role to a permission
   * @param {string} permissionName - Permission name
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - Role name for display
   * @param {string} grantedBy - Discord user ID who made the change
   * @returns {Promise<RolePermission>}
   */
  RolePermission.addRoleToPermission = async function(permissionName, roleId, roleName, grantedBy) {
    return await this.findOrCreate({
      where: {
        permission_name: permissionName,
        role_id: roleId
      },
      defaults: {
        role_name: roleName,
        granted_by: grantedBy,
        granted_at: new Date()
      }
    });
  };

  /**
   * Remove a single role from a permission
   * @param {string} permissionName - Permission name
   * @param {string} roleId - Discord role ID
   * @returns {Promise<number>} Number of rows deleted
   */
  RolePermission.removeRoleFromPermission = async function(permissionName, roleId) {
    return await this.destroy({
      where: {
        permission_name: permissionName,
        role_id: roleId
      }
    });
  };

  /**
   * Check if a role has a specific permission
   * @param {string} roleId - Discord role ID
   * @param {string} permissionName - Permission name
   * @returns {Promise<boolean>}
   */
  RolePermission.roleHasPermission = async function(roleId, permissionName) {
    const entry = await this.findOne({
      where: {
        permission_name: permissionName,
        role_id: roleId
      }
    });
    return entry !== null;
  };

  /**
   * Get all permissions for a role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<string[]>} Array of permission names
   */
  RolePermission.getPermissionsForRole = async function(roleId) {
    const entries = await this.findAll({
      where: { role_id: roleId },
      attributes: ['permission_name']
    });
    return entries.map(e => e.permission_name);
  };

  /**
   * Update cached role name for a role across all permissions
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - New role name
   * @returns {Promise<[number]>} Number of rows updated
   */
  RolePermission.updateRoleName = async function(roleId, roleName) {
    return await this.update(
      { role_name: roleName },
      { where: { role_id: roleId } }
    );
  };

  return RolePermission;
};
