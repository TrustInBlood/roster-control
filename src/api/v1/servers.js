const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { PlayerDiscordLink } = require('../../database/models');
const { loadConfig } = require('../../utils/environment');

const logger = createServiceLogger('ServersAPI');

// Load Discord roles configuration
const { DISCORD_ROLES, getAllStaffRoles } = loadConfig('discordRoles');

/**
 * Get admin role display name based on role ID
 */
function getAdminRoleName(roleId) {
  const roleNames = {
    [DISCORD_ROLES.SUPER_ADMIN]: 'Super Admin',
    [DISCORD_ROLES.EXECUTIVE_ADMIN]: 'Executive Admin',
    [DISCORD_ROLES.HEAD_ADMIN]: 'Head Admin',
    [DISCORD_ROLES.SENIOR_ADMIN]: 'Senior Admin',
    [DISCORD_ROLES.OG_ADMIN]: 'OG Admin',
    [DISCORD_ROLES.SQUAD_ADMIN]: 'Squad Admin',
    [DISCORD_ROLES.MODERATOR_T1]: 'Moderator T1',
    [DISCORD_ROLES.MODERATOR_T2]: 'Moderator T2',
    [DISCORD_ROLES.STAFF]: 'Staff',
    [DISCORD_ROLES.TICKET_SUPPORT]: 'Ticket Support',
    [DISCORD_ROLES.APPLICATIONS]: 'Applications'
  };
  return roleNames[roleId] || 'Staff';
}

/**
 * Get the highest priority staff role from an array of roles
 * Only considers actual staff category roles from discordRoles.js
 * Returns roleId, roleName, and priority (higher = more senior)
 */
function getHighestStaffRole(userRoles) {
  // Staff roles in priority order (highest first)
  // Only includes roles from getAllStaffRoles() - no SUPER_ADMIN/Discord op
  const rolePriority = [
    { id: DISCORD_ROLES.EXECUTIVE_ADMIN, priority: 900 },
    { id: DISCORD_ROLES.HEAD_ADMIN, priority: 800 },
    { id: DISCORD_ROLES.SENIOR_ADMIN, priority: 700 },
    { id: DISCORD_ROLES.OG_ADMIN, priority: 600 },
    { id: DISCORD_ROLES.SQUAD_ADMIN, priority: 500 },
    { id: DISCORD_ROLES.MODERATOR_T2, priority: 400 },
    { id: DISCORD_ROLES.MODERATOR_T1, priority: 300 },
    { id: DISCORD_ROLES.STAFF, priority: 200 },
    { id: DISCORD_ROLES.TICKET_SUPPORT, priority: 100 }
  ];

  for (const role of rolePriority) {
    if (userRoles.includes(role.id)) {
      return { roleId: role.id, roleName: getAdminRoleName(role.id), priority: role.priority };
    }
  }
  return null;
}

/**
 * Look up online staff members for a given list of Steam IDs
 * Returns an array of { discordId, displayName, role, steamId }
 */
async function getOnlineStaff(steamIds) {
  if (!steamIds || steamIds.length === 0) {
    return [];
  }

  const discordClient = global.discordClient;
  if (!discordClient) {
    return [];
  }

  // Get all Discord links for these Steam IDs with high confidence only
  // Staff identification requires confidence >= 1.0 (same as whitelist system)
  const links = await PlayerDiscordLink.findAll({
    where: {
      steamid64: steamIds,
      confidence_score: { [Op.gte]: 1.0 }
    }
  });

  if (links.length === 0) {
    return [];
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return [];
  }

  const allStaffRoles = getAllStaffRoles();
  const onlineStaff = [];

  for (const link of links) {
    try {
      const member = await guild.members.fetch(link.discord_user_id).catch(() => null);
      if (!member) continue;

      const memberRoleIds = member.roles.cache.map(r => r.id);
      const isStaff = memberRoleIds.some(roleId => allStaffRoles.includes(roleId));

      if (isStaff) {
        // Get the highest priority staff role and use its actual Discord name and color
        const highestRole = getHighestStaffRole(memberRoleIds);
        let roleName = 'Staff';
        let roleColor = null;
        let rolePriority = 0;

        if (highestRole?.roleId) {
          const discordRole = member.roles.cache.get(highestRole.roleId);
          if (discordRole) {
            roleName = discordRole.name;
            // Discord stores color as integer, convert to hex
            if (discordRole.color !== 0) {
              roleColor = '#' + discordRole.color.toString(16).padStart(6, '0');
            }
          }
          rolePriority = highestRole.priority || 0;
        }

        onlineStaff.push({
          discordId: link.discord_user_id,
          steamId: link.steamid64,
          displayName: member.displayName || member.user.username,
          role: roleName,
          roleColor,
          rolePriority
        });
      }
    } catch (error) {
      logger.debug('Failed to fetch member for staff check', {
        discordId: link.discord_user_id,
        error: error.message
      });
    }
  }

  // Sort by role priority (highest first)
  onlineStaff.sort((a, b) => b.rolePriority - a.rolePriority);

  return onlineStaff;
}

