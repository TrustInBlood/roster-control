const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'roster_control',
  dialect: 'mariadb',
  
  // Charset and collation settings
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  
  // Connection pooling
  pool: {
    max: 10,           // Maximum number of connection instances
    min: 0,            // Minimum number of connection instances
    acquire: 30000,    // Maximum time (ms) that pool will try to get connection before throwing error
    idle: 10000        // Maximum time (ms) that a connection can be idle before being released
  },
  
  // Logging configuration
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  
  // Additional MariaDB-specific options
  dialectOptions: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    bigNumberStrings: true
  }
};

// Create Sequelize instance
const sequelize = new Sequelize(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  dbConfig
};
