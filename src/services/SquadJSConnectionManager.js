const { io } = require('socket.io-client');

class SquadJSConnectionManager {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.connections = new Map(); // serverId -> socket connection
    this.eventHandlers = new Map(); // eventName -> Set of handler functions
    
    this.connectionConfig = config.squadjs.connection;
    this.servers = config.squadjs.servers;
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
      reconnection: true,
      reconnectionAttempts: this.connectionConfig.reconnectionAttempts,
      reconnectionDelay: this.connectionConfig.reconnectionDelay,
      timeout: this.connectionConfig.timeout
    });

    this.connections.set(server.id, { socket, server, reconnectAttempts: 0 });
    this.setupEventHandlers(socket, server);
  }

  setupEventHandlers(socket, server) {
    const connection = this.connections.get(server.id);

    socket.on('connect', () => {
      this.logger.info('Connected to SquadJS server successfully', {
        serverId: server.id,
        serverName: server.name
      });
      connection.reconnectAttempts = 0;
    });

    socket.on('disconnect', (reason) => {
      this.logger.warn('Disconnected from SquadJS server', { 
        serverId: server.id,
        serverName: server.name,
        reason 
      });
    });

    socket.on('connect_error', (error) => {
      connection.reconnectAttempts++;
      this.logger.error('Failed to connect to SquadJS server', { 
        serverId: server.id,
        serverName: server.name,
        error: error.message,
        attempt: connection.reconnectAttempts,
        maxAttempts: this.connectionConfig.reconnectionAttempts
      });
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
        reconnectAttempts: connection.reconnectAttempts
      };
    }
    return status;
  }

  getServerConnection(serverId) {
    return this.connections.get(serverId);
  }
}

module.exports = SquadJSConnectionManager;