'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('discord_roles', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      role_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Discord role snowflake ID'
      },
      role_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached Discord role name for display'
      },
      role_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Code reference key (e.g., SUPER_ADMIN, MEMBER)'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional description of the role purpose'
      },
      group_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'discord_role_groups',
          key: 'id'
        },
        onDelete: 'SET NULL',
        comment: 'FK to discord_role_groups'
      },
      is_system_role: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'If true, role cannot be deleted'
      },
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who added this role'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When role was added'
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
        comment: 'When role was last modified'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add index on role_id (unique constraint already added above)
    await queryInterface.addIndex('discord_roles', ['role_id'], {
      name: 'idx_discord_roles_role_id'
    });

    // Add index on role_key (unique constraint already added above)
    await queryInterface.addIndex('discord_roles', ['role_key'], {
      name: 'idx_discord_roles_role_key'
    });

    // Add index on group_id for group lookups
    await queryInterface.addIndex('discord_roles', ['group_id'], {
      name: 'idx_discord_roles_group_id'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('discord_roles');
  }
};
