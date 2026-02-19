const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SquadJSServer = sequelize.define('SquadJSServer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key'
    },
    serverKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'server_key',
      comment: 'Unique server identifier (e.g. server1)'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Display name for the server'
    },
    host: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'SquadJS host address'
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'SquadJS socket port'
    },
    gamePort: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'game_port',
      comment: 'Game server query port (for BattleMetrics matching)'
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'SquadJS authentication token'
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this server connection is enabled'
    },
    seedThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
      field: 'seed_threshold',
      comment: 'Player count threshold for seeding detection'
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'display_order',
      comment: 'Order for dashboard display'
    },
    createdBy: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'created_by',
      comment: 'Discord user ID who created this entry'
    },
    createdByName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'created_by_name',
      comment: 'Cached username of creator'
    },
    updatedBy: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'updated_by',
      comment: 'Discord user ID who last updated'
    },
    updatedByName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'updated_by_name',
      comment: 'Cached username of last updater'
    }
  }, {
    tableName: 'squadjs_servers',
    timestamps: true,
    indexes: [
      { name: 'idx_squadjs_servers_key', unique: true, fields: ['server_key'] },
      { name: 'idx_squadjs_servers_enabled', fields: ['enabled'] },
      { name: 'idx_squadjs_servers_order', fields: ['display_order'] }
    ],
    comment: 'SquadJS server connection definitions (managed via dashboard)'
  });

  // Get all servers ordered by display_order
  SquadJSServer.getAll = async function() {
    return this.findAll({
      order: [['displayOrder', 'ASC'], ['id', 'ASC']]
    });
  };

  // Get all enabled servers with a token
  SquadJSServer.getAllEnabled = async function() {
    return this.findAll({
      where: {
        enabled: true,
        token: { [sequelize.Sequelize.Op.ne]: null }
      },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']]
    });
  };

  // Get a single server by its key
  SquadJSServer.getByKey = async function(serverKey) {
    return this.findOne({
      where: { serverKey }
    });
  };

  return SquadJSServer;
};
