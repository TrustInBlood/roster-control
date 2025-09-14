/**
 * Environment-aware Discord configuration loader
 * Uses standard roles.js/channels.js files for production
 * Uses environment-specific files only for development
 */
const path = require('path');

// Get current environment
const env = process.env.NODE_ENV || 'development';

// Load roles configuration
let roles;
if (env === 'development') {
  try {
    // Try development-specific config first
    roles = require(path.join(__dirname, 'roles.development.js'));
    console.log('Loaded development roles configuration');
  } catch (error) {
    // Fallback to standard roles.js
    try {
      roles = require(path.join(__dirname, 'roles.js'));
      console.log('Loaded standard roles configuration (development fallback)');
    } catch (fallbackError) {
      console.error('❌ Failed to load roles configuration:', fallbackError.message);
      console.error('Please create config/roles.development.js or config/roles.js');
      process.exit(1);
    }
  }
} else {
  try {
    // Production: use standard roles.js
    roles = require(path.join(__dirname, 'roles.js'));
    console.log('Loaded standard roles configuration');
  } catch (error) {
    console.error('❌ Failed to load roles configuration:', error.message);
    console.error('Please create config/roles.js');
    process.exit(1);
  }
}

// Load channels configuration
let channels;
if (env === 'development') {
  try {
    // Try development-specific config first
    channels = require(path.join(__dirname, 'channels.development.js'));
    console.log('✅ Loaded development channels configuration');
  } catch (error) {
    // Fallback to standard channels.js
    try {
      channels = require(path.join(__dirname, 'channels.js'));
      console.log('✅ Loaded standard channels configuration (development fallback)');
    } catch (fallbackError) {
      console.error('❌ Failed to load channels configuration:', fallbackError.message);
      console.error('Please create config/channels.development.js or config/channels.js');
      process.exit(1);
    }
  }
} else {
  try {
    // Production: use standard channels.js
    channels = require(path.join(__dirname, 'channels.js'));
    console.log('✅ Loaded standard channels configuration');
  } catch (error) {
    console.error('❌ Failed to load channels configuration:', error.message);
    console.error('Please create config/channels.js');
    process.exit(1);
  }
}

module.exports = {
  ...roles,
  ...channels
};