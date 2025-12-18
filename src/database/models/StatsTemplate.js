const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const StatsTemplate = sequelize.define('StatsTemplate', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Template identifier (used in code/API)'
    },
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Human-readable template name'
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Image filename in assets/stats-templates/'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether template is available for use'
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this is the default template'
    },
    // Box positioning
    box_width: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 800
    },
    box_height: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 420
    },
    box_x: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'X position (null = auto right-aligned)'
    },
    box_y: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Y position (null = auto centered)'
    },
    right_margin: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 80
    },
    // Text styling
    padding: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25
    },
    title_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 28
    },
    label_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 18
    },
    value_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 26
    },
    row_gap: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12
    },
    top_gap: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 40
    },
    section_gap: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 40
    },
    // Metadata
    created_by: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_by: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'stats_templates',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      { fields: ['name'], unique: true },
      { fields: ['is_active'] },
      { fields: ['is_default'] }
    ]
  });

  /**
   * Get all active templates
   * @returns {Promise<Array>} Array of template configs
   */
  StatsTemplate.getAllActive = async function() {
    const templates = await this.findAll({
      where: { is_active: true },
      order: [['display_name', 'ASC']]
    });
    return templates.map(t => t.toConfig());
  };

  /**
   * Get all templates (including inactive)
   * @returns {Promise<Array>} Array of template configs
   */
  StatsTemplate.getAll = async function() {
    const templates = await this.findAll({
      order: [['display_name', 'ASC']]
    });
    return templates.map(t => t.toConfig());
  };

  /**
   * Get template by name
   * @param {string} name - Template name
   * @returns {Promise<Object|null>} Template config or null
   */
  StatsTemplate.getByName = async function(name) {
    const template = await this.findOne({
      where: { name }
    });
    return template ? template.toConfig() : null;
  };

  /**
   * Get the default template
   * @returns {Promise<Object|null>} Default template config or null
   */
  StatsTemplate.getDefault = async function() {
    const template = await this.findOne({
      where: { is_default: true, is_active: true }
    });
    return template ? template.toConfig() : null;
  };

  /**
   * Get a random active template
   * @returns {Promise<Object|null>} Random template config or null
   */
  StatsTemplate.getRandom = async function() {
    const templates = await this.findAll({
      where: { is_active: true }
    });
    if (templates.length === 0) return null;
    const random = templates[Math.floor(Math.random() * templates.length)];
    return random.toConfig();
  };

  /**
   * Set a template as the default (clears others)
   * @param {number} templateId - Template ID to set as default
   * @returns {Promise<boolean>} Success
   */
  StatsTemplate.setDefault = async function(templateId) {
    const transaction = await sequelize.transaction();
    try {
      // Clear existing default
      await this.update(
        { is_default: false },
        { where: { is_default: true }, transaction }
      );
      // Set new default (and ensure it's active)
      const [updated] = await this.update(
        { is_default: true, is_active: true },
        { where: { id: templateId }, transaction }
      );
      await transaction.commit();
      return updated > 0;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  /**
   * Instance method to convert to config format
   * @returns {Object} Config object for StatsImageService
   */
  StatsTemplate.prototype.toConfig = function() {
    return {
      id: this.id,
      name: this.name,
      displayName: this.display_name,
      filename: this.filename,
      isActive: this.is_active,
      isDefault: this.is_default,
      // Box config (used by StatsImageService)
      boxWidth: this.box_width,
      boxHeight: this.box_height,
      boxX: this.box_x,
      boxY: this.box_y,
      rightMargin: this.right_margin,
      padding: this.padding,
      titleSize: this.title_size,
      labelSize: this.label_size,
      valueSize: this.value_size,
      rowGap: this.row_gap,
      topGap: this.top_gap,
      sectionGap: this.section_gap,
      // Metadata
      createdBy: this.created_by,
      createdAt: this.created_at,
      updatedBy: this.updated_by,
      updatedAt: this.updated_at
    };
  };

  /**
   * Create or update a template from config data
   * @param {Object} config - Template configuration
   * @param {string} [userId] - User ID making the change
   * @returns {Promise<Object>} Created/updated template config
   */
  StatsTemplate.upsertFromConfig = async function(config, userId = null) {
    const data = {
      display_name: config.displayName,
      filename: config.filename,
      is_active: config.isActive !== false,
      is_default: config.isDefault || false,
      box_width: config.boxWidth || 800,
      box_height: config.boxHeight || 420,
      box_x: config.boxX ?? null,
      box_y: config.boxY ?? null,
      right_margin: config.rightMargin || 80,
      padding: config.padding || 25,
      title_size: config.titleSize || 28,
      label_size: config.labelSize || 18,
      value_size: config.valueSize || 26,
      row_gap: config.rowGap || 12,
      top_gap: config.topGap || 40,
      section_gap: config.sectionGap || 40,
      updated_by: userId,
      updated_at: new Date()
    };

    const [template, created] = await this.findOrCreate({
      where: { name: config.name },
      defaults: {
        ...data,
        name: config.name,
        created_by: userId,
        created_at: new Date()
      }
    });

    if (!created) {
      await template.update(data);
    }

    return template.toConfig();
  };

  return StatsTemplate;
};
