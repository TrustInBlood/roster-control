const { ON_DUTY_ROLE_ID } = require('../../config/discord');
const DutyStatusFactory = require('../services/DutyStatusFactory');
const RoleWhitelistSyncService = require('../services/RoleWhitelistSyncService');
const StaffRoleSyncService = require('../services/StaffRoleSyncService');
const { discordRoles, getAllTrackedRolesAsync, getHighestPriorityGroupAsync } = require('../utils/environment');
const { getAllStaffRoles } = discordRoles;
const NotificationService = require('../services/NotificationService');
const { AuditLog } = require('../database/models');
const { console: loggerConsole } = require('../utils/logger');

class RoleChangeHandler {
  constructor(client = null, logger = console) {
    this.client = client; // Store Discord client for updates
    this.logger = logger;
    this.onDutyRoleId = ON_DUTY_ROLE_ID;
    this.dutyFactory = new DutyStatusFactory();
    this.processingUsers = new Set(); // Prevent duplicate processing
    this.roleWhitelistSync = new RoleWhitelistSyncService(logger, client); // New sync service
    this.staffRoleSync = new StaffRoleSyncService(client, logger, this.roleWhitelistSync); // Pass roleWhitelistSync for departed members cleanup
    this.trackedRoles = null; // Will be loaded lazily via async
    this.staffRoles = getAllStaffRoles(); // Get all individual staff roles

    // Set up cross-reference
    this.dutyFactory.setRoleChangeHandler(this);
  }

  /**
   * Get tracked roles (lazy async loading with caching)
   * @returns {Promise<string[]>}
   */
  async getTrackedRoles() {
    // Refresh from service if not cached or periodically
    if (!this.trackedRoles || !this._trackedRolesTimestamp || Date.now() - this._trackedRolesTimestamp > 60000) {
      this.trackedRoles = await getAllTrackedRolesAsync();
      this._trackedRolesTimestamp = Date.now();
    }
    return this.trackedRoles;
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
            loggerConsole.log(`🔔 External duty role change detected: ${newMember.user.tag} -> ${newHasDutyRole ? 'ON' : 'OFF'} duty`);

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
      const trackedRoles = await this.getTrackedRoles();
      if (trackedRoles.length > 0) {
        const oldTrackedRoles = oldMember.roles.cache.filter(r => trackedRoles.includes(r.id));
        const newTrackedRoles = newMember.roles.cache.filter(r => trackedRoles.includes(r.id));

        // Check if any tracked roles changed
        const oldRoleIds = new Set(oldTrackedRoles.map(r => r.id));
        const newRoleIds = new Set(newTrackedRoles.map(r => r.id));

        const rolesChanged = oldRoleIds.size !== newRoleIds.size ||
                           ![...oldRoleIds].every(id => newRoleIds.has(id));

        if (rolesChanged) {
          const oldGroup = await getHighestPriorityGroupAsync(oldMember.roles.cache, oldMember.guild);
          const newGroup = await getHighestPriorityGroupAsync(newMember.roles.cache, newMember.guild);

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

      // Handle staff role synchronization for any role change
      const oldStaffRoles = oldMember.roles.cache.filter(r => this.staffRoles.includes(r.id));
      const newStaffRoles = newMember.roles.cache.filter(r => this.staffRoles.includes(r.id));

      // Check if any staff roles changed
      const oldStaffRoleIds = new Set(oldStaffRoles.map(r => r.id));
      const newStaffRoleIds = new Set(newStaffRoles.map(r => r.id));

      const staffRolesChanged = oldStaffRoleIds.size !== newStaffRoleIds.size ||
                               ![...oldStaffRoleIds].every(id => newStaffRoleIds.has(id));

      if (staffRolesChanged) {
        try {
          const staffSyncResult = await this.staffRoleSync.syncMemberStaffRole(newMember, {
            source: 'role_change',
            skipNotification: true
          });

          if (staffSyncResult.success && staffSyncResult.actionPerformed) {
            this.logger.info('Staff role sync completed', {
              userId: newMember.user.id,
              userTag: newMember.user.tag,
              action: staffSyncResult.action,
              hasIndividualStaffRole: staffSyncResult.hasIndividualStaffRole,
              hasStaffRole: staffSyncResult.hasStaffRole
            });
          }
        } catch (error) {
          this.logger.error('Failed to sync staff role during role change', {
            userId: newMember.user.id,
            userTag: newMember.user.tag,
            error: error.message
          });
        }
      }
    } catch (error) {
      loggerConsole.error('Error handling role change:', error);
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
      const currentGroup = await getHighestPriorityGroupAsync(member.roles.cache, member.guild);

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

  /**
   * Start periodic staff role synchronization
   * @param {number} intervalMinutes - How often to run sync (default: 60 minutes)
   */
  startStaffRolePeriodicSync(intervalMinutes = 60) {
    return this.staffRoleSync.startPeriodicSync(intervalMinutes);
  }

  /**
   * Stop periodic staff role synchronization
   */
  stopStaffRolePeriodicSync() {
    return this.staffRoleSync.stopPeriodicSync();
  }

  /**
   * Manually sync staff role for a specific member
   * @param {Object} member - Discord GuildMember object
   * @param {Object} options - Sync options
   */
  async syncMemberStaffRole(member, options = {}) {
    return await this.staffRoleSync.syncMemberStaffRole(member, options);
  }

  /**
   * Bulk sync staff roles for entire guild
   * @param {string} guildId - Discord guild ID
   * @param {Object} options - Sync options
   */
  async bulkSyncGuildStaffRoles(guildId, options = {}) {
    return await this.staffRoleSync.bulkSyncGuildStaffRoles(guildId, options);
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
      loggerConsole.error(`❌ Failed to sync ${member.user.tag}:`, error);
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