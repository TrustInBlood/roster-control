const { ON_DUTY_ROLE_ID } = require('../../config/discord');
const DutyStatusFactory = require('../services/DutyStatusFactory');
const { squadGroups } = require('../utils/environment');
const { getAllTrackedRoles, getHighestPriorityGroup } = squadGroups;
const NotificationService = require('../services/NotificationService');
const { AuditLog } = require('../database/models');

class RoleChangeHandler {
  constructor(roleBasedCache = null) {
    this.onDutyRoleId = ON_DUTY_ROLE_ID;
    this.dutyFactory = new DutyStatusFactory();
    this.processingUsers = new Set(); // Prevent duplicate processing
    this.roleBasedCache = roleBasedCache; // Optional role-based whitelist cache
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
      if (this.roleBasedCache && this.trackedRoles.length > 0) {
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

          console.log(`  Old roles: ${[...oldTrackedRoles.values()].map(r => r.name).join(', ') || 'none'}`);
          console.log(`  New roles: ${[...newTrackedRoles.values()].map(r => r.name).join(', ') || 'none'}`);
          console.log(`  Old group: ${oldGroup || 'none'}`);
          console.log(`  New group: ${newGroup || 'none'}`);

          if (oldGroup !== newGroup) {

            // Update role-based cache
            await this.roleBasedCache.updateUserRole(newMember.user.id, newGroup, newMember);

            // Log to audit
            try {
              await AuditLog.create({
                actionType: 'ROLE_CHANGE',
                actorType: 'system',
                actorId: 'SYSTEM',
                actorName: 'Role Change Monitor',
                targetType: 'user',
                targetId: newMember.user.id,
                targetName: newMember.user.tag,
                guildId: newMember.guild.id,
                description: `User ${newMember.user.tag} whitelist role changed from ${oldGroup || 'none'} to ${newGroup || 'none'} via external role change`,
                beforeState: { group: oldGroup || 'none' },
                afterState: { group: newGroup || 'none' },
                metadata: {
                  source: 'external_role_change',
                  discordUserId: newMember.user.id
                },
                severity: 'info'
              });
            } catch (error) {
              console.error('Failed to log role whitelist change:', error);
            }

            // Send notification
            await NotificationService.send('roleWhitelist', {
              title: 'Role-Based Whitelist Update',
              description: `${newMember.user.tag} whitelist changed`,
              fields: [
                { name: 'Previous Group', value: oldGroup || 'None', inline: true },
                { name: 'New Group', value: newGroup || 'None', inline: true },
                { name: 'Change Type', value: newGroup ? (oldGroup ? 'Updated' : 'Granted') : 'Revoked', inline: true }
              ],
              color: newGroup ? 0x00ff00 : 0xff0000
            });
          }
        }
      }
    } catch (error) {
      console.error('Error handling role change:', error);
    }
  }

  // Method to manually update role-based cache for a user without role change
  async updateUserInCache(discordUserId, guildId) {
    try {
      if (!this.roleBasedCache) {
        console.log('No role-based cache available for manual update');
        return { success: false, error: 'No role-based cache available' };
      }

      // Get the Discord guild and member
      const client = require('../index').client || this.client;

      if (!client) {
        console.log('Discord client not available for cache update');
        return { success: false, error: 'Discord client not available' };
      }

      const guild = await client.guilds.fetch(guildId);
      if (!guild) {
        console.log(`Guild ${guildId} not found for cache update`);
        return { success: false, error: 'Guild not found' };
      }

      const member = await guild.members.fetch(discordUserId);
      if (!member) {
        console.log(`Member ${discordUserId} not found for cache update`);
        return { success: false, error: 'Member not found' };
      }

      // Get their current highest priority group
      const currentGroup = getHighestPriorityGroup(member.roles.cache);

      console.log(`Manually updating cache for ${member.user.tag}: group=${currentGroup || 'none'}`);

      // Update the role-based cache
      await this.roleBasedCache.updateUserRole(discordUserId, currentGroup, member);

      return {
        success: true,
        message: `Cache updated for ${member.user.tag}`,
        group: currentGroup || 'none'
      };

    } catch (error) {
      console.error(`Failed to manually update cache for user ${discordUserId}:`, error);
      return { success: false, error: error.message };
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

function setupRoleChangeHandler(client, roleBasedCache = null) {
  // Create role change handler instance
  globalRoleChangeHandler = new RoleChangeHandler(roleBasedCache);
  
  // Set up Discord event listeners
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      await globalRoleChangeHandler.handleGuildMemberUpdate(oldMember, newMember);
    } catch (error) {
      console.error('Error in guildMemberUpdate handler:', error);
    }
  });
  
  return globalRoleChangeHandler;
}

module.exports = {
  RoleChangeHandler,
  setupRoleChangeHandler,
  getRoleChangeHandler: () => globalRoleChangeHandler
};