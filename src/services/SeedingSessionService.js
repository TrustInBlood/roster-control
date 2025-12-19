const { createServiceLogger } = require('../utils/logger');
const { SeedingSession, SeedingParticipant, Whitelist, AuditLog } = require('../database/models');

/**
 * Format a duration in minutes to a human-readable string
 * Uses the most appropriate unit (minutes, hours, days, months)
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration string (e.g., "30min", "6hr", "2d", "1mo")
 */
function formatRewardDuration(minutes) {
  if (minutes < 60) {
    return `${minutes}min`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    // Show hours, round to 1 decimal if needed
    const displayHours = hours % 1 === 0 ? hours : Math.round(hours * 10) / 10;
    return `${displayHours}hr`;
  }

  const days = hours / 24;
  if (days < 30) {
    // Show days, round to 1 decimal if needed
    const displayDays = days % 1 === 0 ? days : Math.round(days * 10) / 10;
    return `${displayDays}d`;
  }

  const months = days / 30;
  // Show months, round to 1 decimal if needed
  const displayMonths = months % 1 === 0 ? months : Math.round(months * 10) / 10;
  return `${displayMonths}mo`;
}

/**
 * Seeding Session Service
 * Manages cross-server seeding incentive sessions with tiered rewards
 */
class SeedingSessionService {
  constructor(playtimeTrackingService, connectionManager) {
    this.logger = createServiceLogger('SeedingSessionService');
    this.connectionManager = connectionManager;
    this.playtimeTrackingService = playtimeTrackingService;

    // Active session cache (only one allowed at a time)
    this.activeSession = null;

    // Tracking potential switchers on source servers: Map<steamId, { serverId, joinTime }>
    this.potentialSwitchers = new Map();

    // Playtime accumulator for participants: Map<participantId, lastUpdateTime>
    this.playtimeTracking = new Map();

    // Server player counts: Map<serverId, { playerCount, lastUpdate }>
    this.serverPlayerCounts = new Map();

    // Playtime update interval (same as polling - 60 seconds)
    this.playtimeUpdateInterval = null;

    // Broadcast reminder interval
    this.broadcastReminderInterval = null;

    // Configuration
    this.config = {
      // Minimum players on a server before broadcasting to it (0-100, typically 80+ means "full")
      minPlayersForBroadcast: 99,
      // How often to re-broadcast reminders to full servers (in minutes)
      broadcastReminderMinutes: 5,
      // Max players per server (used for percentage calculations)
      maxPlayersPerServer: 100
    };

    // Bound event handlers for cleanup
    this._boundHandlers = {
      onPlayerJoined: this.handlePlayerJoined.bind(this),
      onPlayerLeft: this.handlePlayerLeft.bind(this),
      onPlayerCountUpdate: this.handlePlayerCountUpdate.bind(this)
    };
  }

  /**
   * Initialize the service and subscribe to events
   */
  async initialize() {
    this.logger.info('Initializing SeedingSessionService...');

    // Check for active session in database (recovery from restart)
    const activeSession = await SeedingSession.getActiveSession();
    if (activeSession) {
      this.activeSession = activeSession;
      this.logger.info(`Recovered active seeding session: ${activeSession.id} (target: ${activeSession.target_server_name})`);

      // Rebuild potential switchers map from participants
      await this.rebuildPotentialSwitchersMap(activeSession.id);

      // Resume broadcast reminders for the active session
      this.startBroadcastReminders();
    }

    // Subscribe to PlaytimeTrackingService events
    this.playtimeTrackingService.on('playerJoined', this._boundHandlers.onPlayerJoined);
    this.playtimeTrackingService.on('playerLeft', this._boundHandlers.onPlayerLeft);
    this.playtimeTrackingService.on('playerCountUpdate', this._boundHandlers.onPlayerCountUpdate);

    // Start playtime accumulation interval
    this.startPlaytimeAccumulation();

    this.logger.info('SeedingSessionService initialized');
  }

  /**
   * Start playtime accumulation interval
   */
  startPlaytimeAccumulation() {
    // Update playtime every 60 seconds (same as polling interval)
    this.playtimeUpdateInterval = setInterval(async () => {
      if (this.activeSession) {
        await this.updateParticipantPlaytimes();
        await this.checkPlaytimeRewards();
      }
    }, 60 * 1000);
  }

