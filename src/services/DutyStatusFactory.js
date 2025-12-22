const { ON_DUTY_ROLE_ID, TUTOR_ON_DUTY_ROLE_ID } = require('../../config/discord');
const { sendDutyNotification } = require('../utils/dutyNotifications');
const { DutyStatusChange } = require('../database/models');
const notificationService = require('./NotificationService');
const { console: loggerConsole } = require('../utils/logger');
const { getDutySessionService } = require('./DutySessionService');

class DutyStatusFactory {
  constructor() {
    this.onDutyRoleId = ON_DUTY_ROLE_ID;
    this.tutorOnDutyRoleId = TUTOR_ON_DUTY_ROLE_ID;
    this.roleChangeHandler = null; // Will be set by the handler
    this.dutySessionService = null; // Will be initialized lazily
  }

  getDutySessionService() {
    if (!this.dutySessionService) {
      this.dutySessionService = getDutySessionService();
    }
    return this.dutySessionService;
  }
    
  setRoleChangeHandler(handler) {
    this.roleChangeHandler = handler;
  }

  async setOnDuty(interaction, options = {}) {
    return await this._handleDutyStatusChange(interaction, true, {
      source: 'command',
      reason: 'User activated duty status',
      ...options
    });
  }

  async setOffDuty(interaction, options = {}) {
    return await this._handleDutyStatusChange(interaction, false, {
      source: 'command',
      reason: 'User deactivated duty status',
      ...options
    });
  }

  async setTutorOnDuty(interaction, options = {}) {
    return await this._handleDutyStatusChange(interaction, true, {
      source: 'command',
      reason: 'User activated tutor duty status',
      dutyType: 'tutor',
      ...options
    });
  }

  async setTutorOffDuty(interaction, options = {}) {
    return await this._handleDutyStatusChange(interaction, false, {
      source: 'command',
      reason: 'User deactivated tutor duty status',
      dutyType: 'tutor',
      ...options
    });
  }

  async removeInactiveDuty(member, options = {}) {
    return await this._handleDutyStatusChange(null, false, {
      source: 'automatic',
      reason: 'Inactive user duty removal',
      member,
      skipNotification: options.skipNotification || false,
      ...options
    });
  }

  /**
   * End duty via button click (from timeout warning)
   * Called by DutySessionService.endSessionWithRole
   */
  async endDutyViaButton(member, options = {}) {
    return await this._handleDutyStatusChange(null, false, {
      source: 'button',
      reason: 'Session ended via timeout warning button',
      member,
      ...options
    });
  }

  /**
   * End duty via auto-timeout
   * Called by DutySessionService.autoEndSession
   */
  async endDutyViaTimeout(member, options = {}) {
    const durationMinutes = options.durationMinutes || 0;
    return await this._handleDutyStatusChange(null, false, {
      source: 'auto_timeout',
      reason: `Session auto-ended after ${durationMinutes} minutes due to timeout`,
      member,
      ...options
    });
  }

