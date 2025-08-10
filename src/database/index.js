const { sequelize, testConnection } = require('../../config/database');

// Database connection manager
class DatabaseManager {
  constructor() {
    this.sequelize = sequelize;
    this.isConnected = false;
  }

  // Initialize database connection
  async connect() {
    try {
      const connected = await testConnection();
      this.isConnected = connected;
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
