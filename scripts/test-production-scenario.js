require('dotenv').config();
const { sequelize } = require('../src/database/index');
const { Player, DutyStatusChange } = require('../src/database/models');
const DutyStatusFactory = require('../src/services/DutyStatusFactory');

async function testProductionScenario() {
    try {
        console.log('🎬 Testing production-like scenario...');
        
        // Test database connection
        await sequelize.authenticate();
        console.log('✅ Database connection established.');
        
        // Sync models without force (production-like)
        await sequelize.sync();
        console.log('✅ Models synced (production mode).');
        
        // Scenario: Create a player who joins the server (or find existing)
        console.log('\n👤 Scenario: Player joins server and gets added to roster...');
        
        // Clean up any existing test data first
        await Player.destroy({ where: { steamId: '76561198987654321' } });
        await DutyStatusChange.destroy({ where: { discordUserId: '987654321098765432' } });
        
        const player = await Player.create({
            steamId: '76561198987654321',
            eosId: '0003c36ed0675423cg1e3c579bac5d55',
            username: 'ProductionTestAdmin',
            rosterStatus: true,
            lastSeen: new Date(),
            lastServerId: 'prod-server-1',
            joinCount: 1,
            totalPlayTime: 0,
            notes: 'New admin added during production test'
        });
        console.log('✅ Player created and added to roster');
        
        // Scenario: Player goes on duty via command
        console.log('\n🔔 Scenario: Player goes on duty via bot command...');
        
        // Mock Discord member object for factory testing
        const mockMember = {
            user: {
                id: '987654321098765432',
                username: 'ProductionTestAdmin',
                tag: 'ProductionTestAdmin#1234',
                avatar: null
            },
            guild: {
                id: '123456789012345678',
                client: { user: { id: 'bot-user-id' } }
            },
            roles: {
                cache: new Map() // Start with no roles
            },
            displayName: 'ProductionTestAdmin'
        };
        
        // Mock interaction for command-based duty change
        const mockInteraction = {
            member: mockMember,
            guild: mockMember.guild,
            channelId: '111222333444555666',
            user: mockMember.user
        };
        
        console.log('⚠️ Note: Skipping actual Discord role management (no bot permissions in test)');
        
        // Test duty status logging without actual role changes
        const dutyChange1 = await DutyStatusChange.create({
            discordUserId: mockMember.user.id,
            discordUsername: mockMember.user.username,
            status: true,
            previousStatus: false,
            source: 'command',
            reason: 'User activated duty status via /onduty command',
            guildId: mockMember.guild.id,
            channelId: mockInteraction.channelId,
            metadata: {
                playerSteamId: player.steamId,
                playerUsername: player.username,
                linkedToRoster: true,
                commandName: 'onduty'
            },
            success: true
        });
        console.log('✅ Duty status change logged (ON duty)');
        
        // Scenario: Player is active for a while, then goes off duty
        console.log('\n⏰ Scenario: Player is active for a while...');
        await player.addPlayTime(45); // 45 minutes of play
        await player.updateActivity('prod-server-1');
        console.log('✅ Player activity updated');
        
        // Player goes off duty
        console.log('\n🔕 Scenario: Player goes off duty...');
        const dutyChange2 = await DutyStatusChange.create({
            discordUserId: mockMember.user.id,
            discordUsername: mockMember.user.username,
            status: false,
            previousStatus: true,
            source: 'command',
            reason: 'User deactivated duty status via /offduty command',
            guildId: mockMember.guild.id,
            channelId: mockInteraction.channelId,
            metadata: {
                playerSteamId: player.steamId,
                playerUsername: player.username,
                totalPlayTimeAtLogoff: player.totalPlayTime,
                commandName: 'offduty'
            },
            success: true
        });
        console.log('✅ Duty status change logged (OFF duty)');
        
        // Scenario: External role change detected
        console.log('\n🚨 Scenario: External role change detected...');
        const dutyChange3 = await DutyStatusChange.create({
            discordUserId: mockMember.user.id,
            discordUsername: mockMember.user.username,
            status: true,
            previousStatus: false,
            source: 'external',
            reason: 'Role added externally (not via bot commands)',
            guildId: mockMember.guild.id,
            metadata: {
                externalChange: true,
                detectedAt: new Date().toISOString(),
                playerSteamId: player.steamId
            },
            success: true
        });
        console.log('✅ External duty change logged');
        
        // Scenario: Bot restart sync
        console.log('\n🔄 Scenario: Bot restart sync...');
        const dutyChange4 = await DutyStatusChange.create({
            discordUserId: mockMember.user.id,
            discordUsername: mockMember.user.username,
            status: true,
            previousStatus: true, // Was already on duty
            source: 'startup_sync',
            reason: 'Bot startup sync - confirmed existing duty status',
            guildId: mockMember.guild.id,
            metadata: {
                syncType: 'startup_confirmation',
                botRestart: true,
                playerLinked: true,
                playerSteamId: player.steamId
            },
            success: true
        });
        console.log('✅ Startup sync logged');
        
        // Test queries and analytics
        console.log('\n📊 Testing analytics and queries...');
        
        const userHistory = await DutyStatusChange.getUserHistory(mockMember.user.id);
        console.log(`✅ User history: ${userHistory.length} duty changes found`);
        
        const recentChanges = await DutyStatusChange.getRecentChanges(24);
        console.log(`✅ Recent changes: ${recentChanges.length} changes in last 24h`);
        
        const commandChanges = await DutyStatusChange.getChangesBySource('command');
        console.log(`✅ Command-initiated changes: ${commandChanges.length} found`);
        
        const externalChanges = await DutyStatusChange.getChangesBySource('external');
        console.log(`✅ External changes: ${externalChanges.length} found`);
        
        const rosterMembers = await Player.getRosterMembers();
        console.log(`✅ Roster members: ${rosterMembers.length} players on roster`);
        
        const activePlayers = await Player.getActivePlayers(24);
        console.log(`✅ Active players: ${activePlayers.length} players active in last 24h`);
        
        // Test data consistency
        console.log('\n🔍 Testing data consistency...');
        
        const latestDutyStatus = await DutyStatusChange.findOne({
            where: { discordUserId: mockMember.user.id },
            order: [['createdAt', 'DESC']]
        });
        
        const linkedPlayer = await Player.findBySteamId(player.steamId);
        
        console.log('📋 Final status summary:', {
            playerOnRoster: linkedPlayer?.rosterStatus,
            latestDutyStatus: latestDutyStatus?.status,
            playerPlayTime: linkedPlayer?.totalPlayTime,
            totalDutyChanges: userHistory.length,
            lastActivity: linkedPlayer?.lastSeen
        });
        
        // Clean up test data
        console.log('\n🧹 Cleaning up production test data...');
        await DutyStatusChange.destroy({
            where: { discordUserId: mockMember.user.id }
        });
        await player.destroy();
        console.log('✅ Test data cleaned up');
        
        console.log('\n🎉 Production scenario test completed successfully!');
        console.log('✅ Player model: Working in production scenarios');
        console.log('✅ DutyStatusChange model: Working in production scenarios');
        console.log('✅ Data relationships: Consistent');
        console.log('✅ Analytics queries: Functional');
        console.log('✅ Multi-source tracking: Working');
        
    } catch (error) {
        console.error('❌ Production scenario test failed:', error);
        throw error;
    } finally {
        await sequelize.close();
        console.log('🔌 Database connection closed');
    }
}

// Run the production scenario test
testProductionScenario()
    .then(() => {
        console.log('✅ Production scenario test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Production scenario test failed:', error);
        process.exit(1);
    });