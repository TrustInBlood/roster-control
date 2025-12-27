const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { PlayerDiscordLink, AuditLog } = require('../../database/models');
const { isValidSteamId } = require('../../utils/steamId');
const BattleMetricsService = require('../../services/BattleMetricsService');
const BattleMetricsScrubService = require('../../services/BattleMetricsScrubService');
const { getMemberCacheService } = require('../../services/MemberCacheService');
const { loadConfig } = require('../../utils/environment');
const { createServiceLogger } = require('../../utils/logger');

const logger = createServiceLogger('MembersAPI');

// Load environment-specific configurations
const { DISCORD_ROLES } = loadConfig('discordRoles');
const { CHANNELS } = loadConfig('channels');

/**
 * POST /api/v1/members
 * Add a new member with Steam ID linking and role assignment
 * Permission: ADD_MEMBER
 */
router.post('/', requirePermission('ADD_MEMBER'), async (req, res) => {
  try {
    const { discord_user_id, steamid64, nickname, battlemetrics_player_id } = req.body;

    // Validate required fields
    if (!discord_user_id) {
      return res.status(400).json({
        error: 'Discord user ID is required',
        code: 'MISSING_DISCORD_USER_ID'
      });
    }

    if (!steamid64) {
      return res.status(400).json({
        error: 'Steam ID is required',
        code: 'MISSING_STEAM_ID'
      });
    }

    if (!nickname) {
      return res.status(400).json({
        error: 'Nickname is required',
        code: 'MISSING_NICKNAME'
      });
    }

    // Validate Steam ID format
    if (!isValidSteamId(steamid64)) {
      return res.status(400).json({
        error: 'Invalid Steam ID format. Must be 17 digits starting with 7656119.',
        code: 'INVALID_STEAM_ID'
      });
    }

    // Validate nickname length
    if (nickname.length > 32) {
      return res.status(400).json({
        error: 'Nickname must be 32 characters or less',
        code: 'NICKNAME_TOO_LONG'
      });
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

    // Fetch Discord member
    const cacheService = getMemberCacheService();
    const member = await cacheService.getMember(guild, discord_user_id);

    if (!member) {
      return res.status(404).json({
        error: 'Discord member not found in guild',
        code: 'MEMBER_NOT_FOUND'
      });
    }

    logger.info(`Adding member via dashboard: ${member.user.username} with Steam ID ${steamid64}`, {
      requestedBy: req.user?.username
    });

    const results = {
      linkCreated: false,
      linkUpdated: false,
      roleAdded: false,
      nicknameSet: false,
      flagAdded: null,
      errors: []
    };

    // 1. Create or update PlayerDiscordLink
    // Role sync is handled automatically by createOrUpdateLink when confidence crosses 1.0 threshold
    const { created } = await PlayerDiscordLink.createOrUpdateLink(
      discord_user_id,
      steamid64,
      null, // eosId
      member.user.username,
      {
        linkSource: 'manual',
        confidenceScore: 1.0,
        isPrimary: true,
        metadata: {
          created_via: 'dashboard_addmember',
          created_by: req.user.username
        }
      }
    );

    if (created) {
      logger.info(`Created new PlayerDiscordLink for ${member.user.username}`);
      results.linkCreated = true;
    } else {
      logger.info(`Updated existing PlayerDiscordLink for ${member.user.username}`);
      results.linkUpdated = true;
    }

    // 2. Add Member role
    const hasMemberRole = member.roles.cache.has(DISCORD_ROLES.MEMBER);
    if (!hasMemberRole) {
      const memberRole = guild.roles.cache.get(DISCORD_ROLES.MEMBER);
      if (memberRole) {
        try {
          await member.roles.add(memberRole, `Member role added by ${req.user.username} via dashboard`);
          logger.info(`Added Member role to ${member.user.username}`);
          results.roleAdded = true;
        } catch (roleError) {
          logger.error(`Failed to add Member role: ${roleError.message}`);
          results.errors.push(`Failed to add Member role: ${roleError.message}`);
        }
      } else {
        logger.error('Member role not found in guild cache');
        results.errors.push('Member role not found in server');
      }
    } else {
      logger.info(`${member.user.username} already has Member role`);
    }

    // 3. Set nickname
    try {
      await member.setNickname(nickname, `Nickname set by ${req.user.username} via dashboard`);
      logger.info(`Set nickname for ${member.user.username} to ${nickname}`);
      results.nicknameSet = true;
    } catch (nicknameError) {
      logger.error(`Failed to set nickname: ${nicknameError.message}`);
      results.errors.push(`Failed to set nickname: ${nicknameError.message}`);
    }

    // 4. Add BattleMetrics member flag (if we have the player ID)
    if (battlemetrics_player_id) {
      try {
        const bmScrubService = new BattleMetricsScrubService(discordClient);

        const flagResult = await bmScrubService.addMemberFlag(battlemetrics_player_id, {
          actorType: 'dashboard_user',
          actorId: req.user.id,
          actorName: req.user.username,
          steamId: steamid64,
          discordUserId: discord_user_id
        });

        if (flagResult.success) {
          results.flagAdded = flagResult.alreadyHasFlag ? 'already_has' : 'added';
          logger.info(`BattleMetrics flag ${results.flagAdded} for player ${battlemetrics_player_id}`);
        } else {
          results.flagAdded = 'failed';
          const errorMsg = `${flagResult.error || 'Unknown error'}`;
          logger.warn(`Failed to add BattleMetrics flag: ${errorMsg}`);
          results.errors.push(`BattleMetrics flag: ${errorMsg}`);
        }
      } catch (flagError) {
        results.flagAdded = 'failed';
        logger.error(`Error adding BattleMetrics flag: ${flagError.message}`);
        results.errors.push(`BattleMetrics flag error: ${flagError.message}`);
      }
    } else {
      results.flagAdded = 'skipped';
    }

    // 5. Create audit log
    // Core success = link + role are good (nickname/flag failures are just warnings)
    // Note: createOrUpdateLink always succeeds (creates or updates), so link is always good
    const auditSuccess =
      (results.linkCreated || results.linkUpdated) &&
      (results.roleAdded || hasMemberRole);

    await AuditLog.create({
      actionType: 'MEMBER_ADDED',
      actorType: 'dashboard_user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'user',
      targetId: discord_user_id,
      targetName: member.user.username,
      description: `Member added via dashboard: ${member.user.username} with Steam ID ${steamid64}`,
      guildId: guild.id,
      metadata: {
        steamId: steamid64,
        nickname: nickname,
        battlemetrics_player_id: battlemetrics_player_id || null,
        linkCreated: results.linkCreated,
        linkUpdated: results.linkUpdated,
        roleAdded: results.roleAdded,
        nicknameSet: results.nicknameSet,
        flagAdded: results.flagAdded,
        warnings: results.errors // Rename to warnings for clarity
      },
      success: auditSuccess,
      severity: auditSuccess ? (results.errors.length === 0 ? 'info' : 'warning') : 'error'
    });

    // 6. Role sync is handled automatically by createOrUpdateLink when confidence crosses 1.0 threshold

    // 7. Send log to configured channel
    try {
      const logChannelId = CHANNELS.MEMBER_ADDITION_LOGS;
      const logChannel = await discordClient.channels.fetch(logChannelId);

      if (logChannel) {
        const logEmbed = {
          title: 'Member Added',
          description: 'A new member has been added via the dashboard.',
          color: 0x4caf50,
          fields: [
            { name: 'Member', value: `<@${discord_user_id}> (${member.user.username})`, inline: false },
            { name: 'Steam ID', value: `\`${steamid64}\``, inline: true },
            { name: 'Nickname', value: nickname, inline: true },
            { name: 'Added By', value: `<@${req.user.id}> (${req.user.username})`, inline: false },
            { name: 'Link Status', value: results.linkCreated ? 'New link created' : (results.linkUpdated ? 'Existing link updated' : 'Link already existed'), inline: true },
            { name: 'Role Added', value: results.roleAdded ? 'Yes' : (hasMemberRole ? 'Already had role' : 'Failed'), inline: true },
            { name: 'Nickname Set', value: results.nicknameSet ? 'Yes' : 'Failed', inline: true },
            {
              name: 'BM Flag',
              value: results.flagAdded === 'added' ? 'Added' :
                results.flagAdded === 'already_has' ? 'Already has' :
                  results.flagAdded === 'skipped' ? 'Skipped' :
                    'Failed',
              inline: true
            }
          ],
          timestamp: new Date().toISOString()
        };

        await logChannel.send({ embeds: [logEmbed] });
        logger.info(`Sent member addition log to channel ${logChannelId}`);
      }
    } catch (logError) {
      logger.error(`Failed to send log to channel: ${logError.message}`);
    }

    // 8. Send welcome message to members chat
    try {
      const memberChatId = CHANNELS.MEMBER_CHAT;
      const memberRulesId = CHANNELS.MEMBER_RULES;
      const memberChat = await discordClient.channels.fetch(memberChatId);

      if (memberChat) {
        const welcomeMessage = `**Let's welcome our new member!!!** <@${discord_user_id}>\n\n` +
          'Make sure to change your tag to -B&B- in game (DO NOT PUT "=B&B=" as those are admin tags)\n' +
          `And read all the rules in <#${memberRulesId}>`;

        await memberChat.send(welcomeMessage);
        logger.info(`Sent welcome message to members chat ${memberChatId}`);
      }
    } catch (welcomeError) {
      logger.error(`Failed to send welcome message: ${welcomeError.message}`);
    }

    // Determine success - core operations are link creation and role assignment
    // Nickname and BM flag failures are warnings, not failures
    // Note: createOrUpdateLink always succeeds (creates or updates), so link is always good
    const coreOperationsSucceeded =
      (results.linkCreated || results.linkUpdated) && // Link was created or updated
      (results.roleAdded || hasMemberRole); // Role was added or already had it

    // Return success response
    res.json({
      success: coreOperationsSucceeded,
      member: {
        discord_user_id: discord_user_id,
        steamid64: steamid64,
        username: member.user.username,
        nickname: nickname
      },
      results: {
        linkCreated: results.linkCreated,
        linkUpdated: results.linkUpdated,
        roleAdded: results.roleAdded,
        alreadyHadRole: hasMemberRole && !results.roleAdded,
        nicknameSet: results.nicknameSet,
        flagAdded: results.flagAdded
      },
      errors: results.errors
    });

  } catch (error) {
    logger.error('Error adding member:', error);
    res.status(500).json({
      error: 'Failed to add member',
      code: 'ADD_MEMBER_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/members
 * List members (users with MEMBER role)
 * Permission: VIEW_MEMBERS
 */
router.get('/', requirePermission('VIEW_MEMBERS'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search,
      sortBy = 'username',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

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

    // Get members with MEMBER role using cache service
    const cacheService = getMemberCacheService();
    const membersWithRole = await cacheService.getMembersByRole(guild, DISCORD_ROLES.MEMBER);

    // Convert to array and enrich with link data
    let members = [];
    const memberIds = Array.from(membersWithRole.keys());

    // Batch fetch PlayerDiscordLink data
    const links = await PlayerDiscordLink.findAll({
      where: {
        discord_user_id: memberIds,
        is_primary: true
      }
    });
    const linkMap = new Map(links.map(l => [l.discord_user_id, l]));

    for (const [memberId, member] of membersWithRole) {
      const link = linkMap.get(memberId);

      members.push({
        discord_user_id: memberId,
        username: member.user.username,
        displayName: member.displayName || member.user.username,
        nickname: member.nickname || null,
        avatarUrl: member.user.displayAvatarURL({ size: 64 }),
        steamid64: link?.steamid64 || null,
        linked_at: link?.createdAt?.toISOString() || null,
        confidence_score: link?.confidence_score || null,
        joinedAt: member.joinedAt?.toISOString() || null
      });
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m =>
        m.username.toLowerCase().includes(searchLower) ||
        (m.nickname && m.nickname.toLowerCase().includes(searchLower)) ||
        (m.steamid64 && m.steamid64.includes(search)) ||
        m.discord_user_id.includes(search)
      );
    }

    // Sort
    const sortMultiplier = sortOrder.toUpperCase() === 'DESC' ? -1 : 1;
    members.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
      case 'username':
        aVal = a.username.toLowerCase();
        bVal = b.username.toLowerCase();
        break;
      case 'nickname':
        aVal = (a.nickname || a.username).toLowerCase();
        bVal = (b.nickname || b.username).toLowerCase();
        break;
      case 'linked_at':
        aVal = a.linked_at || '';
        bVal = b.linked_at || '';
        break;
      case 'joinedAt':
        aVal = a.joinedAt || '';
        bVal = b.joinedAt || '';
        break;
      default:
        aVal = a.username.toLowerCase();
        bVal = b.username.toLowerCase();
      }

      if (aVal < bVal) return -1 * sortMultiplier;
      if (aVal > bVal) return 1 * sortMultiplier;
      return 0;
    });

    // Paginate
    const total = members.length;
    const paginatedMembers = members.slice(offset, offset + parseInt(limit));

    res.json({
      members: paginatedMembers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Error listing members:', error);
    res.status(500).json({
      error: 'Failed to list members',
      code: 'LIST_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/members/:discordId
 * Get member details by Discord ID
 * Permission: VIEW_MEMBERS
 */
router.get('/:discordId', requirePermission('VIEW_MEMBERS'), async (req, res) => {
  try {
    const { discordId } = req.params;

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

    // Fetch Discord member
    const cacheService = getMemberCacheService();
    const member = await cacheService.getMember(guild, discordId);

    if (!member) {
      return res.status(404).json({
        error: 'Member not found in guild',
        code: 'MEMBER_NOT_FOUND'
      });
    }

    // Check if they have the member role
    const hasMemberRole = member.roles.cache.has(DISCORD_ROLES.MEMBER);

    // Get PlayerDiscordLink data
    const link = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: discordId,
        is_primary: true
      }
    });

    // Get BattleMetrics data if Steam ID is linked
    let battlemetrics = null;
    if (link?.steamid64) {
      try {
        const result = await BattleMetricsService.searchPlayerBySteamId(link.steamid64, 5000);
        if (result.found && result.playerData) {
          battlemetrics = {
            found: true,
            playerId: result.playerData.id,
            playerName: result.playerData.name || null,
            profileUrl: result.profileUrl
          };
        } else {
          battlemetrics = { found: false, error: result.error };
        }
      } catch (bmError) {
        logger.warn(`Failed to fetch BattleMetrics data for ${link.steamid64}:`, bmError.message);
        battlemetrics = { found: false, error: bmError.message };
      }
    }

    // Get all Discord roles
    const roles = member.roles.cache
      .filter(role => role.id !== guild.id) // Exclude @everyone
      .sort((a, b) => b.position - a.position) // Sort by position (highest first)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor
      }));

    res.json({
      discord_user_id: discordId,
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      globalName: member.user.globalName || null,
      nickname: member.nickname || null,
      avatarUrl: member.user.displayAvatarURL({ size: 128 }),
      bannerColor: member.user.accentColor ? `#${member.user.accentColor.toString(16)}` : null,
      joinedAt: member.joinedAt?.toISOString() || null,
      createdAt: member.user.createdAt?.toISOString() || null,
      isMember: hasMemberRole,
      roles,
      link: link ? {
        steamid64: link.steamid64,
        eosID: link.eosID || null,
        confidence_score: link.confidence_score,
        link_source: link.link_source,
        linked_at: link.created_at ? new Date(link.created_at).toISOString() : null,
        metadata: link.metadata || null
      } : null,
      battlemetrics
    });

  } catch (error) {
    logger.error('Error fetching member details:', error);
    res.status(500).json({
      error: 'Failed to fetch member details',
      code: 'FETCH_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
