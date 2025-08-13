const { ON_DUTY_ROLE_ID } = require('../../config/roles');
const DutyStatusFactory = require('../services/DutyStatusFactory');

class RoleChangeHandler {
    constructor() {
        this.onDutyRoleId = ON_DUTY_ROLE_ID;
        this.dutyFactory = new DutyStatusFactory();
        this.processingUsers = new Set(); // Prevent duplicate processing
    }

    async handleGuildMemberUpdate(oldMember, newMember) {
        try {
            // Check if the on-duty role changed
            const oldHasRole = oldMember.roles.cache.has(this.onDutyRoleId);
            const newHasRole = newMember.roles.cache.has(this.onDutyRoleId);

            if (oldHasRole === newHasRole) {
                // No change in on-duty role status
                return;
            }

            // Prevent duplicate processing if this user is already being processed
            const userId = newMember.user.id;
            if (this.processingUsers.has(userId)) {
                console.log(`⏭️ Skipping duplicate role change processing for ${newMember.user.tag}`);
                return;
            }

            this.processingUsers.add(userId);

            try {
                console.log(`🔔 External role change detected: ${newMember.user.tag} -> ${newHasRole ? 'ON' : 'OFF'} duty`);

                // Use the factory to handle the role change
                const result = await this.dutyFactory._handleDutyStatusChange(null, newHasRole, {
                    member: newMember,
                    source: 'external',
                    reason: `Role ${newHasRole ? 'added' : 'removed'} externally (not via bot commands)`,
                    skipNotification: false, // Send notifications for external changes
                    metadata: {
                        externalChange: true,
                        oldRoleStatus: oldHasRole,
                        newRoleStatus: newHasRole,
                        changeDetectedAt: new Date().toISOString()
                    }
                });

                if (result.success) {
                    console.log(`✅ External role change processed successfully for ${newMember.user.tag}`);
                } else {
                    console.error(`❌ Failed to process external role change for ${newMember.user.tag}:`, result.error);
                }

            } finally {
                // Always remove from processing set
                setTimeout(() => {
                    this.processingUsers.delete(userId);
                }, 5000); // Remove after 5 seconds to prevent permanent blocking
            }

        } catch (error) {
            console.error('❌ Error in role change handler:', error);
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
                console.log(`🔄 Syncing ${member.user.tag}: Discord=${hasRole}, DB=${dbStatus}`);
                
                const result = await this.dutyFactory._handleDutyStatusChange(null, hasRole, {
                    member,
                    source: 'manual_sync',
                    reason: 'Manual role sync requested',
                    skipNotification: false,
                    metadata: {
                        syncReason: 'manual',
                        previousDbStatus: dbStatus,
                        currentRoleStatus: hasRole
                    }
                });

                return result;
            }

            return { success: true, message: 'Roles already in sync' };

        } catch (error) {
            console.error('❌ Error syncing member roles:', error);
            return { success: false, error: error.message };
        }
    }

    // Method to check if a specific role change should be processed
    shouldProcessRoleChange(oldMember, newMember, roleId) {
        const oldHasRole = oldMember.roles.cache.has(roleId);
        const newHasRole = newMember.roles.cache.has(roleId);
        return oldHasRole !== newHasRole;
    }

    // Utility method to get role change details
    getRoleChangeDetails(oldMember, newMember) {
        const changes = {
            added: [],
            removed: []
        };

        // Find added roles
        for (const [roleId, role] of newMember.roles.cache) {
            if (!oldMember.roles.cache.has(roleId)) {
                changes.added.push(role);
            }
        }

        // Find removed roles
        for (const [roleId, role] of oldMember.roles.cache) {
            if (!newMember.roles.cache.has(roleId)) {
                changes.removed.push(role);
            }
        }

        return changes;
    }

    // Method to log all role changes for debugging
    async logAllRoleChanges(oldMember, newMember) {
        const changes = this.getRoleChangeDetails(oldMember, newMember);
        
        if (changes.added.length > 0 || changes.removed.length > 0) {
            console.log(`👤 Role changes for ${newMember.user.tag}:`);
            
            if (changes.added.length > 0) {
                console.log(`  ➕ Added: ${changes.added.map(r => r.name).join(', ')}`);
            }
            
            if (changes.removed.length > 0) {
                console.log(`  ➖ Removed: ${changes.removed.map(r => r.name).join(', ')}`);
            }

            // Check if on-duty role was involved
            const onDutyRoleInvolved = changes.added.some(r => r.id === this.onDutyRoleId) || 
                                     changes.removed.some(r => r.id === this.onDutyRoleId);
            
            if (onDutyRoleInvolved) {
                console.log(`  🚨 ON-DUTY ROLE CHANGE DETECTED`);
            }
        }
    }
}

// Export the class and a function to set up the event listener
module.exports = {
    RoleChangeHandler,
    
    setupRoleChangeHandler: (client) => {
        const handler = new RoleChangeHandler();
        
        client.on('guildMemberUpdate', async (oldMember, newMember) => {
            await handler.handleGuildMemberUpdate(oldMember, newMember);
        });

        console.log('🔧 Role change handler registered');
        return handler;
    }
};