'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff_role_archives', {
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
        comment: 'Discord user ID whose staff roles were removed'
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
        comment: 'Array of removed role objects with {id, name, priority, group}'
      },
      highest_role_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Name of highest priority role removed (for quick reference)'
      },
      highest_role_group: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Group of highest priority role (HeadAdmin, SquadAdmin, Moderator, etc.)'
      },
      removal_reason: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'Unlinked account',
        comment: 'Reason for role removal'
      },
      removal_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'scrub_unlinked',
        comment: 'Type of removal (scrub_unlinked, manual, disciplinary, etc.)'
      },
      removed_by_user_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Discord ID of admin who approved the removal'
      },
      removed_by_username: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Username of admin who approved the removal'
      },
      scrub_approval_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Approval ID from scrub preview command (if applicable)'
      },
      prior_link_status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Link status at removal (no_link, low_confidence, insufficient_confidence)'
      },
      prior_confidence_score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: 'Confidence score at time of removal (if link existed)'
      },
      prior_steam_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Steam ID64 at time of removal (if link existed)'
      },
      restore_eligible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether user is eligible for role restoration upon linking'
      },
      restore_expiry: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When restoration eligibility expires (null = no expiry)'
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
        comment: 'Discord ID of admin who approved restoration'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata about the removal/restoration'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes about this archive entry'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When the roles were removed'
      },
      updated_at: {
        allowNull: true,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: 'When this record was last updated'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Archive of staff roles removed during scrubbing operations'
    });

    // Add indexes for performance
    await queryInterface.addIndex('staff_role_archives', ['discord_user_id'], {
      name: 'idx_staff_archive_discord_user_id'
    });

    await queryInterface.addIndex('staff_role_archives', ['removed_by_user_id'], {
      name: 'idx_staff_archive_removed_by'
    });

    await queryInterface.addIndex('staff_role_archives', ['removal_type'], {
      name: 'idx_staff_archive_removal_type'
    });

    await queryInterface.addIndex('staff_role_archives', ['prior_link_status'], {
      name: 'idx_staff_archive_prior_link_status'
    });

    await queryInterface.addIndex('staff_role_archives', ['restore_eligible'], {
      name: 'idx_staff_archive_restore_eligible'
    });

    await queryInterface.addIndex('staff_role_archives', ['restored'], {
      name: 'idx_staff_archive_restored'
    });

    await queryInterface.addIndex('staff_role_archives', ['created_at'], {
      name: 'idx_staff_archive_created_at'
    });

    await queryInterface.addIndex('staff_role_archives', ['scrub_approval_id'], {
      name: 'idx_staff_archive_approval_id'
    });

    // Composite index for active restoration candidates
    await queryInterface.addIndex('staff_role_archives', ['discord_user_id', 'restore_eligible', 'restored'], {
      name: 'idx_staff_archive_restore_lookup'
    });

    // Composite index for scrub operations
    await queryInterface.addIndex('staff_role_archives', ['removal_type', 'created_at'], {
      name: 'idx_staff_archive_scrub_date'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('staff_role_archives');
  }
};
