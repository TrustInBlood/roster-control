const { createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');
const { DutySession, DutyActivityEvent, PlayerDiscordLink } = require('../database/models');
const { Op } = require('sequelize');

const logger = createServiceLogger('DutySquadJSTrackingService');

// Load Discord roles configuration
const { getAllStaffRoles } = loadConfig('discordRoles');

// Singleton instance
let instance = null;

/**
 * Tracks SquadJS events (admin cam, in-game chat) for staff duty activity.
 * Records events to DutyActivityEvent and increments DutySession counters.
 */
class DutySquadJSTrackingService {
  constructor(connectionManager, discordClient) {
    this.connectionManager = connectionManager;
    this.discordClient = discordClient;

    // Cache of staff Steam IDs for quick lookup
    // Map<steamId, { discordUserId, lastChecked }>
    this.staffCache = new Map();
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    // Bind handlers to preserve 'this' context
    this.boundHandleAdminCamera = this.handleAdminCamera.bind(this);
    this.boundHandleChatMessage = this.handleChatMessage.bind(this);

    // Register event handlers with SquadJS connection manager
    // POSSESSED_ADMIN_CAMERA is the specific event for admin camera usage
    this.connectionManager.registerEventHandler('POSSESSED_ADMIN_CAMERA', this.boundHandleAdminCamera);
    this.connectionManager.registerEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);

    this.initialized = true;
    logger.info('DutySquadJSTrackingService initialized');
  }

  shutdown() {
    if (!this.initialized) return;

    // Unregister event handlers
    this.connectionManager.unregisterEventHandler('POSSESSED_ADMIN_CAMERA', this.boundHandleAdminCamera);
    this.connectionManager.unregisterEventHandler('CHAT_MESSAGE', this.boundHandleChatMessage);

    this.staffCache.clear();
    this.initialized = false;
    logger.info('DutySquadJSTrackingService shutdown');
  }

  /**
   * Handle POSSESSED_ADMIN_CAMERA event from SquadJS
   * This fires specifically when a player enters admin camera mode
   *
   * Event data structure:
   * - steamID: Steam ID of the player
   * - eosID: EOS ID of the player
   * - name: Player name
   * - player: Full player object with additional details
   */
  async handleAdminCamera(data, server) {
    try {
      // POSSESSED_ADMIN_CAMERA provides steamID directly on data object
      const steamId = data?.steamID || data?.player?.steamID;

      logger.debug('POSSESSED_ADMIN_CAMERA event received', {
        serverId: server.id,
        steamId,
        playerName: data?.name || data?.player?.name
      });

      if (!steamId) {
        logger.debug('POSSESSED_ADMIN_CAMERA missing steamID', { data });
        return;
      }

      const guildId = process.env.DISCORD_GUILD_ID;

      // Look up staff member
      const staffInfo = await this.getStaffInfo(steamId);
      if (!staffInfo) {
        return; // Not a linked staff member
      }

      logger.info('Admin cam event detected', {
        serverId: server.id,
        serverName: server.name,
        steamId,
        discordUserId: staffInfo.discordUserId,
        playerName: data?.name || data?.player?.name
      });

      // Record the activity event
      await this.recordAdminCamEvent(staffInfo.discordUserId, guildId, server.id);

    } catch (error) {
      logger.error('Error handling POSSESSED_ADMIN_CAMERA event', {
        error: error.message,
        serverId: server?.id
      });
    }
  }

  /**
   * Handle CHAT_MESSAGE event from SquadJS
   * Track all chat messages from staff members
   *
   * SquadJS CHAT_MESSAGE data structure:
   * - player.steamID: Steam ID of the sender
   * - message: The chat message content
   * - chat: Chat channel type (e.g., 'ChatAll', 'ChatTeam', 'ChatSquad', 'ChatAdmin')
   */
  async handleChatMessage(data, server) {
    try {
      // SquadJS provides steamID directly on player object
      const steamId = data?.player?.steamID;
      if (!steamId) {
        return; // No steam ID in message
      }

      const guildId = process.env.DISCORD_GUILD_ID;

      // Look up staff member
      const staffInfo = await this.getStaffInfo(steamId);
      if (!staffInfo) {
        return; // Not a linked staff member
      }

      const chatType = data?.chat || 'unknown';

      logger.debug('Staff in-game chat detected', {
        serverId: server.id,
        serverName: server.name,
        steamId,
        discordUserId: staffInfo.discordUserId,
        chatType
      });

      // Record the activity event
      await this.recordIngameChatEvent(staffInfo.discordUserId, guildId, server.id, chatType);

    } catch (error) {
      logger.error('Error handling CHAT_MESSAGE event', {
        error: error.message,
        serverId: server?.id
      });
    }
  }

  /**
   * Get staff info from Steam ID using cache
   * Returns { discordUserId } if staff, null otherwise
   */
  async getStaffInfo(steamId) {
    // Check cache first
    const cached = this.staffCache.get(steamId);
    if (cached && (Date.now() - cached.lastChecked) < this.CACHE_TTL_MS) {
      return cached.discordUserId ? { discordUserId: cached.discordUserId } : null;
    }

    // Look up in database - require high confidence link (≥1.0)
    const link = await PlayerDiscordLink.findOne({
      where: {
        steamid64: steamId,
        confidence_score: { [Op.gte]: 1.0 }
      }
    });

    if (!link) {
      // Cache negative result
      this.staffCache.set(steamId, { discordUserId: null, lastChecked: Date.now() });
      return null;
    }

    // Verify they have a staff role
    const isStaff = await this.verifyStaffRole(link.discord_user_id);
    if (!isStaff) {
      // Cache negative result
      this.staffCache.set(steamId, { discordUserId: null, lastChecked: Date.now() });
      return null;
    }

    // Cache positive result
    this.staffCache.set(steamId, { discordUserId: link.discord_user_id, lastChecked: Date.now() });
    return { discordUserId: link.discord_user_id };
  }

  /**
   * Verify a Discord user has a staff role
   */
  async verifyStaffRole(discordUserId) {
    try {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await this.discordClient.guilds.fetch(guildId).catch(() => null);
      if (!guild) return false;

      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) return false;

      const allStaffRoles = getAllStaffRoles();
      const memberRoleIds = member.roles.cache.map(r => r.id);
      return memberRoleIds.some(roleId => allStaffRoles.includes(roleId));
    } catch (error) {
      logger.debug('Error verifying staff role', { discordUserId, error: error.message });
      return false;
    }
  }

  /**
   * Record an admin cam event
   */
  async recordAdminCamEvent(discordUserId, guildId, serverId) {
    // Check for active duty session
    const activeSession = await DutySession.getActiveSession(discordUserId);
    const isOnDuty = !!activeSession;

    // Record the activity event
    await DutyActivityEvent.recordEvent({
      sessionId: isOnDuty ? activeSession.id : null,
      discordUserId,
      guildId,
      isOnDuty,
      eventType: 'admin_cam',
      serverId
    });

    // If on duty, increment the session counter
    if (activeSession) {
      await DutySession.incrementActivityCounter(activeSession.id, 'adminCamEvents', 1);
    }

    logger.info('Admin cam event recorded', {
      discordUserId,
      serverId,
      isOnDuty,
      sessionId: activeSession?.id
    });
  }

  /**
   * Record an in-game chat event
   */
  async recordIngameChatEvent(discordUserId, guildId, serverId, chatType) {
    // Check for active duty session
    const activeSession = await DutySession.getActiveSession(discordUserId);
    const isOnDuty = !!activeSession;

    // Record the activity event
    await DutyActivityEvent.recordEvent({
      sessionId: isOnDuty ? activeSession.id : null,
      discordUserId,
      guildId,
      isOnDuty,
      eventType: 'ingame_chat',
      serverId,
      metadata: { chatType }
    });

    // If on duty, increment the session counter
    if (activeSession) {
      await DutySession.incrementActivityCounter(activeSession.id, 'ingameChatMessages', 1);
    }

    logger.debug('In-game chat event recorded', {
      discordUserId,
      serverId,
      isOnDuty,
      chatType,
      sessionId: activeSession?.id
    });
  }

  /**
   * Clear the staff cache (useful when roles change)
   */
  clearCache() {
    this.staffCache.clear();
    logger.debug('Staff cache cleared');
  }
}

/**
 * Initialize the singleton service
 */
function initializeDutySquadJSTrackingService(connectionManager, discordClient) {
  if (!instance) {
    instance = new DutySquadJSTrackingService(connectionManager, discordClient);
  }
  instance.initialize();
  return instance;
}

/**
 * Get the singleton service instance
 */
function getDutySquadJSTrackingService() {
  return instance;
}

module.exports = {
  DutySquadJSTrackingService,
  initializeDutySquadJSTrackingService,
  getDutySquadJSTrackingService
};
