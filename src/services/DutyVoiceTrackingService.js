const { createServiceLogger } = require('../utils/logger');
const { getDutyConfigService } = require('./DutyConfigService');
const { getDutySessionService } = require('./DutySessionService');
const { DutySession, DutyLifetimeStats } = require('../database/models');

const logger = createServiceLogger('DutyVoiceTrackingService');

/**
 * Tracks voice channel presence for all users.
 * Accumulates voice minutes and credits them appropriately:
 * - On-duty users: Credits to active session
 * - Off-duty users: Credits directly to lifetime stats
 */
class DutyVoiceTrackingService {
  constructor(client) {
    this.client = client;
    this.configService = getDutyConfigService();

    // Track active voice sessions: Map<discordUserId, { channelId, joinTime, guildId, isOnDuty }>
    this.voiceSessions = new Map();

    // Interval for periodic voice minute updates (every 5 minutes)
    this.updateInterval = null;
    this.UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing DutyVoiceTrackingService');

    // Start periodic update interval
    this.startPeriodicUpdates();

    // Scan for users already in voice channels
    await this.scanExistingVoiceStates();

    this.initialized = true;
    logger.info('DutyVoiceTrackingService initialized');
  }

  async shutdown() {
    this.stopPeriodicUpdates();

    // Finalize any active voice sessions
    for (const [userId, session] of this.voiceSessions) {
      await this.finalizeVoiceSession(userId, session);
    }
    this.voiceSessions.clear();

    this.initialized = false;
    logger.info('DutyVoiceTrackingService shutdown');
  }

