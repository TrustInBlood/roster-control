const { ON_DUTY_ROLE_ID } = require('../../config/roles');
const { DutyStatusChange } = require('../database/models');
const DutyStatusFactory = require('./DutyStatusFactory');

class DutyStatusSyncService {
    constructor() {
        this.onDutyRoleId = ON_DUTY_ROLE_ID;
        this.dutyFactory = new DutyStatusFactory();
    }

    async syncGuildDutyStatus(guild) {
        try {
            console.log('🔄 Starting duty status sync for guild:', guild.name);
            
            const syncResults = {
                scanned: 0,
                discordRoleHolders: 0,
                databaseRecordsFound: 0,
                recordsCreated: 0,
                discrepanciesFound: 0,
                discrepanciesResolved: 0,
                errors: []
            };

            // Get the on-duty role
            const onDutyRole = guild.roles.cache.get(this.onDutyRoleId);
            if (!onDutyRole) {
                console.warn('⚠️ On-duty role not found in guild:', guild.name);
                return syncResults;
            }

            // Get all members who currently have the on-duty role in Discord
            const discordRoleHolders = onDutyRole.members;
            syncResults.discordRoleHolders = discordRoleHolders.size;
            console.log(`👥 Found ${discordRoleHolders.size} members with on-duty role in Discord`);

            // Get recent duty status changes from database for analysis
            const recentChanges = await this._getRecentDutyChanges(guild.id);
            const latestStatusByUser = this._getLatestStatusByUser(recentChanges);

            // Process each Discord role holder
            for (const [userId, member] of discordRoleHolders) {
                syncResults.scanned++;
                
                try {
                    const latestStatus = latestStatusByUser.get(userId);
                    
                    if (!latestStatus) {
                        // User has role but no database record - create one
                        console.log(`📝 Creating missing database record for ${member.user.tag}`);
                        await this._createMissingRecord(member, syncResults);
                    } else if (!latestStatus.status) {
                        // User has role but database shows off-duty - potential discrepancy
                        console.log(`⚠️ Discrepancy found: ${member.user.tag} has role but database shows off-duty`);
                        await this._handleDiscrepancy(member, latestStatus, syncResults);
                    } else {
                        // User has role and database shows on-duty - all good
                        console.log(`✅ ${member.user.tag} status is consistent`);
                        syncResults.databaseRecordsFound++;
                    }
                } catch (error) {
                    console.error(`❌ Error processing ${member.user.tag}:`, error);
                    syncResults.errors.push(`${member.user.tag}: ${error.message}`);
                }
            }

            // Check for users in database who are marked on-duty but don't have the role
            await this._checkForMissingRoles(guild, latestStatusByUser, discordRoleHolders, syncResults);

            console.log('📊 Duty status sync completed:', syncResults);
            return syncResults;

        } catch (error) {
            console.error('❌ Failed to sync duty status:', error);
            throw error;
        }
    }

