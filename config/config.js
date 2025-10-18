const path = require('path');
const dotenvFlow = require('dotenv-flow');
const { console: loggerConsole } = require('../src/utils/logger');

// Load environment config using dotenv-flow for automatic environment detection
// This will load:
// - .env.development when NODE_ENV=development
// - .env.production when NODE_ENV=production
// - .env as fallback for shared variables (used in production Pterodactyl egg)
//
// IMPORTANT: Production Pterodactyl egg does NOT set NODE_ENV in startup command.
// We detect production by checking if .env has NODE_ENV=production after loading.
const preLoadEnv = process.env.NODE_ENV;

// First, load .env to check what environment it specifies
dotenvFlow.config({
  node_env: preLoadEnv || 'development',
  path: path.join(__dirname, '..')
});

// Now check what environment .env specified (production egg uses .env directly)
const env = process.env.NODE_ENV || 'development';

loggerConsole.log(`Loading environment config with dotenv-flow (NODE_ENV: ${env})`);

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',

  // Discord Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'roster_control',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'mariadb',
    logging: process.env.NODE_ENV === 'development' ? loggerConsole.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // BattleMetrics Configuration
  battlemetrics: {
    token: process.env.BATTLEMETRICS_TOKEN,
    serverId: process.env.BATTLEMETRICS_SERVER_ID,
    baseUrl: 'https://api.battlemetrics.com',
    rateLimit: {
      requests: 60,
      window: 60000 // 1 minute
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filename: `logs/${process.env.NODE_ENV || 'development'}.log`,
    maxSize: '10m',
    maxFiles: 5
  },

  // Command Configuration
  commands: {
    // Command cooldowns (in seconds)
    cooldowns: {
      whitelist: 30,
      onduty: 60,
      activity: 10
    },
    // Permissions
    permissions: {
      whitelist: ['ADMINISTRATOR', 'MANAGE_ROLES'],
      onduty: ['ADMINISTRATOR'],
      activity: ['VIEW_CHANNEL']
    }
  },

  // Validation
  validate() {
    const required = [
      'discord.token',
      'discord.clientId',
      'database.user',
      'database.password',
      'battlemetrics.token'
    ];

    const missing = required.filter(key => {
      const value = key.split('.').reduce((obj, k) => obj?.[k], config);
      return !value;
    });

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return true;
  }
};

module.exports = config;
