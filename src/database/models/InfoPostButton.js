const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InfoPostButton = sequelize.define('InfoPostButton', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    button_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Unique button identifier (e.g., info_seed_reward)'
    },
    button_label: {
      type: DataTypes.STRING(80),
      allowNull: false,
      comment: 'Display text on the button'
    },
    button_emoji: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Optional emoji displayed on the button'
    },
    channels: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Channel references for placeholders (e.g., { tickets: "channelId" })'
    },
    embed: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Full embed configuration (color, title, description, fields, footer)'
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Order in which buttons appear (lower = first)'
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the button is visible on the whitelist post'
    }
  }, {
    tableName: 'info_post_buttons',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['button_id'],
        unique: true,
        name: 'idx_info_post_buttons_button_id'
      },
      {
        fields: ['display_order'],
        name: 'idx_info_post_buttons_order'
      },
      {
        fields: ['enabled'],
        name: 'idx_info_post_buttons_enabled'
      }
    ]
  });

  /**
   * Get all enabled buttons ordered by display_order
   * @returns {Promise<Array<InfoPostButton>>}
   */
  InfoPostButton.getEnabledButtons = async function() {
    return await this.findAll({
      where: { enabled: true },
      order: [['display_order', 'ASC'], ['id', 'ASC']]
    });
  };

  /**
   * Get all buttons ordered by display_order
   * @returns {Promise<Array<InfoPostButton>>}
   */
  InfoPostButton.getAllOrdered = async function() {
    return await this.findAll({
      order: [['display_order', 'ASC'], ['id', 'ASC']]
    });
  };

  /**
   * Find a button by its button_id
   * @param {string} buttonId - The button_id to search for
   * @returns {Promise<InfoPostButton|null>}
   */
  InfoPostButton.findByButtonId = async function(buttonId) {
    return await this.findOne({
      where: { button_id: buttonId }
    });
  };

  /**
   * Update the display order of multiple buttons
   * @param {Array<{id: number, display_order: number}>} orderUpdates - Array of id and new display_order
   * @returns {Promise<void>}
   */
  InfoPostButton.updateDisplayOrder = async function(orderUpdates) {
    const transaction = await sequelize.transaction();
    try {
      for (const update of orderUpdates) {
        await this.update(
          { display_order: update.display_order },
          { where: { id: update.id }, transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  return InfoPostButton;
};
