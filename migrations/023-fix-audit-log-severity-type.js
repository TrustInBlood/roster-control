const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Converting audit_logs.severity from ENUM to VARCHAR(20)');

    try {
      // Get current table description
      const tableDescription = await queryInterface.describeTable('audit_logs');

      // Check severity column
      const severityColumn = tableDescription.severity;
      if (severityColumn && severityColumn.type.includes('enum')) {
        console.log('Converting severity from ENUM to VARCHAR(20)');
        await queryInterface.changeColumn('audit_logs', 'severity', {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: 'info',
          comment: 'Severity level of the action'
        });
        console.log('✅ Successfully converted severity column');
      } else {
        console.log('severity is already VARCHAR, skipping...');
      }

      console.log('✅ All audit_logs ENUM columns converted to VARCHAR');

    } catch (error) {
      console.error('❌ Error converting severity column:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Converting audit_logs.severity back to ENUM');

    try {
      // Convert severity back to ENUM
      await queryInterface.changeColumn('audit_logs', 'severity', {
        type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
        allowNull: false,
        defaultValue: 'info',
        comment: 'Severity level of the action'
      });

      console.log('✅ Successfully rolled back severity column to ENUM');

    } catch (error) {
      console.error('❌ Error rolling back severity column:', error.message);
      throw error;
    }
  }
};