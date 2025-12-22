const { DutySession } = require('../database/models');
const { getDutyConfigService } = require('./DutyConfigService');
const { createServiceLogger } = require('../utils/logger');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const logger = createServiceLogger('DutySessionService');

class DutySessionService {
  constructor(client) {
    this.client = client;
    this.configService = getDutyConfigService();
    this.timeoutCheckInterval = null;
    this.initialized = false;
  }

  // ============================================
  // Initialization
  // ============================================

  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing DutySessionService');

    // Start auto-timeout checker
    await this.startAutoTimeoutChecker();

    this.initialized = true;
    logger.info('DutySessionService initialized');
  }

  async shutdown() {
    this.stopAutoTimeoutChecker();
    this.initialized = false;
    logger.info('DutySessionService shutdown');
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Start a new duty session
   */
  async startSession(discordUserId, discordUsername, dutyType, guildId, metadata = {}) {
    try {
      const result = await DutySession.startSession(
        discordUserId,
        discordUsername,
        dutyType,
        guildId,
        metadata
      );

      if (result.created) {
        logger.info('Duty session started', {
          sessionId: result.session.id,
          discordUserId,
          dutyType
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to start duty session', {
        discordUserId,
        dutyType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * End a duty session
   */
  async endSession(sessionId, endReason = 'manual') {
    try {
      const session = await DutySession.findByPk(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Calculate points before ending
      const pointsData = await this.calculateSessionPoints(session);

      const result = await DutySession.endSession(sessionId, endReason, pointsData);

      if (result.success) {
        logger.info('Duty session ended', {
          sessionId,
          endReason,
          durationMinutes: result.session.durationMinutes,
          totalPoints: pointsData.basePoints + pointsData.bonusPoints
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to end duty session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * End session by user ID (finds active session)
   */
  async endSessionByUser(discordUserId, dutyType, endReason = 'manual') {
    const session = await DutySession.getActiveSession(discordUserId, dutyType);

    if (!session) {
      return { success: false, error: 'No active session found' };
    }

    return this.endSession(session.id, endReason);
  }

  /**
   * Get active session for a user
   */
  async getActiveSession(discordUserId, dutyType = null) {
    return DutySession.getActiveSession(discordUserId, dutyType);
  }

  /**
   * Get all active sessions for a guild
   */
  async getActiveSessions(guildId, dutyType = null) {
    return DutySession.getActiveSessions(guildId, dutyType);
  }

  // ============================================
  // Points Calculation
  // ============================================

  /**
   * Calculate points for a session
   */
  async calculateSessionPoints(session) {
    const guildId = session.guildId;

    // Get point values from config
    const basePerMinute = await this.configService.getPointValue(guildId, 'base_per_minute');
    const voicePerMinute = await this.configService.getPointValue(guildId, 'voice_per_minute');
    const ticketPoints = await this.configService.getPointValue(guildId, 'ticket_response');
    const adminCamPoints = await this.configService.getPointValue(guildId, 'admin_cam');
    const ingameChatPoints = await this.configService.getPointValue(guildId, 'ingame_chat');

    // Calculate duration
    const durationMinutes = session.getDurationMinutes();

    // Calculate base points
    const basePoints = Math.floor(durationMinutes * basePerMinute);

    // Calculate bonus points from activities
    const voiceBonus = Math.floor(session.voiceMinutes * voicePerMinute);
    const ticketBonus = session.ticketResponses * ticketPoints;
    const adminCamBonus = session.adminCamEvents * adminCamPoints;
    const ingameChatBonus = session.ingameChatMessages * ingameChatPoints;

    const bonusPoints = voiceBonus + ticketBonus + adminCamBonus + ingameChatBonus;

    return {
      basePoints,
      bonusPoints,
      breakdown: {
        durationMinutes,
        basePerMinute,
        voiceMinutes: session.voiceMinutes,
        voiceBonus,
        ticketResponses: session.ticketResponses,
        ticketBonus,
        adminCamEvents: session.adminCamEvents,
        adminCamBonus,
        ingameChatMessages: session.ingameChatMessages,
        ingameChatBonus
      }
    };
  }

  // ============================================
  // Auto-Timeout System
  // ============================================

  /**
   * Start the auto-timeout checker
   */
  async startAutoTimeoutChecker() {
    // Check every 5 minutes
    const checkIntervalMs = 5 * 60 * 1000;

    this.timeoutCheckInterval = setInterval(async () => {
      await this.checkForTimeouts();
    }, checkIntervalMs);

    logger.info('Auto-timeout checker started', { intervalMinutes: 5 });
  }

  /**
   * Stop the auto-timeout checker
   */
  stopAutoTimeoutChecker() {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
      logger.info('Auto-timeout checker stopped');
    }
  }

  /**
   * Check all active sessions for timeout
   */
  async checkForTimeouts() {
    try {
      const guildId = process.env.DISCORD_GUILD_ID;

      // Get timeout settings
      const settings = await this.configService.getTimeoutSettings(guildId);

      if (!settings.enabled) {
        return;
      }

      // Get sessions needing warning
      const needsWarning = await DutySession.getSessionsNeedingWarning(
        settings.hours,
        settings.warningMinutes
      );

      for (const session of needsWarning) {
        // Check for recent activity if extend on activity is enabled
        if (settings.extendOnActivity) {
          const hasRecentActivity = await this.checkRecentActivity(session);
          if (hasRecentActivity) {
            await DutySession.extendTimeout(session.id);
            logger.info('Session timeout extended due to activity', {
              sessionId: session.id,
              discordUserId: session.discordUserId
            });
            continue;
          }
        }

        // Send warning
        await this.sendTimeoutWarning(session, settings);
      }

      // Get expired sessions (warned and past grace period)
      const expired = await DutySession.getExpiredSessions(
        settings.hours,
        settings.warningMinutes
      );

      for (const session of expired) {
        await this.autoEndSession(session);
      }
    } catch (error) {
      logger.error('Error checking for timeouts', { error: error.message });
    }
  }

  /**
   * Check if session has recent activity
   * Note: lookbackHours is reserved for future use with DutyActivityEvent timestamps
   */
  async checkRecentActivity(session, _lookbackHours = 2) {
    // TODO: When DutyActivityEvent is implemented, use timestamps:
    // const lookbackMs = _lookbackHours * 60 * 60 * 1000;
    // const cutoff = new Date(Date.now() - lookbackMs);
    // Query events since cutoff time

    // For now, check if any activity exists
    return session.voiceMinutes > 0 ||
           session.ticketResponses > 0 ||
           session.adminCamEvents > 0 ||
           session.ingameChatMessages > 0;
  }

  /**
   * Send timeout warning DM
   */
  async sendTimeoutWarning(session, settings) {
    try {
      const user = await this.client.users.fetch(session.discordUserId);

      const embed = new EmbedBuilder()
        .setColor(0xFFA500) // Orange warning
        .setTitle('Duty Session Timeout Warning')
        .setDescription(
          `Your ${session.dutyType} duty session will automatically end in **${settings.warningMinutes} minutes** due to the ${settings.hours}-hour session limit.\n\n` +
          'If you\'re still on duty, click the button below to extend your session.'
        )
        .addFields(
          { name: 'Session Started', value: `<t:${Math.floor(session.sessionStart.getTime() / 1000)}:R>`, inline: true },
          { name: 'Current Duration', value: `${session.getDurationMinutes()} minutes`, inline: true }
        )
        .setFooter({ text: 'This is an automatic message from the duty tracking system' })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`duty_extend_${session.id}`)
            .setLabel('Extend Session')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
          new ButtonBuilder()
            .setCustomId(`duty_end_${session.id}`)
            .setLabel('End Session Now')
            .setStyle(ButtonStyle.Secondary)
        );

      await user.send({ embeds: [embed], components: [row] });
      await DutySession.markWarned(session.id);

      logger.info('Sent timeout warning', {
        sessionId: session.id,
        discordUserId: session.discordUserId
      });
    } catch (error) {
      // User might have DMs disabled
      logger.warn('Failed to send timeout warning DM', {
        sessionId: session.id,
        discordUserId: session.discordUserId,
        error: error.message
      });
    }
  }

  /**
   * Auto-end an expired session
   */
  async autoEndSession(session) {
    try {
      // End the session
      await this.endSession(session.id, 'auto_timeout');

      // Remove the duty role
      await this.removeDutyRole(session);

      // Notify user
      await this.sendAutoEndNotification(session);

      // Notify duty logs channel
      await this.sendDutyLogNotification(session);

      logger.info('Auto-ended session due to timeout', {
        sessionId: session.id,
        discordUserId: session.discordUserId,
        durationMinutes: session.getDurationMinutes()
      });
    } catch (error) {
      logger.error('Failed to auto-end session', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Remove duty role from member
   */
  async removeDutyRole(session) {
    try {
      const guild = await this.client.guilds.fetch(session.guildId);
      const member = await guild.members.fetch(session.discordUserId);

      // Get the appropriate role based on duty type
      const { DISCORD_ROLES } = require('../utils/environment');
      const roleId = session.dutyType === 'tutor'
        ? DISCORD_ROLES.TUTOR_ON_DUTY
        : DISCORD_ROLES.ADMIN_ON_DUTY;

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Auto-timeout: session exceeded maximum duration');
        logger.info('Removed duty role due to auto-timeout', {
          discordUserId: session.discordUserId,
          roleId
        });
      }
    } catch (error) {
      logger.error('Failed to remove duty role', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Send auto-end notification to user
   */
  async sendAutoEndNotification(session) {
    try {
      const user = await this.client.users.fetch(session.discordUserId);

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B) // Red
        .setTitle('Duty Session Auto-Ended')
        .setDescription(
          `Your ${session.dutyType} duty session was automatically ended after reaching the session time limit.\n\n` +
          'Remember to use `/offduty` when you\'re done next time!'
        )
        .addFields(
          { name: 'Session Duration', value: `${session.getDurationMinutes()} minutes`, inline: true },
          { name: 'Total Points', value: `${session.totalPoints}`, inline: true }
        )
        .setFooter({ text: 'Use /onduty to start a new session when you\'re ready' })
        .setTimestamp();

      await user.send({ embeds: [embed] });
    } catch (error) {
      // User might have DMs disabled
      logger.warn('Failed to send auto-end notification', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Send notification to duty logs channel
   */
  async sendDutyLogNotification(session) {
    try {
      const { CHANNELS } = require('../utils/environment');
      const channelId = session.dutyType === 'tutor'
        ? CHANNELS.TUTOR_DUTY_LOG
        : CHANNELS.ADMIN_DUTY_LOG;

      if (!channelId) return;

      const channel = await this.client.channels.fetch(channelId);

      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('Session Auto-Timeout')
        .setDescription(`<@${session.discordUserId}>'s duty session was automatically ended due to timeout.`)
        .addFields(
          { name: 'Duration', value: `${session.getDurationMinutes()} minutes`, inline: true },
          { name: 'Points Earned', value: `${session.totalPoints}`, inline: true }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.warn('Failed to send duty log notification', {
        sessionId: session.id,
        error: error.message
      });
    }
  }

  // ============================================
  // Activity Tracking
  // ============================================

  /**
   * Record voice time for a session
   */
  async addVoiceTime(sessionId, minutes) {
    return DutySession.incrementActivityCounter(sessionId, 'voiceMinutes', minutes);
  }

  /**
   * Record a ticket response
   */
  async recordTicketResponse(sessionId) {
    return DutySession.incrementActivityCounter(sessionId, 'ticketResponses', 1);
  }

  /**
   * Record an admin cam event
   */
  async recordAdminCam(sessionId) {
    return DutySession.incrementActivityCounter(sessionId, 'adminCamEvents', 1);
  }

  /**
   * Record an in-game chat message
   */
  async recordIngameChat(sessionId) {
    return DutySession.incrementActivityCounter(sessionId, 'ingameChatMessages', 1);
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get user statistics
   */
  async getUserStats(discordUserId, startDate = null, endDate = null, dutyType = null) {
    return DutySession.getUserStats(discordUserId, startDate, endDate, dutyType);
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(guildId, startDate = null, endDate = null, dutyType = null, sortBy = 'time', limit = 10) {
    return DutySession.getLeaderboard(guildId, startDate, endDate, dutyType, sortBy, limit);
  }

  /**
   * Get guild-wide statistics
   */
  async getGuildStats(guildId, startDate = null, endDate = null, dutyType = null) {
    return DutySession.getGuildStats(guildId, startDate, endDate, dutyType);
  }

  // ============================================
  // Maintenance
  // ============================================

  /**
   * Close orphaned sessions (e.g., after bot restart)
   */
  async closeOrphanedSessions(guildId, reason = 'server_restart') {
    const closed = await DutySession.closeOrphanedSessions(guildId, reason);

    if (closed.length > 0) {
      logger.info(`Closed ${closed.length} orphaned sessions`, { guildId, reason });
    }

    return closed;
  }

  /**
   * Extend a session (called from button interaction)
   */
  async extendSession(sessionId) {
    try {
      await DutySession.extendTimeout(sessionId);

      logger.info('Session extended via button', { sessionId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to extend session', {
        sessionId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
let instance = null;

function getDutySessionService(client) {
  if (!instance && client) {
    instance = new DutySessionService(client);
  }
  return instance;
}

async function initializeDutySessionService(client) {
  const service = getDutySessionService(client);
  await service.initialize();

  // Close any orphaned sessions from previous bot run
  // Note: We don't close them immediately - users with the role are still on duty
  // The auto-timeout checker will handle them naturally
  // Only use closeOrphanedSessions if we want to force-end sessions on restart

  return service;
}

module.exports = {
  DutySessionService,
  getDutySessionService,
  initializeDutySessionService
};
