const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Converting audit_logs actorType and targetType from ENUM to VARCHAR');

    try {
      // Get current table description
      const tableDescription = await queryInterface.describeTable('audit_logs');

      // Check actorType column
      const actorTypeColumn = tableDescription.actorType;
      if (actorTypeColumn && actorTypeColumn.type.includes('enum')) {
        console.log('Converting actorType from ENUM to VARCHAR(50)');
        await queryInterface.changeColumn('audit_logs', 'actorType', {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'system',
          comment: 'Type of entity that performed the action'
        });
        console.log('✅ Successfully converted actorType column');
      } else {
        console.log('actorType is already VARCHAR, skipping...');
      }

      // Check targetType column
      const targetTypeColumn = tableDescription.targetType;
      if (targetTypeColumn && targetTypeColumn.type.includes('enum')) {
        console.log('Converting targetType from ENUM to VARCHAR(50)');
        await queryInterface.changeColumn('audit_logs', 'targetType', {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: 'Type of entity that was acted upon'
        });
        console.log('✅ Successfully converted targetType column');
      } else {
        console.log('targetType is already VARCHAR, skipping...');
      }

      console.log('✅ All audit_logs ENUM columns converted to VARCHAR');

    } catch (error) {
      console.error('❌ Error converting audit_logs columns:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back: Converting audit_logs columns back to ENUM');

    try {
      // Convert actorType back to ENUM
      await queryInterface.changeColumn('audit_logs', 'actorType', {
        type: DataTypes.ENUM('user', 'admin', 'system', 'external', 'scheduled', 'webhook'),
        allowNull: false,
        defaultValue: 'system',
        comment: 'Type of entity that performed the action'
      });

      // Convert targetType back to ENUM
      await queryInterface.changeColumn('audit_logs', 'targetType', {
        type: DataTypes.ENUM('player', 'admin', 'server', 'whitelist', 'role', 'channel', 'config', 'system'),
        allowNull: true,
        comment: 'Type of entity that was acted upon'
      });

      console.log('✅ Successfully rolled back audit_logs columns to ENUM');

    } catch (error) {
      console.error('❌ Error rolling back audit_logs columns:', error.message);
      throw error;
    }
  }
};