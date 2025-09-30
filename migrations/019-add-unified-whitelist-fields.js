'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add source field to track where the whitelist came from
    await queryInterface.addColumn('whitelists', 'source', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Source of the whitelist: "role", "manual", "import"',
      defaultValue: 'manual' // Default existing entries to manual
    });

    // Add role_name field for role-based entries
    await queryInterface.addColumn('whitelists', 'role_name', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Discord role name that granted access (for role-based entries)'
    });

    // Add discord_user_id field for better Discord integration
    await queryInterface.addColumn('whitelists', 'discord_user_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Discord user ID for role-based tracking'
    });

    // Update existing entries to have source='manual' (they're already defaulted above)
    await queryInterface.sequelize.query(
      'UPDATE whitelists SET source = \'manual\' WHERE source IS NULL'
    );

    // Now make source NOT NULL
    await queryInterface.changeColumn('whitelists', 'source', {
      type: Sequelize.STRING(20),
      allowNull: false,
      comment: 'Source of the whitelist: "role", "manual", "import"'
    });

    // Add indexes for better performance
    await queryInterface.addIndex('whitelists', ['source', 'revoked']);
    await queryInterface.addIndex('whitelists', ['discord_user_id', 'revoked']);
    await queryInterface.addIndex('whitelists', ['role_name']);

    // Compound index for role-based queries
    await queryInterface.addIndex('whitelists', ['discord_user_id', 'source', 'revoked']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('whitelists', ['discord_user_id', 'source', 'revoked']);
    await queryInterface.removeIndex('whitelists', ['role_name']);
    await queryInterface.removeIndex('whitelists', ['discord_user_id', 'revoked']);
    await queryInterface.removeIndex('whitelists', ['source', 'revoked']);

    // Remove columns in reverse order
    await queryInterface.removeColumn('whitelists', 'discord_user_id');
    await queryInterface.removeColumn('whitelists', 'role_name');
    await queryInterface.removeColumn('whitelists', 'source');
  }
};