  /**
   * Rebuild potential switchers map from database (for recovery)
   */
  async rebuildPotentialSwitchersMap(sessionId) {
    const participants = await SeedingParticipant.findAll({
      where: {
        session_id: sessionId,
        status: 'on_source'
      }
    });

    for (const participant of participants) {
      this.potentialSwitchers.set(participant.steam_id, {
        serverId: participant.source_server_id,
        joinTime: participant.source_join_time,
        participantId: participant.id
      });
    }

    this.logger.info(`Rebuilt potential switchers map: ${this.potentialSwitchers.size} entries`);
  }

  /**
   * Create a new seeding session
   */
  async createSession(config, startedBy, startedByName) {
    // Check if there's already an active session
    if (await SeedingSession.hasActiveSession()) {
      throw new Error('An active seeding session already exists. Close or cancel it first.');
    }

    const {
      targetServerId,
      playerThreshold,
      rewards,
      testMode = false,
      sourceServerIds: manualSourceServerIds
    } = config;

    // Get target server info
    const connections = this.connectionManager.getConnections();
    const targetConnection = connections.get(targetServerId);

    if (!targetConnection) {
      throw new Error(`Target server ${targetServerId} is not connected`);
    }

    const targetServerName = targetConnection.server.name;

    // Build source server IDs
    let sourceServerIds;
    if (testMode && manualSourceServerIds && manualSourceServerIds.length > 0) {
      // Test mode: use manually specified source servers
      sourceServerIds = manualSourceServerIds;
      this.logger.info(`TEST MODE: Using manually specified source servers: ${sourceServerIds.join(', ')}`);
    } else {
      // Normal mode: all servers except target
      sourceServerIds = [];
      for (const [serverId] of connections) {
        if (serverId !== targetServerId) {
          sourceServerIds.push(serverId);
        }
      }
    }

    // Track test mode for this session
    this.isTestMode = testMode;

    // Create session in database
    const session = await SeedingSession.createSession({
      targetServerId,
      targetServerName,
      playerThreshold,
      rewards,
      sourceServerIds,
      startedBy,
      startedByName,
      metadata: testMode ? { testMode: true } : null
    });

    // Cache the active session
    this.activeSession = session;

    // Enroll existing players on target as seeders
    await this.enrollExistingPlayers(session.id, targetServerId);

    // Broadcast seeding call to source servers
    // In test mode, bypass the full server threshold
    await this.broadcastSeedingCall(session, sourceServerIds, false, testMode);

    // Start periodic reminder broadcasts
    this.startBroadcastReminders();

    // Log audit
    await this.logAuditAction('seeding_session_started', startedBy, session.id, {
      targetServerId,
      targetServerName,
      playerThreshold,
      rewards,
      sourceServerIds,
      testMode
    });

    this.logger.info(`Seeding session ${session.id} created: ${targetServerName} needs ${playerThreshold} players`);

    return session;
  }

  /**
   * Enroll existing players on target server as seeders
   */
  async enrollExistingPlayers(sessionId, targetServerId) {
    const activeSessions = this.playtimeTrackingService.getActiveSessions();

    let enrolledCount = 0;

    for (const [sessionKey, sessionData] of activeSessions) {
      const [serverId, steamId] = sessionKey.split(':');

      if (serverId !== targetServerId) continue;

      try {
        // Check if already a participant
        const existing = await SeedingParticipant.findBySessionAndSteamId(sessionId, steamId);
        if (existing) continue;

        // Create seeder participant
        await SeedingParticipant.createSeeder({
          sessionId,
          playerId: sessionData.playerId,
          steamId,
          username: sessionData.username
        });

        enrolledCount++;

        // Send enrollment notification
        await this.sendPlayerNotification(targetServerId, steamId, this.buildSeederEnrollmentMessage());

      } catch (error) {
        this.logger.error(`Error enrolling seeder ${steamId}:`, error.message);
      }
    }

    // Update participant count
    await SeedingSession.updateParticipantCount(sessionId, enrolledCount);

    this.logger.info(`Enrolled ${enrolledCount} existing players as seeders`);
  }

