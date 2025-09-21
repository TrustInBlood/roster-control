const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Increasing audit_logs.targetType column length from VARCHAR(50) to VARCHAR(100)');

    try {
      // Get current table description
      const tableDescription = await queryInterface.describeTable('audit_logs');
      const targetTypeColumn = tableDescription.targetType;

      if (targetTypeColumn) {
        console.log(`Current targetType column type: ${targetTypeColumn.type}`);

        // Increase the column length to VARCHAR(100)
        await queryInterface.changeColumn('audit_logs', 'targetType', {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: 'Type of entity that was acted upon'
        });

        console.log('✅ Successfully increased targetType column to VARCHAR(100)');
      } else {
        console.log('targetType column not found, skipping...');
      }

      console.log('✅ audit_logs.targetType column length increased');

    } catch (error) {
      console.error('❌ Error increasing targetType column length:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Reducing audit_logs.targetType back to VARCHAR(50)');

    try {
      // Convert targetType back to VARCHAR(50)
      await queryInterface.changeColumn('audit_logs', 'targetType', {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Type of entity that was acted upon'
      });

      console.log('✅ Successfully rolled back targetType column to VARCHAR(50)');

    } catch (error) {
      console.error('❌ Error rolling back targetType column:', error.message);
      throw error;
    }
  }
};