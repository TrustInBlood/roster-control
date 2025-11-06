const { console: loggerConsole } = require('../utils/logger');
const { Player } = require('../database/models');
const { Server } = require('../database/models');
const PlayerSession = require('../database/models/PlayerSession');

/**
 * Playtime Tracking Service
 * Polls Squad servers every 60 seconds to track player sessions via diff detection
 */
class PlaytimeTrackingService {
  constructor(logger, connectionManager) {
    this.logger = logger;
    this.connectionManager = connectionManager;

    // In-memory tracking: Map<serverId:steamId, { playerId, sessionId, username, joinTime }>
    this.activeSessions = new Map();

    // Polling intervals: Map<serverId, intervalId>
    this.pollIntervals = new Map();

    // Polling frequency in milliseconds (60 seconds)
    this.pollIntervalMs = 60 * 1000;
  }

  /**
   * Initialize the service and start polling all servers
   */
  async initialize() {
    loggerConsole.log('Initializing PlaytimeTrackingService...');

    // Get all server connections
    const connections = this.connectionManager.getConnections();

    for (const [serverId, connectionData] of connections) {
      this.startServerPolling(serverId, connectionData);
    }

    loggerConsole.log(`PlaytimeTrackingService initialized: Polling ${connections.size} servers every ${this.pollIntervalMs / 1000}s`);
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
      // Request playerlist from SquadJS (reads from cache, no server query)
      const playerList = await this.getPlayerList(socket);

      if (!playerList) {
        loggerConsole.warn(`Failed to get playerlist for server: ${serverId}`);
        return;
      }

      // Process the playerlist and detect joins/leaves
      await this.processPlayerList(serverId, playerList);

    } catch (error) {
      loggerConsole.error(`Error polling server ${serverId}:`, error.message);
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
   */
  async processPlayerList(serverId, playerList) {
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
        await this.handleNewPlayer(serverId, playerData);
      }
    }

    // Detect departed players (in active but not in current)
    for (const steamId of activeSteamIds) {
      if (!currentPlayers.has(steamId)) {
        await this.handleDepartedPlayer(serverId, steamId);
      }
    }
  }

  /**
   * Handle a new player joining
   * @param {string} serverId - Server identifier
   * @param {Object} playerData - Player data { steamId, eosId, username }
   */
  async handleNewPlayer(serverId, playerData) {
    const { steamId, eosId, username } = playerData;

    try {
      // Step 1: Find or create Player record
      const player = await Player.findOrCreateByIdentifiers(steamId, eosId, username);

      // Step 2: Create new PlayerSession
      const session = await PlayerSession.createSession(player.id, serverId);

      // Step 3: Add to in-memory tracking
      const sessionKey = `${serverId}:${steamId}`;
      this.activeSessions.set(sessionKey, {
        playerId: player.id,
        sessionId: session.id,
        username: username,
        joinTime: session.sessionStart
      });

      // Step 4: Update Player activity stats
      await player.updateActivity(serverId);

      // Step 5: Update Server connection count
      const serverRecord = await Server.findByServerId(serverId);
      if (serverRecord) {
        await serverRecord.addConnection();
      }

      loggerConsole.log(`Player joined: ${username} (${steamId}) on ${serverId}`);

    } catch (error) {
      loggerConsole.error(`Error handling new player ${steamId}:`, error.message);
    }
  }

  /**
   * Handle a player leaving
   * @param {string} serverId - Server identifier
   * @param {string} steamId - Steam ID of departed player
   */
  async handleDepartedPlayer(serverId, steamId) {
    const sessionKey = `${serverId}:${steamId}`;
    const sessionData = this.activeSessions.get(sessionKey);

    if (!sessionData) {
      loggerConsole.warn(`No active session found for departed player: ${steamId} on ${serverId}`);
      return;
    }

    try {
      const { playerId, sessionId, username } = sessionData;

      // Step 1: End the session
      const session = await PlayerSession.endSession(sessionId);

      if (!session) {
        loggerConsole.warn(`Failed to end session ${sessionId} for ${steamId}`);
        this.activeSessions.delete(sessionKey);
        return;
      }

      // Step 2: Update Player total playtime
      const player = await Player.findByPk(playerId);
      if (player && session.durationMinutes) {
        await player.addPlayTime(session.durationMinutes);
      }

      // Step 3: Update Server total playtime
      const serverRecord = await Server.findByServerId(serverId);
      if (serverRecord && session.durationMinutes) {
        await serverRecord.addPlaytime(session.durationMinutes);
      }

      // Step 4: Remove from in-memory tracking
      this.activeSessions.delete(sessionKey);

      loggerConsole.log(`Player left: ${username} (${steamId}) from ${serverId} - Duration: ${session.durationMinutes} minutes`);

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
    loggerConsole.log('Shutting down PlaytimeTrackingService...');

    // Stop all polling intervals
    for (const [serverId, intervalId] of this.pollIntervals) {
      clearInterval(intervalId);
      loggerConsole.log(`Stopped polling for server: ${serverId}`);
    }

    this.pollIntervals.clear();

    // Close all active sessions
    const closedCount = await PlayerSession.closeAllActiveSessions();
    loggerConsole.log(`Closed ${closedCount} active sessions on shutdown`);

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
}

module.exports = PlaytimeTrackingService;
