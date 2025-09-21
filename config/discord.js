/**
 * Environment-aware Discord configuration loader
 * Uses standard roles.js/channels.js files for production
 * Uses environment-specific files only for development
 */
const path = require('path');
const { console: loggerConsole } = require('../src/utils/logger');

// Get current environment
const env = process.env.NODE_ENV || 'development';

// Load roles configuration
let roles;
if (env === 'development') {
  try {
    // Try development-specific config first
    roles = require(path.join(__dirname, 'roles.development.js'));
    loggerConsole.log('Loaded development roles configuration');
  } catch (error) {
    // Fallback to standard roles.js
    try {
      roles = require(path.join(__dirname, 'roles.js'));
      loggerConsole.log('Loaded standard roles configuration (development fallback)');
    } catch (fallbackError) {
      loggerConsole.error('❌ Failed to load roles configuration:', fallbackError.message);
      loggerConsole.error('Please create config/roles.development.js or config/roles.js');
      process.exit(1);
    }
  }
} else {
  try {
    // Production: use standard roles.js
    roles = require(path.join(__dirname, 'roles.js'));
    loggerConsole.log('Loaded standard roles configuration');
  } catch (error) {
    loggerConsole.error('❌ Failed to load roles configuration:', error.message);
    loggerConsole.error('Please create config/roles.js');
    process.exit(1);
  }
}

// Load channels configuration
let channels;
if (env === 'development') {
  try {
    // Try development-specific config first
    channels = require(path.join(__dirname, 'channels.development.js'));
    loggerConsole.log('✅ Loaded development channels configuration');
  } catch (error) {
    // Fallback to standard channels.js
    try {
      channels = require(path.join(__dirname, 'channels.js'));
      loggerConsole.log('✅ Loaded standard channels configuration (development fallback)');
    } catch (fallbackError) {
      loggerConsole.error('❌ Failed to load channels configuration:', fallbackError.message);
      loggerConsole.error('Please create config/channels.development.js or config/channels.js');
      process.exit(1);
    }
  }
} else {
  try {
    // Production: use standard channels.js
    channels = require(path.join(__dirname, 'channels.js'));
    loggerConsole.log('✅ Loaded standard channels configuration');
  } catch (error) {
    loggerConsole.error('❌ Failed to load channels configuration:', error.message);
    loggerConsole.error('Please create config/channels.js');
    process.exit(1);
  }
}

module.exports = {
  ...roles,
  ...channels
};