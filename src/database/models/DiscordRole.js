const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DiscordRole = sequelize.define('DiscordRole', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    role_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: 'Discord role snowflake ID'
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Cached Discord role name for display'
    },
    role_key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Code reference key (e.g., SUPER_ADMIN, MEMBER)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the role purpose'
    },
    is_system_role: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'If true, role cannot be deleted'
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
    tableName: 'discord_roles',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['role_id'], unique: true },
      { fields: ['role_key'], unique: true }
    ]
  });

  /**
   * Get all roles with their group info
   * @returns {Promise<Array>}
   */
  DiscordRole.getAllRoles = async function() {
    return this.findAll({
      order: [['role_key', 'ASC']]
    });
  };

  /**
   * Get a role by Discord role ID
   * @param {string} roleId - Discord role snowflake ID
   * @returns {Promise<Object|null>}
   */
  DiscordRole.getByRoleId = async function(roleId) {
    return this.findOne({
      where: { role_id: roleId }
    });
  };

  /**
   * Get a role by its key
   * @param {string} roleKey - Role key (e.g., 'MEMBER', 'SUPER_ADMIN')
   * @returns {Promise<Object|null>}
   */
  DiscordRole.getByKey = async function(roleKey) {
    return this.findOne({
      where: { role_key: roleKey }
    });
  };

  /**
   * Get all roles in a specific group (via junction table)
   * @param {number} groupId - Group ID
   * @returns {Promise<Array>}
   */
  DiscordRole.getByGroupId = async function(groupId) {
    const { DiscordRoleGroupMember } = require('./index');
    const roleIds = await DiscordRoleGroupMember.getRolesForGroup(groupId);
    if (roleIds.length === 0) return [];
    return this.findAll({
      where: { id: roleIds },
      order: [['role_key', 'ASC']]
    });
  };

  /**
   * Get all Discord role IDs in a specific group (via junction table)
   * @param {number} groupId - Group ID
   * @returns {Promise<string[]>}
   */
  DiscordRole.getRoleIdsByGroupId = async function(groupId) {
    const roles = await this.getByGroupId(groupId);
    return roles.map(r => r.role_id);
  };

  /**
   * Create a new role entry
   * @param {Object} data - Role data
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<Object>}
   */
  DiscordRole.createRole = async function(data, createdBy = null) {
    const role = await this.create({
      role_id: data.roleId,
      role_name: data.roleName || null,
      role_key: data.roleKey,
      description: data.description || null,
      is_system_role: data.isSystemRole || false,
      created_by: createdBy,
      created_at: new Date(),
      updated_by: createdBy,
      updated_at: new Date()
    });

    // If groupIds provided, add to those groups
    if (data.groupIds && data.groupIds.length > 0) {
      const { DiscordRoleGroupMember } = require('./index');
      await DiscordRoleGroupMember.setGroupsForRole(role.id, data.groupIds, createdBy);
    }

    return role;
  };

  /**
   * Update a role
   * @param {string} roleId - Discord role ID
   * @param {Object} data - Update data
   * @param {string} [updatedBy] - Discord user ID
   * @returns {Promise<boolean>}
   */
  DiscordRole.updateRole = async function(roleId, data, updatedBy = null) {
    const updateData = { updated_by: updatedBy, updated_at: new Date() };

    if (data.roleName !== undefined) updateData.role_name = data.roleName;
    if (data.roleKey !== undefined) updateData.role_key = data.roleKey;
    if (data.description !== undefined) updateData.description = data.description;

    const [updated] = await this.update(updateData, {
      where: { role_id: roleId }
    });

    // Handle group membership updates
    if (data.groupIds !== undefined) {
      const role = await this.findOne({ where: { role_id: roleId } });
      if (role) {
        const { DiscordRoleGroupMember } = require('./index');
        await DiscordRoleGroupMember.setGroupsForRole(role.id, data.groupIds, updatedBy);
      }
    }

    return updated > 0;
  };

  /**
   * Update cached role name
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - New role name
   * @returns {Promise<boolean>}
   */
  DiscordRole.updateRoleName = async function(roleId, roleName) {
    const [updated] = await this.update(
      { role_name: roleName, updated_at: new Date() },
      { where: { role_id: roleId } }
    );
    return updated > 0;
  };

  /**
   * Delete a role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  DiscordRole.deleteRole = async function(roleId) {
    const role = await this.findOne({
      where: { role_id: roleId }
    });

    if (!role) {
      return { success: false, error: 'Role not found' };
    }

    await role.destroy();
    return { success: true };
  };

  /**
   * Seed roles from config file
   * @param {Object} discordRoles - DISCORD_ROLES object from config
   * @param {Object} groupMapping - Map of role keys to group ID or array of group IDs
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<number>} Number of roles created
   */
  DiscordRole.seedFromConfig = async function(discordRoles, groupMapping, createdBy = null) {
    const { DiscordRoleGroupMember } = require('./index');
    let count = 0;

    for (const [roleKey, roleId] of Object.entries(discordRoles)) {
      const [role, created] = await this.findOrCreate({
        where: { role_id: roleId },
        defaults: {
          role_key: roleKey,
          role_name: roleKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          is_system_role: true,
          created_by: createdBy,
          created_at: new Date(),
          updated_by: createdBy,
          updated_at: new Date()
        }
      });

      // Handle group membership (supports single ID or array of IDs)
      const groupIds = groupMapping[roleKey];
      if (groupIds) {
        const groupIdArray = Array.isArray(groupIds) ? groupIds : [groupIds];
        if (created) {
          // New role - set all groups
          await DiscordRoleGroupMember.setGroupsForRole(role.id, groupIdArray, createdBy);
        }
      }

      if (created) count++;
    }

    return count;
  };

  return DiscordRole;
};
