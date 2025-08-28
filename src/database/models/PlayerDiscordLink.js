const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PlayerDiscordLink = sequelize.define('PlayerDiscordLink', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'player_discord_links',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['discord_user_id']
      },
      {
        fields: ['steamid64']
      },
      {
        fields: ['eosID']
      }
    ]
  });

  PlayerDiscordLink.findByDiscordId = async function(discordUserId) {
    return await this.findOne({ 
      where: { discord_user_id: discordUserId } 
    });
  };

  PlayerDiscordLink.findBySteamId = async function(steamid64) {
    return await this.findOne({ 
      where: { steamid64 } 
    });
  };

  PlayerDiscordLink.findByEosId = async function(eosID) {
    return await this.findOne({ 
      where: { eosID } 
    });
  };

  PlayerDiscordLink.createOrUpdateLink = async function(discordUserId, steamid64, eosID, username) {
    const [link, created] = await this.upsert({
      discord_user_id: discordUserId,
      steamid64,
      eosID,
      username,
      created_at: new Date()
    }, {
      returning: true
    });

    return { link, created };
  };

  return PlayerDiscordLink;
};