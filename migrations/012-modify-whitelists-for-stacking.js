'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns for duration-based whitelist stacking
    await queryInterface.addColumn('whitelists', 'duration_value', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'The numeric duration value (e.g., 6 for 6 months)'
    });

    await queryInterface.addColumn('whitelists', 'duration_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'The duration unit: "months", "days"'
    });

    await queryInterface.addColumn('whitelists', 'granted_by', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Discord ID of the admin who granted this whitelist'
    });

    await queryInterface.addColumn('whitelists', 'granted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When this whitelist entry was granted'
    });

    await queryInterface.addColumn('whitelists', 'revoked', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this whitelist entry has been revoked'
    });

    await queryInterface.addColumn('whitelists', 'revoked_by', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Discord ID of the admin who revoked this whitelist'
    });

    await queryInterface.addColumn('whitelists', 'revoked_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Reason for revoking this whitelist entry'
    });

    await queryInterface.addColumn('whitelists', 'revoked_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When this whitelist entry was revoked'
    });

    // Add indexes for better performance on queries
    await queryInterface.addIndex('whitelists', ['steamid64', 'revoked']);
    await queryInterface.addIndex('whitelists', ['granted_by']);
    await queryInterface.addIndex('whitelists', ['granted_at']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('whitelists', ['steamid64', 'revoked']);
    await queryInterface.removeIndex('whitelists', ['granted_by']);
    await queryInterface.removeIndex('whitelists', ['granted_at']);

    // Remove columns in reverse order
    await queryInterface.removeColumn('whitelists', 'revoked_at');
    await queryInterface.removeColumn('whitelists', 'revoked_reason');
    await queryInterface.removeColumn('whitelists', 'revoked_by');
    await queryInterface.removeColumn('whitelists', 'revoked');
    await queryInterface.removeColumn('whitelists', 'granted_at');
    await queryInterface.removeColumn('whitelists', 'granted_by');
    await queryInterface.removeColumn('whitelists', 'duration_type');
    await queryInterface.removeColumn('whitelists', 'duration_value');
  }
};