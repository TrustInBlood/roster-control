const { io } = require('socket.io-client');
const battleMetricsService = require('./BattleMetricsService');

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
    this.BATTLEMETRICS_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    this.battleMetricsRefreshTimer = null;
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

    // Probe all servers after initial connection attempt (with delay to allow connections to establish)
    setTimeout(() => {
      this.probeAllConnectedServers();
    }, 5000);

    // Fetch BattleMetrics server info for auto-discovery of server names
    this.fetchAllBattleMetricsInfo();

    // Start periodic refresh of BattleMetrics info
    this.startBattleMetricsRefresh();
  }

  /**
   * Start periodic refresh of BattleMetrics server info
   */
  startBattleMetricsRefresh() {
    // Clear any existing timer
    if (this.battleMetricsRefreshTimer) {
      clearInterval(this.battleMetricsRefreshTimer);
    }

    this.battleMetricsRefreshTimer = setInterval(() => {
      this.logger.debug('Refreshing BattleMetrics server info');
      this.fetchAllBattleMetricsInfo();
    }, this.BATTLEMETRICS_REFRESH_INTERVAL);

    this.logger.info('BattleMetrics refresh started', {
      intervalMinutes: this.BATTLEMETRICS_REFRESH_INTERVAL / 60000
    });
  }

  /**
   * Probe all currently connected servers for available endpoints and fetch initial queue data
   */
  probeAllConnectedServers() {
    this.logger.debug('Fetching initial queue data from connected servers');
    for (const [serverId, connection] of this.connections) {
      if (connection.socket && connection.socket.connected) {
        this.probeServerEndpoints(serverId);
      }
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
      disconnectedAt: null,
      serverInfo: null // Cache for queue data from UPDATED_SERVER_INFORMATION
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

      // Probe available endpoints on connect to discover what SquadJS exposes
      this.probeServerEndpoints(server.id);

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
      'POSSESSED_ADMIN_CAMERA',
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

    // Listen for server information updates (contains queue data)
    socket.on('UPDATED_SERVER_INFORMATION', (data) => {
      const connection = this.connections.get(server.id);
      if (connection) {
        this.logger.info('UPDATED_SERVER_INFORMATION received', {
          serverId: server.id,
          publicQueue: data?.publicQueue,
          reserveQueue: data?.reserveQueue,
          rawData: JSON.stringify(data).substring(0, 500)
        });
        connection.serverInfo = {
          publicQueue: data?.publicQueue || 0,
          reserveQueue: data?.reserveQueue || 0,
          maxPlayers: data?.maxPlayers || 100,
          currentMap: data?.currentMap || null,
          nextMap: data?.nextMap || null,
          updatedAt: Date.now()
        };
      }
    });

    // Listen for A2S information updates - use this as trigger to fetch queue data
    socket.on('UPDATED_A2S_INFORMATION', (data) => {
      const connection = this.connections.get(server.id);
      if (connection) {
        // A2S data is nested in 'raw' object with keys like MaxPlayers, PlayerCount_I, etc.
        const raw = data?.raw || data;
        const maxPlayers = raw?.MaxPlayers || raw?.maxPlayers;
        const playerCount = raw?.PlayerCount_I ? parseInt(raw.PlayerCount_I, 10) : undefined;
        const mapName = raw?.MapName_s || raw?.currentMap;

        // Update serverInfo with A2S data
        connection.serverInfo = {
          ...connection.serverInfo,
          maxPlayers: maxPlayers ?? connection.serverInfo?.maxPlayers ?? 100,
          currentMap: mapName ?? connection.serverInfo?.currentMap ?? null,
          a2sPlayerCount: playerCount,
          updatedAt: Date.now()
        };

        // When A2S updates, also fetch queue data via RPC getters
        this.fetchQueueData(server.id);
      }
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
    socket.onAny((eventName) => {
      const knownEvents = [
        ...eventTypes,
        'connect', 'disconnect', 'connect_error',
        'rcon-response', 'rcon-error',
        'PLAYER_POSSESS', 'PLAYER_UNPOSSESS', 'PLAYER_SPAWN', 'PLAYER_REVIVED',
        'PLAYER_WARNED', 'PLAYER_KICKED', 'PLAYER_BANNED',
        'UPDATED_A2S_INFORMATION', 'UPDATED_LAYER_INFORMATION', 'UPDATED_PLAYER_INFORMATION', 'UPDATED_SERVER_INFORMATION',
        'TICK_RATE', 'NEW_GAME', 'DEPLOYABLE_BUILT', 'DEPLOYABLE_DAMAGED'
      ];

      if (!knownEvents.includes(eventName)) {
        // Only log unknown events if enabled in config (disabled in development by default)
        if (this.config.logging && this.config.logging.logSquadJSEvents) {
          this.logger.debug('Unknown SquadJS event received', {
            serverId: server.id,
            serverName: server.name,
            eventName
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
    // Clear BattleMetrics refresh timer
    if (this.battleMetricsRefreshTimer) {
      clearInterval(this.battleMetricsRefreshTimer);
      this.battleMetricsRefreshTimer = null;
    }

    // Clear all reconnection timers
    for (const [, timer] of this.reconnectTimers) {
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

  /**
   * Fetch queue data from SquadJS using RPC-style property getters
   * Called when UPDATED_A2S_INFORMATION event is received
   */
  fetchQueueData(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection || !connection.socket || !connection.socket.connected) {
      return;
    }

    const socket = connection.socket;

    // Query publicQueue property
    socket.emit('publicQueue', (value) => {
      if (value !== undefined && value !== null) {
        const conn = this.connections.get(serverId);
        if (conn) {
          conn.serverInfo = {
            ...conn.serverInfo,
            publicQueue: typeof value === 'number' ? value : parseInt(value, 10) || 0,
            updatedAt: Date.now()
          };
          this.logger.debug('publicQueue fetched', { serverId, publicQueue: value });
        }
      }
    });

    // Query reserveQueue property
    socket.emit('reserveQueue', (value) => {
      if (value !== undefined && value !== null) {
        const conn = this.connections.get(serverId);
        if (conn) {
          conn.serverInfo = {
            ...conn.serverInfo,
            reserveQueue: typeof value === 'number' ? value : parseInt(value, 10) || 0,
            updatedAt: Date.now()
          };
          this.logger.debug('reserveQueue fetched', { serverId, reserveQueue: value });
        }
      }
    });
  }

  /**
   * Probe SquadJS endpoints to discover what data is available
   * Called once on connect to each server
   */
  probeServerEndpoints(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection || !connection.socket || !connection.socket.connected) {
      return;
    }

    const socket = connection.socket;
    // Include queue property getters in the probe
    const endpoints = ['serverState', 'server', 'serverInfo', 'state', 'info', 'squads', 'maps', 'publicQueue', 'reserveQueue'];

    this.logger.debug('Probing SquadJS endpoints', { serverId, endpoints });

    endpoints.forEach(endpoint => {
      socket.emit(endpoint, (response) => {
        if (response !== undefined && response !== null) {
          // For queue properties, cache the values
          if (endpoint === 'publicQueue' || endpoint === 'reserveQueue') {
            const value = typeof response === 'number' ? response : parseInt(response, 10) || 0;
            connection.serverInfo = {
              ...connection.serverInfo,
              [endpoint]: value,
              updatedAt: Date.now()
            };
            this.logger.info('Queue data fetched on connect', {
              serverId,
              [endpoint]: value
            });
          } else {
            // Log other endpoint responses at debug level
            this.logger.debug(`SquadJS endpoint "${endpoint}" responded`, {
              serverId,
              type: typeof response,
              isArray: Array.isArray(response)
            });
          }
        }
      });
    });
  }

  /**
   * Query server info directly from SquadJS socket
   * @param {string} serverId - Server ID to query
   * @returns {Promise<Object|null>} - Server info or null
   */
  async queryServerInfo(serverId) {
    const connection = this.connections.get(serverId);
    if (!connection || !connection.socket || !connection.socket.connected) {
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.logger.debug('serverState query timeout', { serverId });
          resolve(null);
        }
      }, 3000);

      // Try 'serverState' endpoint
      connection.socket.emit('serverState', (info) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        if (info) {
          // Update cached serverInfo with queue data if available
          connection.serverInfo = {
            ...connection.serverInfo,
            publicQueue: info.publicQueue ?? connection.serverInfo?.publicQueue ?? 0,
            reserveQueue: info.reserveQueue ?? connection.serverInfo?.reserveQueue ?? 0,
            maxPlayers: info.maxPlayers ?? connection.serverInfo?.maxPlayers ?? 100,
            currentMap: info.currentMap ?? info.layer ?? connection.serverInfo?.currentMap ?? null,
            updatedAt: Date.now()
          };
          resolve(info);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Fetch BattleMetrics server info for all configured servers
   * Auto-discovers server names by matching gamePort from config to BM game port
   */
  async fetchAllBattleMetricsInfo() {
    // Get unique IPs from all servers
    const ips = [...new Set(this.servers.map(s => s.host))];

    this.logger.info('Fetching BattleMetrics server info', { ips });

    for (const ip of ips) {
      try {
        const bmServers = await battleMetricsService.findServersByIP(ip);

        // Match to our servers by gamePort
        for (const [serverId, connection] of this.connections) {
          const server = connection.server;
          if (server.host === ip && server.gamePort) {
            const bmInfo = bmServers.get(server.gamePort);
            if (bmInfo) {
              connection.serverInfo = {
                ...connection.serverInfo,
                battlemetricsId: bmInfo.id,
                battlemetricsName: bmInfo.name
              };
              this.logger.info('Matched BattleMetrics server', {
                serverId,
                bmId: bmInfo.id,
                name: bmInfo.name,
                gamePort: server.gamePort
              });
            } else {
              this.logger.warn('No BattleMetrics match found for server', {
                serverId,
                gamePort: server.gamePort,
                availablePorts: [...bmServers.keys()]
              });
            }
          } else if (server.host === ip && !server.gamePort) {
            this.logger.debug('Server missing gamePort config, skipping BM lookup', { serverId });
          }
        }
      } catch (error) {
        this.logger.warn('Failed to fetch BattleMetrics info for IP', {
          ip,
          error: error.message
        });
      }
    }
  }
}

module.exports = SquadJSConnectionManager;