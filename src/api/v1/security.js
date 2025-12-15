const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { PlayerDiscordLink } = require('../../database/models');
const { getHighestPriorityGroupAsync, getSquadGroupService, squadGroups } = require('../../utils/environment');
const { SQUAD_GROUPS } = squadGroups; // Fallback
const { getMemberCacheService } = require('../../services/MemberCacheService');

const logger = createServiceLogger('SecurityAPI');

// GET /api/v1/security/unlinked-staff - Get staff members without high-confidence Steam links
router.get('/unlinked-staff', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const discordClient = global.discordClient;

    if (!discordClient) {
      return res.status(503).json({ error: 'Discord client not available' });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return res.status(503).json({ error: 'Discord guild not available' });
    }

    const cacheService = getMemberCacheService();

    // Get all staff role IDs (excluding Member roles)
    let staffRoleIds = [];
    try {
      const squadGroupService = getSquadGroupService();
      const roleConfigs = await squadGroupService.getAllRoleConfigs();
      staffRoleIds = roleConfigs
        .filter(config => config.groupName !== 'Member')
        .map(config => config.roleId);
    } catch (error) {
      // Fallback to config file
      logger.warn('Failed to get staff roles from service, using config fallback');
      for (const [groupName, groupData] of Object.entries(SQUAD_GROUPS)) {
        if (groupName === 'Member') continue;
        staffRoleIds.push(...groupData.discordRoles);
      }
    }

    // Fetch only members with staff roles (optimized)
    const members = await cacheService.getMembersByRole(guild, staffRoleIds);

    // Find staff members who lack proper Steam links
    const unlinkedStaff = [];

    for (const [memberId, member] of members) {
      if (member.user.bot) continue;

      const userGroup = await getHighestPriorityGroupAsync(member.roles.cache, member.guild);

      // Verify it's a staff role
      if (!userGroup || userGroup === 'Member') continue;

      // Check if they have a high-confidence Steam link
      const primaryLink = await PlayerDiscordLink.findOne({
        where: {
          discord_user_id: memberId,
          is_primary: true,
          confidence_score: { [Op.gte]: 1.0 }
        }
      });

      // If no high-confidence link, they're considered unlinked staff
      if (!primaryLink) {
        unlinkedStaff.push({
          discordId: memberId,
          username: member.displayName || member.user.username,
          userTag: member.user.tag,
          group: userGroup,
          avatarUrl: member.user.displayAvatarURL({ size: 64 })
        });
      }
    }

    // Group by role
    const groupedStaff = {};
    unlinkedStaff.forEach(staff => {
      if (!groupedStaff[staff.group]) {
        groupedStaff[staff.group] = [];
      }
      groupedStaff[staff.group].push(staff);
    });

    // Sort groups by priority (higher priority first)
    const groupOrder = Object.keys(SQUAD_GROUPS).filter(g => g !== 'Member');
    const sortedGroups = Object.entries(groupedStaff)
      .sort((a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]));

    res.json({
      total: unlinkedStaff.length,
      staffTotal: members.size,
      groups: Object.fromEntries(sortedGroups),
      ungrouped: unlinkedStaff
    });
  } catch (error) {
    logger.error('Error fetching unlinked staff', { error: error.message });

    if (error.code === 'GuildMembersTimeout') {
      return res.status(504).json({ error: 'Timeout fetching guild members' });
    }

    res.status(500).json({ error: 'Failed to fetch unlinked staff' });
  }
});

module.exports = router;
