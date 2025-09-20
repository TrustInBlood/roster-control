const { ON_DUTY_ROLE_ID } = require('../../config/discord');
const DutyStatusFactory = require('../services/DutyStatusFactory');
const RoleWhitelistSyncService = require('../services/RoleWhitelistSyncService');
const { squadGroups } = require('../utils/environment');
const { getAllTrackedRoles, getHighestPriorityGroup } = squadGroups;
const NotificationService = require('../services/NotificationService');
const { AuditLog } = require('../database/models');

class RoleChangeHandler {
  constructor(client = null, logger = console) {
    this.client = client; // Store Discord client for updates
    this.logger = logger;
    this.onDutyRoleId = ON_DUTY_ROLE_ID;
    this.dutyFactory = new DutyStatusFactory();
    this.processingUsers = new Set(); // Prevent duplicate processing
    this.roleWhitelistSync = new RoleWhitelistSyncService(logger, client); // New sync service
    this.trackedRoles = getAllTrackedRoles(); // Get all staff/member roles

    // Set up cross-reference
    this.dutyFactory.setRoleChangeHandler(this);
  }
    
  addToProcessingSet(userId) {
    this.processingUsers.add(userId);
    // Remove after longer timeout to account for Discord event delays
    setTimeout(() => {
      this.processingUsers.delete(userId);
    }, 10000); // 10 seconds should be more than enough
  }

