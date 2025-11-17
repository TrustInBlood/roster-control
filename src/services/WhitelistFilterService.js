const { PlayerDiscordLink } = require('../database/models');
const { Op } = require('sequelize');
const { getHighestPriorityGroup } = require('../utils/environment');
const { logger } = require('../utils/logger');
const { getMemberCacheService } = require('./MemberCacheService');

class WhitelistFilterService {
  constructor() {
    this.logger = logger.child({ service: 'WhitelistFilterService' });
  }

  async filterByConfidence(entries, minConfidence) {
    const filteredEntries = [];

    if (entries.length === 0) {
      return filteredEntries;
    }

    const steamIds = entries.map(entry => entry.steamid64);
    const entryBySteamId = new Map();
    entries.forEach(entry => entryBySteamId.set(entry.steamid64, entry));

    try {
      const links = await PlayerDiscordLink.findAll({
        where: {
          steamid64: steamIds,
          is_primary: true,
          confidence_score: {
            [Op.gte]: minConfidence
          }
        },
        order: [['confidence_score', 'DESC']]
      });

      const linkBySteamId = new Map();
      links.forEach(link => {
        if (!linkBySteamId.has(link.steamid64) ||
            link.confidence_score > linkBySteamId.get(link.steamid64).confidence_score) {
          linkBySteamId.set(link.steamid64, link);
        }
      });

      for (const entry of entries) {
        const link = linkBySteamId.get(entry.steamid64);

        if (link && link.confidence_score >= minConfidence) {
          filteredEntries.push(entry);
          this.logger.debug('Including whitelist entry (confidence check passed)', {
            steamid64: entry.steamid64,
            confidence: link.confidence_score,
            linkSource: link.link_source,
            validationMethod: 'bulk_optimized'
          });
        } else {
          this.logger.debug('Excluding whitelist entry due to insufficient confidence', {
            steamid64: entry.steamid64,
            hasLink: !!link,
            actualConfidence: link?.confidence_score || 0,
            requiredConfidence: minConfidence,
            reason: 'insufficient_confidence'
          });
        }
      }

      this.logger.info('Confidence filtering completed', {
        originalCount: entries.length,
        filteredCount: filteredEntries.length,
        requiredConfidence: minConfidence,
        droppedCount: entries.length - filteredEntries.length
      });

      return filteredEntries;

    } catch (error) {
      this.logger.error('Failed to filter by confidence', {
        error: error.message,
        minConfidence,
        entryCount: entries.length
      });
      throw new Error(`Confidence filtering failed: ${error.message}`);
    }
  }

  async filterRoleBasedUsers(entries, discordClient) {
    if (!discordClient) {
      this.logger.debug('No Discord client provided, skipping role-based filtering');
      return entries;
    }

    const filteredEntries = [];
    let roleBasedCount = 0;
    let errorCount = 0;

    const steamIds = entries.map(entry => entry.steamid64);

    try {
      const links = await PlayerDiscordLink.findAll({
        where: {
          steamid64: steamIds,
          is_primary: true
        }
      });

      const linkBySteamId = new Map();
      links.forEach(link => linkBySteamId.set(link.steamid64, link));

      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        this.logger.warn('No guild found in Discord client, skipping role-based filtering');
        return entries;
      }

      // OPTIMIZATION: Batch fetch all discord members at once instead of one-by-one in loop
      const cacheService = getMemberCacheService();
      const discordUserIds = links.map(link => link.discord_user_id);
      const members = await cacheService.getMembersBatch(guild, discordUserIds);

      this.logger.debug('Batch fetched members for role-based filtering', {
        linksCount: links.length,
        membersFound: members.size
      });

      for (const entry of entries) {
        try {
          const link = linkBySteamId.get(entry.steamid64);

          if (!link) {
            filteredEntries.push(entry);
            continue;
          }

          // Get member from pre-fetched batch
          const member = members.get(link.discord_user_id);

          if (!member) {
            // User not in guild or left
            this.logger.debug('Discord user not found in guild (may have left)', {
              steamid64: entry.steamid64,
              discordUserId: link.discord_user_id
            });
            filteredEntries.push(entry);
            continue;
          }

          const userGroup = getHighestPriorityGroup(member.roles.cache);

          if (!userGroup || userGroup === 'Member' || userGroup === 'unknown') {
            filteredEntries.push(entry);
            this.logger.debug('Including entry (no role-based whitelist)', {
              steamid64: entry.steamid64,
              discordUserId: link.discord_user_id,
              group: userGroup || 'none'
            });
          } else {
            roleBasedCount++;
            this.logger.debug('Excluding entry (handled by role-based whitelist)', {
              steamid64: entry.steamid64,
              discordUserId: link.discord_user_id,
              group: userGroup,
              confidence: link.confidence_score
            });
          }

        } catch (error) {
          errorCount++;
          this.logger.error('Error checking role-based user', {
            steamid64: entry.steamid64,
            error: error.message
          });
          filteredEntries.push(entry);
        }
      }

      this.logger.info('Role-based filtering completed', {
        originalCount: entries.length,
        filteredCount: filteredEntries.length,
        roleBasedCount,
        errorCount,
        droppedCount: entries.length - filteredEntries.length
      });

      return filteredEntries;

    } catch (error) {
      this.logger.error('Failed to filter role-based users', {
        error: error.message,
        entryCount: entries.length
      });
      return entries;
    }
  }

  async bulkFilterByRoles(entries, discordClient) {
    if (!discordClient || entries.length === 0) {
      return entries;
    }

    try {
      const steamIds = entries.map(entry => entry.steamid64);
      const links = await PlayerDiscordLink.findAll({
        where: {
          steamid64: steamIds,
          is_primary: true
        }
      });

      const linkBySteamId = new Map();
      links.forEach(link => linkBySteamId.set(link.steamid64, link));

      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return entries;
      }

      // OPTIMIZATION: Use cache service for batch member fetching
      const cacheService = getMemberCacheService();
      const discordUserIds = links.map(link => link.discord_user_id);
      const members = await cacheService.getMembersBatch(guild, discordUserIds);

      const memberByDiscordId = new Map();
      members.forEach(member => memberByDiscordId.set(member.user.id, member));

      const filteredEntries = [];

      for (const entry of entries) {
        const link = linkBySteamId.get(entry.steamid64);

        if (!link) {
          filteredEntries.push(entry);
          continue;
        }

        const member = memberByDiscordId.get(link.discord_user_id);
        if (!member) {
          filteredEntries.push(entry);
          continue;
        }

        const userGroup = getHighestPriorityGroup(member.roles.cache);

        if (!userGroup || userGroup === 'Member' || userGroup === 'unknown') {
          filteredEntries.push(entry);
        }
      }

      this.logger.info('Bulk role filtering completed', {
        originalCount: entries.length,
        filteredCount: filteredEntries.length,
        droppedCount: entries.length - filteredEntries.length
      });

      return filteredEntries;

    } catch (error) {
      this.logger.error('Bulk role filtering failed, falling back to individual filtering', {
        error: error.message
      });
      return this.filterRoleBasedUsers(entries, discordClient);
    }
  }
}

module.exports = WhitelistFilterService;