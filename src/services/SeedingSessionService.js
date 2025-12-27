const { createServiceLogger } = require('../utils/logger');
const { SeedingSession, SeedingParticipant, Whitelist, AuditLog } = require('../database/models');

/**
 * Format a duration in minutes to a human-readable string
 * Uses the most appropriate unit (days, months)
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration string (e.g., "2d", "1mo")
 */
function formatRewardDuration(minutes) {
  const days = minutes / (60 * 24);
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

    // Potential switchers: Map<steamId, { serverId, joinTime, participantId }>
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

      // Sync participants with current players on target server
      // This catches any players who joined during bot downtime
      await this.syncParticipantsWithServer(activeSession.id, activeSession.target_server_id);

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
      sourceServerIds: manualSourceServerIds,
      customBroadcastMessage
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
      customBroadcastMessage,
      metadata: testMode ? { testMode: true } : null
    });

    // Cache the active session
    this.activeSession = session;

    // Enroll existing players on target as seeders
    await this.enrollExistingPlayers(session.id, targetServerId);

    // Enroll existing players on source servers as potential switchers (for tracking broadcast recipients)
    // In test mode, enroll from all source servers; otherwise only from full servers
    await this.enrollExistingSourcePlayers(session.id, sourceServerIds, !testMode);

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
   * Enroll existing players on source servers as potential switchers
   * This tracks players who receive broadcast messages for accurate metrics
   * @param {number} sessionId - Session ID
   * @param {string[]} sourceServerIds - Array of source server IDs to enroll from
   * @param {boolean} fullServersOnly - Only enroll from servers above broadcast threshold
   * @returns {Promise<number>} Number of players enrolled
   */
  async enrollExistingSourcePlayers(sessionId, sourceServerIds, fullServersOnly = true) {
    const activeSessions = this.playtimeTrackingService.getActiveSessions();

    // Filter to only full servers if requested
    const serversToEnroll = fullServersOnly
      ? sourceServerIds.filter(serverId => this.isServerFull(serverId))
      : sourceServerIds;

    if (serversToEnroll.length === 0) {
      this.logger.debug('No source servers above threshold for enrollment');
      return 0;
    }

    let enrolledCount = 0;

    for (const [sessionKey, sessionData] of activeSessions) {
      const [serverId, steamId] = sessionKey.split(':');

      // Skip if not a source server we're enrolling from
      if (!serversToEnroll.includes(serverId)) continue;

      try {
        // Check if already a participant
        const existing = await SeedingParticipant.findBySessionAndSteamId(sessionId, steamId);
        if (existing) continue;

        // Create potential switcher participant
        await SeedingParticipant.createPotentialSwitcher({
          sessionId,
          playerId: sessionData.playerId,
          steamId,
          username: sessionData.username,
          sourceServerId: serverId
        });

        enrolledCount++;

        // Track in memory for switch detection
        this.potentialSwitchers.set(steamId, {
          serverId,
          joinTime: new Date(),
          participantId: null // Will be set if needed
        });

      } catch (error) {
        this.logger.error(`Error enrolling source player ${steamId}:`, error.message);
      }
    }

    if (enrolledCount > 0) {
      // Update participant count
      const currentCount = await SeedingParticipant.count({ where: { session_id: sessionId } });
      await SeedingSession.update(
        { participants_count: currentCount },
        { where: { id: sessionId } }
      );

      this.logger.info(`Enrolled ${enrolledCount} existing players from ${serversToEnroll.length} source servers as potential switchers`);
    }

    return enrolledCount;
  }

  /**
   * Sync participants with current players on server
   * Used during session recovery to catch players who joined during bot downtime
   */
  async syncParticipantsWithServer(sessionId, targetServerId) {
    const activeSessions = this.playtimeTrackingService.getActiveSessions();

    // Get current steam IDs on target server
    const currentSteamIds = [];
    for (const [sessionKey] of activeSessions) {
      const [serverId, steamId] = sessionKey.split(':');
      if (serverId === targetServerId) {
        currentSteamIds.push(steamId);
      }
    }

    if (currentSteamIds.length === 0) {
      this.logger.info('No players on target server to sync');
      return;
    }

    // Update is_on_target for all matching participants
    await SeedingParticipant.updateOnTargetStatus(sessionId, currentSteamIds);

    // Check for players on server who aren't enrolled as participants
    let newEnrollments = 0;
    for (const [sessionKey, sessionData] of activeSessions) {
      const [serverId, steamId] = sessionKey.split(':');
      if (serverId !== targetServerId) continue;

      // Check if already a participant
      const existing = await SeedingParticipant.findBySessionAndSteamId(sessionId, steamId);
      if (existing) continue;

      // Enroll as seeder
      try {
        await SeedingParticipant.createSeeder({
          sessionId,
          playerId: sessionData.playerId,
          steamId,
          username: sessionData.username
        });
        newEnrollments++;
        this.logger.info(`Late enrollment during recovery: ${sessionData.username} (${steamId})`);
      } catch (error) {
        this.logger.error(`Error enrolling ${steamId} during recovery:`, error.message);
      }
    }

    if (newEnrollments > 0) {
      // Update participant count
      const count = await SeedingParticipant.count({ where: { session_id: sessionId } });
      await SeedingSession.updateParticipantCount(sessionId, count);
      this.logger.info(`Recovery sync: enrolled ${newEnrollments} new participants, updated ${currentSteamIds.length} on-target statuses`);
    } else {
      this.logger.info(`Recovery sync: updated ${currentSteamIds.length} on-target statuses, no new enrollments needed`);
    }
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
      // Check if this is a source server (only in test mode with explicit source servers)
      else if (session.source_server_ids && session.source_server_ids.includes(serverId)) {
        await this.handlePlayerJoinedSource(serverId, steamId, username, playerId);
      }
    } catch (error) {
      this.logger.error(`Error handling playerJoined for ${steamId}:`, error.message || error);
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

      // If leaving source server, update source_leave_time (only in test mode with explicit source servers)
      if (session.source_server_ids && session.source_server_ids.includes(serverId)) {
        const participant = await SeedingParticipant.findBySessionAndSteamId(session.id, steamId);
        if (participant && participant.status === 'on_source') {
          await SeedingParticipant.update(
            { source_leave_time: new Date() },
            { where: { id: participant.id } }
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error handling playerLeft for ${steamId}:`, error.message || error);
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
      this.logger.error('Error handling playerCountUpdate:', error.message);
    }
  }

  /**
   * Get current player count for a server
   * Falls back to PlaytimeTrackingService stats if no cached count
   */
  getServerPlayerCount(serverId) {
    const data = this.serverPlayerCounts.get(serverId);
    if (data && data.playerCount > 0) {
      return data.playerCount;
    }

    // Fallback to PlaytimeTrackingService stats (count of active sessions)
    if (this.playtimeTrackingService) {
      const stats = this.playtimeTrackingService.getStats();
      if (stats.sessionsByServer && stats.sessionsByServer[serverId] !== undefined) {
        return stats.sessionsByServer[serverId];
      }
    }

    return 0;
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
      targetServerName: session.target_server_name,
      playerThreshold: session.player_threshold,
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
      reason,
      targetServerName: session.target_server_name,
      playerThreshold: session.player_threshold
    });

    this.logger.info(`Seeding session ${sessionId} cancelled: ${reason}`);

    return session;
  }

  /**
   * Get a preview of what will happen when closing a session
   * Used for confirmation dialogs
   * @param {number} sessionId - Session ID
   * @returns {Promise<Object>} Preview data
   */
  async getClosePreview(sessionId) {
    const session = await SeedingSession.findByPk(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get eligible participants for completion reward
    const eligible = session.hasCompletionReward()
      ? await SeedingParticipant.getEligibleForCompletionReward(sessionId)
      : [];

    // Calculate total reward in days
    const completionRewardDays = session.hasCompletionReward()
      ? session.rewardToMinutes(session.completion_reward_value, session.completion_reward_unit) / (60 * 24)
      : 0;

    const totalWhitelistDays = eligible.length * completionRewardDays;

    return {
      sessionId,
      participantsToReward: eligible.length,
      completionRewardDays,
      totalWhitelistDaysToGrant: totalWhitelistDays,
      sessionConfig: {
        completionReward: session.hasCompletionReward()
          ? `${session.completion_reward_value} ${session.completion_reward_unit}`
          : null
      }
    };
  }

  /**
   * Reverse all rewards for a completed/cancelled session
   * @param {number} sessionId - Session ID
   * @param {string} reversedBy - Discord ID of admin reversing
   * @param {string} reason - Reason for reversal
   * @returns {Promise<Object>} Result with counts
   */
  async reverseSessionRewards(sessionId, reversedBy, reason = 'Manual reversal') {
    const session = await SeedingSession.findByPk(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'active') {
      throw new Error('Cannot reverse rewards for an active session');
    }

    // Revoke all whitelist entries for this session
    const revokedCount = await Whitelist.revokeSeedingRewards(sessionId, reversedBy, reason);

    // Clear participant reward timestamps
    const participantsUpdated = await SeedingParticipant.clearRewardsForSession(sessionId);

    // Reset session rewards count
    await SeedingSession.update(
      { rewards_granted_count: 0 },
      { where: { id: sessionId } }
    );

    // Log audit
    await this.logAuditAction('seeding_rewards_reversed', reversedBy, sessionId, {
      reason,
      targetServerName: session.target_server_name,
      playerThreshold: session.player_threshold,
      revokedCount,
      participantsUpdated
    });

    this.logger.info(`Reversed ${revokedCount} rewards for session ${sessionId}: ${reason}`);

    return {
      revokedCount,
      participantsAffected: participantsUpdated,
      message: `Revoked ${revokedCount} whitelist entries, cleared rewards for ${participantsUpdated} participants`
    };
  }

  /**
   * Revoke rewards for a specific participant
   * @param {number} sessionId - Session ID
   * @param {number} participantId - Participant ID
   * @param {string} revokedBy - Discord ID of admin revoking
   * @param {string} reason - Reason for revocation
   * @returns {Promise<Object>} Result with details
   */
  async revokeParticipantRewards(sessionId, participantId, revokedBy, reason = 'Manual revocation') {
    const participant = await SeedingParticipant.findByPk(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    if (participant.session_id !== sessionId) {
      throw new Error('Participant does not belong to this session');
    }

    // Fetch session for audit logging
    const session = await SeedingSession.findByPk(sessionId);

    // Revoke whitelist entries for this participant
    const revokedCount = await Whitelist.revokeSeedingRewardsForParticipant(
      sessionId,
      participant.steam_id,
      revokedBy,
      reason
    );

    // Clear participant reward timestamps
    const { rewardsCleared } = await SeedingParticipant.clearParticipantRewards(participantId);

    // Decrement session rewards count
    const rewardsClearedCount = Object.values(rewardsCleared).filter(Boolean).length;
    if (rewardsClearedCount > 0) {
      await SeedingSession.decrement('rewards_granted_count', {
        by: rewardsClearedCount,
        where: { id: sessionId }
      });
    }

    // Log audit
    await this.logAuditAction('seeding_participant_rewards_revoked', revokedBy, sessionId, {
      participantId,
      steamId: participant.steam_id,
      username: participant.username,
      reason,
      targetServerName: session?.target_server_name,
      revokedCount,
      rewardsCleared
    });

    this.logger.info(`Revoked ${revokedCount} rewards for participant ${participantId} in session ${sessionId}`);

    return {
      revokedCount,
      rewardsCleared,
      message: `Revoked ${revokedCount} whitelist entries for ${participant.username || participant.steam_id}`
    };
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

    // Extract server number from server ID (e.g., "server1" -> "1")
    const serverNumber = session.target_server_id.replace(/\D/g, '') || session.target_server_id;

    // Use custom message if provided, otherwise use default
    let message;
    if (session.custom_broadcast_message) {
      // Replace placeholders in custom message
      message = session.custom_broadcast_message
        .replace(/\{server\}/g, serverNumber)
        .replace(/\{reward\}/g, formattedReward);
      message = `${testModePrefix}${message}`;
    } else {
      message = `${testModePrefix}[SEEDING] ${session.target_server_name} needs players! Switch now for up to ${formattedReward} whitelist reward!`;
    }

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

    // Enroll any players on servers that are now receiving broadcasts
    // This catches servers that crossed the threshold since the session started or last broadcast
    if (serversTobroadcast.length > 0) {
      const enrolledCount = await this.enrollExistingSourcePlayers(
        session.id,
        serversTobroadcast,
        false // Don't filter again, we already know these servers are above threshold
      );
      if (enrolledCount > 0) {
        this.logger.info(`Enrolled ${enrolledCount} new broadcast recipients from servers crossing threshold`);
      }
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
      // Build a descriptive message based on action type and details
      let description = this.buildAuditDescription(actionType, details);

      // Use server name as target for display, with session ID in metadata
      const targetName = details.targetServerName || details.serverName || `Session #${sessionId}`;

      await AuditLog.logAction({
        actionType,
        actorType: actorId === 'system' ? 'system' : 'discord_user',
        actorId: actorId === 'system' ? 'SEEDING SYSTEM' : actorId,
        targetType: 'seeding_session',
        targetId: targetName,
        description,
        metadata: { ...details, sessionId }
      });
    } catch (error) {
      this.logger.error('Error logging audit action:', error.message);
    }
  }

  /**
   * Build descriptive audit log message
   */
  buildAuditDescription(actionType, details) {
    const serverName = details.targetServerName || details.serverName || 'Unknown Server';
    const threshold = details.playerThreshold;

    switch (actionType) {
    case 'seeding_session_started':
      return `Seeding session started for ${serverName} (target: ${threshold} players)`;
    case 'seeding_session_closed':
      return `Seeding session closed for ${serverName}: ${details.reason || 'Completed'}`;
    case 'seeding_session_cancelled':
      return `Seeding session cancelled for ${serverName}: ${details.reason || 'No reason provided'}`;
    case 'seeding_rewards_reversed':
      return `Seeding rewards reversed for ${serverName}: ${details.reason || 'No reason provided'}`;
    case 'seeding_participant_rewards_revoked': {
      const playerName = details.username || details.steamId || 'Unknown';
      return `Participant rewards revoked (${playerName}) for ${serverName} session: ${details.reason || 'No reason provided'}`;
    }
    default:
      return `Seeding session action: ${actionType}`;
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
   * Fetches current player counts from PlaytimeTrackingService (which may query sockets)
   */
  async getAvailableServers() {
    const servers = [];
    const connections = this.connectionManager.getConnections();

    for (const [serverId, connectionData] of connections) {
      const { server, socket } = connectionData;

      // Try to get player count from PlaytimeTrackingService (most accurate)
      let playerCount = 0;
      if (this.playtimeTrackingService) {
        try {
          playerCount = await this.playtimeTrackingService.getServerPlayerCount(serverId);
        } catch (error) {
          // Fallback to cached count
          playerCount = this.getServerPlayerCount(serverId);
        }
      } else {
        playerCount = this.getServerPlayerCount(serverId);
      }

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
