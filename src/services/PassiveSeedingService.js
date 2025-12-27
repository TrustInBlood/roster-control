const { createServiceLogger } = require('../utils/logger');
const { SeedingTime, ServerSeedingSnapshot, Player } = require('../database/models');

/**
 * PassiveSeedingService
 *
 * Tracks passive seeding time - time players spend on servers while below seed threshold.
 * This runs continuously, independent of organized seeding sessions.
 *
 * Key features:
 * - In-memory tracking during poll cycles (minimal DB writes)
 * - Aggregates written on session end or periodic flush
 * - Server state changes recorded only on threshold crossing
 */
class PassiveSeedingService {
  constructor() {
    this.logger = createServiceLogger('PassiveSeedingService');

    // Server state tracking: Map<serverId, { wasBelowThreshold, threshold, lastUpdate }>
    this.serverStates = new Map();

    // Player seeding time accumulator: Map<sessionKey, { playerId, serverId, seedingMinutes, totalMinutes, threshold }>
    // sessionKey = `${serverId}:${steamId}`
    this.playerAccumulators = new Map();

    // Flush interval for periodic writes (every 5 minutes)
    this.flushIntervalMs = 5 * 60 * 1000;
    this.flushIntervalId = null;

    this.logger.info('PassiveSeedingService initialized');
  }

  /**
   * Start the service (called on bot startup)
   */
  start() {
    // Start periodic flush
    this.flushIntervalId = setInterval(() => {
      this.flushAccumulators().catch(err => {
        this.logger.error('Error during periodic flush:', err.message);
      });
    }, this.flushIntervalMs);

    this.logger.info('PassiveSeedingService started', { flushIntervalMs: this.flushIntervalMs });
  }