  /**
   * Handle playerJoined event from PlaytimeTrackingService
   */
  async handlePlayerJoined(data) {
    if (!this.activeSession) return;

    const { serverId, steamId, username, playerId, playerCount } = data;
    const session = this.activeSession;

    try {
      // Check if this is the target server
      if (serverId === session.target_server_id) {
        await this.handlePlayerJoinedTarget(steamId, username, playerId, playerCount);
      }
      // Check if this is a source server
      else if (session.source_server_ids.includes(serverId)) {
        await this.handlePlayerJoinedSource(serverId, steamId, username, playerId);
      }
    } catch (error) {
      this.logger.error(`Error handling playerJoined for ${steamId}:`, error.message);
    }
  }

  /**
   * Handle player joining a source server
   */
  async handlePlayerJoinedSource(serverId, steamId, username, playerId) {
    const session = this.activeSession;

    // Check if already a participant
    const existing = await SeedingParticipant.findBySessionAndSteamId(session.id, steamId);
    if (existing) return;

    // Create potential switcher participant
    const participant = await SeedingParticipant.createPotentialSwitcher({
      sessionId: session.id,
      playerId,
      steamId,
      username,
      sourceServerId: serverId
    });

    // Track in memory
    this.potentialSwitchers.set(steamId, {
      serverId,
      joinTime: new Date(),
      participantId: participant.id
    });

    this.logger.debug(`Tracking potential switcher: ${username} on ${serverId}`);
  }

  /**
   * Handle player joining the target server
   */
  async handlePlayerJoinedTarget(steamId, username, playerId, playerCount) {
    const session = this.activeSession;

    // Check if this player was on a source server (switcher)
    const potentialSwitcher = this.potentialSwitchers.get(steamId);

    // Check if already a participant
    let participant = await SeedingParticipant.findBySessionAndSteamId(session.id, steamId);

    if (participant) {
      // Existing participant rejoining target
      if (participant.participant_type === 'switcher' && participant.status === 'on_source') {
        // They were on source, now joining target - this is a valid switch
        await SeedingParticipant.markAsSwitched(participant.id);
        participant.is_on_target = true;
        participant.status = 'switched';

        // Grant switch reward if applicable
        await this.grantSwitchReward(participant, session);

        // Send confirmation
        await this.sendPlayerNotification(
          session.target_server_id,
          steamId,
          this.buildSwitchConfirmationMessage(session)
        );

        await SeedingParticipant.markConfirmationSent(participant.id);
      } else {
        // Rejoining after leaving - just update is_on_target
        await SeedingParticipant.update(
          { is_on_target: true, target_leave_time: null },
          { where: { id: participant.id } }
        );
      }
    } else if (potentialSwitcher) {
      // New switcher arriving from source server
      participant = await SeedingParticipant.findByPk(potentialSwitcher.participantId);

      if (participant) {
        await SeedingParticipant.markAsSwitched(participant.id);

        // Grant switch reward if applicable
        await this.grantSwitchReward(participant, session);

        // Send confirmation
        await this.sendPlayerNotification(
          session.target_server_id,
          steamId,
          this.buildSwitchConfirmationMessage(session)
        );

        await SeedingParticipant.markConfirmationSent(participant.id);

        // Remove from potential switchers
        this.potentialSwitchers.delete(steamId);

        // Update participant count
        const count = await SeedingParticipant.count({ where: { session_id: session.id } });
        await SeedingSession.updateParticipantCount(session.id, count);
      }
    } else {
      // New player joining target who wasn't on a source server
      // They become a seeder (can earn playtime + completion rewards)
      await SeedingParticipant.createSeeder({
        sessionId: session.id,
        playerId,
        steamId,
        username
      });

      // Send enrollment notification
      await this.sendPlayerNotification(
        session.target_server_id,
        steamId,
        this.buildSeederEnrollmentMessage()
      );

      // Update participant count
      const count = await SeedingParticipant.count({ where: { session_id: session.id } });
      await SeedingSession.updateParticipantCount(session.id, count);
    }

    // Check if threshold reached
    await this.checkThreshold(session.target_server_id, playerCount);
  }

