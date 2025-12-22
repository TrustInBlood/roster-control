const { console: loggerConsole } = require('../src/utils/logger');

/**
 * Migration: Add 'button' and 'auto_timeout' to duty_status_changes source enum
 *
 * These new sources are needed for:
 * - button: When a user clicks "End Session" on a timeout warning
 * - auto_timeout: When a session is automatically ended due to timeout
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    loggerConsole.log('Adding button and auto_timeout to duty_status_changes source enum...');

    // MySQL/MariaDB: Modify the ENUM to add new values
    await queryInterface.sequelize.query(`
      ALTER TABLE duty_status_changes
      MODIFY COLUMN source ENUM(
        'command',
        'automatic',
        'admin',
        'voice_state',
        'manual',
        'external',
        'startup_sync',
        'manual_sync',
        'button',
        'auto_timeout'
      ) NOT NULL DEFAULT 'command'
    `);

    loggerConsole.log('Successfully added button and auto_timeout to source enum');
  },

  async down(queryInterface, Sequelize) {
    loggerConsole.log('Removing button and auto_timeout from duty_status_changes source enum...');

    // First update any rows with the new values to 'manual' as a fallback
    await queryInterface.sequelize.query(`
      UPDATE duty_status_changes
      SET source = 'manual'
      WHERE source IN ('button', 'auto_timeout')
    `);

    // Then modify the ENUM back to the original values
    await queryInterface.sequelize.query(`
      ALTER TABLE duty_status_changes
      MODIFY COLUMN source ENUM(
        'command',
        'automatic',
        'admin',
        'voice_state',
        'manual',
        'external',
        'startup_sync',
        'manual_sync'
      ) NOT NULL DEFAULT 'command'
    `);

    loggerConsole.log('Successfully removed button and auto_timeout from source enum');
  }
};