  async _handleDutyStatusChange(interaction, isOnDuty, options = {}) {
    const result = {
      success: false,
      error: null,
      warning: null,
      data: {
        wasOnDuty: false,
        isOnDuty: isOnDuty,
        roleChanged: false,
        notificationSent: false,
        dbRecordCreated: false
      }
    };

    try {
      const member = options.member || interaction.member;
      const guild = member.guild;
      const dutyType = options.dutyType || 'admin'; // Default to admin duty
            
      // Get the appropriate on-duty role based on duty type
      const roleId = dutyType === 'tutor' ? this.tutorOnDutyRoleId : this.onDutyRoleId;
      const onDutyRole = guild.roles.cache.get(roleId);
      if (!onDutyRole) {
        result.error = `The ${dutyType} on-duty role could not be found. Please contact a server administrator.`;
        return result;
      }

      // Check current Discord role status (this is the source of truth)
      const currentlyOnDuty = member.roles.cache.has(roleId);
      result.data.wasOnDuty = currentlyOnDuty;

      // Sources that bypass role validation (role already changed elsewhere)
      const skipRoleValidation = ['external', 'button', 'auto_timeout'].includes(options.source);

      // Only validate state change for command-based changes
      // For external/button/auto_timeout changes, we're just logging what already happened
      if (!skipRoleValidation && currentlyOnDuty === isOnDuty) {
        result.error = isOnDuty
          ? 'User is already on duty'
          : 'User is not currently on duty';
        return result;
      }

      // Permission checks (only for bot-initiated changes via interaction)
      if (interaction) {
        const permissionCheck = await this._validatePermissions(guild, onDutyRole);
        if (!permissionCheck.success) {
          result.error = permissionCheck.error;
          return result;
        }
      }

      // Handle role change (skip for sources where role already changed)
      if (!skipRoleValidation) {
        // Notify role change handler that we're about to make a change
        if (this.roleChangeHandler) {
          this.roleChangeHandler.addToProcessingSet(member.user.id);
        }

        const roleResult = await this._handleRoleChange(member, onDutyRole, isOnDuty);
        if (!roleResult.success) {
          result.error = roleResult.error;
          return result;
        }
        result.data.roleChanged = true;
      } else {
        result.data.roleChanged = false; // Role was changed externally or by session service
        if (options.source === 'external') {
          loggerConsole.log('📝 External role change detected - logging the change');
        } else {
          loggerConsole.log(`📝 ${options.source} duty ending - logging the change`);
        }
      }

      // Send notification (unless explicitly skipped)
      if (!options.skipNotification) {
        const notificationResult = await this._handleNotification(interaction, member, isOnDuty, dutyType);
        result.data.notificationSent = notificationResult.success;
        if (!notificationResult.success && notificationResult.warning) {
          result.warning = notificationResult.warning;
        }
      }

      // Log to database
      const dbResult = await this._logStatusChange(member, isOnDuty, options);
      result.data.dbRecordCreated = dbResult.success;
      if (!dbResult.success) {
        loggerConsole.warn('Failed to log duty status change to database:', dbResult.error);
      }

      result.success = true;
      return result;

    } catch (error) {
      loggerConsole.error('Error in duty status change:', error);
      result.error = this._getErrorMessage(error);
      return result;
    }
  }

