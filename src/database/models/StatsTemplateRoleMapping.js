const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StatsTemplateRoleMapping = sequelize.define('StatsTemplateRoleMapping', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    template_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stats_templates',
        key: 'id'
      },
      comment: 'Reference to stats_templates.id'
    },
    role_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: 'Discord role ID'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Priority order (higher = checked first)'
    },
    created_by: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'stats_template_role_mappings',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['template_id'] },
      { fields: ['role_id'], unique: true },
      { fields: ['priority'] }
    ]
  });

  /**
   * Get all role mappings with template info
   * @returns {Promise<Array>} Array of mappings with template data
   */
  StatsTemplateRoleMapping.getAllWithTemplates = async function() {
    const StatsTemplate = sequelize.models.StatsTemplate;
    const mappings = await this.findAll({
      include: [{
        model: StatsTemplate,
        as: 'template'
      }],
      order: [['priority', 'DESC'], ['created_at', 'ASC']]
    });

    return mappings.map(m => ({
      id: m.id,
      roleId: m.role_id,
      templateId: m.template_id,
      templateName: m.template?.name || null,
      templateDisplayName: m.template?.display_name || null,
      priority: m.priority,
      createdBy: m.created_by,
      createdAt: m.created_at
    }));
  };

  /**
   * Get template for a set of role IDs (highest priority match)
   * @param {string[]} roleIds - Array of Discord role IDs
   * @returns {Promise<Object|null>} Template config or null
   */
  StatsTemplateRoleMapping.getTemplateForRoles = async function(roleIds) {
    if (!roleIds || roleIds.length === 0) return null;

    const StatsTemplate = sequelize.models.StatsTemplate;
    const mapping = await this.findOne({
      where: {
        role_id: roleIds
      },
      include: [{
        model: StatsTemplate,
        as: 'template',
        where: { is_active: true }
      }],
      order: [['priority', 'DESC']]
    });

    if (!mapping || !mapping.template) return null;
    return mapping.template.toConfig();
  };

  /**
   * Get mapping by role ID
   * @param {string} roleId - Discord role ID
   * @returns {Promise<Object|null>} Mapping object or null
   */
  StatsTemplateRoleMapping.getByRoleId = async function(roleId) {
    const mapping = await this.findOne({
      where: { role_id: roleId }
    });

    if (!mapping) return null;

    return {
      id: mapping.id,
      roleId: mapping.role_id,
      templateId: mapping.template_id,
      priority: mapping.priority,
      createdBy: mapping.created_by,
      createdAt: mapping.created_at
    };
  };

  /**
   * Set template mapping for a role
   * @param {string} roleId - Discord role ID
   * @param {number} templateId - Template ID
   * @param {number} [priority=0] - Priority (higher = checked first)
   * @param {string} [createdBy] - User ID creating the mapping
   * @returns {Promise<Object>} Created/updated mapping
   */
  StatsTemplateRoleMapping.setMapping = async function(roleId, templateId, priority = 0, createdBy = null) {
    const [mapping, created] = await this.findOrCreate({
      where: { role_id: roleId },
      defaults: {
        template_id: templateId,
        priority,
        created_by: createdBy,
        created_at: new Date()
      }
    });

    if (!created) {
      await mapping.update({
        template_id: templateId,
        priority
      });
    }

    return {
      id: mapping.id,
      roleId: mapping.role_id,
      templateId: mapping.template_id,
      priority: mapping.priority,
      createdBy: mapping.created_by,
      createdAt: mapping.created_at,
      isNew: created
    };
  };

  /**
   * Remove mapping for a role
   * @param {string} roleId - Discord role ID
   * @returns {Promise<boolean>} True if deleted
   */
  StatsTemplateRoleMapping.removeMapping = async function(roleId) {
    const deleted = await this.destroy({
      where: { role_id: roleId }
    });
    return deleted > 0;
  };

  /**
   * Get all mappings for a template
   * @param {number} templateId - Template ID
   * @returns {Promise<Array>} Array of role IDs
   */
  StatsTemplateRoleMapping.getRolesForTemplate = async function(templateId) {
    const mappings = await this.findAll({
      where: { template_id: templateId },
      attributes: ['role_id', 'priority'],
      order: [['priority', 'DESC']]
    });
    return mappings.map(m => ({
      roleId: m.role_id,
      priority: m.priority
    }));
  };

  /**
   * Update priority for a mapping
   * @param {string} roleId - Discord role ID
   * @param {number} priority - New priority
   * @returns {Promise<boolean>} True if updated
   */
  StatsTemplateRoleMapping.updatePriority = async function(roleId, priority) {
    const [updated] = await this.update(
      { priority },
      { where: { role_id: roleId } }
    );
    return updated > 0;
  };

  return StatsTemplateRoleMapping;
};
