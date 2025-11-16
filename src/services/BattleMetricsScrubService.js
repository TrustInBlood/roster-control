const BattleMetricsService = require('./BattleMetricsService');
const { PlayerDiscordLink, AuditLog } = require('../database/models');
const { console: loggerConsole, createServiceLogger } = require('../utils/logger');
const { getAllMemberRoles, getAllStaffRoles } = require('../../config/discordRoles');

/**
 * BattleMetricsScrubService
 * Specialized service for managing BattleMetrics whitelist entries during scrubbing operations
 */
class BattleMetricsScrubService {
  constructor(discordClient = null) {
    this.bmService = BattleMetricsService;
    this.client = discordClient;
    this.logger = createServiceLogger('BattleMetricsScrubService');
    this.MEMBER_FLAG = '=B&B= Member';
  }

  /**
   * Find all BattleMetrics players with the member flag
   * @returns {Promise<Array>} Players with member flag
   */
  async findPlayersWithMemberFlag() {
    try {
      this.logger.info(`Searching for BattleMetrics players with "${this.MEMBER_FLAG}" flag`);

      // Search for players with the member flag
      const players = await this.bmService.searchPlayersByFlag(this.MEMBER_FLAG);

      this.logger.info(`Found ${players.length} players with member flag`);

      return players;
    } catch (error) {
      this.logger.error('Error finding players with member flag:', error);
      throw error;
    }
  }

  /**
   * Identify players whose flags should be removed (no Discord link or no member role)
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Categorized players
   */
  async identifyUnlinkedWithFlag(guildId) {
    try {
      this.logger.info('Identifying unlinked players with member flag');

      // Get all BM players with member flag
      const bmPlayers = await this.findPlayersWithMemberFlag();

      // Get Discord guild for role checking
      const guild = this.client ? await this.client.guilds.fetch(guildId) : null;
      const memberRoleIds = getAllMemberRoles();
      const staffRoleIds = getAllStaffRoles();

      const categorized = {
        toRemove: [],
        toKeep: [],
        noSteamId: [],
        stats: {
          total: bmPlayers.length,
          noSteamId: 0,
          noLink: 0,
          noRole: 0,
          leftDiscord: 0,
          valid: 0
        }
      };

      for (const player of bmPlayers) {
        const steamId = player.steamId;

        // Skip players without Steam ID
        if (!steamId) {
          categorized.noSteamId.push(player);
          categorized.stats.noSteamId++;
          continue;
        }

        // Check if Steam ID is linked to a Discord account
        const link = await PlayerDiscordLink.findBySteamId(steamId);

        if (!link) {
          // No Discord link - should remove flag
          // Find the member flag for this player
          const memberFlag = player.flags.find(f => f.name === this.MEMBER_FLAG);

          categorized.toRemove.push({
            ...player,
            flagToRemove: memberFlag,
            reason: 'no_link',
            discordUserId: null
          });
          categorized.stats.noLink++;
          continue;
        }

        // Has link - check if Discord user still has member role
        if (guild) {
          try {
            const member = await guild.members.fetch(link.discord_user_id);

            if (!member) {
              // User left Discord - should remove flag
              const memberFlag = player.flags.find(f => f.name === this.MEMBER_FLAG);

              categorized.toRemove.push({
                ...player,
                flagToRemove: memberFlag,
                reason: 'left_discord',
                discordUserId: link.discord_user_id
              });
              categorized.stats.leftDiscord++;
              continue;
            }

            // Check if user has any member or staff role
            const hasAnyRole = member.roles.cache.some(role =>
              memberRoleIds.includes(role.id) || staffRoleIds.includes(role.id)
            );

            if (!hasAnyRole) {
              // Has link but no roles - should remove flag
              const memberFlag = player.flags.find(f => f.name === this.MEMBER_FLAG);

              categorized.toRemove.push({
                ...player,
                flagToRemove: memberFlag,
                reason: 'no_role',
                discordUserId: link.discord_user_id,
                username: member.user.username
              });
              categorized.stats.noRole++;
            } else {
              // Valid player - keep flag
              categorized.toKeep.push({
                ...player,
                discordUserId: link.discord_user_id,
                username: member.user.username
              });
              categorized.stats.valid++;
            }
          } catch (discordError) {
            // Error fetching member (probably left server)
            this.logger.warn(`Error fetching Discord member ${link.discord_user_id}:`, discordError.message);
            const memberFlag = player.flags.find(f => f.name === this.MEMBER_FLAG);

            categorized.toRemove.push({
              ...player,
              flagToRemove: memberFlag,
              reason: 'discord_fetch_error',
              discordUserId: link.discord_user_id
            });
            categorized.stats.leftDiscord++;
          }
        } else {
          // No Discord client available - can't check roles
          // Assume valid if has link
          categorized.toKeep.push({
            ...player,
            discordUserId: link.discord_user_id
          });
          categorized.stats.valid++;
        }
      }

      this.logger.info('Categorization complete:', categorized.stats);

      return categorized;
    } catch (error) {
      this.logger.error('Error identifying unlinked players:', error);
      throw error;
    }
  }

