const { createServiceLogger } = require('../utils/logger');
const { getDutyConfigService } = require('./DutyConfigService');
const { getDutySessionService } = require('./DutySessionService');
const { DutySession, DutyLifetimeStats } = require('../database/models');

const logger = createServiceLogger('DutyTicketTrackingService');

/**
 * Tracks ticket responses from users who are on duty.
 * Records each response and credits their active session.
 */
class DutyTicketTrackingService {
  constructor(client) {
    this.client = client;
    this.configService = getDutyConfigService();
    this.initialized = false;

    // Cache of recently counted messages to prevent double-counting
    // Map<`${userId}_${channelId}_${minuteTimestamp}`, true>
    this.recentMessages = new Map();
    this.DEDUP_WINDOW_MS = 60 * 1000; // 1 minute window for deduplication
  }

  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing DutyTicketTrackingService');

    // Clean up dedup cache periodically
    setInterval(() => this.cleanupDedupCache(), 5 * 60 * 1000);

    this.initialized = true;
    logger.info('DutyTicketTrackingService initialized');
  }

  /**
   * Clean up old entries from the dedup cache
   */
  cleanupDedupCache() {
    const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
    for (const [key, timestamp] of this.recentMessages) {
      if (timestamp < cutoff) {
        this.recentMessages.delete(key);
      }
    }
  }

  /**
   * Handle a message event - check if it's a ticket response
   * Credits to active session if on duty, otherwise credits to lifetime stats
   * @param {Message} message - Discord message
   */
  async handleMessage(message) {
    try {
      // Ignore bots
      if (message.author.bot) return;

      // Must be in a guild
      if (!message.guild) return;

      const guildId = message.guild.id;
      const userId = message.author.id;
      const channelId = message.channel.id;
      const channelName = message.channel.name;

      // Check if ticket tracking is enabled
      const trackingEnabled = await this.configService.isEnabled(guildId, 'track_ticket_responses');
      if (!trackingEnabled) return;

      // Check if channel matches ticket pattern
      const isTicketChannel = await this.configService.isTicketChannel(guildId, channelName);
      if (!isTicketChannel) return;

      // Deduplication: Only count one message per user per channel per minute
      const minuteKey = Math.floor(Date.now() / this.DEDUP_WINDOW_MS);
      const dedupKey = `${userId}_${channelId}_${minuteKey}`;

      if (this.recentMessages.has(dedupKey)) {
        // Already counted a message from this user in this channel this minute
        return;
      }

      // Mark as counted
      this.recentMessages.set(dedupKey, Date.now());

      // Check if user has an active duty session
      const dutySession = await DutySession.getActiveSession(userId);

      // Get points value for ticket response
      const ticketPoints = await this.configService.getPointValue(guildId, 'ticket_response');

      if (dutySession) {
        // On duty: Credit the session
        const sessionService = getDutySessionService();
        if (sessionService) {
          await sessionService.recordTicketResponse(dutySession.id);

          logger.debug('Credited ticket response to session', {
            userId,
            sessionId: dutySession.id,
            channelName
          });
        }
      } else {
        // Off duty: Credit directly to lifetime stats
        try {
          await DutyLifetimeStats.addOffDutyTicketResponse(userId, guildId, ticketPoints);

          logger.debug('Credited off-duty ticket response', {
            userId,
            channelName,
            points: ticketPoints
          });
        } catch (lifetimeError) {
          // Table may not exist yet if migrations haven't run
          logger.warn('Could not update lifetime stats for off-duty ticket', {
            userId,
            error: lifetimeError.message
          });
        }
      }
    } catch (error) {
      logger.error('Error handling ticket message', { error: error.message });
    }
  }
}

// Singleton instance
let instance = null;

function getDutyTicketTrackingService(client) {
  if (!instance && client) {
    instance = new DutyTicketTrackingService(client);
  }
  return instance;
}

async function initializeDutyTicketTrackingService(client) {
  const service = getDutyTicketTrackingService(client);
  await service.initialize();
  return service;
}

module.exports = {
  DutyTicketTrackingService,
  getDutyTicketTrackingService,
  initializeDutyTicketTrackingService
};
