require('dotenv').config();
const { sequelize } = require('../src/database/index');
const { Player, DutyStatusChange } = require('../src/database/models');

async function testAllModels() {
    try {
        console.log('🔌 Testing all database models...');
        
        // Test database connection
        await sequelize.authenticate();
        console.log('✅ Database connection established.');
        
        // Sync all models (force recreate to handle ENUM changes)
        await sequelize.sync({ force: true });
        console.log('✅ All models synced with database (force recreated for ENUM updates).');
        
        // Test Player model
        console.log('\n📋 Testing Player model...');
        const testPlayer = await Player.create({
            steamId: '76561198123456789',
            eosId: '0002b25dc9564312bf0d2b468a9b4c44',
            username: 'TestPlayer',
            rosterStatus: true,
            lastSeen: new Date(),
            lastServerId: 'server-001',
            joinCount: 5,
            totalPlayTime: 120,
            notes: 'Test player for model verification'
        });
        
        console.log('✅ Player record created:', {
            id: testPlayer.id,
            steamId: testPlayer.steamId,
            username: testPlayer.username,
            rosterStatus: testPlayer.rosterStatus
        });
        
        // Test Player static methods
        const foundPlayer = await Player.findBySteamId('76561198123456789');
        console.log('✅ Player.findBySteamId works');
        
        const foundByEos = await Player.findByEosId('0002b25dc9564312bf0d2b468a9b4c44');
        console.log('✅ Player.findByEosId works');
        
        const rosterMembers = await Player.getRosterMembers();
        console.log('✅ Player.getRosterMembers works, found', rosterMembers.length, 'members');
        
        // Test Player instance methods
        await testPlayer.updateActivity('server-002');
        console.log('✅ Player.updateActivity works');
        
        await testPlayer.addPlayTime(30);
        console.log('✅ Player.addPlayTime works');
        
        // Test DutyStatusChange model
        console.log('\n📝 Testing DutyStatusChange model...');
        const testDutyChange = await DutyStatusChange.create({
            discordUserId: '123456789012345678',
            discordUsername: 'TestUser',
            status: true,
            previousStatus: false,
            source: 'command',
            reason: 'Testing both models together',
            guildId: '987654321098765432',
            channelId: '111222333444555666',
            metadata: {
                test: true,
                playerSteamId: testPlayer.steamId,
                linkedToPlayer: true
            },
            success: true
        });
        
        console.log('✅ DutyStatusChange record created:', {
            id: testDutyChange.id,
            discordUsername: testDutyChange.discordUsername,
            status: testDutyChange.status,
            source: testDutyChange.source
        });
        
        // Test DutyStatusChange static methods
        const userHistory = await DutyStatusChange.getUserHistory('123456789012345678');
        console.log('✅ DutyStatusChange.getUserHistory works, found', userHistory.length, 'records');
        
        const recentChanges = await DutyStatusChange.getRecentChanges(24);
        console.log('✅ DutyStatusChange.getRecentChanges works, found', recentChanges.length, 'records');
        
        const changesBySource = await DutyStatusChange.getChangesBySource('command');
        console.log('✅ DutyStatusChange.getChangesBySource works, found', changesBySource.length, 'records');
        
        // Test model relationships/integration
        console.log('\n🔗 Testing model integration...');
        
        // Create another duty change for the same "user"
        const testDutyChange2 = await DutyStatusChange.create({
            discordUserId: '123456789012345678',
            discordUsername: 'TestUser',
            status: false,
            previousStatus: true,
            source: 'external',
            reason: 'Testing model integration',
            guildId: '987654321098765432',
            metadata: {
                linkedToPlayer: testPlayer.id,
                playerUsername: testPlayer.username
            },
            success: true
        });
        
        console.log('✅ Second duty change created for integration test');
        
        // Test complex queries
        const allRecordsCount = await DutyStatusChange.count();
        const playerCount = await Player.count();
        
        console.log('📊 Database summary:', {
            totalPlayers: playerCount,
            totalDutyChanges: allRecordsCount,
            testRecordsCreated: 2
        });
        
        // Test database transactions
        console.log('\n💾 Testing database transactions...');
        const transaction = await sequelize.transaction();
        
        try {
            const transactionPlayer = await Player.create({
                steamId: '76561198999999999',
                eosId: '0002b25dc9564312bf0d2b468a9b4c99',
                username: 'TransactionTest',
                rosterStatus: false
            }, { transaction });
            
            const transactionDuty = await DutyStatusChange.create({
                discordUserId: '999999999999999999',
                discordUsername: 'TransactionTest',
                status: true,
                previousStatus: false,
                source: 'manual',
                reason: 'Transaction test',
                guildId: '987654321098765432',
                metadata: {
                    transactionTest: true,
                    playerId: transactionPlayer.id
                },
                success: true
            }, { transaction });
            
            await transaction.commit();
            console.log('✅ Transaction test successful');
            
            // Clean up transaction test records
            await transactionPlayer.destroy();
            await transactionDuty.destroy();
            console.log('✅ Transaction test records cleaned up');
            
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
        
        // Clean up test records
        console.log('\n🧹 Cleaning up test records...');
        await testPlayer.destroy();
        await testDutyChange.destroy();
        await testDutyChange2.destroy();
        console.log('✅ Test records cleaned up');
        
        console.log('\n🎉 All model tests completed successfully!');
        console.log('📋 Player model: ✅ Working');
        console.log('📝 DutyStatusChange model: ✅ Working');
        console.log('🔗 Model integration: ✅ Working');
        console.log('💾 Database transactions: ✅ Working');
        
    } catch (error) {
        console.error('❌ Model test failed:', error);
        throw error;
    } finally {
        await sequelize.close();
        console.log('🔌 Database connection closed');
    }
}

// Run the comprehensive test
testAllModels()
    .then(() => {
        console.log('✅ All model tests completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Model tests failed:', error);
        process.exit(1);
    });