  /**
   * Generate detailed report for flag removal preview
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Detailed report
   */
  async generateFlagRemovalReport(guildId) {
    try {
      this.logger.info('Generating flag removal report');

      const categorized = await this.identifyUnlinkedWithFlag(guildId);

      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalWithFlag: categorized.stats.total,
          toRemove: categorized.toRemove.length,
          toKeep: categorized.toKeep.length,
          noSteamId: categorized.noSteamId.length
        },
        breakdown: {
          noLink: categorized.stats.noLink,
          noRole: categorized.stats.noRole,
          leftDiscord: categorized.stats.leftDiscord,
          valid: categorized.stats.valid
        },
        toRemove: categorized.toRemove,
        sampleToRemove: categorized.toRemove.slice(0, 10), // First 10 for preview
        noSteamId: categorized.noSteamId
      };

      this.logger.info('Report generated:', report.summary);

      return report;
    } catch (error) {
      this.logger.error('Error generating flag removal report:', error);
      throw error;
    }
  }

  /**
   * Remove member flag from multiple BattleMetrics players
   * @param {Array} bmPlayers - BM players to update (with flagToRemove field)
   * @param {Object} options - { approvalId, executedBy }
   * @returns {Promise<Object>} Results summary
   */
  async removeMemberFlagBulk(bmPlayers, options = {}) {
    try {
      const { approvalId = null, executedBy = null } = options;

      this.logger.info(`Starting bulk flag removal for ${bmPlayers.length} players`, {
        approvalId,
        executedBy: executedBy?.userId
      });

      // Prepare player flags array for bulk removal
      const playerFlags = bmPlayers
        .filter(player => player.flagToRemove)
        .map(player => ({
          playerId: player.id,
          flagId: player.flagToRemove.id,
          flagName: player.flagToRemove.name,
          playerName: player.name,
          steamId: player.steamId,
          discordUserId: player.discordUserId,
          reason: player.reason
        }));

      this.logger.info(`Prepared ${playerFlags.length} flags for removal`);

      const results = {
        successful: [],
        failed: [],
        total: playerFlags.length,
        startTime: new Date()
      };

      // Use BattleMetrics bulk removal with progress tracking
      const bmResults = await this.bmService.bulkRemovePlayerFlags(
        playerFlags,
        async (progress) => {
          // Log progress every 10%
          if (progress.percentComplete % 10 === 0) {
            this.logger.info(`Removal progress: ${progress.percentComplete}% (${progress.currentIndex}/${progress.total})`);
          }
        }
      );

      results.successful = bmResults.successful;
      results.failed = bmResults.failed;
      results.endTime = new Date();
      results.durationMs = results.endTime - results.startTime;

      // Log each successful removal to AuditLog
      for (const success of results.successful) {
        await AuditLog.logAction({
          actionType: 'BATTLEMETRICS_FLAG_REMOVED',
          actorType: executedBy ? 'user' : 'system',
          actorId: executedBy?.userId || 'SYSTEM',
          actorName: executedBy?.username || 'System',
          targetType: 'battlemetrics_player',
          targetId: success.playerId,
          targetName: success.playerName || 'Unknown',
          description: `Removed "${this.MEMBER_FLAG}" flag from BattleMetrics player`,
          metadata: {
            approvalId,
            steamId: success.steamId,
            discordUserId: success.discordUserId,
            reason: success.reason,
            flagId: success.flagId,
            flagName: success.flagName
          },
          success: true,
          severity: 'info'
        });
      }

      // Log failed removals
      for (const failure of results.failed) {
        await AuditLog.logAction({
          actionType: 'BATTLEMETRICS_FLAG_REMOVED',
          actorType: executedBy ? 'user' : 'system',
          actorId: executedBy?.userId || 'SYSTEM',
          actorName: executedBy?.username || 'System',
          targetType: 'battlemetrics_player',
          targetId: failure.playerId,
          targetName: failure.playerName || 'Unknown',
          description: `Failed to remove "${this.MEMBER_FLAG}" flag from BattleMetrics player`,
          metadata: {
            approvalId,
            error: failure.error,
            status: failure.status,
            flagId: failure.flagId,
            flagName: failure.flagName
          },
          success: false,
          severity: 'warning',
          errorMessage: failure.error
        });
      }

      this.logger.info('Bulk flag removal complete:', {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        durationSec: Math.round(results.durationMs / 1000)
      });

      return results;
    } catch (error) {
      this.logger.error('Error during bulk flag removal:', error);
      throw error;
    }
  }

  /**
   * Add member flag to a BattleMetrics player
   * @param {string} playerId - BM player ID
   * @param {Object} metadata - Context info
   * @returns {Promise<Object>} Result
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
}

module.exports = BattleMetricsScrubService;
