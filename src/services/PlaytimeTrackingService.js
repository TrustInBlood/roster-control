const EventEmitter = require('events');
const { console: loggerConsole } = require('../utils/logger');
const { Player } = require('../database/models');
const { Server } = require('../database/models');
const PlayerSession = require('../database/models/PlayerSession');
const { getPassiveSeedingService } = require('./PassiveSeedingService');

/**
 * Playtime Tracking Service
 * Polls Squad servers every 60 seconds to track player sessions via diff detection
 *
 * Events emitted:
 * - 'playerJoined': { serverId, steamId, eosId, username, playerId, playerCount }
 * - 'playerLeft': { serverId, steamId, username, playerId, durationMinutes, playerCount }
 * - 'playerCountUpdate': { serverId, playerCount, steamIds }
 */
class PlaytimeTrackingService extends EventEmitter {
  constructor(logger, connectionManager) {
    super();
    this.logger = logger;
    this.connectionManager = connectionManager;

    // In-memory tracking: Map<serverId:steamId, { playerId, sessionId, username, joinTime }>
    this.activeSessions = new Map();

    // Polling intervals: Map<serverId, intervalId>
    this.pollIntervals = new Map();

    // Polling frequency in milliseconds (60 seconds)
    this.pollIntervalMs = 60 * 1000;

    // Passive seeding service for tracking seeding time
    this.seedingService = getPassiveSeedingService();

    // Shutdown guard
    this.isShuttingDown = false;
  }

  /**
   * Initialize the service and start polling all servers
   */
  async initialize() {
    loggerConsole.log('Initializing PlaytimeTrackingService...');

    // Clean up stale sessions from previous crashes (older than 6 hours)
    await this.cleanupStaleSessions();

    // Start passive seeding service
    this.seedingService.start();

    // Get all server connections
    const connections = this.connectionManager.getConnections();

    for (const [serverId, connectionData] of connections) {
      this.startServerPolling(serverId, connectionData);
    }

    loggerConsole.log(`PlaytimeTrackingService initialized: Polling ${connections.size} servers every ${this.pollIntervalMs / 1000}s`);
  }

  /**
   * Clean up stale sessions that were left open from previous crashes
   * Sessions older than 6 hours are considered stale and closed
   */
  async cleanupStaleSessions() {
    try {
      const staleHours = 6;
      const closedCount = await PlayerSession.closeStaleSessionsOlderThan(staleHours);

      if (closedCount > 0) {
        loggerConsole.log(`Cleaned up ${closedCount} stale sessions (older than ${staleHours} hours)`);
      }
    } catch (error) {
      loggerConsole.error('Error cleaning up stale sessions:', error.message);
    }
  }

  /**
   * Start polling a specific server
   * @param {string} serverId - Server identifier
   * @param {Object} connectionData - Connection data with socket
   */
  startServerPolling(serverId, connectionData) {
    const { socket, server } = connectionData;

    // Initial poll immediately
    this.pollServer(serverId, socket, server);

    // Set up recurring poll
    const intervalId = setInterval(() => {
      this.pollServer(serverId, socket, server);
    }, this.pollIntervalMs);

    this.pollIntervals.set(serverId, intervalId);

    loggerConsole.log(`Started polling for server: ${serverId} (${server.name})`);
  }

  /**
   * Poll a server for current playerlist and detect changes
   * @param {string} serverId - Server identifier
   * @param {Socket} socket - Socket.io connection
   * @param {Object} server - Server configuration
   */
  async pollServer(serverId, socket, server) {
    try {
      // Check connection state - skip polling if server is degraded
      if (this.connectionManager.isServerDegraded(serverId)) {
        // Server is in degraded mode - don't poll
        return;
      }

      // Check if socket is connected
      if (!socket || !socket.connected) {
        // Socket is not connected - don't attempt to poll
        return;
      }

      // Request playerlist from SquadJS (reads from cache, no server query)
      const playerList = await this.getPlayerList(socket);

      if (!playerList) {
        loggerConsole.warn(`Failed to get playerlist for server: ${serverId}`);
        return;
      }

      // Process the playerlist and detect joins/leaves
      await this.processPlayerList(serverId, playerList, server);

      // Track passive seeding time for active players
      const playerCount = playerList.length;
      const threshold = server.seedThreshold || 50;

      // Build list of active players for seeding tracking
      const activePlayers = [];
      for (const [sessionKey, sessionData] of this.activeSessions) {
        if (sessionKey.startsWith(`${serverId}:`)) {
          activePlayers.push({
            steamId: sessionKey.split(':')[1],
            playerId: sessionData.playerId
          });
        }
      }

      // Track seeding time (handles state changes and player accumulation)
      await this.seedingService.trackPollCycle(serverId, playerCount, threshold, activePlayers);

    } catch (error) {
      // Determine log level based on connection state
      const connection = this.connectionManager.getServerConnection(serverId);
      const isDisconnected = connection && (connection.state === 'failed' || connection.state === 'degraded');

      if (isDisconnected) {
        // Server is known to be offline - log as debug to reduce noise
        loggerConsole.debug(`Error polling offline server ${serverId}:`, error.message);
      } else {
        // Server should be online - log as error
        loggerConsole.error(`Error polling server ${serverId}:`, error.message);
      }
    }
  }

