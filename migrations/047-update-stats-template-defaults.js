'use strict';

/**
 * Migration: Update stats template defaults to larger values
 *
 * Updates all existing templates to use new default values:
 * - box_width: 1000 (was 800)
 * - box_height: 475 (was 420)
 * - box_x: 968 (was null)
 * - box_y: 18.5 (was null)
 * - padding: 12 (was 25)
 * - title_size: 50 (was 28)
 * - label_size: 25 (was 18)
 * - value_size: 50 (was 26)
 * - top_gap: 50 (was 40)
 *
 * Also changes box_y column from INTEGER to FLOAT to support decimal values.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { console: loggerConsole } = require('../src/utils/logger');

    loggerConsole.log('Starting stats template defaults update migration...');

    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = '${tableName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return results.count > 0;
    };

    // Check if stats_templates table exists
    if (!await tableExists('stats_templates')) {
      loggerConsole.log('stats_templates table does not exist, skipping migration');
      return;
    }

    // Change box_y column from INTEGER to FLOAT to support decimal values
    loggerConsole.log('Changing box_y column from INTEGER to FLOAT...');
    await queryInterface.changeColumn('stats_templates', 'box_y', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 18.5,
      comment: 'Y position (null = auto centered)'
    });

    // Update all existing templates to use new default values
    loggerConsole.log('Updating all existing templates to new default values...');
    await queryInterface.sequelize.query(`
      UPDATE stats_templates SET
        box_width = 1000,
        box_height = 475,
        box_x = 968,
        box_y = 18.5,
        padding = 12,
        title_size = 50,
        label_size = 25,
        value_size = 50,
        top_gap = 50
    `, { type: queryInterface.sequelize.QueryTypes.UPDATE });

    loggerConsole.log('Updated all stats templates to new default values');
  },

  async down(queryInterface, Sequelize) {
    const { console: loggerConsole } = require('../src/utils/logger');

    loggerConsole.log('Rolling back stats template defaults update migration...');

    // Helper to check if a table exists
    const tableExists = async (tableName) => {
      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = '${tableName}'`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      return results.count > 0;
    };

    // Check if stats_templates table exists
    if (!await tableExists('stats_templates')) {
      loggerConsole.log('stats_templates table does not exist, skipping rollback');
      return;
    }

    // Revert box_y column back to INTEGER
    await queryInterface.changeColumn('stats_templates', 'box_y', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Y position (null = auto centered)'
    });

    // Revert all templates to old default values
    await queryInterface.sequelize.query(`
      UPDATE stats_templates SET
        box_width = 800,
        box_height = 420,
        box_x = NULL,
        box_y = NULL,
        padding = 25,
        title_size = 28,
        label_size = 18,
        value_size = 26,
        top_gap = 40
    `, { type: queryInterface.sequelize.QueryTypes.UPDATE });

    loggerConsole.log('Reverted all stats templates to old default values');
  }
};
