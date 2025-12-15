const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DiscordRoleGroupMember = sequelize.define('DiscordRoleGroupMember', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'discord_roles',
        key: 'id'
      },
      comment: 'FK to discord_roles'
    },
    group_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'discord_role_groups',
        key: 'id'
      },
      comment: 'FK to discord_role_groups'
    },
    added_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Discord user ID who added this role to the group'
    },
    added_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When role was added to group'
    }
  }, {
    tableName: 'discord_role_group_members',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['role_id', 'group_id'], unique: true },
      { fields: ['group_id'] },
      { fields: ['role_id'] }
    ]
  });

  /**
   * Add a role to a group
   * @param {number} roleId - Role table ID
   * @param {number} groupId - Group ID
   * @param {string} [addedBy] - Discord user ID
   * @returns {Promise<Object>}
   */
  DiscordRoleGroupMember.addRoleToGroup = async function(roleId, groupId, addedBy = null) {
    const [member, created] = await this.findOrCreate({
      where: { role_id: roleId, group_id: groupId },
      defaults: {
        added_by: addedBy,
        added_at: new Date()
      }
    });
    return { member, created };
  };

  /**
   * Remove a role from a group
   * @param {number} roleId - Role table ID
   * @param {number} groupId - Group ID
   * @returns {Promise<boolean>}
   */
  DiscordRoleGroupMember.removeRoleFromGroup = async function(roleId, groupId) {
    const deleted = await this.destroy({
      where: { role_id: roleId, group_id: groupId }
    });
    return deleted > 0;
  };

  /**
   * Get all groups for a role
   * @param {number} roleId - Role table ID
   * @returns {Promise<number[]>} Array of group IDs
   */
  DiscordRoleGroupMember.getGroupsForRole = async function(roleId) {
    const members = await this.findAll({
      where: { role_id: roleId },
      attributes: ['group_id']
    });
    return members.map(m => m.group_id);
  };

  /**
   * Get all roles for a group
   * @param {number} groupId - Group ID
   * @returns {Promise<number[]>} Array of role table IDs
   */
  DiscordRoleGroupMember.getRolesForGroup = async function(groupId) {
    const members = await this.findAll({
      where: { group_id: groupId },
      attributes: ['role_id']
    });
    return members.map(m => m.role_id);
  };

  /**
   * Set groups for a role (replaces existing)
   * @param {number} roleId - Role table ID
   * @param {number[]} groupIds - Array of group IDs
   * @param {string} [addedBy] - Discord user ID
   * @returns {Promise<void>}
   */
  DiscordRoleGroupMember.setGroupsForRole = async function(roleId, groupIds, addedBy = null) {
    // Remove existing memberships
    await this.destroy({ where: { role_id: roleId } });

    // Add new memberships
    if (groupIds && groupIds.length > 0) {
      const records = groupIds.map(groupId => ({
        role_id: roleId,
        group_id: groupId,
        added_by: addedBy,
        added_at: new Date()
      }));
      await this.bulkCreate(records);
    }
  };

  return DiscordRoleGroupMember;
};
