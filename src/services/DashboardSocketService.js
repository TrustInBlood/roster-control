const { Server } = require('socket.io');
const { createServiceLogger } = require('../utils/logger');
const { getServersStatus } = require('../api/v1/servers');
const { loadConfig } = require('../utils/environment');

const logger = createServiceLogger('DashboardSocketService');

// Load Discord roles configuration
const { getAllStaffRoles } = loadConfig('discordRoles');

/**
 * Dashboard Socket Service
 * Provides real-time server status updates to connected dashboard clients
 */
class DashboardSocketService {
  constructor(httpServer, sessionMiddleware) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? process.env.DASHBOARD_URL || false
          : ['http://localhost:5173', 'http://localhost:3001'],
        credentials: true
      },
      path: '/socket.io'
    });

    this.sessionMiddleware = sessionMiddleware;
    this.connectedClients = new Map(); // socketId -> { userId, username }

    // Bound event handlers for cleanup
    this._boundHandlers = {
      onPlayerJoined: this.handlePlayerEvent.bind(this),
      onPlayerLeft: this.handlePlayerEvent.bind(this),
      onPlayerCountUpdate: this.handlePlayerCountUpdate.bind(this)
    };
  }

  /**
   * Initialize the socket service
   */
  async initialize() {
    logger.info('Initializing DashboardSocketService...');

    // Setup authentication middleware
    this.io.use((socket, next) => {
      // Wrap express session middleware for socket.io
      this.sessionMiddleware(socket.request, {}, () => {
        if (socket.request.session?.passport?.user) {
          const user = socket.request.session.passport.user;
          const allStaffRoles = getAllStaffRoles();
          const userRoles = user.roles || [];

          // Check if user has staff role
          const hasStaffRole = userRoles.some(roleId => allStaffRoles.includes(roleId));
          if (hasStaffRole) {
            socket.user = user;
            return next();
          }
        }

        logger.warn('Socket connection rejected - not authenticated or not staff');
        return next(new Error('Authentication required'));
      });
    });

    // Setup connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    // Subscribe to PlaytimeTrackingService events
    const playtimeService = global.playtimeTrackingService;
    if (playtimeService) {
      playtimeService.on('playerJoined', this._boundHandlers.onPlayerJoined);
      playtimeService.on('playerLeft', this._boundHandlers.onPlayerLeft);
      playtimeService.on('playerCountUpdate', this._boundHandlers.onPlayerCountUpdate);
      logger.info('Subscribed to PlaytimeTrackingService events');
    } else {
      logger.warn('PlaytimeTrackingService not available - real-time updates may be limited');
    }

    logger.info('DashboardSocketService initialized');
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.user?.id;
    const username = socket.user?.username;

    this.connectedClients.set(socket.id, { userId, username });
    logger.info('Dashboard client connected', {
      socketId: socket.id,
      userId,
      username,
      totalClients: this.connectedClients.size
    });

    // Send initial server status
    this.sendServerStatus(socket);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.connectedClients.delete(socket.id);
      logger.info('Dashboard client disconnected', {
        socketId: socket.id,
        userId,
        reason,
        totalClients: this.connectedClients.size
      });
    });

    // Handle request for server status refresh
    socket.on('requestServerStatus', async () => {
      await this.sendServerStatus(socket);
    });
  }

  /**
   * Send current server status to a specific socket
   */
  async sendServerStatus(socket) {
    try {
      const servers = await getServersStatus();
      socket.emit('serverStatus', {
        servers,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error sending server status', { error: error.message });
    }
  }

  /**
   * Broadcast server status to all connected clients
   */
  async broadcastServerStatus() {
    if (this.connectedClients.size === 0) {
      return; // No clients connected, skip
    }

    try {
      const servers = await getServersStatus();
      this.io.emit('serverStatus', {
        servers,
        timestamp: new Date().toISOString()
      });

      logger.debug('Broadcast server status', {
        serverCount: servers.length,
        clientCount: this.connectedClients.size
      });
    } catch (error) {
      logger.error('Error broadcasting server status', { error: error.message });
    }
  }

  /**
   * Handle player joined/left events - trigger a broadcast
   */
  handlePlayerEvent() {
    // Debounce broadcasts - don't send more than once per second
    if (this._lastBroadcast && Date.now() - this._lastBroadcast < 1000) {
      return;
    }
    this._lastBroadcast = Date.now();

    // Broadcast updated status
    this.broadcastServerStatus();
  }

  /**
   * Handle player count update events
   */
  handlePlayerCountUpdate() {
    // Same debounce logic
    if (this._lastBroadcast && Date.now() - this._lastBroadcast < 1000) {
      return;
    }
    this._lastBroadcast = Date.now();

    this.broadcastServerStatus();
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClientCount() {
    return this.connectedClients.size;
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    logger.info('Shutting down DashboardSocketService...');

    // Unsubscribe from events
    const playtimeService = global.playtimeTrackingService;
    if (playtimeService) {
      playtimeService.off('playerJoined', this._boundHandlers.onPlayerJoined);
      playtimeService.off('playerLeft', this._boundHandlers.onPlayerLeft);
      playtimeService.off('playerCountUpdate', this._boundHandlers.onPlayerCountUpdate);
    }

    // Close all connections
    this.io.close();
    this.connectedClients.clear();

    logger.info('DashboardSocketService shutdown complete');
  }
}

module.exports = DashboardSocketService;