/**
 * Get player list directly from SquadJS socket
 * @param {Socket} socket - Socket.io connection
 * @returns {Promise<{success: boolean, players: Array}>} - Result object with success flag and players
 */
function getPlayerListFromSocket(socket) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ success: false, players: [] });
      return;
    }

    const timeout = setTimeout(() => {
      logger.debug('Socket player list request timed out after 5s');
      resolve({ success: false, players: [] });
    }, 5000);

    socket.emit('players', (playerList) => {
      clearTimeout(timeout);
      // Socket responded successfully - trust the result even if empty
      resolve({ success: true, players: playerList || [] });
    });
  });
}

/**
 * Get active Steam IDs for a specific server - tries direct socket query first
 * Falls back to PlaytimeTrackingService cache only if socket query fails (timeout/error)
 */
async function getActiveSteamIdsForServer(playtimeService, serverId, socket) {
  // Try direct socket query first (most accurate)
  if (socket && socket.connected) {
    const result = await getPlayerListFromSocket(socket);

    // If socket responded successfully, trust the result even if empty
    // (server could genuinely be empty)
    if (result.success) {
      const steamIds = result.players
        .filter(p => p.steamID)
        .map(p => p.steamID);
      logger.debug(`Server ${serverId}: Socket returned ${steamIds.length} players (direct query)`);
      return steamIds;
    }

    // Socket failed (timeout) - fall through to cache
    logger.warn(`Server ${serverId}: Socket query timed out, falling back to cache`);
  } else {
    logger.debug(`Server ${serverId}: Socket not connected, using cache`);
  }

  // Fallback to PlaytimeTrackingService cache (only when socket unavailable/failed)
  if (!playtimeService) {
    return [];
  }

  const activeSessions = playtimeService.getActiveSessions();
  const steamIds = [];

  for (const [sessionKey] of activeSessions) {
    // Key format is "serverId:steamId"
    if (sessionKey.startsWith(`${serverId}:`)) {
      const steamId = sessionKey.split(':')[1];
      if (steamId) {
        steamIds.push(steamId);
      }
    }
  }

  logger.warn(`Server ${serverId}: Using cached sessions - ${steamIds.length} players (cache may be stale)`);
  return steamIds;
}

/**
 * Get current status of all servers including player count and online staff
 */
async function getServersStatus() {
  const whitelistServices = global.whitelistServices;
  const playtimeService = global.playtimeTrackingService;

  if (!whitelistServices || !whitelistServices.connectionManager) {
    return [];
  }

  const connectionManager = whitelistServices.connectionManager;
  const connections = connectionManager.getConnections();
  const servers = [];

  for (const [serverId, connectionData] of connections) {
    const { server, socket, state, serverInfo } = connectionData;

    // Get active Steam IDs for this server (try socket first, then cache)
    const activeSteamIds = await getActiveSteamIdsForServer(playtimeService, serverId, socket);
    const playerCount = activeSteamIds.length;

    // Get online staff for this server
    const onlineStaff = await getOnlineStaff(activeSteamIds);

    // Try to query server info directly if we don't have queue data cached
    let currentServerInfo = serverInfo;
    if (socket && socket.connected && (!serverInfo || serverInfo.publicQueue === undefined)) {
      await connectionManager.queryServerInfo(serverId);
      // Re-fetch the connection data to get updated serverInfo
      const updatedConnection = connections.get(serverId);
      if (updatedConnection) {
        currentServerInfo = updatedConnection.serverInfo;
      }
    }

    servers.push({
      id: serverId,
      name: server.name,
      connected: socket && socket.connected,
      state: state || 'unknown',
      playerCount,
      maxPlayers: currentServerInfo?.maxPlayers || 100,
      publicQueue: currentServerInfo?.publicQueue || 0,
      reserveQueue: currentServerInfo?.reserveQueue || 0,
      onlineStaff,
      lastUpdate: new Date().toISOString()
    });
  }

  return servers;
}

// GET /api/v1/servers/status - Get status of all servers
router.get('/status', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const servers = await getServersStatus();

    res.json({
      success: true,
      data: servers
    });
  } catch (error) {
    logger.error('Error getting server status:', error.message);
    res.status(500).json({ error: 'Failed to get server status' });
  }
});

// Export the getServersStatus function for use by socket service
module.exports = router;
module.exports.getServersStatus = getServersStatus;
module.exports.getOnlineStaff = getOnlineStaff;
