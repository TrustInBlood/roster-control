const { createServiceLogger } = require('../utils/logger');
const { discordRoles } = require('../utils/environment');
const { getAllStaffRoles } = discordRoles;
const { getMemberCacheService } = require('./MemberCacheService');

class StaffRoleSyncService {
  constructor(client, logger = null, roleWhitelistSync = null) {
    this.client = client;
    this.logger = logger || createServiceLogger('StaffRoleSync');
    this.staffRoleId = discordRoles.DISCORD_ROLES.STAFF;
    this.staffRoles = getAllStaffRoles();
    this.roleWhitelistSync = roleWhitelistSync; // For departed members cleanup

    // Remove the STAFF role from the staff roles list to prevent circular logic
    this.individualStaffRoles = this.staffRoles.filter(roleId => roleId !== this.staffRoleId);

    this.logger.info('StaffRoleSyncService initialized', {
      staffRoleId: this.staffRoleId,
      individualStaffRoles: this.individualStaffRoles
    });
  }

  /**
   * Sync staff role for a single member based on their individual staff roles
   * @param {Object} member - Discord GuildMember object
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} - Result of sync operation
   */
  async syncMemberStaffRole(member, options = {}) {
    try {
      const { source = 'automatic', skipNotification = true } = options;

      // Check if the STAFF role is configured
      if (!this.staffRoleId || this.staffRoleId === 'null') {
        this.logger.warn('STAFF role not configured, skipping sync', {
          userId: member.user.id,
          userTag: member.user.tag
        });
        return {
          success: false,
          message: 'STAFF role not configured',
          action: 'skipped'
        };
      }

      // Check if member has any individual staff roles (excluding the meta STAFF role)
      const hasIndividualStaffRole = this.individualStaffRoles.some(roleId =>
        member.roles.cache.has(roleId)
      );

      const hasStaffRole = member.roles.cache.has(this.staffRoleId);

      this.logger.debug('Staff role sync check', {
        userId: member.user.id,
        userTag: member.user.tag,
        hasIndividualStaffRole,
        hasStaffRole,
        individualStaffRoles: member.roles.cache
          .filter(role => this.individualStaffRoles.includes(role.id))
          .map(role => role.name)
      });

      // Determine required action
      let action = 'none';
      let actionPerformed = false;

      if (hasIndividualStaffRole && !hasStaffRole) {
        // Should have STAFF role but doesn't - add it
        try {
          await member.roles.add(this.staffRoleId, 'Automatic staff role assignment');
          action = 'added';
          actionPerformed = true;
          this.logger.info('Added STAFF role', {
            userId: member.user.id,
            userTag: member.user.tag,
            source
          });
        } catch (error) {
          this.logger.error('Failed to add STAFF role', {
            userId: member.user.id,
            userTag: member.user.tag,
            error: error.message
          });
          return {
            success: false,
            message: `Failed to add STAFF role: ${error.message}`,
            action: 'failed_add'
          };
        }
      } else if (!hasIndividualStaffRole && hasStaffRole) {
        // Shouldn't have STAFF role but does - remove it
        try {
          await member.roles.remove(this.staffRoleId, 'Automatic staff role removal');
          action = 'removed';
          actionPerformed = true;
          this.logger.info('Removed STAFF role', {
            userId: member.user.id,
            userTag: member.user.tag,
            source
          });
        } catch (error) {
          this.logger.error('Failed to remove STAFF role', {
            userId: member.user.id,
            userTag: member.user.tag,
            error: error.message
          });
          return {
            success: false,
            message: `Failed to remove STAFF role: ${error.message}`,
            action: 'failed_remove'
          };
        }
      }

      return {
        success: true,
        message: actionPerformed ? `STAFF role ${action}` : 'No action needed',
        action,
        actionPerformed,
        hasIndividualStaffRole,
        hasStaffRole: actionPerformed ? !hasStaffRole : hasStaffRole
      };

    } catch (error) {
      this.logger.error('Failed to sync member staff role', {
        userId: member.user.id,
        userTag: member.user.tag,
        error: error.message
      });
      return {
        success: false,
        message: error.message,
        action: 'error'
      };
    }
  }