  async _validatePermissions(guild, onDutyRole) {
    try {
      const botMember = guild.members.cache.get(guild.client.user.id);
            
      if (!botMember.permissions.has('ManageRoles')) {
        return {
          success: false,
          error: 'I don\'t have permission to manage roles. Please ask a server administrator to give me the "Manage Roles" permission.'
        };
      }

      if (botMember.roles.highest.position <= onDutyRole.position) {
        return {
          success: false,
          error: 'I can\'t manage the on-duty role because it\'s higher than or equal to my highest role. Please ask a server administrator to move my role above the on-duty role.'
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to validate bot permissions.'
      };
    }
  }

  async _handleRoleChange(member, role, shouldHaveRole) {
    try {
      if (shouldHaveRole) {
        await member.roles.add(role);
      } else {
        await member.roles.remove(role);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this._getErrorMessage(error)
      };
    }
  }

  async _handleNotification(interaction, member, isOnDuty, dutyType = 'admin') {
    try {
      if (interaction) {
        // For command-based changes, use the interaction-based notification
        return await sendDutyNotification(interaction, isOnDuty, dutyType);
      } else {
        // For external role changes, send direct notification to duty logs
        return await this._sendDirectNotification(member, isOnDuty, dutyType);
      }
    } catch (error) {
      return {
        success: false,
        warning: 'Failed to send duty notification'
      };
    }
  }

  async _sendDirectNotification(member, isOnDuty, dutyType = 'admin') {
    try {
      // Use NotificationService for duty notifications
      const success = await notificationService.sendDutyNotification(member, isOnDuty, dutyType);
      
      return { 
        success,
        warning: success ? null : 'Failed to send notification via NotificationService'
      };
    } catch (error) {
      loggerConsole.error('Failed to send direct notification:', error);
      return {
        success: false,
        warning: 'Failed to send notification to duty logs channel'
      };
    }
  }

  async _logStatusChange(member, isOnDuty, options) {
    try {
      const dutyType = options.dutyType || 'admin';
      loggerConsole.log(`📝 Logging ${dutyType} duty status change: ${member.user.tag} -> ${isOnDuty ? 'ON' : 'OFF'} duty (${options.source || 'command'})`);

      // Create/end duty session (new session-based tracking)
      await this._handleDutySession(member, isOnDuty, dutyType, options);

      // Also log to DutyStatusChange for backward compatibility
      const changeRecord = await DutyStatusChange.create({
        discordUserId: member.user.id,
        discordUsername: member.user.username,
        status: isOnDuty,
        previousStatus: !isOnDuty, // Since we validated the change is valid
        source: options.source || 'command',
        reason: options.reason || (isOnDuty ? `User activated ${dutyType} duty status` : `User deactivated ${dutyType} duty status`),
        guildId: member.guild.id,
        channelId: options.channelId || null,
        metadata: {
          userTag: member.user.tag,
          userDisplayName: member.displayName,
          roleChangeSuccessful: true,
          dutyType: dutyType,
          timestamp: new Date().toISOString(),
          botVersion: process.env.npm_package_version || 'unknown',
          ...options.metadata
        },
        success: true
      });

      return { success: true, record: changeRecord };
    } catch (error) {
      loggerConsole.error('❌ Failed to log duty status change:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async _handleDutySession(member, isOnDuty, dutyType, options) {
    try {
      // Skip session handling for button/auto_timeout - session already handled by DutySessionService
      if (['button', 'auto_timeout'].includes(options.source)) {
        loggerConsole.log(`📊 Session already handled by DutySessionService for ${options.source}`);
        return;
      }

      const sessionService = this.getDutySessionService();
      if (!sessionService) {
        loggerConsole.warn('DutySessionService not available - skipping session tracking');
        return;
      }

      if (isOnDuty) {
        // Start a new session
        const result = await sessionService.startSession(
          member.user.id,
          member.user.username,
          dutyType,
          member.guild.id,
          {
            source: options.source || 'command',
            displayName: member.displayName
          }
        );

        if (result.created) {
          loggerConsole.log(`📊 Started duty session for ${member.user.tag}`);
        } else if (result.error) {
          loggerConsole.warn(`⚠️ Could not start session: ${result.error}`);
        }
      } else {
        // End active session
        const endReason = options.source === 'external' ? 'role_removed' : 'manual';
        const result = await sessionService.endSessionByUser(
          member.user.id,
          dutyType,
          endReason
        );

        if (result.success) {
          loggerConsole.log(`📊 Ended duty session for ${member.user.tag} (${result.session?.durationMinutes || 0} min, ${result.session?.totalPoints || 0} pts)`);
        } else if (result.error && result.error !== 'No active session found') {
          loggerConsole.warn(`⚠️ Could not end session: ${result.error}`);
        }
      }
    } catch (error) {
      // Don't let session tracking errors break the main duty flow
      loggerConsole.error('❌ Error in duty session handling:', error.message);
    }
  }

  _getErrorMessage(error) {
    if (error.code === 50013) {
      return 'I don\'t have permission to manage roles. Please ask a server administrator to check my role permissions and position.';
    }
    return 'An unexpected error occurred. Please try again or contact a server administrator.';
  }

  // Utility methods for checking status
  isUserOnDuty(member) {
    return member.roles.cache.has(this.onDutyRoleId);
  }

  getOnDutyMembers(guild) {
    const onDutyRole = guild.roles.cache.get(this.onDutyRoleId);
    return onDutyRole ? onDutyRole.members : new Map();
  }
}

module.exports = DutyStatusFactory;