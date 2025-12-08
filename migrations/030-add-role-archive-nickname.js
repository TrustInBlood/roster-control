'use strict';

/**
 * Migration: Add previous_nickname column to role_archives table
 *
 * Stores the user's nickname at the time of role removal so it can be
 * restored when they link their Steam account within the 30-day window.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('role_archives', 'previous_nickname', {
      type: Sequelize.STRING(32), // Discord nickname max is 32 characters
      allowNull: true,
      after: 'discord_display_name'
    });

    console.log('Added previous_nickname column to role_archives table');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('role_archives', 'previous_nickname');
    console.log('Removed previous_nickname column from role_archives table');
  }
};
