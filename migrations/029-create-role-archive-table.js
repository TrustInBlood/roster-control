'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('role_archives', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      discord_user_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Discord user ID whose roles were archived'
      },
      discord_username: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Discord username at time of removal'
      },
      discord_display_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Discord display name at time of removal'
      },
      removed_roles: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: 'Array of {id, name} objects representing removed roles'
      },
      removal_reason: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Reason for removal: purge_unlinked, inactive, manual'
      },
      removal_source: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'web',
        comment: 'Source of removal: web, command, system'
      },
      removed_by_user_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Discord user ID of admin who initiated removal (null for system)'
      },
      removed_by_username: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Username of admin who initiated removal'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'When the archive expires and roles can no longer be restored'
      },
      restored: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether roles have been restored'
      },
      restored_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When roles were restored'
      },
      restored_by_user_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Discord user ID who restored roles (self or admin)'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional context and data'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When roles were archived'
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Archives removed roles for potential restoration within expiry period'
    });

    // Add indexes for performance
    await queryInterface.addIndex('role_archives', ['discord_user_id'], {
      name: 'idx_role_archive_discord_user_id'
    });

    await queryInterface.addIndex('role_archives', ['expires_at'], {
      name: 'idx_role_archive_expires_at'
    });

    await queryInterface.addIndex('role_archives', ['restored'], {
      name: 'idx_role_archive_restored'
    });

    await queryInterface.addIndex('role_archives', ['removal_reason'], {
      name: 'idx_role_archive_removal_reason'
    });

    // Composite index for finding active (non-expired, non-restored) archives for a user
    await queryInterface.addIndex('role_archives', ['discord_user_id', 'restored', 'expires_at'], {
      name: 'idx_role_archive_active_lookup'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('role_archives');
  }
};