  /**
   * Handle playerLeft event from PlaytimeTrackingService
   */
  async handlePlayerLeft(data) {
    if (!this.activeSession) return;

    const { serverId, steamId } = data;
    const session = this.activeSession;

    try {
      // If leaving target server, mark participant as off target
      if (serverId === session.target_server_id) {
        const participant = await SeedingParticipant.findBySessionAndSteamId(session.id, steamId);
        if (participant && participant.is_on_target) {
          await SeedingParticipant.markAsLeftTarget(participant.id);
        }
      }

      // If leaving source server, update source_leave_time
      if (session.source_server_ids.includes(serverId)) {
        const participant = await SeedingParticipant.findBySessionAndSteamId(session.id, steamId);
        if (participant && participant.status === 'on_source') {
          await SeedingParticipant.update(
            { source_leave_time: new Date() },
            { where: { id: participant.id } }
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error handling playerLeft for ${steamId}:`, error.message);
    }
  }

  /**
   * Handle playerCountUpdate event
   */
  async handlePlayerCountUpdate(data) {
    const { serverId, playerCount, steamIds } = data;

    // Always track server player counts (for broadcast filtering)
    this.serverPlayerCounts.set(serverId, {
      playerCount,
      lastUpdate: Date.now()
    });

    if (!this.activeSession) return;

    const session = this.activeSession;

    // Only care about target server for participant tracking
    if (serverId !== session.target_server_id) return;

    try {
      // Update is_on_target for all participants based on current steam IDs
      await SeedingParticipant.updateOnTargetStatus(session.id, steamIds);

      // Check threshold
      await this.checkThreshold(serverId, playerCount);
    } catch (error) {
      this.logger.error(`Error handling playerCountUpdate:`, error.message);
    }
  }

  /**
   * Get current player count for a server
   */
  getServerPlayerCount(serverId) {
    const data = this.serverPlayerCounts.get(serverId);
    return data ? data.playerCount : 0;
  }

  /**
   * Check if a server is "full" (above broadcast threshold)
   */
  isServerFull(serverId) {
    const playerCount = this.getServerPlayerCount(serverId);
    return playerCount >= this.config.minPlayersForBroadcast;
  }

  /**
   * Update playtime for all participants on target
   */
  async updateParticipantPlaytimes() {
    if (!this.activeSession) return;

    try {
      const participants = await SeedingParticipant.getParticipantsOnTarget(this.activeSession.id);

      for (const participant of participants) {
        // Add 1 minute of playtime (called every 60 seconds)
        await SeedingParticipant.addPlaytime(participant.id, 1);
      }
    } catch (error) {
      this.logger.error('Error updating participant playtimes:', error.message);
    }
  }

  /**
   * Check and grant playtime rewards
   */
  async checkPlaytimeRewards() {
    if (!this.activeSession) return;

    const session = this.activeSession;

    // Skip if no playtime reward configured
    if (!session.hasPlaytimeReward()) return;

    try {
      const eligible = await SeedingParticipant.getEligibleForPlaytimeReward(
        session.id,
        session.playtime_threshold_minutes
      );

      for (const participant of eligible) {
        await this.grantPlaytimeReward(participant, session);
      }
    } catch (error) {
      this.logger.error('Error checking playtime rewards:', error.message);
    }
  }

  /**
   * Check if player threshold is reached
   */
  async checkThreshold(serverId, playerCount) {
    if (!this.activeSession) return;

    const session = this.activeSession;

    if (serverId !== session.target_server_id) return;

    if (playerCount >= session.player_threshold) {
      await this.closeSession(session.id, 'threshold_reached');
    }
  }

  /**
   * Close a seeding session
   */
  async closeSession(sessionId, reason = 'manual') {
    const session = await SeedingSession.closeSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or already closed`);
    }

    // Stop reminder broadcasts
    this.stopBroadcastReminders();

    // Grant completion rewards
    await this.distributeCompletionRewards(session);

    // Broadcast closure to source servers
    await this.broadcastSeedingClosed(session);

    // Clear active session
    this.activeSession = null;
    this.potentialSwitchers.clear();
    this.isTestMode = false;

    // Log audit
    await this.logAuditAction('seeding_session_closed', 'system', sessionId, {
      reason,
      participantsCount: session.participants_count,
      rewardsGrantedCount: session.rewards_granted_count
    });

    this.logger.info(`Seeding session ${sessionId} closed: ${reason}`);

    return session;
  }

  /**
   * Cancel a seeding session
   */
  async cancelSession(sessionId, cancelledBy, reason = 'Cancelled by admin') {
    const session = await SeedingSession.cancelSession(sessionId, reason);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or already closed`);
    }

    // Stop reminder broadcasts
    this.stopBroadcastReminders();

    // Broadcast cancellation to source servers
    await this.broadcastSeedingCancelled(session);

    // Clear active session
    this.activeSession = null;
    this.potentialSwitchers.clear();
    this.isTestMode = false;

    // Log audit
    await this.logAuditAction('seeding_session_cancelled', cancelledBy, sessionId, {
      reason
    });

    this.logger.info(`Seeding session ${sessionId} cancelled: ${reason}`);

    return session;
  }

  /**
   * Grant switch reward to a participant
   */
  async grantSwitchReward(participant, session) {
    if (!session.hasSwitchReward()) return;
    if (participant.switch_rewarded_at) return;
    if (participant.participant_type !== 'switcher') return;

    try {
      const rewardMinutes = session.rewardToMinutes(
        session.switch_reward_value,
        session.switch_reward_unit
      );

      // Grant whitelist
      await this.grantWhitelistReward(
        participant.steam_id,
        participant.username,
        session.switch_reward_value,
        session.switch_reward_unit,
        'seeding-switch',
        session.id
      );

      // Update participant
      await SeedingParticipant.grantSwitchReward(participant.id, rewardMinutes);

      // Increment session rewards count
      await SeedingSession.incrementRewardsGranted(session.id);

      this.logger.info(`Granted switch reward to ${participant.username}: ${session.switch_reward_value} ${session.switch_reward_unit}`);

    } catch (error) {
      this.logger.error(`Error granting switch reward to ${participant.steam_id}:`, error.message);
    }
  }

  /**
   * Grant playtime reward to a participant
   */
  async grantPlaytimeReward(participant, session) {
    if (!session.hasPlaytimeReward()) return;
    if (participant.playtime_rewarded_at) return;

    try {
      const rewardMinutes = session.rewardToMinutes(
        session.playtime_reward_value,
        session.playtime_reward_unit
      );

      // Grant whitelist
      await this.grantWhitelistReward(
        participant.steam_id,
        participant.username,
        session.playtime_reward_value,
        session.playtime_reward_unit,
        'seeding-playtime',
        session.id
      );

      // Update participant
      await SeedingParticipant.grantPlaytimeReward(participant.id, rewardMinutes);

      // Increment session rewards count
      await SeedingSession.incrementRewardsGranted(session.id);

      // Send notification
      await this.sendPlayerNotification(
        session.target_server_id,
        participant.steam_id,
        this.buildPlaytimeRewardMessage(session, participant.total_reward_minutes + rewardMinutes)
      );

      this.logger.info(`Granted playtime reward to ${participant.username}: ${session.playtime_reward_value} ${session.playtime_reward_unit}`);

    } catch (error) {
      this.logger.error(`Error granting playtime reward to ${participant.steam_id}:`, error.message);
    }
  }

  /**
   * Distribute completion rewards to all eligible participants
   */
  async distributeCompletionRewards(session) {
    if (!session.hasCompletionReward()) return;

    try {
      const eligible = await SeedingParticipant.getEligibleForCompletionReward(session.id);

      const rewardMinutes = session.rewardToMinutes(
        session.completion_reward_value,
        session.completion_reward_unit
      );

      for (const participant of eligible) {
        try {
          // Grant whitelist
          await this.grantWhitelistReward(
            participant.steam_id,
            participant.username,
            session.completion_reward_value,
            session.completion_reward_unit,
            'seeding-completion',
            session.id
          );

          // Update participant
          await SeedingParticipant.grantCompletionReward(participant.id, rewardMinutes);

          // Increment session rewards count
          await SeedingSession.incrementRewardsGranted(session.id);

          // Send notification
          await this.sendPlayerNotification(
            session.target_server_id,
            participant.steam_id,
            this.buildCompletionRewardMessage(session, participant.total_reward_minutes + rewardMinutes)
          );

        } catch (error) {
          this.logger.error(`Error granting completion reward to ${participant.steam_id}:`, error.message);
        }
      }

      this.logger.info(`Distributed completion rewards to ${eligible.length} participants`);

    } catch (error) {
      this.logger.error('Error distributing completion rewards:', error.message);
    }
  }

  /**
   * Grant whitelist reward to a player
   */
  async grantWhitelistReward(steamId, username, value, unit, reason, sessionId) {
    await Whitelist.grantWhitelist({
      steamid64: steamId,
      username: username,
      reason: reason,
      duration_value: value,
      duration_type: unit,
      granted_by: 'seeding-system',
      metadata: {
        seeding_session_id: sessionId,
        granted_automatically: true
      }
    });
  }

  /**
   * Broadcast seeding call to source servers (only to full/busy servers, unless in test mode)
   * @param {Object} session - The seeding session
   * @param {string[]} sourceServerIds - Array of source server IDs
   * @param {boolean} isReminder - Whether this is a reminder broadcast
   * @param {boolean} bypassThreshold - Bypass the full server threshold (for test mode)
   */
  async broadcastSeedingCall(session, sourceServerIds, isReminder = false, bypassThreshold = false) {
    const totalRewardMinutes = session.getTotalPossibleRewardMinutes();
    const formattedReward = formatRewardDuration(totalRewardMinutes);
    const testModePrefix = (bypassThreshold || this.isTestMode) ? '[TEST] ' : '';
    const message = `${testModePrefix}[SEEDING] ${session.target_server_name} needs players! Switch now for up to ${formattedReward} whitelist reward!`;

    // In test mode or with bypass, broadcast to all specified servers
    // Otherwise, filter to only full/busy servers
    let serversTobroadcast;
    let skippedServers = [];

    if (bypassThreshold || this.isTestMode) {
      serversTobroadcast = sourceServerIds;
      this.logger.info(`TEST MODE: Broadcasting to all ${serversTobroadcast.length} source servers (threshold bypassed)`);
    } else {
      serversTobroadcast = sourceServerIds.filter(serverId => this.isServerFull(serverId));
      skippedServers = sourceServerIds.filter(serverId => !this.isServerFull(serverId));

      if (serversTobroadcast.length === 0) {
        this.logger.debug(`No servers above threshold (${this.config.minPlayersForBroadcast} players) for broadcast${isReminder ? ' reminder' : ''}`);
        return;
      }

      this.logger.info(`Broadcasting seeding call to ${serversTobroadcast.length} full servers${isReminder ? ' (reminder)' : ''}, skipping ${skippedServers.length} servers below threshold`);
    }

    for (const serverId of serversTobroadcast) {
      try {
        const playerCount = this.getServerPlayerCount(serverId);
        this.logger.debug(`Broadcasting to ${serverId} (${playerCount} players)`);
        await this.connectionManager.sendRCONBroadcast(serverId, message);
      } catch (error) {
        this.logger.error(`Error broadcasting to ${serverId}:`, error.message);
      }
    }
  }

  /**
   * Start periodic reminder broadcasts
   */
  startBroadcastReminders() {
    if (this.broadcastReminderInterval) {
      clearInterval(this.broadcastReminderInterval);
    }

    const intervalMs = this.config.broadcastReminderMinutes * 60 * 1000;
    this.logger.info(`Starting broadcast reminders every ${this.config.broadcastReminderMinutes} minutes`);

    this.broadcastReminderInterval = setInterval(async () => {
      if (!this.activeSession || this.activeSession.status !== 'active') {
        return;
      }

      try {
        await this.broadcastSeedingCall(
          this.activeSession,
          this.activeSession.source_server_ids,
          true // isReminder
        );
      } catch (error) {
        this.logger.error('Error sending broadcast reminder:', error.message);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic reminder broadcasts
   */
  stopBroadcastReminders() {
    if (this.broadcastReminderInterval) {
      clearInterval(this.broadcastReminderInterval);
      this.broadcastReminderInterval = null;
      this.logger.info('Stopped broadcast reminders');
    }
  }

  /**
   * Broadcast seeding closed to source servers
   */
  async broadcastSeedingClosed(session) {
    const message = `[SEEDING] Thanks! ${session.target_server_name} seeding complete. Session closed.`;

    for (const serverId of session.source_server_ids) {
      try {
        await this.connectionManager.sendRCONBroadcast(serverId, message);
      } catch (error) {
        this.logger.error(`Error broadcasting closure to ${serverId}:`, error.message);
      }
    }
  }

  /**
   * Broadcast seeding cancelled to source servers
   */
  async broadcastSeedingCancelled(session) {
    const message = `[SEEDING] ${session.target_server_name} seeding session has been cancelled.`;

    for (const serverId of session.source_server_ids) {
      try {
        await this.connectionManager.sendRCONBroadcast(serverId, message);
      } catch (error) {
        this.logger.error(`Error broadcasting cancellation to ${serverId}:`, error.message);
      }
    }
  }

  /**
   * Send notification to a specific player
   */
  async sendPlayerNotification(serverId, steamId, message) {
    try {
      await this.connectionManager.sendRCONWarn(serverId, steamId, message);
    } catch (error) {
      this.logger.error(`Error sending notification to ${steamId}:`, error.message);
    }
  }

  // ============ Message Builders ============

  buildSeederEnrollmentMessage() {
    const session = this.activeSession;
    if (!session) return '[SEEDING] Session started!';

    const parts = ['[SEEDING] Seeding session started!'];

    if (session.hasPlaytimeReward()) {
      parts.push(`Stay ${session.playtime_threshold_minutes}min for +${session.playtime_reward_value}${session.playtime_reward_unit.charAt(0)} whitelist.`);
    }

    if (session.hasCompletionReward()) {
      parts.push(`Be here at ${session.player_threshold} players for +${session.completion_reward_value}${session.completion_reward_unit.charAt(0)} more!`);
    }

    return parts.join(' ');
  }

  buildSwitchConfirmationMessage(session) {
    const parts = [];

    if (session.hasSwitchReward()) {
      parts.push(`[SEEDING] +${session.switch_reward_value}${session.switch_reward_unit.charAt(0)} whitelist unlocked!`);
    } else {
      parts.push('[SEEDING] You\'ve been counted!');
    }

    if (session.hasPlaytimeReward()) {
      parts.push(`Stay ${session.playtime_threshold_minutes}min for +${session.playtime_reward_value}${session.playtime_reward_unit.charAt(0)} bonus.`);
    }

    if (session.hasCompletionReward()) {
      parts.push(`Be here at ${session.player_threshold} players for +${session.completion_reward_value}${session.completion_reward_unit.charAt(0)} more!`);
    }

    return parts.join(' ');
  }

  buildPlaytimeRewardMessage(session, totalMinutes) {
    const formattedTotal = formatRewardDuration(totalMinutes);
    return `[SEEDING] Playtime bonus unlocked! +${session.playtime_reward_value}${session.playtime_reward_unit.charAt(0)} whitelist added. Total earned: ${formattedTotal}`;
  }

  buildCompletionRewardMessage(session, totalMinutes) {
    const formattedTotal = formatRewardDuration(totalMinutes);
    return `[SEEDING] Seeding complete! +${session.completion_reward_value}${session.completion_reward_unit.charAt(0)} completion bonus! Your total reward: ${formattedTotal} whitelist`;
  }

  /**
   * Log audit action
   */
  async logAuditAction(actionType, actorId, sessionId, details) {
    try {
      await AuditLog.logAction({
        actionType,
        actorType: actorId === 'system' ? 'system' : 'discord_user',
        actorId: actorId === 'system' ? null : actorId,
        targetType: 'seeding_session',
        targetId: String(sessionId),
        description: `Seeding session action: ${actionType}`,
        metadata: details
      });
    } catch (error) {
      this.logger.error('Error logging audit action:', error.message);
    }
  }

  /**
   * Get the current active session
   */
  getActiveSession() {
    return this.activeSession;
  }

  /**
   * Get available servers for seeding
   */
  getAvailableServers() {
    const servers = [];
    const connections = this.connectionManager.getConnections();

    for (const [serverId, connectionData] of connections) {
      const { server, socket } = connectionData;
      const playerCount = this.getServerPlayerCount(serverId);
      servers.push({
        id: serverId,
        name: server.name,
        connected: socket && socket.connected,
        playerCount,
        isFull: playerCount >= this.config.minPlayersForBroadcast,
        maxPlayers: this.config.maxPlayersPerServer
      });
    }

    return servers;
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    this.logger.info('Shutting down SeedingSessionService...');

    // Stop broadcast reminders
    this.stopBroadcastReminders();

    // Stop playtime accumulation
    if (this.playtimeUpdateInterval) {
      clearInterval(this.playtimeUpdateInterval);
      this.playtimeUpdateInterval = null;
    }

    // Unsubscribe from events
    this.playtimeTrackingService.off('playerJoined', this._boundHandlers.onPlayerJoined);
    this.playtimeTrackingService.off('playerLeft', this._boundHandlers.onPlayerLeft);
    this.playtimeTrackingService.off('playerCountUpdate', this._boundHandlers.onPlayerCountUpdate);

    // Clear state
    this.activeSession = null;
    this.potentialSwitchers.clear();
    this.playtimeTracking.clear();
    this.serverPlayerCounts.clear();

    this.logger.info('SeedingSessionService shutdown complete');
  }
}

module.exports = SeedingSessionService;
