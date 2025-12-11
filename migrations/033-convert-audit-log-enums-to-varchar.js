'use strict';

const { console: loggerConsole } = require('../src/utils/logger');

/**
 * Migration: Convert audit_logs ENUM columns to VARCHAR
 *
 * This migration converts ENUM columns to VARCHAR(STRING) to allow
 * flexible values without requiring new migrations for each new value.
 * Application-level validation will be used instead.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    loggerConsole.log('Converting audit_logs ENUM columns to VARCHAR...');

    // Convert actorType ENUM to VARCHAR(50)
    await queryInterface.changeColumn('audit_logs', 'actorType', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'system'
    });
    loggerConsole.log('  ✓ Converted actorType to VARCHAR(50)');

    // Convert actionType ENUM to VARCHAR(50)
    await queryInterface.changeColumn('audit_logs', 'actionType', {
      type: Sequelize.STRING(50),
      allowNull: false
    });
    loggerConsole.log('  ✓ Converted actionType to VARCHAR(50)');

    // Convert targetType ENUM to VARCHAR(50)
    await queryInterface.changeColumn('audit_logs', 'targetType', {
      type: Sequelize.STRING(50),
      allowNull: true
    });
    loggerConsole.log('  ✓ Converted targetType to VARCHAR(50)');

    // Convert severity ENUM to VARCHAR(20)
    await queryInterface.changeColumn('audit_logs', 'severity', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'info'
    });
    loggerConsole.log('  ✓ Converted severity to VARCHAR(20)');

    loggerConsole.log('✅ All ENUM columns converted to VARCHAR');
  },

  down: async (queryInterface, Sequelize) => {
    // Note: Reverting to ENUM would require ensuring all existing data
    // fits within the original ENUM values. This is intentionally left
    // as a no-op to avoid data loss.
    loggerConsole.warn('Down migration not implemented - ENUM conversion is one-way');
    loggerConsole.warn('To revert, manually recreate ENUM columns after validating data');
  }
};
