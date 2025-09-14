const { ON_DUTY_ROLE_ID, TUTOR_ON_DUTY_ROLE_ID } = require('../../config/discord');
const { sendDutyNotification } = require('../utils/dutyNotifications');
const { DutyStatusChange } = require('../database/models');
const notificationService = require('./NotificationService');

class DutyStatusFactory {
  constructor() {
    this.onDutyRoleId = ON_DUTY_ROLE_ID;
    this.tutorOnDutyRoleId = TUTOR_ON_DUTY_ROLE_ID;
    this.roleChangeHandler = null; // Will be set by the handler
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

      // Only validate state change for command-based changes
      // For external changes, we're just logging what already happened
      if (options.source !== 'external' && currentlyOnDuty === isOnDuty) {
        result.error = isOnDuty 
          ? 'User is already on duty'
          : 'User is not currently on duty';
        return result;
      }

      // Permission checks (only for bot-initiated changes)
      if (interaction) {
        const permissionCheck = await this._validatePermissions(guild, onDutyRole);
        if (!permissionCheck.success) {
          result.error = permissionCheck.error;
          return result;
        }
      }


      // Handle role change (skip for external changes since role already changed)
      if (options.source !== 'external') {
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
        result.data.roleChanged = false; // Role was changed externally
        console.log('📝 External role change detected - logging the change');
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
        console.warn('Failed to log duty status change to database:', dbResult.error);
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('Error in duty status change:', error);
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
      console.error('Failed to send direct notification:', error);
      return {
        success: false,
        warning: 'Failed to send notification to duty logs channel'
      };
    }
  }

  async _logStatusChange(member, isOnDuty, options) {
    try {
      const dutyType = options.dutyType || 'admin';
      console.log(`📝 Logging ${dutyType} duty status change: ${member.user.tag} -> ${isOnDuty ? 'ON' : 'OFF'} duty (${options.source || 'command'})`);
            
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
      console.error('❌ Failed to log duty status change:', error);
      return {
        success: false,
        error: error.message
      };
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