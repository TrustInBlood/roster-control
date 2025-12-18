'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create stats_templates table
    await queryInterface.createTable('stats_templates', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Template identifier (used in code/API)'
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Human-readable template name'
      },
      filename: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Image filename in assets/stats-templates/'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether template is available for use'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether this is the default template (only one can be true)'
      },
      // Box positioning
      box_width: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 800,
        comment: 'Width of the stats overlay box'
      },
      box_height: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 420,
        comment: 'Height of the stats overlay box'
      },
      box_x: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'X position of box (null = auto right-aligned)'
      },
      box_y: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'Y position of box (null = auto centered)'
      },
      right_margin: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 80,
        comment: 'Right margin when box_x is null'
      },
      // Text styling
      padding: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 25,
        comment: 'Internal padding within the box'
      },
      title_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 28,
        comment: 'Font size for player name'
      },
      label_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 18,
        comment: 'Font size for stat labels'
      },
      value_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 26,
        comment: 'Font size for stat values'
      },
      row_gap: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 12,
        comment: 'Vertical gap between rows'
      },
      top_gap: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 40,
        comment: 'Gap from divider to first stat row'
      },
      section_gap: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 40,
        comment: 'Gap between stat sections'
      },
      // Metadata
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who created this template'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who last modified'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes for stats_templates
    await queryInterface.addIndex('stats_templates', ['name'], {
      name: 'idx_stats_templates_name',
      unique: true
    });
    await queryInterface.addIndex('stats_templates', ['is_active'], {
      name: 'idx_stats_templates_active'
    });
    await queryInterface.addIndex('stats_templates', ['is_default'], {
      name: 'idx_stats_templates_default'
    });

    // Create stats_template_role_mappings table
    await queryInterface.createTable('stats_template_role_mappings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      template_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'stats_templates',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'Reference to stats_templates.id'
      },
      role_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Discord role ID (each role maps to one template)'
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Priority order (higher = checked first)'
      },
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who created this mapping'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes for role mappings
    await queryInterface.addIndex('stats_template_role_mappings', ['template_id'], {
      name: 'idx_stats_role_mappings_template'
    });
    await queryInterface.addIndex('stats_template_role_mappings', ['role_id'], {
      name: 'idx_stats_role_mappings_role',
      unique: true
    });
    await queryInterface.addIndex('stats_template_role_mappings', ['priority'], {
      name: 'idx_stats_role_mappings_priority'
    });
  },

  down: async (queryInterface) => {
    // Drop tables in reverse order (child first due to foreign key)
    await queryInterface.dropTable('stats_template_role_mappings');
    await queryInterface.dropTable('stats_templates');
  }
};