  /**
   * Stop the service (called on bot shutdown)
   */
  async stop() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }

    // Final flush before shutdown
    await this.flushAccumulators();

    this.serverStates.clear();
    this.playerAccumulators.clear();

    this.logger.info('PassiveSeedingService stopped');
  }

  /**
   * Called each poll cycle to track server state and player seeding time
   *
   * @param {string} serverId - Server identifier
   * @param {number} playerCount - Current player count
   * @param {number} threshold - Seed threshold for this server
   * @param {Array<{steamId: string, playerId: number}>} activePlayers - Currently active players
   */
  async trackPollCycle(serverId, playerCount, threshold, activePlayers) {
    const isBelowThreshold = playerCount < threshold;
    const previousState = this.serverStates.get(serverId);

    // Check if server state changed (crossing threshold)
    if (previousState && previousState.wasBelowThreshold !== isBelowThreshold) {
      // State changed - record the transition
      try {
        await ServerSeedingSnapshot.recordStateChange(
          serverId,
          playerCount,
          isBelowThreshold,
          threshold
        );

        this.logger.info('Server seeding state changed', {
          serverId,
          playerCount,
          threshold,
          nowSeeding: isBelowThreshold
        });
      } catch (err) {
        this.logger.error('Failed to record state change:', err.message);
      }
    }

    // Update server state
    this.serverStates.set(serverId, {
      wasBelowThreshold: isBelowThreshold,
      threshold,
      lastUpdate: Date.now()
    });

    // Update player accumulators (1 minute elapsed since last poll)
    for (const { steamId, playerId } of activePlayers) {
      const sessionKey = `${serverId}:${steamId}`;

      let accumulator = this.playerAccumulators.get(sessionKey);

      if (!accumulator) {
        // Create new accumulator for this session
        accumulator = {
          playerId,
          serverId,
          seedingMinutes: 0,
          totalMinutes: 0,
          threshold
        };
        this.playerAccumulators.set(sessionKey, accumulator);
      }

      // Add 1 minute to totals
      accumulator.totalMinutes += 1;

      if (isBelowThreshold) {
        accumulator.seedingMinutes += 1;
      }
    }
  }

  /**
   * Called when a player leaves (session ends)
   * Finalizes their seeding time and writes to database
   *
   * @param {string} sessionKey - The session key (`${serverId}:${steamId}`)
   * @param {number} playerId - Player ID
   * @returns {Promise<{seedingMinutes: number, totalMinutes: number}>}
   */
  async finalizePlayerSession(sessionKey, playerId) {
    const accumulator = this.playerAccumulators.get(sessionKey);

    if (!accumulator) {
      return { seedingMinutes: 0, totalMinutes: 0 };
    }

    const { serverId, seedingMinutes, totalMinutes, threshold } = accumulator;

    // Remove from accumulators
    this.playerAccumulators.delete(sessionKey);

    // Write to database if there's any time to record
    if (totalMinutes > 0) {
      try {
        await SeedingTime.addSeedingTime(
          playerId,
          serverId,
          seedingMinutes,
          totalMinutes,
          threshold
        );

        // Also update player's lifetime seeding total
        await this.updatePlayerLifetimeSeeding(playerId, seedingMinutes);

        this.logger.debug('Finalized player seeding session', {
          sessionKey,
          playerId,
          seedingMinutes,
          totalMinutes,
          seedingPercentage: Math.round((seedingMinutes / totalMinutes) * 100)
        });
      } catch (err) {
        this.logger.error('Failed to finalize player seeding session:', err.message);
      }
    }

    return { seedingMinutes, totalMinutes };
  }

  /**
   * Periodic flush of accumulators to database
   * Writes partial data without removing accumulators (session still active)
   */
  async flushAccumulators() {
    if (this.playerAccumulators.size === 0) {
      return;
    }

    const flushed = [];
    const errors = [];

    for (const [sessionKey, accumulator] of this.playerAccumulators) {
      const { playerId, serverId, seedingMinutes, totalMinutes, threshold } = accumulator;

      // Only flush if there's accumulated time
      if (totalMinutes > 0) {
        try {
          await SeedingTime.addSeedingTime(
            playerId,
            serverId,
            seedingMinutes,
            totalMinutes,
            threshold
          );

          // Update player's lifetime seeding total
          await this.updatePlayerLifetimeSeeding(playerId, seedingMinutes);

          // Reset accumulator (time has been flushed)
          accumulator.seedingMinutes = 0;
          accumulator.totalMinutes = 0;

          flushed.push(sessionKey);
        } catch (err) {
          errors.push({ sessionKey, error: err.message });
        }
      }
    }

    if (flushed.length > 0 || errors.length > 0) {
      this.logger.info('Flushed seeding accumulators', {
        flushed: flushed.length,
        errors: errors.length
      });
    }

    if (errors.length > 0) {
      this.logger.error('Errors during flush:', errors);
    }
  }

  /**
   * Update player's lifetime seeding total
   * @param {number} playerId - Player ID
   * @param {number} seedingMinutes - Minutes to add
   */
  async updatePlayerLifetimeSeeding(playerId, seedingMinutes) {
    if (seedingMinutes <= 0) return;

    try {
      await Player.increment(
        { total_seeding_minutes: seedingMinutes },
        { where: { id: playerId } }
      );
    } catch (err) {
      this.logger.error('Failed to update player lifetime seeding:', err.message);
    }
  }

  /**
   * Get current server seeding states (for monitoring/debugging)
   * @returns {Object}
   */
  getServerStates() {
    const states = {};
    for (const [serverId, state] of this.serverStates) {
      states[serverId] = {
        isSeeding: state.wasBelowThreshold,
        threshold: state.threshold,
        lastUpdate: new Date(state.lastUpdate).toISOString()
      };
    }
    return states;
  }

  /**
   * Get current accumulator stats (for monitoring/debugging)
   * @returns {Object}
   */
  getAccumulatorStats() {
    let totalSeedingMinutes = 0;
    let totalPlayMinutes = 0;
    const byServer = {};

    for (const [sessionKey, acc] of this.playerAccumulators) {
      totalSeedingMinutes += acc.seedingMinutes;
      totalPlayMinutes += acc.totalMinutes;

      if (!byServer[acc.serverId]) {
        byServer[acc.serverId] = { players: 0, seedingMinutes: 0, totalMinutes: 0 };
      }
      byServer[acc.serverId].players++;
      byServer[acc.serverId].seedingMinutes += acc.seedingMinutes;
      byServer[acc.serverId].totalMinutes += acc.totalMinutes;
    }

    return {
      activeSessions: this.playerAccumulators.size,
      totalSeedingMinutes,
      totalPlayMinutes,
      byServer
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get singleton instance of PassiveSeedingService
   */
  getPassiveSeedingService() {
    if (!instance) {
      instance = new PassiveSeedingService();
    }
    return instance;
  },

  /**
   * Initialize and start the service
   */
  initializePassiveSeedingService() {
    const service = module.exports.getPassiveSeedingService();
    service.start();
    return service;
  }
};
