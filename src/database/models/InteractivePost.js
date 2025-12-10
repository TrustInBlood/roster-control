const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InteractivePost = sequelize.define('InteractivePost', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    post_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Type of interactive post (e.g., whitelist_post)'
    },
    guild_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Discord guild ID where the post exists'
    },
    channel_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Discord channel ID where the post is located'
    },
    message_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Discord message ID of the interactive post'
    }
  }, {
    tableName: 'interactive_posts',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['guild_id', 'post_type'],
        unique: true,
        name: 'idx_interactive_posts_guild_type'
      },
      { fields: ['channel_id'] },
      { fields: ['message_id'] }
    ]
  });

  /**
   * Find a post by type for a guild
   * @param {string} guildId - Discord guild ID
   * @param {string} postType - Type of post (e.g., 'whitelist_post')
   * @returns {Promise<InteractivePost|null>}
   */
  InteractivePost.findByType = async function(guildId, postType) {
    return await this.findOne({
      where: {
        guild_id: guildId,
        post_type: postType
      }
    });
  };

  /**
   * Create or update a post record
   * @param {string} guildId - Discord guild ID
   * @param {string} postType - Type of post
   * @param {string} channelId - Discord channel ID
   * @param {string} messageId - Discord message ID
   * @returns {Promise<InteractivePost>}
   */
  InteractivePost.upsertPost = async function(guildId, postType, channelId, messageId) {
    const [post] = await this.upsert({
      guild_id: guildId,
      post_type: postType,
      channel_id: channelId,
      message_id: messageId
    }, {
      conflictFields: ['guild_id', 'post_type']
    });
    return post;
  };

  /**
   * Delete a post record
   * @param {string} guildId - Discord guild ID
   * @param {string} postType - Type of post
   * @returns {Promise<number>} Number of deleted rows
   */
  InteractivePost.deletePost = async function(guildId, postType) {
    return await this.destroy({
      where: {
        guild_id: guildId,
        post_type: postType
      }
    });
  };

  /**
   * Get all posts of a specific type across all guilds
   * @param {string} postType - Type of post
   * @returns {Promise<Array<InteractivePost>>}
   */
  InteractivePost.findAllByType = async function(postType) {
    return await this.findAll({
      where: { post_type: postType }
    });
  };

  return InteractivePost;
};
