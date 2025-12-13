const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { getMemberCacheService } = require('../../services/MemberCacheService');
const { createServiceLogger } = require('../../utils/logger');

const logger = createServiceLogger('DiscordAPI');

/**
 * GET /api/v1/discord/members
 * Search guild members for autocomplete
 * Permission: ADD_MEMBER
 */
router.get('/members', requirePermission('ADD_MEMBER'), async (req, res) => {
  try {
    const { search } = req.query;

    if (!search || search.length < 2) {
      return res.json({ members: [] });
    }

    const discordClient = global.discordClient;
    if (!discordClient) {
      return res.status(503).json({
        error: 'Discord client not available',
        code: 'DISCORD_UNAVAILABLE'
      });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return res.status(503).json({
        error: 'Guild not found',
        code: 'GUILD_NOT_FOUND'
      });
    }

    // Use MemberCacheService to get cached members (1hr TTL)
    const cacheService = getMemberCacheService();
    const allMembers = await cacheService.getAllMembers(guild);

    // Filter by search query (case-insensitive)
    const searchLower = search.toLowerCase();
    const matchingMembers = [];

    for (const [memberId, member] of allMembers) {
      const username = member.user.username.toLowerCase();
      const displayName = (member.displayName || member.user.username).toLowerCase();
      const globalName = (member.user.globalName || '').toLowerCase();

      // Match against username, displayName, globalName, or member ID
      if (
        username.includes(searchLower) ||
        displayName.includes(searchLower) ||
        globalName.includes(searchLower) ||
        memberId.includes(search)
      ) {
        matchingMembers.push({
          id: member.user.id,
          username: member.user.username,
          displayName: member.displayName || member.user.username,
          globalName: member.user.globalName || null,
          avatar: member.user.avatar,
          avatarUrl: member.user.displayAvatarURL({ size: 64 }),
          roles: member.roles.cache.map(r => r.id)
        });
      }

      // Limit to 25 results for performance
      if (matchingMembers.length >= 25) {
        break;
      }
    }

    logger.debug(`Member search for "${search}" returned ${matchingMembers.length} results`);

    res.json({ members: matchingMembers });

  } catch (error) {
    logger.error('Error searching members:', error);
    res.status(500).json({
      error: 'Failed to search members',
      code: 'SEARCH_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/discord/member/:userId
 * Get a single member by ID
 * Permission: ADD_MEMBER
 */
router.get('/member/:userId', requirePermission('ADD_MEMBER'), async (req, res) => {
  try {
    const { userId } = req.params;

    const discordClient = global.discordClient;
    if (!discordClient) {
      return res.status(503).json({
        error: 'Discord client not available',
        code: 'DISCORD_UNAVAILABLE'
      });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return res.status(503).json({
        error: 'Guild not found',
        code: 'GUILD_NOT_FOUND'
      });
    }

    // Use MemberCacheService to get member
    const cacheService = getMemberCacheService();
    const member = await cacheService.getMember(guild, userId);

    if (!member) {
      return res.status(404).json({
        error: 'Member not found',
        code: 'MEMBER_NOT_FOUND'
      });
    }

    res.json({
      member: {
        id: member.user.id,
        username: member.user.username,
        displayName: member.displayName || member.user.username,
        globalName: member.user.globalName || null,
        avatar: member.user.avatar,
        avatarUrl: member.user.displayAvatarURL({ size: 128 }),
        roles: member.roles.cache.map(r => r.id),
        nickname: member.nickname || null,
        joinedAt: member.joinedAt?.toISOString() || null
      }
    });

  } catch (error) {
    logger.error('Error fetching member:', error);
    res.status(500).json({
      error: 'Failed to fetch member',
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