  /**
   * Start periodic updates to accumulate voice minutes
   */
  startPeriodicUpdates() {
    this.updateInterval = setInterval(async () => {
      await this.updateAllVoiceSessions();
    }, this.UPDATE_INTERVAL_MS);

    logger.info('Started periodic voice updates', { intervalMinutes: 5 });
  }

  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Stopped periodic voice updates');
    }
  }

  /**
   * Scan existing voice states on startup to catch users already in voice
   */
  async scanExistingVoiceStates() {
    try {
      for (const [guildId, guild] of this.client.guilds.cache) {
        // Get on-duty users for reference
        const activeSessions = await DutySession.getActiveSessions(guildId);
        const onDutyUserIds = new Set(activeSessions.map(s => s.discordUserId));

        for (const [memberId, voiceState] of guild.voiceStates.cache) {
          if (!voiceState.channel) continue;

          // Check if channel should be tracked
          const isTracked = await this.configService.isTrackedVoiceChannel(guildId, voiceState.channel.id);
          if (!isTracked) continue;

          // Add to tracking (both on-duty and off-duty)
          this.voiceSessions.set(memberId, {
            channelId: voiceState.channel.id,
            channelName: voiceState.channel.name,
            joinTime: new Date(),
            guildId,
            isOnDuty: onDutyUserIds.has(memberId)
          });

          logger.info('Resumed tracking voice session', {
            discordUserId: memberId,
            channelName: voiceState.channel.name,
            isOnDuty: onDutyUserIds.has(memberId)
          });
        }
      }

      logger.info('Scanned existing voice states', {
        trackedSessions: this.voiceSessions.size
      });
    } catch (error) {
      logger.error('Error scanning existing voice states', { error: error.message });
    }
  }

  /**
   * Handle voice state update from Discord
   */
  async handleVoiceStateUpdate(oldState, newState) {
    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;

    if (!userId || !guildId) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Case 1: User left voice entirely
    if (oldChannel && !newChannel) {
      await this.handleVoiceLeave(userId);
      return;
    }

    // Case 2: User joined voice
    if (!oldChannel && newChannel) {
      await this.handleVoiceJoin(userId, newChannel, guildId);
      return;
    }

    // Case 3: User switched channels
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      await this.handleVoiceLeave(userId);
      await this.handleVoiceJoin(userId, newChannel, guildId);
      return;
    }
  }

  /**
   * Handle user joining a voice channel
   */
  async handleVoiceJoin(userId, channel, guildId) {
    // Check if channel should be tracked
    const isTracked = await this.configService.isTrackedVoiceChannel(guildId, channel.id);

    if (!isTracked) {
      logger.debug('Ignoring voice join - channel not tracked', {
        userId,
        channelName: channel.name
      });
      return;
    }

    // Check if user is on duty
    const dutySession = await DutySession.getActiveSession(userId);

    // Start tracking this voice session
    this.voiceSessions.set(userId, {
      channelId: channel.id,
      channelName: channel.name,
      joinTime: new Date(),
      guildId,
      isOnDuty: !!dutySession
    });

    logger.info('Started tracking voice session', {
      discordUserId: userId,
      channelName: channel.name,
      isOnDuty: !!dutySession
    });
  }

  /**
   * Handle user leaving a voice channel
   */
  async handleVoiceLeave(userId) {
    const voiceSession = this.voiceSessions.get(userId);

    if (!voiceSession) {
      // Wasn't being tracked (maybe excluded channel)
      return;
    }

    // Finalize and credit the voice time
    await this.finalizeVoiceSession(userId, voiceSession);
    this.voiceSessions.delete(userId);
  }

  /**
   * Finalize a voice session and credit minutes appropriately
   */
  async finalizeVoiceSession(userId, voiceSession) {
    const durationMs = Date.now() - voiceSession.joinTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    if (durationMinutes < 1) {
      // Less than a minute, don't credit
      return;
    }

    try {
      // Get point value for voice
      const voicePointsPerMinute = await this.configService.getPointValue(voiceSession.guildId, 'voice_per_minute');
      const voicePoints = Math.floor(durationMinutes * voicePointsPerMinute);

      // Check if user is currently on duty
      const dutySession = await DutySession.getActiveSession(userId);

      if (dutySession) {
        // On duty: Credit voice minutes to the session
        const sessionService = getDutySessionService();
        await sessionService.addVoiceTime(dutySession.id, durationMinutes);

        logger.info('Credited voice time to duty session', {
          discordUserId: userId,
          sessionId: dutySession.id,
          channelName: voiceSession.channelName,
          durationMinutes
        });
      } else {
        // Off duty: Credit directly to lifetime stats
        try {
          await DutyLifetimeStats.addOffDutyVoiceMinutes(userId, voiceSession.guildId, durationMinutes, voicePoints);

          logger.info('Credited off-duty voice time', {
            discordUserId: userId,
            channelName: voiceSession.channelName,
            durationMinutes,
            points: voicePoints
          });
        } catch (lifetimeError) {
          // Table may not exist yet if migrations haven't run
          logger.warn('Could not update lifetime stats for off-duty voice', {
            userId,
            error: lifetimeError.message
          });
        }
      }
    } catch (error) {
      logger.error('Error finalizing voice session', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Periodic update: Credit accumulated voice time for all active sessions
   */
  async updateAllVoiceSessions() {
    const now = new Date();

    for (const [userId, voiceSession] of this.voiceSessions) {
      const durationMs = now.getTime() - voiceSession.joinTime.getTime();
      const durationMinutes = Math.floor(durationMs / 60000);

      if (durationMinutes < 1) continue;

      try {
        // Check if they're still in a tracked channel
        const member = await this.client.guilds.cache
          .get(voiceSession.guildId)
          ?.members.fetch(userId)
          .catch(() => null);

        if (!member?.voice?.channel) {
          // No longer in voice - finalize and clean up
          await this.finalizeVoiceSession(userId, voiceSession);
          this.voiceSessions.delete(userId);
          continue;
        }

        // Get point value for voice
        const voicePointsPerMinute = await this.configService.getPointValue(voiceSession.guildId, 'voice_per_minute');
        const voicePoints = Math.floor(durationMinutes * voicePointsPerMinute);

        // Check if user has active duty session
        const dutySession = await DutySession.getActiveSession(userId);

        if (dutySession) {
          // On duty: Credit the accumulated time to session
          const sessionService = getDutySessionService();
          await sessionService.addVoiceTime(dutySession.id, durationMinutes);

          logger.debug('Credited periodic voice time to session', {
            userId,
            sessionId: dutySession.id,
            durationMinutes
          });
        } else {
          // Off duty: Credit directly to lifetime stats
          try {
            await DutyLifetimeStats.addOffDutyVoiceMinutes(userId, voiceSession.guildId, durationMinutes, voicePoints);

            logger.debug('Credited periodic off-duty voice time', {
              userId,
              durationMinutes,
              points: voicePoints
            });
          } catch (lifetimeError) {
            // Table may not exist yet if migrations haven't run
            logger.warn('Could not update lifetime stats for periodic off-duty voice', {
              userId,
              error: lifetimeError.message
            });
          }
        }

        // Reset join time for next interval
        voiceSession.joinTime = now;

        // Update on-duty status for next cycle
        voiceSession.isOnDuty = !!dutySession;
      } catch (error) {
        logger.error('Error updating voice session', {
          userId,
          error: error.message
        });
      }
    }
  }

  /**
   * Called when a user goes on duty - start tracking if they're in voice
   */
  async onDutyStart(userId, guildId) {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member?.voice?.channel) return;

      // Check if channel should be tracked
      const isTracked = await this.configService.isTrackedVoiceChannel(guildId, member.voice.channel.id);
      if (!isTracked) return;

      // Check if already tracking
      const existingSession = this.voiceSessions.get(userId);
      if (existingSession) {
        // User was already in voice, just update their status
        existingSession.isOnDuty = true;
        return;
      }

      // Start tracking
      this.voiceSessions.set(userId, {
        channelId: member.voice.channel.id,
        channelName: member.voice.channel.name,
        joinTime: new Date(),
        guildId,
        isOnDuty: true
      });

      logger.info('Started voice tracking on duty start', {
        discordUserId: userId,
        channelName: member.voice.channel.name
      });
    } catch (error) {
      logger.error('Error starting voice tracking on duty start', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Called when a user goes off duty - finalize voice tracking for session
   */
  async onDutyEnd(userId) {
    const voiceSession = this.voiceSessions.get(userId);
    if (!voiceSession) return;

    // Finalize the on-duty portion
    await this.finalizeVoiceSession(userId, voiceSession);

    // Keep tracking but mark as off-duty now
    voiceSession.isOnDuty = false;
    voiceSession.joinTime = new Date(); // Reset for off-duty tracking

    logger.info('Transitioned voice tracking to off-duty', {
      discordUserId: userId
    });
  }

  /**
   * Get current voice tracking stats
   */
  getStats() {
    return {
      activeVoiceSessions: this.voiceSessions.size,
      sessions: Array.from(this.voiceSessions.entries()).map(([userId, session]) => ({
        userId,
        channelName: session.channelName,
        durationMinutes: Math.floor((Date.now() - session.joinTime.getTime()) / 60000),
        isOnDuty: session.isOnDuty
      }))
    };
  }
}

// Singleton instance
let instance = null;

function getDutyVoiceTrackingService(client) {
  if (!instance && client) {
    instance = new DutyVoiceTrackingService(client);
  }
  return instance;
}

async function initializeDutyVoiceTrackingService(client) {
  const service = getDutyVoiceTrackingService(client);
  await service.initialize();
  return service;
}

module.exports = {
  DutyVoiceTrackingService,
  getDutyVoiceTrackingService,
  initializeDutyVoiceTrackingService
};
