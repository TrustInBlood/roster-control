/**
 * Centralized Logging Utility
 * Provides consistent logging across the entire application
 * Replaces scattered console.log statements with structured logging
 */

const winston = require('winston');
const path = require('path');

// Log levels: error, warn, info, http, verbose, debug, silly
const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const servicePrefix = service ? `[${service}] ` : '';
    let metaString = '';

    if (Object.keys(meta).length) {
      try {
        // Try to stringify, but handle circular references
        metaString = ` ${JSON.stringify(meta, (key, value) => {
          // Handle circular references by returning a placeholder
          if (typeof value === 'object' && value !== null) {
            if (value.constructor && value.constructor.name === 'Sequelize') {
              return '[Sequelize Instance]';
            }
            if (value.constructor && value.constructor.name.includes('Dialect')) {
              return '[Database Dialect]';
            }
          }
          return value;
        })}`;
      } catch (error) {
        // Fallback if JSON.stringify still fails
        metaString = ` [Complex Object]`;
      }
    }

    return `${timestamp} ${level}: ${servicePrefix}${message}${metaString}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create winston logger
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: 'roster-control' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport for all environments with timestamps
logger.add(new winston.transports.Console({
  level: nodeEnv === 'development' ? logLevel : 'info', // Development: all levels, Production: info and above
  format: consoleFormat
}));

/**
 * Create a child logger with a specific service context
 * @param {string} service - Service name (e.g., 'WhitelistService', 'RoleHandler')
 * @returns {winston.Logger} Child logger with service context
 */
function createServiceLogger(service) {
  return logger.child({ service });
}

/**
 * Log database operations
 * @param {string} operation - Database operation (query, insert, update, delete)
 * @param {string} table - Table name
 * @param {Object} meta - Additional metadata
 */
function logDatabase(operation, table, meta = {}) {
  logger.debug('Database operation', {
    operation,
    table,
    ...meta,
    service: 'Database'
  });
}

/**
 * Log Discord API operations
 * @param {string} operation - Discord operation (fetch, send, update)
 * @param {Object} meta - Additional metadata
 */
function logDiscord(operation, meta = {}) {
  logger.debug('Discord API operation', {
    operation,
    ...meta,
    service: 'Discord'
  });
}

/**
 * Log external API operations
 * @param {string} service - External service name (BattleMetrics, SquadJS)
 * @param {string} operation - Operation type
 * @param {Object} meta - Additional metadata
 */
function logExternalAPI(service, operation, meta = {}) {
  logger.info('External API operation', {
    externalService: service,
    operation,
    ...meta,
    service: 'ExternalAPI'
  });
}

/**
 * Log security events
 * @param {string} event - Security event type
 * @param {Object} meta - Event metadata
 */
function logSecurity(event, meta = {}) {
  logger.warn('Security event', {
    event,
    ...meta,
    service: 'Security'
  });
}

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} meta - Additional metadata
 */
function logPerformance(operation, duration, meta = {}) {
  const level = duration > 5000 ? 'warn' : 'debug';
  logger.log(level, 'Performance metric', {
    operation,
    duration,
    ...meta,
    service: 'Performance'
  });
}

/**
 * Console replacement methods for easy migration from console.log
 * These methods provide the exact same interface as console but with timestamps
 */
const console_replacement = {
  log: (message, ...args) => {
    if (args.length > 0) {
      logger.info(message, { args });
    } else {
      logger.info(message);
    }
  },

  error: (message, ...args) => {
    if (args.length > 0) {
      logger.error(message, { args });
    } else {
      logger.error(message);
    }
  },

  warn: (message, ...args) => {
    if (args.length > 0) {
      logger.warn(message, { args });
    } else {
      logger.warn(message);
    }
  },

  info: (message, ...args) => {
    if (args.length > 0) {
      logger.info(message, { args });
    } else {
      logger.info(message);
    }
  },

  debug: (message, ...args) => {
    if (args.length > 0) {
      logger.debug(message, { args });
    } else {
      logger.debug(message);
    }
  }
};

// Export the main logger and utility functions
module.exports = {
  // Main logger instance
  logger,

  // Factory function for service-specific loggers
  createServiceLogger,

  // Specialized logging functions
  logDatabase,
  logDiscord,
  logExternalAPI,
  logSecurity,
  logPerformance,

  // Convenience methods that match common usage patterns
  info: (message, meta = {}) => logger.info(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),

  // Console replacement methods for easy migration
  console: console_replacement,

  // Migration-specific logger (for console.log replacement in migrations)
  migration: {
    info: (message) => logger.info(`🔧 ${message}`, { service: 'Migration' }),
    warn: (message) => logger.warn(`⚠️ ${message}`, { service: 'Migration' }),
    error: (message) => logger.error(`❌ ${message}`, { service: 'Migration' }),
    success: (message) => logger.info(`✅ ${message}`, { service: 'Migration' })
  },

  // Global console override function
  overrideGlobalConsole: () => {
    global.console.log = console_replacement.log;
    global.console.error = console_replacement.error;
    global.console.warn = console_replacement.warn;
    global.console.info = console_replacement.info;
    global.console.debug = console_replacement.debug;
  }
};