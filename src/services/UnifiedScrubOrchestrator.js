const MemberScrubService = require('./MemberScrubService');
const StaffScrubService = require('./StaffScrubService');
const BattleMetricsScrubService = require('./BattleMetricsScrubService');
const { AuditLog } = require('../database/models');
const { createServiceLogger } = require('../utils/logger');
const crypto = require('crypto');

/**
 * UnifiedScrubOrchestrator
 * Coordinates all scrubbing operations (members, staff, BattleMetrics) in a unified workflow
 */
class UnifiedScrubOrchestrator {
  constructor(discordClient) {
    this.client = discordClient;
    this.memberScrub = new MemberScrubService(discordClient);
    this.staffScrub = new StaffScrubService(discordClient);
    this.bmScrub = new BattleMetricsScrubService(discordClient);
    this.logger = createServiceLogger('UnifiedScrubOrchestrator');
    this.pendingApprovals = new Map(); // approvalId => preview data
    this.APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredPreviews();
    }, 60 * 60 * 1000);
  }

  /**
   * Generate cryptographically secure approval ID
   * @returns {string} Approval ID
   */
  _generateApprovalId() {
    return `scrub_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate comprehensive scrub preview
   * @param {string} guildId - Discord guild ID
   * @param {Object} requestedBy - Admin who requested {userId, username}
   * @returns {Promise<Object>} Unified preview report with approval ID
   */
  async generatePreview(guildId, requestedBy) {
    try {
      this.logger.info(`Generating scrub preview for guild ${guildId}`, {
        requestedBy: requestedBy?.userId
      });

      const startTime = new Date();

      // Run all three preview reports in parallel for efficiency
      const [memberReport, staffReport, bmReport] = await Promise.all([
        this.memberScrub.generateMemberScrubReport(guildId),
        this.staffScrub.generateStaffScrubReport(guildId),
        this.bmScrub.generateFlagRemovalReport(guildId)
      ]);

      const endTime = new Date();

      // Generate unique approval ID
      const approvalId = this._generateApprovalId();

      // Create unified preview
      const preview = {
        approvalId,
        guildId,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.APPROVAL_EXPIRY_MS).toISOString(),
        requestedBy,
        generationDurationMs: endTime - startTime,
        summary: {
          totalToRemove: memberReport.summary.toRemove + staffReport.summary.toRemove,
          members: memberReport.summary.toRemove,
          staff: staffReport.summary.toRemove,
          battleMetrics: bmReport.summary.toRemove
        },
        memberReport,
        staffReport,
        bmReport,
        createdAt: Date.now() // For expiry check
      };

      // Store in memory with expiry
      this.pendingApprovals.set(approvalId, preview);

      // Log preview generation to AuditLog
      await AuditLog.logAction({
        actionType: 'SCRUB_PREVIEW',
        actorType: 'user',
        actorId: requestedBy?.userId || 'SYSTEM',
        actorName: requestedBy?.username || 'System',
        targetType: 'guild',
        targetId: guildId,
        targetName: 'Guild',
        guildId,
        description: `Generated scrub preview`,
        metadata: {
          approvalId,
          summary: preview.summary,
          expiresAt: preview.expiresAt
        },
        success: true,
        severity: 'info',
        duration: preview.generationDurationMs
      });

      this.logger.info(`Scrub preview generated successfully`, {
        approvalId,
        summary: preview.summary,
        durationMs: preview.generationDurationMs
      });

      return preview;
    } catch (error) {
      this.logger.error('Error generating scrub preview:', error);
      throw error;
    }
  }

  /**
   * Execute approved scrub operation
   * @param {string} approvalId - Approval ID from preview
   * @param {Object} executedBy - Admin executing {userId, username}
   * @returns {Promise<Object>} Execution results
   */
  async executeScrub(approvalId, executedBy) {
    try {
      this.logger.info(`Executing scrub operation`, {
        approvalId,
        executedBy: executedBy?.userId
      });

      const startTime = new Date();

      // Validate approval ID
      const preview = this.pendingApprovals.get(approvalId);

      if (!preview) {
        throw new Error(`Invalid or expired approval ID: ${approvalId}`);
      }

      // Check if expired
      const now = Date.now();
      if (now - preview.createdAt > this.APPROVAL_EXPIRY_MS) {
        // Clean up expired approval
        this.pendingApprovals.delete(approvalId);
        throw new Error(`Approval ID has expired (older than 24 hours)`);
      }

      const { guildId, memberReport, staffReport, bmReport } = preview;

      this.logger.info(`Executing scrub for guild ${guildId}`, {
        members: memberReport.summary.toRemove,
        staff: staffReport.summary.toRemove,
        battleMetrics: bmReport.summary.toRemove
      });

      // Execute operations in safe order:
      // 1. Staff (archive + remove roles)
      // 2. Members (remove roles)
      // 3. BattleMetrics (remove flags)

      const results = {
        approvalId,
        guildId,
        executedBy,
        startTime,
        staff: { successful: [], failed: [], archived: [] },
        members: { successful: [], failed: [] },
        battleMetrics: { successful: [], failed: [] },
        errors: []
      };

      // STEP 1: Execute staff scrub
      try {
        if (staffReport.toRemove.length > 0) {
          this.logger.info(`Executing staff scrub for ${staffReport.toRemove.length} users`);

          const staffUserIds = staffReport.toRemove.map(s => s.userId);

          const staffResults = await this.staffScrub.executeStaffScrub(staffUserIds, {
            approvalId,
            executedBy,
            guildId,
            staffData: staffReport.toRemove
          });

          results.staff = staffResults;

          this.logger.info(`Staff scrub complete: ${staffResults.successful.length} successful, ${staffResults.failed.length} failed`);
        } else {
          this.logger.info('No staff to scrub, skipping staff scrub');
        }
      } catch (staffError) {
        this.logger.error('Staff scrub failed:', staffError);
        results.errors.push({
          phase: 'staff',
          error: staffError.message
        });
        // Continue with other phases even if staff scrub fails
      }

      // STEP 2: Execute member scrub
      try {
        if (memberReport.toRemove.length > 0) {
          this.logger.info(`Executing member scrub for ${memberReport.toRemove.length} users`);

          const memberUserIds = memberReport.toRemove.map(m => m.userId);

          const memberResults = await this.memberScrub.executeMemberScrub(memberUserIds, {
            approvalId,
            executedBy,
            guildId
          });

          results.members = memberResults;

          this.logger.info(`Member scrub complete: ${memberResults.successful.length} successful, ${memberResults.failed.length} failed`);
        } else {
          this.logger.info('No members to scrub, skipping member scrub');
        }
      } catch (memberError) {
        this.logger.error('Member scrub failed:', memberError);
        results.errors.push({
          phase: 'members',
          error: memberError.message
        });
        // Continue with BattleMetrics phase
      }

      // STEP 3: Execute BattleMetrics flag removal
      try {
        if (bmReport.toRemove.length > 0) {
          this.logger.info(`Executing BattleMetrics flag removal for ${bmReport.toRemove.length} players`);

          const bmResults = await this.bmScrub.removeMemberFlagBulk(bmReport.toRemove, {
            approvalId,
            executedBy
          });

          results.battleMetrics = bmResults;

          this.logger.info(`BattleMetrics flag removal complete: ${bmResults.successful.length} successful, ${bmResults.failed.length} failed`);
        } else {
          this.logger.info('No BattleMetrics flags to remove, skipping BM scrub');
        }
      } catch (bmError) {
        this.logger.error('BattleMetrics scrub failed:', bmError);
        results.errors.push({
          phase: 'battleMetrics',
          error: bmError.message
        });
      }

      results.endTime = new Date();
      results.durationMs = results.endTime - results.startTime;

      // Calculate overall stats
      const totalSuccessful =
        (results.staff.successful?.length || 0) +
        (results.members.successful?.length || 0) +
        (results.battleMetrics.successful?.length || 0);

      const totalFailed =
        (results.staff.failed?.length || 0) +
        (results.members.failed?.length || 0) +
        (results.battleMetrics.failed?.length || 0);

      // Log execution to AuditLog
      await AuditLog.logAction({
        actionType: 'SCRUB_EXECUTED',
        actorType: 'user',
        actorId: executedBy?.userId || 'SYSTEM',
        actorName: executedBy?.username || 'System',
        targetType: 'guild',
        targetId: guildId,
        targetName: 'Guild',
        guildId,
        description: `Executed scrub operation`,
        metadata: {
          approvalId,
          totalSuccessful,
          totalFailed,
          staff: {
            successful: results.staff.successful?.length || 0,
            failed: results.staff.failed?.length || 0,
            archived: results.staff.archived?.length || 0
          },
          members: {
            successful: results.members.successful?.length || 0,
            failed: results.members.failed?.length || 0
          },
          battleMetrics: {
            successful: results.battleMetrics.successful?.length || 0,
            failed: results.battleMetrics.failed?.length || 0
          },
          errors: results.errors
        },
        success: results.errors.length === 0,
        severity: results.errors.length > 0 ? 'warning' : 'info',
        duration: results.durationMs
      });

      // Clean up approval from memory
      this.pendingApprovals.delete(approvalId);

      this.logger.info(`Scrub execution complete`, {
        approvalId,
        totalSuccessful,
        totalFailed,
        durationSec: Math.round(results.durationMs / 1000)
      });

      return results;
    } catch (error) {
      this.logger.error('Error executing scrub operation:', error);
      throw error;
    }
  }

  /**
   * Get preview by approval ID
   * @param {string} approvalId - Approval ID
   * @returns {Object|null} Preview data or null
   */
  getPreview(approvalId) {
    const preview = this.pendingApprovals.get(approvalId);

    if (!preview) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - preview.createdAt > this.APPROVAL_EXPIRY_MS) {
      // Clean up expired approval
      this.pendingApprovals.delete(approvalId);
      return null;
    }

    return preview;
  }

  /**
   * Clean up expired previews (24hr old)
   */
  cleanupExpiredPreviews() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, data] of this.pendingApprovals.entries()) {
      if (now - data.createdAt > this.APPROVAL_EXPIRY_MS) {
        this.pendingApprovals.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} expired preview approvals`);
    }
  }

  /**
   * Get pending approval count
   * @returns {number} Count of pending approvals
   */
  getPendingApprovalCount() {
    return this.pendingApprovals.size;
  }

  /**
   * Send execution summary to admin channel
   * @param {Object} results - Execution results
   * @param {string} guildId - Guild ID
   * @param {string} channelId - Admin channel ID
   * @returns {Promise<boolean>} Success status
   */
  async sendCompletionNotification(results, guildId, channelId) {
    try {
      this.logger.info(`Sending scrub completion notification to channel ${channelId}`);

      const guild = await this.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        this.logger.warn(`Channel ${channelId} not found or not text-based`);
        return false;
      }

      const totalSuccessful =
        (results.staff.successful?.length || 0) +
        (results.members.successful?.length || 0) +
        (results.battleMetrics.successful?.length || 0);

      const totalFailed =
        (results.staff.failed?.length || 0) +
        (results.members.failed?.length || 0) +
        (results.battleMetrics.failed?.length || 0);

      const embed = {
        title: 'Scrub Operation Complete',
        description: `Member and staff scrubbing operation has completed.`,
        color: results.errors.length > 0 ? 0xFF9900 : 0x00FF00, // Orange if errors, green if success
        fields: [
          {
            name: 'Summary',
            value: `**Total Successful:** ${totalSuccessful}\n**Total Failed:** ${totalFailed}\n**Duration:** ${Math.round(results.durationMs / 1000)}s`,
            inline: false
          },
          {
            name: 'Staff',
            value: `Removed: ${results.staff.successful?.length || 0}\nFailed: ${results.staff.failed?.length || 0}\nArchived: ${results.staff.archived?.length || 0}`,
            inline: true
          },
          {
            name: 'Members',
            value: `Removed: ${results.members.successful?.length || 0}\nFailed: ${results.members.failed?.length || 0}`,
            inline: true
          },
          {
            name: 'BattleMetrics',
            value: `Flags Removed: ${results.battleMetrics.successful?.length || 0}\nFailed: ${results.battleMetrics.failed?.length || 0}`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Approval ID: ${results.approvalId} | Executed by: ${results.executedBy?.username || 'System'}`
        }
      };

      // Add errors field if there are any
      if (results.errors.length > 0) {
        const errorText = results.errors.map(e => `**${e.phase}:** ${e.error}`).join('\n');
        embed.fields.push({
          name: 'Errors',
          value: errorText.substring(0, 1024), // Discord field limit
          inline: false
        });
      }

      await channel.send({ embeds: [embed] });

      this.logger.info('Scrub completion notification sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to send completion notification:', error);
      return false;
    }
  }

  /**
   * Clean up resources (stop cleanup interval)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

module.exports = UnifiedScrubOrchestrator;
