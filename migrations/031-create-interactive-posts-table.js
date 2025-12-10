'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('interactive_posts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      post_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Type of interactive post (e.g., whitelist_post)'
      },
      guild_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Discord guild ID where the post exists'
      },
      channel_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Discord channel ID where the post is located'
      },
      message_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Discord message ID of the interactive post'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When the post record was created'
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Tracks persistent interactive Discord posts for management'
    });

    // Unique constraint: one post per type per guild
    await queryInterface.addIndex('interactive_posts', ['guild_id', 'post_type'], {
      name: 'idx_interactive_posts_guild_type',
      unique: true
    });

    // Index for channel lookups
    await queryInterface.addIndex('interactive_posts', ['channel_id'], {
      name: 'idx_interactive_posts_channel_id'
    });

    // Index for message ID validation
    await queryInterface.addIndex('interactive_posts', ['message_id'], {
      name: 'idx_interactive_posts_message_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('interactive_posts');
  }
};
