'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('squad_role_permissions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      role_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Discord role ID (unique - each role is its own group)'
      },
      role_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached Discord role name for display'
      },
      group_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Squad group name (defaults to role name if not set)'
      },
      permissions: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Comma-separated Squad permissions (cameraman,canseeadminchat,etc)'
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
    await queryInterface.addIndex('squad_role_permissions', ['role_id'], {
      name: 'idx_squad_role_permissions_role_id'
    });

    // Add index on group_name for lookups
    await queryInterface.addIndex('squad_role_permissions', ['group_name'], {
      name: 'idx_squad_role_permissions_group_name'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('squad_role_permissions');
  }
};