  /**
   * Get playerlist from SquadJS via socket.emit
   * @param {Socket} socket - Socket.io connection
   * @returns {Promise<Array>} - Array of player objects
   */
  getPlayerList(socket) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Playerlist request timed out after 10s'));
      }, 10000);

      socket.emit('players', (playerList) => {
        clearTimeout(timeout);
        resolve(playerList || []);
      });
    });
  }

  /**
   * Process playerlist and detect joins/leaves via diff
   * @param {string} serverId - Server identifier
   * @param {Array} playerList - Current playerlist from SquadJS
   * @param {Object} server - Server configuration
   */
  async processPlayerList(serverId, playerList, server) {
    // Build set of current steamIds on server
    const currentPlayers = new Set();
    const playerDataMap = new Map(); // steamId -> player data

    for (const player of playerList) {
      if (player.steamID) {
        currentPlayers.add(player.steamID);
        playerDataMap.set(player.steamID, {
          steamId: player.steamID,
          eosId: player.eosID || null,
          username: player.name || 'Unknown'
        });
      }
    }

    const playerCount = currentPlayers.size;

    // Get active sessions for this server
    const activeSessionKeys = Array.from(this.activeSessions.keys())
      .filter(key => key.startsWith(`${serverId}:`));

    const activeSteamIds = new Set(
      activeSessionKeys.map(key => key.split(':')[1])
    );

    // Detect new players (in current but not in active)
    for (const steamId of currentPlayers) {
      if (!activeSteamIds.has(steamId)) {
        const playerData = playerDataMap.get(steamId);
        await this.handleNewPlayer(serverId, playerData, playerCount, server);
      }
    }

    // Detect departed players (in active but not in current)
    for (const steamId of activeSteamIds) {
      if (!currentPlayers.has(steamId)) {
        await this.handleDepartedPlayer(serverId, steamId, playerCount);
      }
    }

    // Emit playerCountUpdate event with current state
    this.emit('playerCountUpdate', {
      serverId,
      playerCount,
      steamIds: Array.from(currentPlayers)
    });
  }

  /**
   * Handle a new player joining
   * @param {string} serverId - Server identifier
   * @param {Object} playerData - Player data { steamId, eosId, username }
   * @param {number} playerCount - Current player count on server
   * @param {Object} server - Server configuration
   */
  async handleNewPlayer(serverId, playerData, playerCount, server) {
    const { steamId, eosId, username } = playerData;

    try {
      // Step 1: Find or create Player record
      const player = await Player.findOrCreateByIdentifiers(steamId, eosId, username);

      // Step 2: Build minimal session metadata (seeding is now tracked separately)
      const metadata = {
        seedThreshold: server.seedThreshold || 50,
        initialPlayerCount: playerCount
      };

      // Step 3: Create new PlayerSession with metadata
      const session = await PlayerSession.createSession(player.id, serverId, metadata);

      // Step 4: Add to in-memory tracking
      const sessionKey = `${serverId}:${steamId}`;
      this.activeSessions.set(sessionKey, {
        playerId: player.id,
        sessionId: session.id,
        username: username,
        joinTime: session.sessionStart
      });

      // Step 5: Update Player activity stats
      await player.updateActivity(serverId);

      // Step 6: Update Server connection count
      const serverRecord = await Server.findByServerId(serverId);
      if (serverRecord) {
        await serverRecord.addConnection();
      }

      loggerConsole.log(`Player joined: ${username} (${steamId}) on ${serverId}`);

      // Emit playerJoined event for other services (e.g., SeedingSessionService)
      this.emit('playerJoined', {
        serverId,
        steamId,
        eosId,
        username,
        playerId: player.id,
        playerCount
      });

    } catch (error) {
      loggerConsole.error(`Error handling new player ${steamId}:`, error.message);
    }
  }

  /**
   * Handle a player leaving
   * @param {string} serverId - Server identifier
   * @param {string} steamId - Steam ID of departed player
   * @param {number} playerCount - Current player count on server (after player left)
   */
  async handleDepartedPlayer(serverId, steamId, playerCount) {
    const sessionKey = `${serverId}:${steamId}`;
    const sessionData = this.activeSessions.get(sessionKey);

    if (!sessionData) {
      loggerConsole.warn(`No active session found for departed player: ${steamId} on ${serverId}`);
      return;
    }

    try {
      const { playerId, sessionId, username } = sessionData;

      // Step 1: Finalize seeding time tracking and get accumulated minutes
      const { seedingMinutes } = await this.seedingService.finalizePlayerSession(sessionKey, playerId);

      // Step 2: End the session with final player count and seeding time
      const finalMetadata = {
        finalPlayerCount: playerCount
      };
      const session = await PlayerSession.endSession(sessionId, finalMetadata, seedingMinutes);

      if (!session) {
        loggerConsole.warn(`Failed to end session ${sessionId} for ${steamId}`);
        this.activeSessions.delete(sessionKey);
        return;
      }

      // Step 3: Update Player total playtime
      const player = await Player.findByPk(playerId);
      if (player && session.durationMinutes) {
        await player.addPlayTime(session.durationMinutes);
      }

      // Step 4: Update Server total playtime
      const serverRecord = await Server.findByServerId(serverId);
      if (serverRecord && session.durationMinutes) {
        await serverRecord.addPlaytime(session.durationMinutes);
      }

      // Step 5: Remove from in-memory tracking
      this.activeSessions.delete(sessionKey);

      loggerConsole.log(`Player left: ${username} (${steamId}) from ${serverId} - Duration: ${session.durationMinutes} min, Seeding: ${seedingMinutes} min`);

      // Emit playerLeft event for other services (e.g., SeedingSessionService)
      this.emit('playerLeft', {
        serverId,
        steamId,
        username,
        playerId,
        durationMinutes: session.durationMinutes,
        playerCount
      });

    } catch (error) {
      loggerConsole.error(`Error handling departed player ${steamId}:`, error.message);
      // Still remove from tracking to avoid memory leak
      this.activeSessions.delete(sessionKey);
    }
  }

  /**
   * Shutdown service - stop polling and close all active sessions
   */
  async shutdown() {
    // Prevent duplicate shutdown calls
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    loggerConsole.log('Shutting down PlaytimeTrackingService...');

    // Stop all polling intervals
    for (const [serverId, intervalId] of this.pollIntervals) {
      clearInterval(intervalId);
      loggerConsole.log(`Stopped polling for server: ${serverId}`);
    }

    this.pollIntervals.clear();

    // Stop passive seeding service (flushes accumulators)
    try {
      await this.seedingService.stop();
    } catch (error) {
      loggerConsole.error('Error stopping seeding service:', error.message);
    }

    // Close all active sessions
    try {
      const closedCount = await PlayerSession.closeAllActiveSessions();
      loggerConsole.log(`Closed ${closedCount} active sessions on shutdown`);
    } catch (error) {
      loggerConsole.error('Error closing active sessions:', error.message);
    }

    // Clear in-memory tracking
    this.activeSessions.clear();

    loggerConsole.log('PlaytimeTrackingService shutdown complete');
  }

  /**
   * Get current active sessions (for monitoring/debugging)
   * @returns {Map} - Active sessions map
   */
  getActiveSessions() {
    return this.activeSessions;
  }

  /**
   * Get statistics about active sessions
   * @returns {Object} - Statistics
   */
  getStats() {
    const statsByServer = {};

    for (const [sessionKey, sessionData] of this.activeSessions) {
      const serverId = sessionKey.split(':')[0];
      statsByServer[serverId] = (statsByServer[serverId] || 0) + 1;
    }

    return {
      totalActiveSessions: this.activeSessions.size,
      sessionsByServer: statsByServer,
      pollingServers: this.pollIntervals.size
    };
  }

  /**
   * Get the current player count for a server
   * Uses active sessions count, or queries socket directly as fallback
   * @param {string} serverId - Server identifier
   * @returns {Promise<number>} - Current player count
   */
  async getServerPlayerCount(serverId) {
    // First try active sessions count (fast path)
    let count = 0;
    for (const [sessionKey] of this.activeSessions) {
      if (sessionKey.startsWith(`${serverId}:`)) {
        count++;
      }
    }

    // If we have active sessions tracked, return that count
    if (count > 0) {
      return count;
    }

    // Otherwise, try to query the socket directly
    const connection = this.connectionManager.getServerConnection(serverId);
    if (!connection || !connection.socket || !connection.socket.connected) {
      return 0;
    }

    try {
      const playerList = await this.getPlayerList(connection.socket);
      return playerList ? playerList.length : 0;
    } catch (error) {
      loggerConsole.debug(`Failed to get player count for ${serverId}:`, error.message);
      return 0;
    }
  }
}

module.exports = PlaytimeTrackingService;
