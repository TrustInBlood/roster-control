const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Converting audit_logs.actionType from ENUM to VARCHAR(100)');

    try {
      // First, check if the column exists and get its current type
      const tableDescription = await queryInterface.describeTable('audit_logs');
      const actionTypeColumn = tableDescription.actionType;

      if (!actionTypeColumn) {
        console.warn('⚠️ actionType column not found, skipping migration');
        return;
      }

      console.log(`Current actionType column type: ${actionTypeColumn.type}`);

      // Check if it's already VARCHAR
      if (actionTypeColumn.type.includes('varchar') || actionTypeColumn.type.includes('VARCHAR')) {
        console.log('✅ actionType is already VARCHAR, skipping migration');
        return;
      }

      // Change the column type from ENUM to VARCHAR(100)
      await queryInterface.changeColumn('audit_logs', 'actionType', {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Type of action that was performed'
      });

      console.log('✅ Successfully converted actionType column to VARCHAR(100)');

    } catch (error) {
      console.error('❌ Error converting actionType column:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Converting audit_logs.actionType back to ENUM');

    try {
      // Convert back to ENUM with original values
      await queryInterface.changeColumn('audit_logs', 'actionType', {
        type: DataTypes.ENUM(
          'roster_add', 'roster_remove', 'roster_modify',
          'admin_duty_on', 'admin_duty_off', 'admin_create', 'admin_modify', 'admin_deactivate',
          'server_add', 'server_modify', 'server_status_change', 'server_health_check',
          'player_join', 'player_leave', 'player_activity', 'player_modify',
          'whitelist_sync', 'database_migration', 'system_startup', 'system_error',
          'command_executed', 'permission_denied', 'authentication_failure',
          'config_change', 'backup_created', 'data_pruned', 'manual_intervention'
        ),
        allowNull: false,
        comment: 'Type of action that was performed'
      });

      console.log('✅ Successfully rolled back actionType column to ENUM');

    } catch (error) {
      console.error('❌ Error rolling back actionType column:', error.message);
      throw error;
    }
  }
};