const { io } = require('socket.io-client');

class SquadJSConnectionManager {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.connections = new Map(); // serverId -> socket connection
    this.eventHandlers = new Map(); // eventName -> Set of handler functions
    this.reconnectTimers = new Map(); // serverId -> timeout reference

    this.connectionConfig = config.squadjs.connection;
    this.servers = config.squadjs.servers;

    // Connection state constants
    this.STATES = {
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      FAILED: 'failed',
      DEGRADED: 'degraded'
    };

    // Configuration
    this.MAX_ATTEMPTS = this.connectionConfig.reconnectionAttempts || 10;
    this.DEGRADED_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
  }

  async connect() {
    if (this.servers.length === 0) {
      this.logger.warn('No SquadJS servers configured, skipping connections');
      return;
    }

    this.logger.info('Connecting to SquadJS servers', { 
      serverCount: this.servers.length,
      servers: this.servers.map(s => ({ id: s.id, name: s.name, host: s.host, port: s.port }))
    });

    for (const server of this.servers) {
      await this.connectToServer(server);
    }
  }

  async connectToServer(server) {
    const socketUrl = `http://${server.host}:${server.port}`;

    this.logger.info('Connecting to SquadJS server', {
      serverId: server.id,
      serverName: server.name,
      url: socketUrl
    });

    const socket = io(socketUrl, {
      auth: {
        token: server.token
      },
      reconnection: false, // Disable auto-reconnection, we'll handle manually
      timeout: this.connectionConfig.timeout
    });

    this.connections.set(server.id, {
      socket,
      server,
      reconnectAttempts: 0,
      state: this.STATES.CONNECTING,
      lastAttemptTime: Date.now(),
      disconnectedAt: null
    });
    this.setupEventHandlers(socket, server);
  }

  // Calculate exponential backoff delay
  getReconnectDelay(attempt) {
    if (attempt <= this.MAX_ATTEMPTS) {
      // Exponential backoff: 5s, 10s, 20s, 40s, 60s (max)
      const baseDelay = this.connectionConfig.reconnectionDelay || 5000;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 60000);
      return delay;
    }
    // Degraded mode: 5 minutes
    return this.DEGRADED_RETRY_INTERVAL;
  }

  // Manual reconnection handler
  scheduleReconnect(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) return;

    // Clear any existing timer
    if (this.reconnectTimers.has(serverId)) {
      clearTimeout(this.reconnectTimers.get(serverId));
    }

    const delay = this.getReconnectDelay(connection.reconnectAttempts);

    const timer = setTimeout(() => {
      this.attemptReconnect(serverId);
    }, delay);

    this.reconnectTimers.set(serverId, timer);
  }

  attemptReconnect(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection) return;

    connection.lastAttemptTime = Date.now();

    // Try to reconnect
    if (connection.socket && !connection.socket.connected) {
      connection.socket.connect();
    }
  }

  setupEventHandlers(socket, server) {
    const connection = this.connections.get(server.id);

    socket.on('connect', () => {
      const wasDisconnected = connection.disconnectedAt !== null;
      const downtime = wasDisconnected
        ? Math.round((Date.now() - connection.disconnectedAt) / 1000 / 60)
        : 0;

      // Log successful connection
      if (wasDisconnected && downtime > 0) {
        this.logger.info('SquadJS server reconnected', {
          serverId: server.id,
          serverName: server.name,
          downtimeMinutes: downtime,
          previousAttempts: connection.reconnectAttempts
        });
      } else {
        this.logger.info('Connected to SquadJS server successfully', {
          serverId: server.id,
          serverName: server.name
        });
      }

      // Reset connection state
      connection.reconnectAttempts = 0;
      connection.state = this.STATES.CONNECTED;
      connection.disconnectedAt = null;

      // Clear any pending reconnect timers
      if (this.reconnectTimers.has(server.id)) {
        clearTimeout(this.reconnectTimers.get(server.id));
        this.reconnectTimers.delete(server.id);
      }
    });

    socket.on('disconnect', (reason) => {
      connection.state = this.STATES.FAILED;
      connection.disconnectedAt = Date.now();

      this.logger.warn('Disconnected from SquadJS server', {
        serverId: server.id,
        serverName: server.name,
        reason
      });

      // Schedule reconnection
      this.scheduleReconnect(server.id);
    });

    socket.on('connect_error', (error) => {
      connection.reconnectAttempts++;
      const attempt = connection.reconnectAttempts;

      // Determine log level based on attempt count
      let logLevel;
      let logMessage;

      if (attempt <= 3) {
        // First 3 attempts: ERROR
        logLevel = 'error';
        logMessage = 'Failed to connect to SquadJS server';
      } else if (attempt <= this.MAX_ATTEMPTS) {
        // Attempts 4-10: WARN
        logLevel = 'warn';
        logMessage = 'SquadJS server connection failing';
        connection.state = this.STATES.FAILED;
      } else {
        // After 10 attempts: WARN (degraded mode)
        logLevel = 'warn';
        logMessage = 'SquadJS server in degraded mode - retrying every 5 minutes';
        connection.state = this.STATES.DEGRADED;
      }

      // Calculate next retry delay
      const nextRetryDelay = this.getReconnectDelay(attempt);
      const nextRetrySeconds = Math.round(nextRetryDelay / 1000);

      this.logger[logLevel](logMessage, {
        serverId: server.id,
        serverName: server.name,
        error: error.message,
        attempt: attempt,
        maxAttempts: this.MAX_ATTEMPTS,
        state: connection.state,
        nextRetryIn: `${nextRetrySeconds}s`
      });

      // Record disconnection time if not already set
      if (!connection.disconnectedAt) {
        connection.disconnectedAt = Date.now();
      }

      // Schedule next reconnection attempt
      this.scheduleReconnect(server.id);
    });

    this.setupEventForwarding(socket, server);

    this.logger.info('SquadJS event handlers configured', {
      serverId: server.id,
      serverName: server.name
    });
  }

  setupEventForwarding(socket, server) {
    const eventTypes = [
      'CHAT_MESSAGE',
      'PLAYER_CONNECTED',
      'PLAYER_DISCONNECTED',
      'PLAYER_DAMAGED',
      'PLAYER_WOUNDED',
      'PLAYER_DIED',
      'TEAMKILL',
      'SQUAD_CREATED',
      'SQUAD_DISBANDED',
      'MATCH_STARTED',
      'MATCH_ENDED',
      'TICK_RATE'
    ];

    eventTypes.forEach(eventType => {
      socket.on(eventType, (data) => {
        this.emitToHandlers(eventType, data, server);
      });
    });

    // Listen for RCON responses/errors for debugging
    socket.on('rcon-response', (data) => {
      this.logger.debug('RCON response received', {
        serverId: server.id,
        serverName: server.name,
        data
      });
    });

    socket.on('rcon-error', (data) => {
      this.logger.warn('RCON error received', {
        serverId: server.id,
        serverName: server.name,
        data
      });
    });

    // Listen for any unhandled events for debugging (only log event names, not full data)
    socket.onAny((eventName, ...args) => {
      const knownEvents = [
        ...eventTypes,
        'connect', 'disconnect', 'connect_error', 
        'rcon-response', 'rcon-error',
        'PLAYER_POSSESS', 'PLAYER_UNPOSSESS', 'PLAYER_SPAWN', 'PLAYER_REVIVED',
        'PLAYER_WARNED', 'PLAYER_KICKED', 'PLAYER_BANNED',
        'UPDATED_A2S_INFORMATION', 'UPDATED_LAYER_INFORMATION', 'UPDATED_PLAYER_INFORMATION',
        'TICK_RATE', 'NEW_GAME', 'DEPLOYABLE_BUILT', 'DEPLOYABLE_DAMAGED'
      ];
      
      if (!knownEvents.includes(eventName)) {
        // Only log unknown events if enabled in config (disabled in development by default)
        if (this.config.logging && this.config.logging.logSquadJSEvents) {
          this.logger.debug('Unknown SquadJS event received', {
            serverId: server.id,
            serverName: server.name,
            eventName
            // Removed args to reduce noise
          });
        }
      }
    });
  }

  emitToHandlers(eventType, data, server) {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers || handlers.size === 0) {
      return;
    }

    handlers.forEach(async (handler) => {
      try {
        await handler(data, server);
      } catch (error) {
        this.logger.error('Error in SquadJS event handler', {
          eventType,
          serverId: server.id,
          serverName: server.name,
          error: error.message,
          data: data
        });
      }
    });
  }

  registerEventHandler(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType).add(handler);

    this.logger.debug('Event handler registered', { 
      eventType, 
      handlerCount: this.eventHandlers.get(eventType).size 
    });
  }

  unregisterEventHandler(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  sendRCONCommand(serverId, command) {
    const connection = this.connections.get(serverId);
    if (connection && connection.socket && connection.socket.connected) {
      // Use the correct SquadJS RCON API - specific methods rather than raw commands
      connection.socket.emit('rcon', { command });
      
      this.logger.info('RCON command sent to SquadJS', {
        serverId,
        serverName: connection.server.name,
        command: command.substring(0, 50) + (command.length > 50 ? '...' : '')
      });
      
      return true;
    }
    
    this.logger.warn('Cannot send RCON command - server not connected', {
      serverId,
      command
    });
    
    return false;
  }

  sendRCONWarn(serverId, steamID, message) {
    const connection = this.connections.get(serverId);
    if (connection && connection.socket && connection.socket.connected) {
      // Use SquadJS specific warn API
      connection.socket.emit('rcon.warn', steamID, message, (response) => {
        this.logger.debug('RCON warn response', {
          serverId,
          serverName: connection.server.name,
          steamID,
          response
        });
      });
      
      this.logger.info('RCON warn sent to SquadJS', {
        serverId,
        serverName: connection.server.name,
        steamID,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
      
      return true;
    }
    
    this.logger.warn('Cannot send RCON warn - server not connected', {
      serverId,
      steamID,
      message
    });
    
    return false;
  }

  sendRCONBroadcast(serverId, message) {
    const connection = this.connections.get(serverId);
    if (connection && connection.socket && connection.socket.connected) {
      // Use SquadJS broadcast API for server-wide messages
      connection.socket.emit('rcon.broadcast', message, (response) => {
        this.logger.debug('RCON broadcast response', {
          serverId,
          serverName: connection.server.name,
          response
        });
      });
      
      this.logger.info('RCON broadcast sent to SquadJS', {
        serverId,
        serverName: connection.server.name,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      });
      
      return true;
    }
    
    this.logger.warn('Cannot send RCON broadcast - server not connected', {
      serverId,
      message
    });
    
    return false;
  }

  disconnect() {
    // Clear all reconnection timers
    for (const [serverId, timer] of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Disconnect all sockets
    for (const [serverId, connection] of this.connections) {
      if (connection.socket) {
        connection.socket.disconnect();
        this.logger.info('Disconnected from SquadJS server', {
          serverId,
          serverName: connection.server.name
        });
      }
    }
    this.connections.clear();
    this.eventHandlers.clear();
  }

  isConnected() {
    return Array.from(this.connections.values()).some(conn => conn.socket && conn.socket.connected);
  }

  getConnectionStatus() {
    const status = {};
    for (const [serverId, connection] of this.connections) {
      status[serverId] = {
        serverName: connection.server.name,
        connected: connection.socket && connection.socket.connected,
        reconnectAttempts: connection.reconnectAttempts,
        state: connection.state,
        disconnectedAt: connection.disconnectedAt,
        lastAttemptTime: connection.lastAttemptTime
      };
    }
    return status;
  }

  // Helper method for other services to check if server is in degraded state
  isServerDegraded(serverId) {
    const connection = this.connections.get(serverId);
    return connection && connection.state === this.STATES.DEGRADED;
  }

  // Helper method to check if server is connected
  isServerConnected(serverId) {
    const connection = this.connections.get(serverId);
    return connection && connection.socket && connection.socket.connected;
  }

  getServerConnection(serverId) {
    return this.connections.get(serverId);
  }

  getConnections() {
    return this.connections;
  }
}

module.exports = SquadJSConnectionManager;