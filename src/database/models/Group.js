const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Group = sequelize.define('Group', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    group_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    permissions: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Comma-separated permissions like "reserve,kick"'
    }
  }, {
    tableName: 'groups',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  });

  Group.associate = function(models) {
    Group.hasMany(models.Whitelist, {
      foreignKey: 'group_id',
      as: 'whitelistEntries'
    });
  };

  Group.findByName = async function(groupName) {
    return await this.findOne({ where: { group_name: groupName } });
  };

  Group.getAllGroups = async function() {
    return await this.findAll({
      order: [['group_name', 'ASC']]
    });
  };

  return Group;
};