  async handleGuildMemberUpdate(oldMember, newMember) {
    try {
      // Handle on-duty role changes
      const oldHasDutyRole = oldMember.roles.cache.has(this.onDutyRoleId);
      const newHasDutyRole = newMember.roles.cache.has(this.onDutyRoleId);

      if (oldHasDutyRole !== newHasDutyRole) {
        // Prevent duplicate processing if this user is already being processed
        const userId = newMember.user.id;
        if (this.processingUsers.has(userId)) {
          return; // Skip processing if already being processed
        } else {
          this.processingUsers.add(userId);

          try {
            console.log(`🔔 External duty role change detected: ${newMember.user.tag} -> ${newHasDutyRole ? 'ON' : 'OFF'} duty`);

            // Use the factory to handle the duty role change
            const result = await this.dutyFactory._handleDutyStatusChange(null, newHasDutyRole, {
              member: newMember,
              source: 'external',
              reason: `Role ${newHasDutyRole ? 'added' : 'removed'} externally (not via bot commands)`,
              skipNotification: false, // Send notifications for external changes
              metadata: {
                externalChange: true,
                oldRoleStatus: oldHasDutyRole,
                newRoleStatus: newHasDutyRole,
                changeDetectedAt: new Date().toISOString()
              }
            });

            if (result && result.embed) {
              // Notification handled by factory
            }
          } finally {
            // Remove from processing set after delay
            setTimeout(() => {
              this.processingUsers.delete(userId);
            }, 5000);
          }
        }
      }

      // Handle staff/member whitelist role changes
      if (this.trackedRoles.length > 0) {
        const oldTrackedRoles = oldMember.roles.cache.filter(r => this.trackedRoles.includes(r.id));
        const newTrackedRoles = newMember.roles.cache.filter(r => this.trackedRoles.includes(r.id));

        // Check if any tracked roles changed
        const oldRoleIds = new Set(oldTrackedRoles.map(r => r.id));
        const newRoleIds = new Set(newTrackedRoles.map(r => r.id));

        const rolesChanged = oldRoleIds.size !== newRoleIds.size ||
                           ![...oldRoleIds].every(id => newRoleIds.has(id));

        if (rolesChanged) {
          const oldGroup = getHighestPriorityGroup(oldMember.roles.cache);
          const newGroup = getHighestPriorityGroup(newMember.roles.cache);

          this.logger.info('Tracked role change detected', {
            userId: newMember.user.id,
            userTag: newMember.user.tag,
            oldRoles: [...oldTrackedRoles.values()].map(r => r.name),
            newRoles: [...newTrackedRoles.values()].map(r => r.name),
            oldGroup: oldGroup || 'none',
            newGroup: newGroup || 'none'
          });

          if (oldGroup !== newGroup) {
            try {
              // Sync role change to database using new service
              const syncResult = await this.roleWhitelistSync.syncUserRole(
                newMember.user.id,
                newGroup,
                newMember,
                {
                  source: 'external_role_change',
                  skipNotification: false,
                  metadata: {
                    oldGroup,
                    newGroup,
                    guildId: newMember.guild.id,
                    changeDetectedAt: new Date().toISOString()
                  }
                }
              );

              if (syncResult.success) {
                this.logger.info('Role whitelist sync completed', {
                  userId: newMember.user.id,
                  oldGroup,
                  newGroup,
                  steamId: syncResult.steamId,
                  confidence: syncResult.confidence
                });

                // Send notification about the change
                await this._sendRoleChangeNotification(
                  newMember,
                  oldGroup,
                  newGroup,
                  syncResult
                );
              } else {
                this.logger.warn('Role whitelist sync failed', {
                  userId: newMember.user.id,
                  oldGroup,
                  newGroup,
                  error: syncResult.error
                });
              }

            } catch (error) {
              this.logger.error('Failed to handle role whitelist change', {
                userId: newMember.user.id,
                oldGroup,
                newGroup,
                error: error.message
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling role change:', error);
    }
  }

  // Method to manually sync user's roles to database
  async syncUserToDatabase(discordUserId, guildId) {
    try {
      this.logger.info('Manual role sync requested', { discordUserId, guildId });

      // Get the Discord client
      if (!this.client) {
        this.logger.warn('Discord client not available for manual sync');
        return { success: false, error: 'Discord client not available' };
      }

      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        this.logger.warn(`Guild ${guildId} not found for manual sync`);
        return { success: false, error: 'Guild not found' };
      }

      const member = await guild.members.fetch(discordUserId);
      if (!member) {
        this.logger.warn(`Member ${discordUserId} not found for manual sync`);
        return { success: false, error: 'Member not found' };
      }

      // Get their current highest priority group
      const currentGroup = getHighestPriorityGroup(member.roles.cache);

      this.logger.info('Manual sync executing', {
        userTag: member.user.tag,
        currentGroup: currentGroup || 'none'
      });

      // Sync to database using the new service
      const syncResult = await this.roleWhitelistSync.syncUserRole(
        discordUserId,
        currentGroup,
        member,
        {
          source: 'manual_sync',
          skipNotification: true,
          metadata: {
            guildId,
            requestedAt: new Date().toISOString(),
            manual: true
          }
        }
      );

      if (syncResult.success) {
        this.logger.info('Manual sync completed successfully', {
          discordUserId: member.user.id,
          userTag: member.user.tag,
          group: currentGroup,
          steamId: syncResult.steamId
        });
      }

      return {
        success: syncResult.success,
        message: `Database sync completed for ${member.user.tag}`,
        discordUserId: member.user.id,
        userTag: member.user.tag,
        group: currentGroup || 'none',
        steamId: syncResult.steamId,
        confidence: syncResult.confidence,
        error: syncResult.error
      };

    } catch (error) {
      this.logger.error('Failed to manually sync user', {
        discordUserId,
        guildId,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send notification about role-based whitelist changes
   * @private
   */
  async _sendRoleChangeNotification(member, oldGroup, newGroup, syncResult) {
    try {
      const changeType = newGroup ? (oldGroup ? 'Updated' : 'Granted') : 'Revoked';
      const color = newGroup ? 0x00ff00 : 0xff0000;

      const fields = [
        { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
        { name: 'Previous Group', value: oldGroup || 'None', inline: true },
        { name: 'New Group', value: newGroup || 'None', inline: true },
        { name: 'Change Type', value: changeType, inline: true }
      ];

      if (syncResult.steamId) {
        fields.push(
          { name: 'Steam ID', value: syncResult.steamId, inline: true },
          { name: 'Link Confidence', value: `${syncResult.confidence || 0}`, inline: true }
        );
      } else {
        fields.push(
          { name: 'Steam Link', value: 'Not linked', inline: true },
          { name: 'Access Status', value: newGroup ? 'Pending Steam link' : 'No access', inline: true }
        );
      }

      await NotificationService.send('roleWhitelist', {
        title: 'Whitelist Access Updated',
        description: `Role-based whitelist access changed for ${member.user.tag}`,
        fields,
        color,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to send role change notification', {
        userId: member.user.id,
        error: error.message
      });
    }
  }

  /**
   * Bulk sync all guild members to database
   * @param {string} guildId - Discord guild ID
   * @param {Object} options - Sync options
   */
  async bulkSyncGuild(guildId, options = {}) {
    try {
      return await this.roleWhitelistSync.bulkSyncGuild(guildId, options);
    } catch (error) {
      this.logger.error('Failed to bulk sync guild', {
        guildId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status for a user
   * @param {string} discordUserId - Discord user ID
   */
  async getUserSyncStatus(discordUserId) {
    try {
      return await this.roleWhitelistSync.getSyncStatus(discordUserId);
    } catch (error) {
      this.logger.error('Failed to get user sync status', {
        discordUserId,
        error: error.message
      });
      throw error;
    }
  }

  // Method to manually trigger role sync for a member
  async syncMemberRoles(member) {
    try {
      const hasRole = member.roles.cache.has(this.onDutyRoleId);
            
      // Check current database status
      const { DutyStatusChange } = require('../database/models');
      const latestChange = await DutyStatusChange.findOne({
        where: {
          discordUserId: member.user.id,
          guildId: member.guild.id
        },
        order: [['createdAt', 'DESC']]
      });

      const dbStatus = latestChange ? latestChange.status : false;

      if (hasRole !== dbStatus) {
                
        const result = await this.dutyFactory._handleDutyStatusChange(null, hasRole, {
          member,
          source: 'manual_sync',
          reason: 'Manual role sync requested',
          skipNotification: false,
          metadata: {
            syncRequired: true,
            discordHasRole: hasRole,
            databaseStatus: dbStatus,
            syncedAt: new Date().toISOString()
          }
        });

        return result;
      } else {
        return { success: true, message: 'Already in sync' };
      }
    } catch (error) {
      console.error(`❌ Failed to sync ${member.user.tag}:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Global instance to share with setup function
let globalRoleChangeHandler = null;

function setupRoleChangeHandler(client, logger = console) {
  // Create role change handler instance with new sync service
  globalRoleChangeHandler = new RoleChangeHandler(client, logger);

  // Set up Discord event listeners
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      await globalRoleChangeHandler.handleGuildMemberUpdate(oldMember, newMember);
    } catch (error) {
      logger.error('Error in guildMemberUpdate handler:', { error: error.message });
    }
  });

  return globalRoleChangeHandler;
}

module.exports = {
  RoleChangeHandler,
  setupRoleChangeHandler,
  getRoleChangeHandler: () => globalRoleChangeHandler
};