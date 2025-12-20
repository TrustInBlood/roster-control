'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('seeding_sessions', 'custom_broadcast_message', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Custom broadcast message template for seeding call'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('seeding_sessions', 'custom_broadcast_message');
  }
};
