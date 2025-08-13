const { ON_DUTY_ROLE_ID } = require('../../config/roles');
const { sendDutyNotification } = require('../utils/dutyNotifications');
const { DutyStatusChange } = require('../database/models');
const { CHANNELS } = require('../../config/channels');
const { EmbedBuilder } = require('discord.js');

class DutyStatusFactory {
    constructor() {
        this.onDutyRoleId = ON_DUTY_ROLE_ID;
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
            
            // Get the on-duty role
            const onDutyRole = guild.roles.cache.get(this.onDutyRoleId);
            if (!onDutyRole) {
                result.error = 'The on-duty role could not be found. Please contact a server administrator.';
                return result;
            }

            // Check current Discord role status (this is the source of truth)
            const currentlyOnDuty = member.roles.cache.has(this.onDutyRoleId);
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

            console.log(`🔄 Processing duty status change: ${member.user.tag} -> ${isOnDuty ? 'ON' : 'OFF'} duty`);

            // Handle role change (skip for external changes since role already changed)
            if (options.source !== 'external') {
                const roleResult = await this._handleRoleChange(member, onDutyRole, isOnDuty);
                if (!roleResult.success) {
                    result.error = roleResult.error;
                    return result;
                }
                result.data.roleChanged = true;
                console.log(`✅ Role ${isOnDuty ? 'added' : 'removed'} successfully`);
            } else {
                result.data.roleChanged = false; // Role was changed externally
                console.log(`📝 External role change detected - logging the change`);
            }

            // Send notification (unless explicitly skipped)
            if (!options.skipNotification) {
                const notificationResult = await this._handleNotification(interaction, member, isOnDuty);
                result.data.notificationSent = notificationResult.success;
                if (!notificationResult.success && notificationResult.warning) {
                    result.warning = notificationResult.warning;
                }
                console.log(`📢 Notification ${notificationResult.success ? 'sent' : 'failed'}`);
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

    async _handleNotification(interaction, member, isOnDuty) {
        try {
            if (interaction) {
                // For command-based changes, use the interaction-based notification
                return await sendDutyNotification(interaction, isOnDuty);
            } else {
                // For external role changes, send direct notification to duty logs
                console.log(`📢 Sending notification for ${member.user.tag} (external change)`);
                return await this._sendDirectNotification(member, isOnDuty);
            }
        } catch (error) {
            return {
                success: false,
                warning: 'Failed to send duty notification'
            };
        }
    }

    async _sendDirectNotification(member, isOnDuty) {
        try {
            const guild = member.guild;
            const channel = guild.channels.cache.get(CHANNELS.DUTY_LOGS);
            
            if (!channel) {
                return {
                    success: false,
                    warning: 'Duty logs channel not found'
                };
            }

            // Use the same embed style as command notifications for consistency
            const embed = new EmbedBuilder()
                .setColor(isOnDuty ? 0x00FF00 : 0xFF0000)
                .setTitle('Admin Duty Status Update')
                .setDescription(`${member} is now ${isOnDuty ? 'on' : 'off'} duty`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            
            return { success: true };
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
            console.log(`📝 Logging duty status change: ${member.user.tag} -> ${isOnDuty ? 'ON' : 'OFF'} duty (${options.source || 'command'})`);
            
            const changeRecord = await DutyStatusChange.create({
                discordUserId: member.user.id,
                discordUsername: member.user.username,
                status: isOnDuty,
                previousStatus: !isOnDuty, // Since we validated the change is valid
                source: options.source || 'command',
                reason: options.reason || (isOnDuty ? 'User activated duty status' : 'User deactivated duty status'),
                guildId: member.guild.id,
                channelId: options.channelId || null,
                metadata: {
                    userTag: member.user.tag,
                    userDisplayName: member.displayName,
                    roleChangeSuccessful: true,
                    timestamp: new Date().toISOString(),
                    botVersion: process.env.npm_package_version || 'unknown',
                    ...options.metadata
                },
                success: true
            });
            
            console.log(`✅ Duty status change logged to database (ID: ${changeRecord.id})`);
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