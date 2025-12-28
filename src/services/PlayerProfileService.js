const { Op } = require('sequelize');
const { createServiceLogger } = require('../utils/logger');
const BattleMetricsService = require('./BattleMetricsService');
const CommunityBanListService = require('./CommunityBanListService');

const logger = createServiceLogger('PlayerProfileService');

// Helper to calculate expiration from whitelist entry
function calculateExpiration(entry) {
  if (entry.duration_value === null && entry.duration_type === null) {
    return null; // Permanent
  }

  const grantedDate = new Date(entry.granted_at);
  const expiration = new Date(grantedDate);

  if (entry.duration_type === 'days') {
    expiration.setDate(expiration.getDate() + entry.duration_value);
  } else if (entry.duration_type === 'months') {
    expiration.setMonth(expiration.getMonth() + entry.duration_value);
  } else if (entry.duration_type === 'hours') {
    expiration.setTime(grantedDate.getTime() + (entry.duration_value * 60 * 60 * 1000));
  }

  return expiration;
}

// Helper to determine entry status
function getEntryStatus(entry) {
  if (entry.revoked) return 'revoked';

  const expiration = calculateExpiration(entry);
  if (expiration === null) return 'permanent';
  if (expiration > new Date()) return 'active';
  return 'expired';
}

// Calculate player whitelist status from entries
function calculateWhitelistStatus(entries) {
  if (!entries || entries.length === 0) {
    return { hasWhitelist: false, status: 'none', expiration: null, isPermanent: false };
  }

  const activeEntries = entries.filter(e => !e.revoked);
  const allRevoked = activeEntries.length === 0;

  if (allRevoked) {
    return { hasWhitelist: false, status: 'revoked', expiration: null, isPermanent: false };
  }

  // Check for permanent
  const hasPermanent = activeEntries.some(e =>
    e.duration_value === null && e.duration_type === null
  );

  if (hasPermanent) {
    return { hasWhitelist: true, status: 'permanent', expiration: null, isPermanent: true };
  }

  // Calculate stacked expiration
  const now = new Date();
  const validEntries = activeEntries.filter(e => {
    if (e.duration_value === 0) return false;
    const exp = calculateExpiration(e);
    return exp && exp > now;
  });

  if (validEntries.length === 0) {
    // Find most recent expiration for display
    let latestExp = null;
    for (const e of activeEntries) {
      const exp = calculateExpiration(e);
      if (exp && (!latestExp || exp > latestExp)) {
        latestExp = exp;
      }
    }
    return { hasWhitelist: false, status: 'expired', expiration: latestExp, isPermanent: false };
  }

  // Stack durations
  const earliest = validEntries.sort((a, b) =>
    new Date(a.granted_at) - new Date(b.granted_at)
  )[0];
  let stackedExp = new Date(earliest.granted_at);

  let totalMonths = 0, totalDays = 0, totalHours = 0;
  for (const e of validEntries) {
    if (e.duration_type === 'months') totalMonths += e.duration_value;
    else if (e.duration_type === 'days') totalDays += e.duration_value;
    else if (e.duration_type === 'hours') totalHours += e.duration_value;
  }

  if (totalMonths > 0) stackedExp.setMonth(stackedExp.getMonth() + totalMonths);
  if (totalDays > 0) stackedExp.setDate(stackedExp.getDate() + totalDays);
  if (totalHours > 0) stackedExp.setTime(stackedExp.getTime() + (totalHours * 60 * 60 * 1000));

  return {
    hasWhitelist: true,
    status: 'active',
    expiration: stackedExp,
    isPermanent: false,
    entryCount: validEntries.length
  };
}

