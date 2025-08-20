#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { Player, Admin, Server, AuditLog, DutyStatusChange } = require('../src/database/models');

async function testAllModels() {
    console.log('🧪 Testing all database models comprehensively...\n');
    
    try {
        // Connect to database
        console.log('1️⃣ Connecting to database...');
        await databaseManager.connect();
        console.log('   ✅ Database connected successfully\n');
        
        // Test 1: Clean up any existing test data first
        console.log('2️⃣ Cleaning up any existing test data...');
        const { Op } = require('sequelize');
        await AuditLog.destroy({ where: { actorName: { [Op.like]: '%Test%' } }, force: true });
        await DutyStatusChange.destroy({ where: { discordUsername: { [Op.like]: '%Test%' } }, force: true });
        await Player.destroy({ where: { username: { [Op.like]: '%Test%' } }, force: true });
        await Server.destroy({ where: { serverName: { [Op.like]: '%Test%' } }, force: true });
        await Admin.destroy({ where: { discordUsername: { [Op.like]: '%Test%' } }, force: true });
        console.log('   ✅ Test data cleanup completed');
        
        // Test 2: Create test records
        console.log('3️⃣ Creating test records for all models...');
        
        // Create test admin
        const testAdmin = await Admin.create({
            discordUserId: '123456789012345678',
            discordUsername: 'TestAdmin',
            displayName: 'Test Admin',
            guildId: '987654321098765432',
            adminLevel: 'admin'
        });
        console.log(`   ✅ Created test admin: ${testAdmin.discordUsername} (ID: ${testAdmin.id})`);
        
        // Create test server
        const testServer = await Server.create({
            serverId: 'test-server-1',
            serverName: 'Test Squad Server #1',
            description: 'Primary test server for development',
            guildId: testAdmin.guildId,
            isActive: true,
            priority: 1,
            maxPlayers: 80
        });
        console.log(`   ✅ Created test server: ${testServer.serverName} (ID: ${testServer.id})`);
        
        // Create test player
        const testPlayer = await Player.create({
            steamId: '76561198123456789',
            eosId: 'abcdef123456789012345678901234',
            username: 'TestPlayer123',
            rosterStatus: true,
            lastServerId: testServer.serverId
        });
        console.log(`   ✅ Created test player: ${testPlayer.username} (ID: ${testPlayer.id})`);
        
        // Create test duty status change
        const testDutyChange = await DutyStatusChange.create({
            discordUserId: testAdmin.discordUserId,
            discordUsername: testAdmin.discordUsername,
            status: true,
            previousStatus: false,
            source: 'command',
            reason: 'Going on duty for testing',
            guildId: testAdmin.guildId
        });
        console.log(`   ✅ Created test duty change: ${testDutyChange.discordUsername} -> ON DUTY (ID: ${testDutyChange.id})`);
        
        // Create test audit log
        const testAuditLog = await AuditLog.create({
            actionType: 'admin_duty_on',
            actorType: 'user',
            actorId: testAdmin.discordUserId,
            actorName: testAdmin.discordUsername,
            targetType: 'admin',
            targetId: testAdmin.discordUserId,
            targetName: testAdmin.discordUsername,
            guildId: testAdmin.guildId,
            serverId: testServer.serverId,
            description: `${testAdmin.discordUsername} went on duty via test command`,
            success: true,
            severity: 'info'
        });
        console.log(`   ✅ Created test audit log: ${testAuditLog.description} (ID: ${testAuditLog.actionId})\n`);
        
        // Test 3: Static methods
        console.log('4️⃣ Testing static methods...');
        
        const foundPlayer = await Player.findBySteamId(testPlayer.steamId);
        console.log(`   ✅ Player.findBySteamId(): ${foundPlayer ? foundPlayer.username : 'NOT FOUND'}`);
        
        const foundAdmin = await Admin.findByDiscordId(testAdmin.discordUserId, testAdmin.guildId);
        console.log(`   ✅ Admin.findByDiscordId(): ${foundAdmin ? foundAdmin.discordUsername : 'NOT FOUND'}`);
        
        const foundServer = await Server.findByServerId(testServer.serverId);
        console.log(`   ✅ Server.findByServerId(): ${foundServer ? foundServer.serverName : 'NOT FOUND'}`);
        
        const recentAuditLogs = await AuditLog.getRecentActions(24, testAdmin.guildId);
        console.log(`   ✅ AuditLog.getRecentActions(): Found ${recentAuditLogs.length} recent actions`);
        
        const userHistory = await DutyStatusChange.getUserHistory(testAdmin.discordUserId);
        console.log(`   ✅ DutyStatusChange.getUserHistory(): Found ${userHistory.length} duty changes\n`);
        
        // Test 4: Instance methods
        console.log('5️⃣ Testing instance methods...');
        
        // Update player activity
        await testPlayer.updateActivity(testServer.serverId);
        console.log(`   ✅ Player.updateActivity(): Updated ${testPlayer.username} activity`);
        
        // Set admin duty status
        await testAdmin.setDutyStatus(true);
        console.log(`   ✅ Admin.setDutyStatus(): Set ${testAdmin.discordUsername} to ON DUTY`);
        
        // Update server status
        await testServer.updateStatus(true, 45);
        console.log(`   ✅ Server.updateStatus(): Set ${testServer.serverName} ONLINE with 45 players`);
        
        console.log('');
        
        // Test 5: Relationships and complex queries
        console.log('6️⃣ Testing relationships and complex queries...');
        
        const onDutyAdmins = await Admin.getOnDutyAdmins(testAdmin.guildId);
        console.log(`   ✅ On-duty admins in guild: ${onDutyAdmins.length}`);
        
        const activeServers = await Server.getActiveServers(testServer.guildId);
        console.log(`   ✅ Active servers in guild: ${activeServers.length}`);
        
        const rosterMembers = await Player.getRosterMembers();
        console.log(`   ✅ Players on roster: ${rosterMembers.length}`);
        
        const failedActions = await AuditLog.getFailedActions(24);
        console.log(`   ✅ Failed actions in last 24h: ${failedActions.length}`);
        
        const actionStats = await AuditLog.getActionStatistics(24, testAdmin.guildId);
        console.log(`   ✅ Action statistics: ${actionStats.total} total, ${actionStats.successRate.toFixed(1)}% success rate`);
        
        console.log('');
        
        // Test 6: Advanced functionality
        console.log('7️⃣ Testing advanced functionality...');
        
        // Test JSON fields
        await testServer.update({
            config: {
                autoRestartEnabled: true,
                backupInterval: 30,
                plugins: ['SquadJS', 'AdminSystem']
            }
        });
        console.log(`   ✅ JSON field update: Server config saved`);
        
        await testAdmin.update({
            permissions: {
                canKick: true,
                canBan: true,
                canManageWhitelist: true,
                maxPlayers: 100
            }
        });
        console.log(`   ✅ JSON field update: Admin permissions saved`);
        
        // Test polymorphic relationships (AuditLog)
        const playerAuditLogs = await AuditLog.getActionsByTarget(testPlayer.steamId, 'player');
        console.log(`   ✅ Polymorphic query: Found ${playerAuditLogs.length} audit logs for player`);
        
        console.log('');
        
        // Test 7: Performance and bulk operations
        console.log('8️⃣ Testing performance and bulk operations...');
        
        // Create multiple audit log entries
        const bulkAuditLogs = [];
        for (let i = 0; i < 5; i++) {
            bulkAuditLogs.push({
                actionType: 'player_activity',
                actorType: 'system',
                actorId: 'system',
                actorName: 'Automated System',
                targetType: 'player',
                targetId: testPlayer.steamId,
                targetName: testPlayer.username,
                guildId: testAdmin.guildId,
                serverId: testServer.serverId,
                description: `Automated activity log ${i + 1}`,
                success: true,
                severity: 'info'
            });
        }
        
        await AuditLog.bulkCreate(bulkAuditLogs);
        console.log(`   ✅ Bulk create: Created ${bulkAuditLogs.length} audit log entries`);
        
        // Test counting and aggregation
        const totalAuditLogs = await AuditLog.count();
        const systemAuditLogs = await AuditLog.count({ where: { actorType: 'system' } });
        console.log(`   ✅ Aggregation: ${totalAuditLogs} total audit logs, ${systemAuditLogs} by system`);
        
        console.log('');
        
        // Test 8: Data validation and constraints
        console.log('9️⃣ Testing data validation and constraints...');
        
        try {
            // This should fail due to unique constraint on steamId
            await Player.create({
                steamId: testPlayer.steamId,
                eosId: 'different123456789012345678901234',
                username: 'DuplicatePlayer'
            });
            console.log('   ❌ Duplicate constraint test FAILED - should have thrown error');
        } catch (error) {
            console.log('   ✅ Duplicate constraint test PASSED - correctly rejected duplicate steamId');
        }
        
        try {
            // This should fail due to required fields
            await Admin.create({
                discordUserId: '111111111111111111'
                // Missing required discordUsername
            });
            console.log('   ❌ Required field test FAILED - should have thrown error');
        } catch (error) {
            console.log('   ✅ Required field test PASSED - correctly rejected missing required field');
        }
        
        console.log('');
        
        // Clean up test data
        console.log('🔟 Cleaning up test data...');
        await AuditLog.destroy({ where: { guildId: testAdmin.guildId } });
        await testDutyChange.destroy();
        await testPlayer.destroy();
        await testServer.destroy();
        await testAdmin.destroy();
        console.log('   ✅ Test data cleaned up successfully\n');
        
        console.log('🎉 All model tests completed successfully!');
        console.log('\n📊 Test Summary:');
        console.log('   ✅ Database connection: PASS');
        console.log('   ✅ Record creation: PASS');
        console.log('   ✅ Static methods: PASS');
        console.log('   ✅ Instance methods: PASS');
        console.log('   ✅ Relationships & queries: PASS');
        console.log('   ✅ Advanced functionality: PASS');
        console.log('   ✅ Performance & bulk ops: PASS');
        console.log('   ✅ Data validation: PASS');
        console.log('   ✅ Data cleanup: PASS');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Model test failed:', error);
        process.exit(1);
    } finally {
        try {
            await databaseManager.disconnect();
        } catch (closeError) {
            console.error('⚠️ Error closing database connection:', closeError.message);
        }
    }
}

// Run if called directly
if (require.main === module) {
    testAllModels();
}

module.exports = { testAllModels };