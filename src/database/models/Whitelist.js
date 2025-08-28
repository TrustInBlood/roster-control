const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const Whitelist = sequelize.define('Whitelist', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['staff', 'whitelist']]
      }
    },
    steamid64: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    eosID: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discord_username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    group_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'groups',
        key: 'id'
      }
    },
    approved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    expiration: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'whitelists',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    indexes: [
      {
        fields: ['type', 'approved']
      },
      {
        fields: ['steamid64']
      },
      {
        fields: ['eosID']
      }
    ]
  });

  Whitelist.associate = function(models) {
    Whitelist.belongsTo(models.Group, {
      foreignKey: 'group_id',
      as: 'group'
    });
  };

  Whitelist.getActiveEntries = async function(type) {
    const now = new Date();
    return await this.findAll({
      where: {
        type: type,
        approved: true,
        [Op.or]: [
          { expiration: null },
          { expiration: { [Op.gt]: now } }
        ]
      },
      include: [{
        model: sequelize.models.Group,
        as: 'group',
        required: false
      }],
      order: [['group_id', 'ASC'], ['username', 'ASC']]
    });
  };

  Whitelist.updateDiscordUsername = async function(steamid64, eosID, discordUsername) {
    const whereClause = {
      [Op.or]: []
    };

    if (steamid64) {
      whereClause[Op.or].push({ steamid64 });
    }
    if (eosID) {
      whereClause[Op.or].push({ eosID });
    }

    if (whereClause[Op.or].length === 0) {
      return 0;
    }

    const [updatedCount] = await this.update(
      { discord_username: discordUsername },
      { where: whereClause }
    );

    return updatedCount;
  };

  return Whitelist;
};