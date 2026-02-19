'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Table 1: SquadJS server definitions
    await queryInterface.createTable('squadjs_servers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      server_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Unique server identifier (e.g. server1)'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Display name for the server'
      },
      host: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'SquadJS host address'
      },
      port: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'SquadJS socket port'
      },
      game_port: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Game server query port (for BattleMetrics matching)'
      },
      token: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'SquadJS authentication token'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this server connection is enabled'
      },
      seed_threshold: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50,
        comment: 'Player count threshold for seeding detection'
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order for dashboard display'
      },
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who created this entry'
      },
      created_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of creator'
      },
      updated_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who last updated'
      },
      updated_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of last updater'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'SquadJS server connection definitions (managed via dashboard)'
    });

    await queryInterface.addIndex('squadjs_servers', ['server_key'], {
      name: 'idx_squadjs_servers_key',
      unique: true
    });

    await queryInterface.addIndex('squadjs_servers', ['enabled'], {
      name: 'idx_squadjs_servers_enabled'
    });

    await queryInterface.addIndex('squadjs_servers', ['display_order'], {
      name: 'idx_squadjs_servers_order'
    });

    // Table 2: Connection config (key-value, no guild scoping)
    await queryInterface.createTable('connection_config', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      config_key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Configuration key name'
      },
      config_value: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Configuration value (JSON stringified for complex values)'
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this config option is enabled'
      },
      updated_by: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Discord user ID who last updated this config'
      },
      updated_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of who last updated'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Connection and integration settings (key-value config)'
    });

    await queryInterface.addIndex('connection_config', ['config_key'], {
      name: 'idx_connection_config_key',
      unique: true
    });

    // Table 3: Audit log for config + server changes
    await queryInterface.createTable('connection_config_audit', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
        comment: 'Auto-increment primary key'
      },
      entity_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Entity type: config or server'
      },
      entity_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'server_key or config_key'
      },
      action: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Action: create, update, delete, enable, disable'
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Previous state (JSON)'
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'New state (JSON)'
      },
      changed_by: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Discord user ID who made the change'
      },
      changed_by_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cached username of who made the change'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: 'Audit log for connection config and server changes'
    });

    await queryInterface.addIndex('connection_config_audit', ['entity_type'], {
      name: 'idx_conn_audit_entity_type'
    });

    await queryInterface.addIndex('connection_config_audit', ['createdAt'], {
      name: 'idx_conn_audit_time'
    });

    await queryInterface.addIndex('connection_config_audit', ['entity_type', 'createdAt'], {
      name: 'idx_conn_audit_entity_time'
    });

    // Seed server data from current config
    const servers = [
      { key: 'server1', name: 'Squad Server 1', host: '216.114.75.106', port: 10206, gamePort: 10214, tokenEnv: 'SQUADJS_TOKEN_SERVER1', seedThreshold: 50, order: 0 },
      { key: 'server2', name: 'Squad Server 2', host: '216.114.75.106', port: 10207, gamePort: 10219, tokenEnv: 'SQUADJS_TOKEN_SERVER2', seedThreshold: 30, order: 1 },
      { key: 'server3', name: 'Squad Server 3', host: '216.114.75.106', port: 10205, gamePort: 10209, tokenEnv: 'SQUADJS_TOKEN_SERVER3', seedThreshold: 50, order: 2 },
      { key: 'server4', name: 'Squad Server 4', host: '216.114.75.106', port: 10204, gamePort: 10200, tokenEnv: 'SQUADJS_TOKEN_SERVER4', seedThreshold: 50, order: 3 },
      { key: 'server5', name: 'Squad Server 5', host: '216.114.75.106', port: 10208, gamePort: 10229, tokenEnv: 'SQUADJS_TOKEN_SERVER5', seedThreshold: 50, order: 4 }
    ];

    for (const server of servers) {
      const token = process.env[server.tokenEnv];
      if (token) {
        await queryInterface.bulkInsert('squadjs_servers', [{
          server_key: server.key,
          name: server.name,
          host: server.host,
          port: server.port,
          game_port: server.gamePort,
          token,
          enabled: true,
          seed_threshold: server.seedThreshold,
          display_order: server.order,
          created_by_name: 'Migration',
          createdAt: new Date(),
          updatedAt: new Date()
        }]);
      }
    }

    // Seed config key-value data
    const configDefaults = [
      { key: 'cache_refresh_seconds', value: '60' },
      { key: 'cache_cleanup_interval', value: '300000' },
      { key: 'prefer_eos_id', value: 'false' },
      { key: 'verification_code_length', value: '6' },
      { key: 'verification_expiration_minutes', value: '5' },
      { key: 'verification_cleanup_interval', value: '300000' },
      { key: 'reconnection_attempts', value: '10' },
      { key: 'reconnection_delay', value: '5000' },
      { key: 'connection_timeout', value: '10000' },
      { key: 'log_level', value: 'info' },
      { key: 'log_connections', value: 'true' },
      { key: 'log_cache_hits', value: 'false' },
      { key: 'log_squadjs_events', value: 'true' }
    ];

    for (const config of configDefaults) {
      await queryInterface.bulkInsert('connection_config', [{
        config_key: config.key,
        config_value: config.value,
        enabled: true,
        updated_by_name: 'Migration',
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('connection_config_audit');
    await queryInterface.dropTable('connection_config');
    await queryInterface.dropTable('squadjs_servers');
  }
};