  /**
   * Bulk sync staff roles for all guild members
   * @param {string} guildId - Discord guild ID
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} - Result of bulk sync operation
   */
  async bulkSyncGuildStaffRoles(guildId, options = {}) {
    try {
      const { dryRun = false } = options;

      this.logger.info('Starting bulk staff role sync', { guildId, dryRun });

      if (!this.client) {
        throw new Error('Discord client not available');
      }

      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        throw new Error(`Guild ${guildId} not found`);
      }

      // OPTIMIZATION: Fetch only staff-related members instead of all 10,000+ members
      // Get all role IDs we need to check (individual staff roles + meta STAFF role)
      const rolesToFetch = [...this.individualStaffRoles, this.staffRoleId];
      const cacheService = getMemberCacheService();

      this.logger.info('Fetching staff members for bulk sync', {
        totalGuildMembers: guild.memberCount,
        staffRolesToCheck: rolesToFetch.length,
        guildName: guild.name
      });

      const allMembers = await cacheService.getMembersByRole(guild, rolesToFetch);

      let processed = 0;
      let added = 0;
      let removed = 0;
      let errors = 0;
      let skipped = 0;

      this.logger.info('Processing staff members for role sync', {
        staffMembersFound: allMembers.size,
        guildName: guild.name
      });

      for (const [userId, member] of allMembers) {
        try {
          // Skip bots
          if (member.user.bot) {
            skipped++;
            continue;
          }

          if (dryRun) {
            // Just check what would happen
            const hasIndividualStaffRole = this.individualStaffRoles.some(roleId =>
              member.roles.cache.has(roleId)
            );
            const hasStaffRole = member.roles.cache.has(this.staffRoleId);

            if (hasIndividualStaffRole && !hasStaffRole) {
              added++;
              this.logger.debug('DRY RUN: Would add STAFF role', {
                userId,
                userTag: member.user.tag
              });
            } else if (!hasIndividualStaffRole && hasStaffRole) {
              removed++;
              this.logger.debug('DRY RUN: Would remove STAFF role', {
                userId,
                userTag: member.user.tag
              });
            }
          } else {
            // Actually perform the sync
            const result = await this.syncMemberStaffRole(member, {
              source: 'bulk_sync',
              skipNotification: true
            });

            if (result.success) {
              if (result.action === 'added') added++;
              else if (result.action === 'removed') removed++;
            } else {
              errors++;
              this.logger.warn('Member sync failed during bulk operation', {
                userId,
                userTag: member.user.tag,
                error: result.message
              });
            }
          }

          processed++;

          // Add small delay to avoid rate limits
          if (processed % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          errors++;
          this.logger.error('Error processing member during bulk sync', {
            userId,
            userTag: member?.user?.tag,
            error: error.message
          });
        }
      }

      const result = {
        success: errors === 0,
        processed,
        added,
        removed,
        errors,
        skipped,
        guildId,
        guildName: guild.name,
        dryRun
      };

      this.logger.info('Bulk staff role sync completed', result);
      return result;

    } catch (error) {
      this.logger.error('Failed to bulk sync guild staff roles', {
        guildId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start periodic staff role synchronization
   * @param {number} intervalMinutes - How often to run sync (default: 60 minutes)
   */
  startPeriodicSync(intervalMinutes = 60) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.info('Starting periodic staff role sync', {
      intervalMinutes,
      intervalMs
    });

    this.syncInterval = setInterval(async () => {
      try {
        if (!this.client || !this.client.guilds) {
          this.logger.warn('Discord client not ready for periodic sync');
          return;
        }

        for (const [guildId, guild] of this.client.guilds.cache) {
          try {
            this.logger.info('Running periodic staff role sync', { guildId, guildName: guild.name });
            await this.bulkSyncGuildStaffRoles(guildId, { source: 'periodic' });

            // Also cleanup departed members' whitelist entries
            if (this.roleWhitelistSync) {
              try {
                const cleanupResult = await this.roleWhitelistSync.cleanupDepartedMembers(guildId, {
                  dryRun: false,
                  sendNotification: true // Only send notification if entries were found and revoked
                });

                if (cleanupResult.departedUsersFound > 0) {
                  this.logger.info('Departed members cleanup completed', {
                    guildId,
                    guildName: guild.name,
                    departedUsersFound: cleanupResult.departedUsersFound,
                    entriesRevoked: cleanupResult.entriesRevoked
                  });
                }
              } catch (cleanupError) {
                this.logger.warn('Departed members cleanup failed - will retry in 60 minutes', {
                  guildId,
                  guildName: guild.name,
                  error: cleanupError.message
                });
              }
            }
          } catch (error) {
            this.logger.error('Periodic sync failed for guild', {
              guildId,
              guildName: guild.name,
              error: error.message
            });
          }
        }
      } catch (error) {
        this.logger.error('Periodic staff role sync error', { error: error.message });
      }
    }, intervalMs);

    return this.syncInterval;
  }

  /**
   * Stop periodic synchronization
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.logger.info('Periodic staff role sync stopped');
    }
  }
}

module.exports = StaffRoleSyncService;