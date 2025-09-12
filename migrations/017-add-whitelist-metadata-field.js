'use strict';

/**
 * Migration: Add metadata field to whitelists table
 * 
 * This migration adds a JSON metadata field to store additional information
 * about whitelist entries, such as BattleMetrics import data, migration info,
 * and other contextual data that doesn't fit in the existing schema.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔧 Adding metadata field to whitelists table...');
      
      // Add the metadata field as a JSON column
      await queryInterface.addColumn('whitelists', 'metadata', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata (e.g., BattleMetrics import data, migration info)'
      }, { transaction });
      
      console.log('✅ Successfully added metadata field to whitelists table');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Failed to add metadata field:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Removing metadata field from whitelists table...');
      
      // Remove the metadata field
      await queryInterface.removeColumn('whitelists', 'metadata', { transaction });
      
      console.log('✅ Successfully removed metadata field from whitelists table');
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Failed to remove metadata field:', error);
      throw error;
    }
  }
};