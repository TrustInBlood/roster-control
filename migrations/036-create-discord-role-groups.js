'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('discord_role_groups', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      group_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Unique identifier for helper function lookups (e.g., admin_roles)'
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Human-readable name for dashboard display'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional description of the group purpose'
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order for dashboard display (lower = higher)'
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        comment: 'Hex color for UI display (e.g., #FF5733)'
      },
      is_system_group: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'If true, group cannot be deleted'
      },
      security_critical: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'If true, group must have at least one role'
      },
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who created this group'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When group was created'
      },
      updated_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who last modified'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: 'When group was last modified'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add index on group_key (unique constraint already added above)
    await queryInterface.addIndex('discord_role_groups', ['group_key'], {
      name: 'idx_discord_role_groups_group_key'
    });

    // Add index on display_order for sorted queries
    await queryInterface.addIndex('discord_role_groups', ['display_order'], {
      name: 'idx_discord_role_groups_display_order'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('discord_role_groups');
  }
};