    async _getRecentDutyChanges(guildId, hours = 168) { // 7 days
        try {
            const { Op } = require('sequelize');
            const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
            return await DutyStatusChange.findAll({
                where: {
                    guildId,
                    createdAt: { [Op.gte]: cutoff }
                },
                order: [['createdAt', 'DESC']]
            });
        } catch (error) {
            if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_NO_SUCH_TABLE') {
                console.log('📝 DutyStatusChange table does not exist yet - returning empty array');
                return [];
            }
            throw error;
        }
    }

    _getLatestStatusByUser(changes) {
        const latestByUser = new Map();
        
        for (const change of changes) {
            if (!latestByUser.has(change.discordUserId)) {
                latestByUser.set(change.discordUserId, change);
            }
        }
        
        return latestByUser;
    }

    async _createMissingRecord(member, syncResults) {
        try {
            const result = await this.dutyFactory.setOnDuty(null, {
                member,
                source: 'startup_sync',
                reason: 'User had role on bot startup - creating missing database record',
                skipNotification: true,
                metadata: {
                    syncType: 'missing_record',
                    botStartup: true
                }
            });

            if (result.success) {
                syncResults.recordsCreated++;
                console.log(`✅ Created database record for ${member.user.tag}`);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`❌ Failed to create record for ${member.user.tag}:`, error);
            syncResults.errors.push(`${member.user.tag}: Failed to create record - ${error.message}`);
        }
    }

    async _handleDiscrepancy(member, latestStatus, syncResults) {
        syncResults.discrepanciesFound++;
        
        try {
            // Check how recent the off-duty record is
            const timeSinceChange = Date.now() - latestStatus.createdAt.getTime();
            const hoursAgo = timeSinceChange / (1000 * 60 * 60);

            if (hoursAgo < 1) {
                // Very recent change - might be a race condition, update database to match Discord
                console.log(`🔄 Recent discrepancy (${Math.round(hoursAgo * 60)} minutes ago), updating database to match Discord`);
                
                const result = await this.dutyFactory.setOnDuty(null, {
                    member,
                    source: 'startup_sync',
                    reason: 'Resolving discrepancy - user has role but recent database shows off-duty',
                    skipNotification: false,
                    metadata: {
                        syncType: 'discrepancy_recent',
                        previousChangeId: latestStatus.id,
                        hoursAgo: hoursAgo
                    }
                });

                if (result.success) {
                    syncResults.discrepanciesResolved++;
                }
            } else {
                // Older discrepancy - log it but don't auto-resolve
                console.log(`⚠️ Older discrepancy (${Math.round(hoursAgo)} hours ago), logging for manual review`);
                
                await DutyStatusChange.create({
                    discordUserId: member.user.id,
                    discordUsername: member.user.username,
                    status: true,
                    previousStatus: false,
                    source: 'startup_sync',
                    reason: `Discrepancy detected: user has role but database shows off-duty (${Math.round(hoursAgo)}h ago)`,
                    guildId: member.guild.id,
                    metadata: {
                        syncType: 'discrepancy_logged',
                        previousChangeId: latestStatus.id,
                        hoursAgo: hoursAgo,
                        requiresManualReview: true
                    },
                    success: true
                });
                
                syncResults.discrepanciesFound++; // Count as unresolved
            }
        } catch (error) {
            console.error(`❌ Failed to handle discrepancy for ${member.user.tag}:`, error);
            syncResults.errors.push(`${member.user.tag}: Discrepancy handling failed - ${error.message}`);
        }
    }

    async _checkForMissingRoles(guild, latestStatusByUser, discordRoleHolders, syncResults) {
        for (const [userId, latestStatus] of latestStatusByUser) {
            if (latestStatus.status && !discordRoleHolders.has(userId)) {
                // User is marked on-duty in database but doesn't have the role
                try {
                    const member = await guild.members.fetch(userId);
                    const timeSinceChange = Date.now() - latestStatus.createdAt.getTime();
                    const hoursAgo = timeSinceChange / (1000 * 60 * 60);

                    console.log(`⚠️ User ${member.user.tag} marked on-duty in database but missing role (${Math.round(hoursAgo)}h ago)`);
                    
                    // Log this discrepancy
                    await DutyStatusChange.create({
                        discordUserId: userId,
                        discordUsername: member.user.username,
                        status: false,
                        previousStatus: true,
                        source: 'startup_sync',
                        reason: `Role missing: user marked on-duty in database but doesn't have Discord role`,
                        guildId: guild.id,
                        metadata: {
                            syncType: 'missing_role',
                            previousChangeId: latestStatus.id,
                            hoursAgo: hoursAgo,
                            requiresManualReview: true
                        },
                        success: true
                    });

                    syncResults.discrepanciesFound++;
                } catch (error) {
                    console.error(`❌ Failed to check user ${userId}:`, error);
                }
            }
        }
    }

    // Utility method to get current duty status from database
    async getCurrentDutyStatus(userId, guildId) {
        const latestChange = await DutyStatusChange.findOne({
            where: {
                discordUserId: userId,
                guildId: guildId
            },
            order: [['createdAt', 'DESC']]
        });

        return latestChange ? latestChange.status : false;
    }

    // Method to force sync a specific user
    async syncUserDutyStatus(member) {
        const hasRole = member.roles.cache.has(this.onDutyRoleId);
        const dbStatus = await this.getCurrentDutyStatus(member.user.id, member.guild.id);

        if (hasRole !== dbStatus) {
            console.log(`🔄 Syncing ${member.user.tag}: Discord=${hasRole}, DB=${dbStatus}`);
            
            const result = await this.dutyFactory._handleDutyStatusChange(null, hasRole, {
                member,
                source: 'manual_sync',
                reason: 'Manual sync requested',
                skipNotification: false
            });

            return result;
        }

        return { success: true, message: 'Already in sync' };
    }
}

module.exports = DutyStatusSyncService;