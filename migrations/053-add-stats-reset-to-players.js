'use strict';

/**
 * Migration to add stats_reset_at column to players table
 *
 * This column tracks when a player's game stats (K/D, kills, deaths, etc.)
 * were last reset. When fetching stats from the external API, this date
 * is used to filter results to only include stats after the reset.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('players', 'stats_reset_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      comment: 'Timestamp of when player game stats were last reset'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('players', 'stats_reset_at');
  }
};
