'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('role_permissions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      permission_name: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Permission identifier (e.g., VIEW_WHITELIST)'
      },
      role_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord role ID'
      },
      role_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached role name for display'
      },
      granted_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who granted this permission'
      },
      granted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When permission was granted'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Add indexes
    await queryInterface.addIndex('role_permissions', ['permission_name'], {
      name: 'idx_role_permissions_permission_name'
    });

    await queryInterface.addIndex('role_permissions', ['role_id'], {
      name: 'idx_role_permissions_role_id'
    });

    // Add unique constraint for permission_name + role_id combination
    await queryInterface.addIndex('role_permissions', ['permission_name', 'role_id'], {
      name: 'idx_role_permissions_unique',
      unique: true
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('role_permissions');
  }
};
