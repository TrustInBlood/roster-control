#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');

async function testDatabaseConnection() {
  console.log('🔌 Testing database connection...');
  
  try {
    // Test connection
    const connected = await databaseManager.connect();
    
    if (connected) {
      console.log('✅ Database connection successful!');
      
      // Test health check
      const healthy = await databaseManager.healthCheck();
      if (healthy) {
        console.log('✅ Database health check passed!');
      } else {
        console.log('❌ Database health check failed!');
      }
      
      // Get connection info
      const sequelize = databaseManager.getSequelize();
      console.log(`📊 Database: ${sequelize.config.database}`);
      console.log(`🌐 Host: ${sequelize.config.host}:${sequelize.config.port}`);
      console.log(`👤 User: ${sequelize.config.username}`);
      
    } else {
      console.log('❌ Database connection failed!');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Error testing database connection:', error);
    process.exit(1);
  } finally {
    // Close connection
    await databaseManager.disconnect();
    console.log('🔌 Test completed.');
  }
}

// Run the test
testDatabaseConnection();
