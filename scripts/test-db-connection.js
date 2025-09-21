#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { console: loggerConsole } = require('../src/utils/logger');

async function testDatabaseConnection() {
  loggerConsole.log('🔌 Testing database connection...');
  
  try {
    // Test connection
    const connected = await databaseManager.connect();
    
    if (connected) {
      loggerConsole.log('✅ Database connection successful!');
      
      // Test health check
      const healthy = await databaseManager.healthCheck();
      if (healthy) {
        loggerConsole.log('✅ Database health check passed!');
      } else {
        loggerConsole.log('❌ Database health check failed!');
      }
      
      // Get connection info
      const sequelize = databaseManager.getSequelize();
      loggerConsole.log(`📊 Database: ${sequelize.config.database}`);
      loggerConsole.log(`🌐 Host: ${sequelize.config.host}:${sequelize.config.port}`);
      loggerConsole.log(`👤 User: ${sequelize.config.username}`);
      
    } else {
      loggerConsole.log('❌ Database connection failed!');
      process.exit(1);
    }
    
  } catch (error) {
    loggerConsole.error('💥 Error testing database connection:', error);
    process.exit(1);
  } finally {
    // Close connection
    await databaseManager.disconnect();
    loggerConsole.log('🔌 Test completed.');
  }
}

// Run the test
testDatabaseConnection();
