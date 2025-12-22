'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('duty_tracking_config', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      guild_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord guild ID'
      },
      config_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Configuration key name'
      },
      config_value: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Configuration value (JSON stringified for complex values)'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this config option is enabled'
      },
      updated_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who last updated this config'
      },
      updated_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of who last updated'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Duty tracking configuration (transparent settings)'
    });

    // Unique constraint on guild + key
    await queryInterface.addIndex('duty_tracking_config', ['guild_id', 'config_key'], {
      name: 'idx_duty_config_guild_key',
      unique: true
    });

    // Index for guild queries
    await queryInterface.addIndex('duty_tracking_config', ['guild_id'], {
      name: 'idx_duty_config_guild'
    });

    // Create config audit log table for transparency
    await queryInterface.createTable('duty_tracking_config_audit', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      guild_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord guild ID'
      },
      config_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Configuration key that was changed'
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Previous value (null for new configs)'
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'New value'
      },
      changed_by: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord user ID who made the change'
      },
      changed_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of who made the change'
      },
      change_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'update',
        comment: 'Type: create, update, enable, disable'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Audit log for duty tracking configuration changes'
    });

    // Index for guild audit queries
    await queryInterface.addIndex('duty_tracking_config_audit', ['guild_id'], {
      name: 'idx_duty_config_audit_guild'
    });

    // Index for time-based queries
    await queryInterface.addIndex('duty_tracking_config_audit', ['createdAt'], {
      name: 'idx_duty_config_audit_time'
    });

    // Composite for guild + time range
    await queryInterface.addIndex('duty_tracking_config_audit', ['guild_id', 'createdAt'], {
      name: 'idx_duty_config_audit_guild_time'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('duty_tracking_config_audit');
    await queryInterface.dropTable('duty_tracking_config');
  }
};
