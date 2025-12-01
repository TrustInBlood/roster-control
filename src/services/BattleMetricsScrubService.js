const BattleMetricsService = require('./BattleMetricsService');
const { AuditLog } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');

const { BATTLEMETRICS_FLAGS } = loadConfig('battlemetrics');

/**
 * BattleMetricsScrubService
 * Specialized service for managing BattleMetrics flags
 */
class BattleMetricsScrubService {
  constructor(discordClient = null) {
    this.bmService = BattleMetricsService;
    this.client = discordClient;
    this.logger = createServiceLogger('BattleMetricsScrubService');
    this.MEMBER_FLAG = BATTLEMETRICS_FLAGS.MEMBER;
  }

  /**
   * Add member flag to a BattleMetrics player
   * @param {string} playerId - BattleMetrics player ID
   * @param {Object} metadata - Context information
   * @param {string} metadata.actorType - Type of actor (user/system)
   * @param {string} metadata.actorId - Discord user ID of actor
   * @param {string} metadata.actorName - Username of actor
   * @param {string} metadata.playerName - BattleMetrics player name
   * @param {string} metadata.steamId - Steam ID64
   * @param {string} metadata.discordUserId - Discord user ID being added
   * @returns {Promise<Object>} Result object with success, alreadyHasFlag, etc.
   */
  async addMemberFlag(playerId, metadata = {}) {
    try {
      this.logger.info('Adding member flag to BM player:', playerId);

      // Check if player already has the flag
      const existingFlags = await this.bmService.getPlayerFlags(playerId);
      const hasFlag = existingFlags.some(f => f.name === this.MEMBER_FLAG);

      if (hasFlag) {
        this.logger.info(`Player ${playerId} already has "${this.MEMBER_FLAG}" flag`);
        return {
          success: true,
          alreadyHasFlag: true,
          playerId
        };
      }

      // Add the flag
      const result = await this.bmService.addPlayerFlag(playerId, this.MEMBER_FLAG);

      if (result.success) {
        // Log to AuditLog
        await AuditLog.logAction({
          actionType: 'BATTLEMETRICS_FLAG_ADDED',
          actorType: metadata.actorType || 'system',
          actorId: metadata.actorId || 'SYSTEM',
          actorName: metadata.actorName || 'System',
          targetType: 'battlemetrics_player',
          targetId: playerId,
          targetName: metadata.playerName || 'Unknown',
          description: `Added "${this.MEMBER_FLAG}" flag to BattleMetrics player`,
          metadata: {
            steamId: metadata.steamId,
            discordUserId: metadata.discordUserId,
            flagId: result.flagId
          },
          success: true,
          severity: 'info'
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Error adding member flag:', error);
      throw error;
    }
  }

  /**
   * Remove member flag from a BattleMetrics player
   * @param {string} playerId - BattleMetrics player ID
   * @param {Object} metadata - Context information
   * @returns {Promise<Object>} Result object
   */
  async removeMemberFlag(playerId, metadata = {}) {
    try {
      this.logger.info('Removing member flag from BM player:', playerId);

      // Get player's flags
      const existingFlags = await this.bmService.getPlayerFlags(playerId);
      const memberFlag = existingFlags.find(f => f.name === this.MEMBER_FLAG);

      if (!memberFlag) {
        this.logger.info(`Player ${playerId} does not have "${this.MEMBER_FLAG}" flag`);
        return {
          success: true,
          alreadyRemoved: true,
          playerId
        };
      }

      // Remove the flag
      const result = await this.bmService.removePlayerFlag(memberFlag.id);

      if (result.success) {
        // Log to AuditLog
        await AuditLog.logAction({
          actionType: 'BATTLEMETRICS_FLAG_REMOVED',
          actorType: metadata.actorType || 'system',
          actorId: metadata.actorId || 'SYSTEM',
          actorName: metadata.actorName || 'System',
          targetType: 'battlemetrics_player',
          targetId: playerId,
          targetName: metadata.playerName || 'Unknown',
          description: `Removed "${this.MEMBER_FLAG}" flag from BattleMetrics player`,
          metadata: {
            steamId: metadata.steamId,
            discordUserId: metadata.discordUserId,
            flagId: memberFlag.id
          },
          success: true,
          severity: 'info'
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Error removing member flag:', error);
      throw error;
    }
  }
}

module.exports = BattleMetricsScrubService;
