'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add metadata fields to player_discord_links table
    await queryInterface.addColumn('player_discord_links', 'link_source', {
      type: Sequelize.ENUM('manual', 'ticket', 'squadjs', 'import'),
      allowNull: false,
      defaultValue: 'manual',
      comment: 'Source of the account link (manual, ticket, squadjs, import)'
    });

    await queryInterface.addColumn('player_discord_links', 'confidence_score', {
      type: Sequelize.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.00,
      comment: 'Confidence score of the link (0.00-1.00, higher is more confident)'
    });

    await queryInterface.addColumn('player_discord_links', 'is_primary', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this is the primary Steam ID for the user (for multiple ID scenarios)'
    });

    await queryInterface.addColumn('player_discord_links', 'metadata', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Additional metadata about the link (ticket info, timestamps, etc.)'
    });

    await queryInterface.addColumn('player_discord_links', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Last update timestamp'
    });

    // Add index for link_source for efficient queries
    await queryInterface.addIndex('player_discord_links', ['link_source']);
    
    // Add index for confidence_score for filtering high-confidence links
    await queryInterface.addIndex('player_discord_links', ['confidence_score']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('player_discord_links', ['confidence_score']);
    await queryInterface.removeIndex('player_discord_links', ['link_source']);
    
    // Remove columns
    await queryInterface.removeColumn('player_discord_links', 'updated_at');
    await queryInterface.removeColumn('player_discord_links', 'metadata');
    await queryInterface.removeColumn('player_discord_links', 'is_primary');
    await queryInterface.removeColumn('player_discord_links', 'confidence_score');
    await queryInterface.removeColumn('player_discord_links', 'link_source');
  }
};