class PlayerProfileService {
  /**
   * Search players across multiple data sources
   * Searches: steamid64, eosID, username, discord_username
   */
  async searchPlayers(query, filters = {}, pagination = {}) {
    const { Player, PlayerDiscordLink, Whitelist } = require('../database/models');
    const { page = 1, limit = 25 } = pagination;
    const { hasWhitelist, whitelistStatus, isStaff, sortBy = 'lastSeen', sortOrder = 'DESC' } = filters;

    try {
      // Build search conditions for whitelist - only search steamid64 and username (in-game name)
      // We don't search discord_username here because it's unreliable (may be granting admin's name)
      const whitelistSearchConditions = query ? {
        [Op.or]: [
          { steamid64: { [Op.like]: `%${query}%` } },
          { username: { [Op.like]: `%${query}%` } }
        ]
      } : {};

      // Get all unique Steam IDs from whitelist entries
      const whitelistEntries = await Whitelist.findAll({
        where: {
          approved: true,
          ...whitelistSearchConditions
        },
        order: [['steamid64', 'ASC'], ['granted_at', 'DESC']]
      });

      // Group entries by steamid64
      const playerMap = new Map();

      for (const entry of whitelistEntries) {
        const steamid64 = entry.steamid64;
        if (!playerMap.has(steamid64)) {
          playerMap.set(steamid64, {
            steamid64,
            username: entry.username,
            discord_username: entry.discord_username,
            discord_user_id: entry.discord_user_id,
            eosID: entry.eosID,
            entries: [],
            source: entry.source
          });
        }
        playerMap.get(steamid64).entries.push(entry);
      }

      // Also search PlayerDiscordLink for linked accounts without whitelist
      if (query) {
        const links = await PlayerDiscordLink.findAll({
          where: {
            is_primary: true, // Only search primary links
            [Op.or]: [
              { steamid64: { [Op.like]: `%${query}%` } },
              { username: { [Op.like]: `%${query}%` } }
            ]
          }
        });

        for (const link of links) {
          if (link.steamid64 && !playerMap.has(link.steamid64)) {
            playerMap.set(link.steamid64, {
              steamid64: link.steamid64,
              username: link.username,
              discord_username: null,
              discord_user_id: link.discord_user_id,
              eosID: link.eosID,
              entries: [],
              source: null
            });
          }
        }
      }

      // Search by Discord username - find linked players by searching actual Discord members
      if (query && global.discordClient) {
        try {
          const guildId = process.env.DISCORD_GUILD_ID;
          const guild = await global.discordClient.guilds.fetch(guildId);
          if (guild) {
            // Fetch members that match the query (Discord API search)
            const members = await guild.members.fetch({ query, limit: 20 }).catch(() => new Map());

            // For each matching Discord member, check if they have a linked Steam account
            for (const [memberId] of members) {
              const link = await PlayerDiscordLink.findOne({
                where: { discord_user_id: memberId, is_primary: true }
              });

              if (link && link.steamid64 && !playerMap.has(link.steamid64)) {
                playerMap.set(link.steamid64, {
                  steamid64: link.steamid64,
                  username: link.username,
                  discord_username: null,
                  discord_user_id: link.discord_user_id,
                  eosID: link.eosID,
                  entries: [],
                  source: null
                });
              }
            }
          }
        } catch {
          // Discord search failed, continue without it
        }
      }

      // Also search Player model
      if (query) {
        const players = await Player.findAll({
          where: {
            [Op.or]: [
              { steamId: { [Op.like]: `%${query}%` } },
              { username: { [Op.like]: `%${query}%` } }
            ]
          }
        });

        for (const player of players) {
          if (!playerMap.has(player.steamId)) {
            playerMap.set(player.steamId, {
              steamid64: player.steamId,
              username: player.username,
              discord_username: null,
              discord_user_id: null,
              eosID: player.eosId,
              entries: [],
              source: null,
              playerData: player
            });
          }
        }
      }

      // Calculate status and enrich each player
      let players = [];

      // Get Discord client for avatar lookups
      const discordClient = global.discordClient;
      const guildId = process.env.DISCORD_GUILD_ID;
      let guild = null;
      if (discordClient && guildId) {
        try {
          guild = await discordClient.guilds.fetch(guildId);
        } catch {
          // Guild not available
        }
      }

      for (const [steamid64, playerData] of playerMap) {
        const whitelistInfo = calculateWhitelistStatus(playerData.entries);

        // Get Player record for activity data (this has the most recent in-game name)
        let activityData = playerData.playerData;
        if (!activityData) {
          activityData = await Player.findOne({ where: { steamId: steamid64 } });
        }

        // Get primary Discord link - only show as "linked" if there's a primary link
        const link = await PlayerDiscordLink.findOne({
          where: { steamid64, is_primary: true }
        });

        // isLinked means they have a primary Discord link
        const isLinked = !!link;

        // Get Discord avatar and display name ONLY if linked (has primary link)
        let avatarUrl = null;
        let discordDisplayName = null;
        let discordUserId = null;

        if (isLinked && link.discord_user_id) {
          discordUserId = link.discord_user_id;
          if (guild) {
            try {
              const member = await guild.members.fetch(discordUserId).catch(() => null);
              if (member) {
                avatarUrl = member.user.displayAvatarURL({ size: 64 });
                discordDisplayName = member.displayName !== member.user.username
                  ? `${member.displayName} (${member.user.username})`
                  : member.user.username;
              }
            } catch {
              // Member not found or error
            }
          }
        }

        // In-game name priority: Player model (most recent from actual gameplay) > link username > whitelist entry username
        // Note: activityData comes from Player model which tracks actual game joins via SquadJS
        const inGameName = activityData?.username || link?.username || playerData.username || null;

        players.push({
          steamid64,
          username: inGameName,
          discord_username: discordDisplayName,
          discord_user_id: discordUserId,
          avatar_url: avatarUrl,
          isLinked,
          eosID: link?.eosID || playerData.eosID,
          hasWhitelist: whitelistInfo.hasWhitelist,
          whitelistStatus: whitelistInfo.status,
          expiration: whitelistInfo.expiration,
          isPermanent: whitelistInfo.isPermanent,
          totalPlaytimeMinutes: activityData?.totalPlayTime || 0,
          lastSeen: activityData?.lastSeen || null,
          joinCount: activityData?.joinCount || 0,
          isStaff: playerData.entries.some(e => e.source === 'role'),
          source: playerData.source,
          entryCount: playerData.entries.length
        });
      }

      // Apply filters
      if (hasWhitelist !== undefined) {
        const hasWL = hasWhitelist === 'true' || hasWhitelist === true;
        players = players.filter(p => p.hasWhitelist === hasWL);
      }

      if (whitelistStatus) {
        players = players.filter(p => p.whitelistStatus === whitelistStatus);
      }

      if (isStaff !== undefined) {
        const staff = isStaff === 'true' || isStaff === true;
        players = players.filter(p => p.isStaff === staff);
      }

      // Sort
      const validSortColumns = ['lastSeen', 'username', 'totalPlaytimeMinutes', 'steamid64', 'expiration'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'lastSeen';
      const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;

      players.sort((a, b) => {
        let aVal = a[safeSortBy];
        let bVal = b[safeSortBy];

        if (safeSortBy === 'lastSeen' || safeSortBy === 'expiration') {
          aVal = aVal ? new Date(aVal).getTime() : (safeSortOrder === 1 ? Infinity : -Infinity);
          bVal = bVal ? new Date(bVal).getTime() : (safeSortOrder === 1 ? Infinity : -Infinity);
        }

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (aVal < bVal) return -1 * safeSortOrder;
        if (aVal > bVal) return 1 * safeSortOrder;
        return 0;
      });

      // Paginate
      const total = players.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedPlayers = players.slice(offset, offset + limit);

      return {
        players: paginatedPlayers,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error) {
      logger.error('Error searching players', { error: error.message });
      throw error;
    }
  }

  /**
   * Get comprehensive player profile by Steam64 ID
   */
  async getPlayerProfile(steamid64) {
    const { Player, PlayerDiscordLink, Whitelist } = require('../database/models');

    try {
      // Get primary Discord link
      const discordLink = await PlayerDiscordLink.findOne({
        where: { steamid64, is_primary: true }
      });

      // Get all Discord links for this Steam ID
      const allLinks = await PlayerDiscordLink.findAll({
        where: { steamid64 }
      });

      // Get Player record for activity data
      const player = await Player.findOne({ where: { steamId: steamid64 } });

      // Get whitelist entries
      const whitelistEntries = await Whitelist.findAll({
        where: { steamid64, approved: true },
        order: [['granted_at', 'DESC']]
      });

      const whitelistStatus = calculateWhitelistStatus(whitelistEntries);

      // Determine if staff (has role-based entries)
      const isStaff = whitelistEntries.some(e => e.source === 'role');
      const staffRoles = [...new Set(
        whitelistEntries
          .filter(e => e.source === 'role' && e.role_name)
          .map(e => e.role_name)
      )];

      // Get Discord info if available
      let discordInfo = null;
      let discordRoles = [];
      if (discordLink?.discord_user_id && global.discordClient) {
        try {
          const guildId = process.env.DISCORD_GUILD_ID;
          const guild = await global.discordClient.guilds.fetch(guildId);
          const member = await guild.members.fetch(discordLink.discord_user_id).catch(() => null);
          if (member) {
            discordInfo = {
              discord_user_id: discordLink.discord_user_id,
              discord_username: member.displayName !== member.user.username
                ? `${member.displayName} (${member.user.username})`
                : member.user.username,
              avatar_url: member.user.displayAvatarURL({ size: 128 }),
              globalName: member.user.globalName || null,
              nickname: member.nickname || null,
              joinedAt: member.joinedAt?.toISOString() || null,
              createdAt: member.user.createdAt?.toISOString() || null,
              bannerColor: member.user.accentColor ? `#${member.user.accentColor.toString(16)}` : null
            };

            // Get all Discord roles
            discordRoles = member.roles.cache
              .filter(role => role.id !== guild.id) // Exclude @everyone
              .sort((a, b) => b.position - a.position) // Sort by position (highest first)
              .map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor
              }));
          }
        } catch {
          // Failed to fetch Discord member
        }
      }

      // Get BattleMetrics and CBL data in parallel
      let battlemetrics = null;
      let communityBanList = null;

      const [bmResult, cblResult] = await Promise.all([
        BattleMetricsService.searchPlayerBySteamId(steamid64, 5000).catch(err => ({ found: false, error: err.message })),
        CommunityBanListService.searchPlayer(steamid64, 5000).catch(err => ({ found: false, error: err.message }))
      ]);

      // Process BattleMetrics result
      if (bmResult.found && bmResult.playerData) {
        battlemetrics = {
          found: true,
          playerId: bmResult.playerData.id,
          playerName: bmResult.playerData.name || null,
          profileUrl: bmResult.profileUrl
        };
      } else {
        battlemetrics = { found: false, error: bmResult.error || null };
      }

      // Process CBL result
      if (cblResult.found && cblResult.playerData) {
        communityBanList = {
          found: true,
          reputationPoints: cblResult.playerData.reputationPoints || 0,
          riskRating: cblResult.playerData.riskRating || 0,
          activeBansCount: cblResult.playerData.activeBansCount || 0,
          expiredBansCount: cblResult.playerData.expiredBansCount || 0,
          activeBans: cblResult.playerData.activeBans || [],
          profileUrl: cblResult.profileUrl
        };
      } else {
        communityBanList = { found: false, error: cblResult.error || null };
      }

      // If no verified link, check for potential links
      let potentialLink = null;
      if (!discordLink) {
        const { PotentialPlayerLink } = require('../database/models');
        const potentialLinks = await PotentialPlayerLink.findBySteamId(steamid64);
        if (potentialLinks.length > 0) {
          const pl = potentialLinks[0]; // Highest confidence first (sorted by model)
          potentialLink = {
            id: pl.id,
            discord_user_id: pl.discord_user_id,
            steamid64: pl.steamid64,
            username: pl.username,
            link_source: pl.link_source,
            confidence_score: parseFloat(pl.confidence_score),
            metadata: pl.metadata,
            created_at: pl.created_at,
            updated_at: pl.updated_at
          };
        }
      }

      // Get latest username - prioritize Player model (updated on game join) over stored values
      const latestEntry = whitelistEntries[0];
      const username = player?.username || discordLink?.username || latestEntry?.username || null;

      return {
        steamid64,
        eosID: discordLink?.eosID || player?.eosId || latestEntry?.eosID || null,
        username,
        discordLink: discordLink ? {
          discord_user_id: discordLink.discord_user_id,
          confidence_score: parseFloat(discordLink.confidence_score),
          link_source: discordLink.link_source,
          is_primary: discordLink.is_primary,
          created_at: discordLink.created_at
        } : null,
        potentialLink,
        allLinks: allLinks.map(l => ({
          id: l.id,
          discord_user_id: l.discord_user_id,
          steamid64: l.steamid64,
          eosID: l.eosID,
          username: l.username,
          confidence_score: parseFloat(l.confidence_score),
          link_source: l.link_source,
          is_primary: l.is_primary,
          created_at: l.created_at
        })),
        discordInfo,
        discordRoles,
        battlemetrics,
        communityBanList,
        activity: {
          totalPlaytimeMinutes: player?.totalPlayTime || 0,
          joinCount: player?.joinCount || 0,
          lastSeen: player?.lastSeen || null,
          lastServerId: player?.lastServerId || null,
          firstSeen: player?.createdAt || null
        },
        whitelist: {
          ...whitelistStatus,
          entryCount: whitelistEntries.length
        },
        isStaff,
        staffRoles,
        notes: player?.notes || null
      };
    } catch (error) {
      logger.error('Error getting player profile', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Get paginated session history for a player
   */
  async getPlayerSessions(steamid64, pagination = {}) {
    const { Player, PlayerSession } = require('../database/models');
    const { page = 1, limit = 10 } = pagination;

    try {
      // Find player by steamId
      const player = await Player.findOne({ where: { steamId: steamid64 } });

      if (!player) {
        return {
          sessions: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      const { count, rows } = await PlayerSession.findAndCountAll({
        where: { player_id: player.id },
        order: [['sessionStart', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });

      return {
        sessions: rows.map(s => ({
          id: s.id,
          serverId: s.serverId,
          sessionStart: s.sessionStart,
          sessionEnd: s.sessionEnd,
          durationMinutes: s.durationMinutes,
          isActive: s.isActive
        })),
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player sessions', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Get audit log entries for a player
   */
  async getPlayerAuditLogs(steamid64, pagination = {}) {
    const { AuditLog } = require('../database/models');
    const { page = 1, limit = 10 } = pagination;

    try {
      const { count, rows } = await AuditLog.findAndCountAll({
        where: {
          [Op.or]: [
            { targetId: steamid64 },
            { targetId: { [Op.like]: `%${steamid64}%` } }
          ]
        },
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });

      return {
        logs: rows.map(log => ({
          id: log.id,
          actionType: log.actionType,
          actorName: log.actorName,
          actorId: log.actorId,
          description: log.description,
          success: log.success,
          createdAt: log.createdAt,
          metadata: log.metadata
        })),
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player audit logs', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Get seeding participation history for a player
   */
  async getPlayerSeedingActivity(steamid64, pagination = {}) {
    const { SeedingParticipant, SeedingSession } = require('../database/models');
    const { page = 1, limit = 10 } = pagination;

    try {
      const { count, rows } = await SeedingParticipant.findAndCountAll({
        where: { steam_id: steamid64 },
        include: [{
          model: SeedingSession,
          as: 'session',
          required: false
        }],
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });

      return {
        participations: rows.map(p => ({
          id: p.id,
          sessionId: p.session_id,
          sessionName: p.session?.name || null,
          participantType: p.participant_type,
          status: p.status,
          targetPlaytimeMinutes: p.target_playtime_minutes,
          totalRewardMinutes: p.total_reward_minutes,
          switchRewardedAt: p.switch_rewarded_at,
          playtimeRewardedAt: p.playtime_rewarded_at,
          completionRewardedAt: p.completion_rewarded_at,
          createdAt: p.createdAt
        })),
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player seeding activity', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Get duty history for a player (requires Discord user ID)
   */
  async getPlayerDutyHistory(discordUserId, pagination = {}) {
    const { DutyStatusChange } = require('../database/models');
    const { page = 1, limit = 10 } = pagination;

    try {
      if (!discordUserId) {
        return {
          changes: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }

      const { count, rows } = await DutyStatusChange.findAndCountAll({
        where: { discordUserId },
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });

      return {
        changes: rows.map(c => ({
          id: c.id,
          status: c.status,
          previousStatus: c.previousStatus,
          source: c.source,
          reason: c.reason,
          dutyType: c.metadata?.dutyType || 'admin',
          success: c.success,
          createdAt: c.createdAt
        })),
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting player duty history', { error: error.message, discordUserId });
      throw error;
    }
  }

  /**
   * Get whitelist history for a player with calculated status
   */
  async getPlayerWhitelistHistory(steamid64) {
    const { Whitelist, Group } = require('../database/models');

    try {
      const entries = await Whitelist.findAll({
        where: { steamid64, approved: true },
        include: [{
          model: Group,
          as: 'group',
          required: false
        }],
        order: [['granted_at', 'DESC']]
      });

      return {
        entries: entries.map(entry => ({
          id: entry.id,
          type: entry.type,
          source: entry.source,
          role_name: entry.role_name,
          reason: entry.reason,
          duration_value: entry.duration_value,
          duration_type: entry.duration_type,
          granted_by: entry.granted_by,
          granted_at: entry.granted_at,
          revoked: entry.revoked,
          revoked_by: entry.revoked_by,
          revoked_reason: entry.revoked_reason,
          revoked_at: entry.revoked_at,
          status: getEntryStatus(entry),
          calculatedExpiration: calculateExpiration(entry),
          groupName: entry.group?.group_name || null
        })),
        summary: calculateWhitelistStatus(entries)
      };
    } catch (error) {
      logger.error('Error getting player whitelist history', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Get unlink history for a player
   */
  async getPlayerUnlinkHistory(discordUserId) {
    const { UnlinkHistory } = require('../database/models');

    try {
      if (!discordUserId) {
        return { history: [] };
      }

      const history = await UnlinkHistory.findAll({
        where: { discord_user_id: discordUserId },
        order: [['unlinked_at', 'DESC']]
      });

      return {
        history: history.map(h => ({
          id: h.id,
          steamid64: h.steamid64,
          eosID: h.eosID,
          username: h.username,
          reason: h.reason,
          unlinked_at: h.unlinked_at
        }))
      };
    } catch (error) {
      logger.error('Error getting player unlink history', { error: error.message, discordUserId });
      throw error;
    }
  }

  /**
   * Get all Steam accounts linked to a Discord user (for showing linked accounts on profile)
   */
  async getLinkedAccountsByDiscord(discordUserId) {
    const { PlayerDiscordLink, Player, Whitelist } = require('../database/models');

    try {
      if (!discordUserId) {
        return { accounts: [] };
      }

      // Get all links for this Discord user
      const links = await PlayerDiscordLink.findAll({
        where: { discord_user_id: discordUserId },
        order: [['is_primary', 'DESC'], ['created_at', 'DESC']]
      });

      // Enrich each link with player activity data
      const accounts = [];
      for (const link of links) {
        const player = await Player.findOne({ where: { steamId: link.steamid64 } });

        // Get whitelist status for this account
        const whitelistEntries = await Whitelist.findAll({
          where: { steamid64: link.steamid64, approved: true }
        });
        const whitelistStatus = calculateWhitelistStatus(whitelistEntries);

        accounts.push({
          steamid64: link.steamid64,
          eosID: link.eosID,
          username: link.username || player?.username || null,
          confidence_score: parseFloat(link.confidence_score),
          link_source: link.link_source,
          is_primary: link.is_primary,
          created_at: link.created_at,
          totalPlaytimeMinutes: player?.totalPlayTime || 0,
          lastSeen: player?.lastSeen || null,
          joinCount: player?.joinCount || 0,
          hasWhitelist: whitelistStatus.hasWhitelist,
          whitelistStatus: whitelistStatus.status
        });
      }

      return { accounts };
    } catch (error) {
      logger.error('Error getting linked accounts by Discord', { error: error.message, discordUserId });
      throw error;
    }
  }

  /**
   * Get all potential links for a Steam ID
   * Used for detailed view in Account tab
   */
  async getPotentialLinksForPlayer(steamid64) {
    const { PotentialPlayerLink } = require('../database/models');

    try {
      const potentialLinks = await PotentialPlayerLink.findBySteamId(steamid64);

      return {
        potentialLinks: potentialLinks.map(pl => ({
          id: pl.id,
          discord_user_id: pl.discord_user_id,
          steamid64: pl.steamid64,
          username: pl.username,
          link_source: pl.link_source,
          confidence_score: parseFloat(pl.confidence_score),
          metadata: pl.metadata,
          created_at: pl.created_at,
          updated_at: pl.updated_at
        }))
      };
    } catch (error) {
      logger.error('Error getting potential links for player', { error: error.message, steamid64 });
      throw error;
    }
  }

  /**
   * Create a verified link from a potential link
   * @param {string} steamid64 - Steam ID64
   * @param {string} discordUserId - Discord user ID from potential link
   * @param {Object} adminInfo - Admin action info (adminId, adminTag, reason)
   */
  async createLinkFromPotential(steamid64, discordUserId, adminInfo = {}) {
    const { PlayerDiscordLink, PotentialPlayerLink, Player } = require('../database/models');

    try {
      // Get the potential link to verify it exists and get metadata
      const potentialLink = await PotentialPlayerLink.findOne({
        where: { discord_user_id: discordUserId, steamid64 }
      });

      if (!potentialLink) {
        return {
          success: false,
          error: 'Potential link not found'
        };
      }

      // Check if a verified link already exists for this Steam ID
      const existingLink = await PlayerDiscordLink.findOne({
        where: { steamid64 }
      });

      if (existingLink) {
        return {
          success: false,
          error: 'This Steam ID is already linked to a Discord account'
        };
      }

      // Get player data for username/eosID
      const player = await Player.findOne({ where: { steamId: steamid64 } });

      // Create verified link with 1.0 confidence
      const metadata = {
        promoted_from_potential: true,
        original_source: potentialLink.link_source,
        original_confidence: parseFloat(potentialLink.confidence_score),
        original_metadata: potentialLink.metadata,
        promoted_by: adminInfo.adminId,
        promoted_by_tag: adminInfo.adminTag,
        promoted_reason: adminInfo.reason,
        promoted_at: new Date().toISOString()
      };

      const { link, created } = await PlayerDiscordLink.createOrUpdateLink(
        discordUserId,
        steamid64,
        potentialLink.eosID || player?.eosId || null,
        potentialLink.username || player?.username || null,
        {
          linkSource: 'manual',
          isPrimary: true,
          metadata
        }
      );

      // Delete the potential link
      await PotentialPlayerLink.removePotentialLink(discordUserId, steamid64);

      logger.info('Created verified link from potential link', {
        steamid64,
        discordUserId,
        originalSource: potentialLink.link_source,
        originalConfidence: potentialLink.confidence_score,
        promotedBy: adminInfo.adminTag
      });

      return {
        success: true,
        link: {
          discord_user_id: link.discord_user_id,
          steamid64: link.steamid64,
          confidence_score: parseFloat(link.confidence_score),
          link_source: link.link_source,
          is_primary: link.is_primary,
          created_at: link.created_at
        },
        created,
        previousConfidence: parseFloat(potentialLink.confidence_score),
        newConfidence: 1.0
      };
    } catch (error) {
      logger.error('Error creating link from potential', { error: error.message, steamid64, discordUserId });
      throw error;
    }
  }
}

module.exports = new PlayerProfileService();
