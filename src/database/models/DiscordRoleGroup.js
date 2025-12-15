const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DiscordRoleGroup = sequelize.define('DiscordRoleGroup', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    group_key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Unique identifier for helper function lookups (e.g., admin_roles)'
    },
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Human-readable name for dashboard display'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the group purpose'
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Order for dashboard display (lower = higher)'
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
      comment: 'Hex color for UI display (e.g., #FF5733)'
    },
    is_system_group: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'If true, group cannot be deleted'
    },
    security_critical: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'If true, group must have at least one role'
    },
    created_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Discord user ID who created this group'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When group was created'
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
      comment: 'When group was last modified'
    }
  }, {
    tableName: 'discord_role_groups',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['group_key'], unique: true },
      { fields: ['display_order'] }
    ]
  });

  /**
   * Get all groups ordered by display_order
   * @returns {Promise<Array>}
   */
  DiscordRoleGroup.getAllGroups = async function() {
    return this.findAll({
      order: [['display_order', 'ASC'], ['display_name', 'ASC']]
    });
  };

  /**
   * Get a group by its key
   * @param {string} groupKey - Group key (e.g., 'admin_roles')
   * @returns {Promise<Object|null>}
   */
  DiscordRoleGroup.getByKey = async function(groupKey) {
    return this.findOne({
      where: { group_key: groupKey }
    });
  };

  /**
   * Create a new group
   * @param {Object} data - Group data
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<Object>}
   */
  DiscordRoleGroup.createGroup = async function(data, createdBy = null) {
    return this.create({
      group_key: data.groupKey,
      display_name: data.displayName,
      description: data.description || null,
      display_order: data.displayOrder || 0,
      color: data.color || null,
      is_system_group: data.isSystemGroup || false,
      security_critical: data.securityCritical || false,
      created_by: createdBy,
      created_at: new Date(),
      updated_by: createdBy,
      updated_at: new Date()
    });
  };

  /**
   * Update a group
   * @param {number} groupId - Group ID
   * @param {Object} data - Update data
   * @param {string} [updatedBy] - Discord user ID
   * @returns {Promise<boolean>}
   */
  DiscordRoleGroup.updateGroup = async function(groupId, data, updatedBy = null) {
    const updateData = { updated_by: updatedBy, updated_at: new Date() };

    if (data.groupKey !== undefined) updateData.group_key = data.groupKey;
    if (data.displayName !== undefined) updateData.display_name = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.displayOrder !== undefined) updateData.display_order = data.displayOrder;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.securityCritical !== undefined) updateData.security_critical = data.securityCritical;

    const [updated] = await this.update(updateData, {
      where: { id: groupId }
    });
    return updated > 0;
  };

  /**
   * Delete a group (if not system group)
   * @param {number} groupId - Group ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  DiscordRoleGroup.deleteGroup = async function(groupId) {
    const group = await this.findByPk(groupId);

    if (!group) {
      return { success: false, error: 'Group not found' };
    }

    if (group.is_system_group) {
      return { success: false, error: 'Cannot delete system group' };
    }

    await group.destroy();
    return { success: true };
  };

  /**
   * Seed default groups from config
   * @param {string} [createdBy] - Discord user ID
   * @returns {Promise<number>} Number of groups created
   */
  DiscordRoleGroup.seedDefaultGroups = async function(createdBy = null) {
    const defaultGroups = [
      { group_key: 'admin_roles', display_name: 'Admin Roles', display_order: 10, is_system_group: true, security_critical: true, description: 'Administrative roles with elevated permissions' },
      { group_key: 'staff_roles', display_name: 'Staff Roles', display_order: 20, is_system_group: true, security_critical: true, description: 'Staff members with moderation access' },
      { group_key: 'tutor_roles', display_name: 'Tutor Roles', display_order: 30, is_system_group: true, security_critical: false, description: 'Tutor program roles' },
      { group_key: 'specialty_roles', display_name: 'Specialty Roles', display_order: 40, is_system_group: true, security_critical: false, description: 'Tutor specialty designations' },
      { group_key: 'whitelist_award_roles', display_name: 'Whitelist Awards', display_order: 50, is_system_group: true, security_critical: false, description: 'Roles that grant whitelist access as rewards' },
      { group_key: 'member_roles', display_name: 'Member Roles', display_order: 60, is_system_group: true, security_critical: false, description: 'General member roles' },
      { group_key: 'duty_roles', display_name: 'Duty Roles', display_order: 70, is_system_group: true, security_critical: false, description: 'On-duty status indicator roles' },
      { group_key: 'system_roles', display_name: 'System Roles', display_order: 80, is_system_group: true, security_critical: false, description: 'System and utility roles' }
    ];

    let count = 0;
    for (const group of defaultGroups) {
      const [, created] = await this.findOrCreate({
        where: { group_key: group.group_key },
        defaults: {
          ...group,
          created_by: createdBy,
          created_at: new Date(),
          updated_by: createdBy,
          updated_at: new Date()
        }
      });
      if (created) count++;
    }

    return count;
  };

  return DiscordRoleGroup;
};
