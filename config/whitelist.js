const config = {
  // HTTP server configuration
  http: {
    port: 3001,
    host: '0.0.0.0'
  },

  // Whitelist endpoint paths
  paths: {
    staff: '/staff',
    whitelist: '/whitelist'
  },

  // Cache configuration
  cache: {
    refreshSeconds: 60,
    cleanupIntervalMs: 300000 // 5 minutes
  },

  // Identifier preferences
  identifiers: {
    preferEosID: false
  },

  // Verification codes
  verification: {
    codeLength: 6,
    expirationMinutes: 5,
    cleanupIntervalMs: 300000 // 5 minutes
  },

  // Multiple SquadJS servers configuration
  squadjs: {
    servers: [
      {
        id: 'server1',
        name: 'Squad Server 1',
        host: '216.114.75.101',
        port: 10206,
        token: process.env.SQUADJS_TOKEN_SERVER1,
        enabled: true
      },
      {
        id: 'server2',
        name: 'Squad Server 2',
        host: '216.114.75.101',
        port: 10207,
        token: process.env.SQUADJS_TOKEN_SERVER2,
        enabled: true
      },
      {
        id: 'server3',
        name: 'Squad Server 3',
        host: '216.114.75.101',
        port: 10205,
        token: process.env.SQUADJS_TOKEN_SERVER3,
        enabled: true
      },
      {
        id: 'server4',
        name: 'Squad Server 4',
        host: '216.114.75.101',
        port: 10204,
        token: process.env.SQUADJS_TOKEN_SERVER4,
        enabled: true
      },
      {
        id: 'server5',
        name: 'Squad Server 5',
        host: '216.114.75.101',
        port: 10208,
        token: process.env.SQUADJS_TOKEN_SERVER5,
        enabled: true
      }
    ].filter(server => server.enabled && server.token), // Only include enabled servers with tokens

    // Connection settings
    connection: {
      reconnectionAttempts: 10,
      reconnectionDelay: 5000,
      timeout: 10000
    }
  },

  // Logging configuration
  logging: {
    level: 'info',
    logConnections: true,
    logCacheHits: false
  }
};

// Validation
function validateConfig() {
  const errors = [];

  // Validate HTTP configuration
  if (!config.http.port || config.http.port < 1 || config.http.port > 65535) {
    errors.push('HTTP port must be between 1 and 65535');
  }

  // Validate cache settings
  if (config.cache.refreshSeconds < 1) {
    errors.push('Cache refresh seconds must be at least 1');
  }

  // Validate verification settings
  if (config.verification.codeLength < 4 || config.verification.codeLength > 10) {
    errors.push('Verification code length must be between 4 and 10');
  }

  if (config.verification.expirationMinutes < 1) {
    errors.push('Verification code expiration must be at least 1 minute');
  }

  // Validate SquadJS servers
  if (config.squadjs.servers.length === 0) {
    console.warn('No SquadJS servers configured or enabled - account linking will not work');
  }

  config.squadjs.servers.forEach((server, index) => {
    if (!server.host) {
      errors.push(`SquadJS server ${index + 1}: host is required`);
    }
    if (!server.port || server.port < 1 || server.port > 65535) {
      errors.push(`SquadJS server ${index + 1}: port must be between 1 and 65535`);
    }
    if (!server.token) {
      errors.push(`SquadJS server ${index + 1}: token is required`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Whitelist configuration errors:\n${errors.join('\n')}`);
  }

  return true;
}

// Export config and validation
module.exports = {
  config,
  validateConfig
};