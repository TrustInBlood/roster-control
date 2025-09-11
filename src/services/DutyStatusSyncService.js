const { ON_DUTY_ROLE_ID } = require('../../config/discord');
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
      console.log(`🔍 Looking for on-duty role ID: ${this.onDutyRoleId}`);
      console.log(`📊 Guild has ${guild.roles.cache.size} roles total`);
            
      // Debug: List first few roles in the guild
      const allRoles = Array.from(guild.roles.cache.values()).slice(0, 10);
      console.log('🎭 First 10 roles in guild:', allRoles.map(r => `${r.name} (${r.id})`));
            
      const onDutyRole = guild.roles.cache.get(this.onDutyRoleId);
      if (!onDutyRole) {
        console.warn('⚠️ On-duty role not found in guild:', guild.name);
        console.warn('🔍 Role ID being searched:', this.onDutyRoleId);
        console.warn('🎭 Available role IDs:', Array.from(guild.roles.cache.keys()).slice(0, 10));
        return syncResults;
      }

      console.log(`✅ Found on-duty role: ${onDutyRole.name} (${onDutyRole.id})`);
      console.log(`🏷️ Role color: ${onDutyRole.hexColor}, position: ${onDutyRole.position}, mentionable: ${onDutyRole.mentionable}`);

      // Get all members who currently have the on-duty role in Discord
      let discordRoleHolders = onDutyRole.members;
      syncResults.discordRoleHolders = discordRoleHolders.size;
      console.log(`👥 Found ${discordRoleHolders.size} members with on-duty role in Discord`);
            
      // Debug: List the members if any
      if (discordRoleHolders.size > 0) {
        console.log('📋 Members with on-duty role:');
        discordRoleHolders.forEach(member => {
          console.log(`  - ${member.user.tag} (${member.user.id})`);
        });
      } else {
        console.log('🔍 No members found with the on-duty role - checking if role exists and has members');
        // Check if we can fetch all members of the guild (might be a cache issue)
        console.log(`👥 Total guild members cached: ${guild.members.cache.size}`);
                
        // Try to fetch guild members if cache is empty or small
        if (guild.members.cache.size < 10) {
          console.log('🔄 Member cache seems incomplete, attempting to fetch members...');
          try {
            await guild.members.fetch();
            console.log(`👥 After fetch: ${guild.members.cache.size} members cached`);
                        
            // Re-check the role members after fetching
            const updatedRoleHolders = onDutyRole.members;
            console.log(`👥 After member fetch: Found ${updatedRoleHolders.size} members with on-duty role`);
                        
            if (updatedRoleHolders.size > 0) {
              console.log('📋 Members with on-duty role (after fetch):');
              updatedRoleHolders.forEach(member => {
                console.log(`  - ${member.user.tag} (${member.user.id})`);
              });
                            
              // Update the results with the correct count
              syncResults.discordRoleHolders = updatedRoleHolders.size;
              // Update the variable for the processing loop
              discordRoleHolders = updatedRoleHolders;
            }
                        
          } catch (fetchError) {
            console.error('❌ Failed to fetch guild members:', fetchError.message);
          }
        }
      }

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
      // First check if any database record already exists for this user
      console.log(`🔍 Checking for existing database records for ${member.user.tag}`);
            
      const existingRecord = await DutyStatusChange.findOne({
        where: {
          discordUserId: member.user.id,
          guildId: member.guild.id
        },
        order: [['createdAt', 'DESC']]
      });

      if (existingRecord) {
        console.log(`📋 Found existing record for ${member.user.tag}: ${existingRecord.status ? 'ON' : 'OFF'} duty (${existingRecord.createdAt})`);
        syncResults.databaseRecordsFound++;
                
        // Check if the existing record matches current Discord state
        if (existingRecord.status === true) {
          console.log(`✅ ${member.user.tag} database record matches Discord role (both ON duty)`);
        } else {
          console.log(`⚠️ ${member.user.tag} has role but database shows OFF duty - will handle as discrepancy`);
        }
        return; // Don't create a new record
      }

      // No existing record found, create one
      console.log(`📝 No database record found for ${member.user.tag} - creating missing record`);
            
      const changeRecord = await DutyStatusChange.create({
        discordUserId: member.user.id,
        discordUsername: member.user.username,
        status: true, // They have the role, so they're on duty
        previousStatus: false, // No previous record, assume false
        source: 'startup_sync',
        reason: 'User had on-duty role at bot startup - creating missing database record',
        guildId: member.guild.id,
        metadata: {
          syncType: 'missing_record',
          botStartup: true,
          userTag: member.user.tag,
          userDisplayName: member.displayName,
          roleAlreadyPresent: true,
          syncTimestamp: new Date().toISOString()
        },
        success: true
      });

      syncResults.recordsCreated++;
      console.log(`✅ Created database record for ${member.user.tag} (ID: ${changeRecord.id})`);
            
    } catch (error) {
      console.error(`❌ Failed to process database record for ${member.user.tag}:`, error);
      syncResults.errors.push(`${member.user.tag}: Failed to process database record - ${error.message}`);
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
            reason: 'Role missing: user marked on-duty in database but doesn\'t have Discord role',
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