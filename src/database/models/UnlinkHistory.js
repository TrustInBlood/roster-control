const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UnlinkHistory = sequelize.define('UnlinkHistory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    steamid64: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    eosID: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    unlinked_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'unlink_history',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      {
        fields: ['discord_user_id']
      },
      {
        fields: ['unlinked_at']
      }
    ]
  });

  UnlinkHistory.recordUnlink = async function(discordUserId, steamid64, eosID, username, reason = null) {
    return await this.create({
      discord_user_id: discordUserId,
      steamid64,
      eosID,
      username,
      unlinked_at: new Date(),
      reason
    });
  };

  UnlinkHistory.getHistoryForUser = async function(discordUserId) {
    return await this.findAll({
      where: { discord_user_id: discordUserId },
      order: [['unlinked_at', 'DESC']]
    });
  };

  return UnlinkHistory;
};