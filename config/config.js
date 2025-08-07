const path = require('path');
const dotenv = require('dotenv');

// Load environment-specific config
const env = process.env.NODE_ENV || 'development';
const envFile = path.join(__dirname, `../.env.${env}`);
dotenv.config({ path: envFile });

// Fallback to default .env if environment-specific file doesn't exist
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  // Environment
  env: env,
  isDevelopment: env === 'development',
  isProduction: env === 'production',

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
    password: process.env.DB_PASS,
    dialect: 'mariadb',
    logging: env === 'development' ? console.log : false,
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

  // SquadJS Configuration
  squadjs: {
    host: process.env.SQUADJS_HOST || 'localhost',
    port: parseInt(process.env.SQUADJS_PORT) || 3000,
    password: process.env.SQUADJS_PASSWORD,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filename: `logs/${env}.log`,
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
      'battlemetrics.token',
      'battlemetrics.serverId'
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
