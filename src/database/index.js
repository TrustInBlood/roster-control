const { sequelize, testConnection } = require('../../config/database');
const { defineAssociations } = require('./associations');

// Database connection manager
class DatabaseManager {
  constructor() {
    this.sequelize = sequelize;
    this.isConnected = false;
    this.associationsDefined = false;
  }

  // Initialize database connection and associations
  async connect() {
    try {
      const connected = await testConnection();
      this.isConnected = connected;
      
      // Define model associations after connection is established
      if (connected && !this.associationsDefined) {
        defineAssociations();
        this.associationsDefined = true;
      }
      
      return connected;
    } catch (error) {
      console.error('Failed to connect to database:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Close database connection
  async disconnect() {
    try {
      await this.sequelize.close();
      this.isConnected = false;
      console.log('✅ Database connection closed successfully.');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }

  // Get Sequelize instance
  getSequelize() {
    return this.sequelize;
  }

  // Check connection status
  isDatabaseConnected() {
    return this.isConnected;
  }

  // Health check
  async healthCheck() {
    try {
      await this.sequelize.authenticate();
      return true;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

module.exports = {
  sequelize,
  databaseManager,
  testConnection
};
