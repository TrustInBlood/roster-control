#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { migrationManager } = require('../src/database/migrator');
const { Player, Admin, Server, AuditLog, DutyStatusChange } = require('../src/database/models');

async function testDatabaseSetup() {
  console.log('🧪 Starting comprehensive database setup test...\n');
    
  try {
    // Test 1: Database connection
    console.log('1️⃣ Testing database connection...');
    const connected = await databaseManager.connect();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    console.log('   ✅ Database connected successfully\n');
        
    // Test 2: Migration system
    console.log('2️⃣ Testing migration system...');
    const migrationStatus = await migrationManager.getStatus();
    console.log(`   📊 Found ${migrationStatus.total} total migrations`);
    console.log(`   📊 Executed: ${migrationStatus.executed.length}, Pending: ${migrationStatus.pending.length}`);
        
    if (migrationStatus.pending.length > 0) {
      console.log('   🔄 Running pending migrations...');
      const result = await migrationManager.runMigrations();
      console.log(`   ✅ Applied ${result.migrationsRun} migrations`);
    } else {
      console.log('   ✅ All migrations are up to date');
    }
    console.log('');
        
    // Test 3: Table verification
    console.log('3️⃣ Verifying database tables...');
    const sequelize = databaseManager.getSequelize();
    const tables = await sequelize.getQueryInterface().showAllTables();
    const expectedTables = ['players', 'duty_status_changes', 'admins', 'servers', 'audit_logs', 'schema_migrations'];
        
    console.log(`   📋 Found tables: ${tables.join(', ')}`);
        
    const missingTables = expectedTables.filter(table => !tables.includes(table));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }
    console.log('   ✅ All expected tables exist\n');
        
    // Test 4: Model operations
    console.log('4️⃣ Testing model operations...');
        
    // Test Player model
    console.log('   👤 Testing Player model...');
    const testPlayer = await Player.create({
      steamId: 'test_steam_123456789',
      eosId: 'test_eos_abcdef123456789012345678901234',
      username: 'TestPlayer',
      rosterStatus: true
    });
    console.log(`   ✅ Created test player: ${testPlayer.username} (ID: ${testPlayer.id})`);
        
    // Test Admin model
    console.log('   👮 Testing Admin model...');
    const testAdmin = await Admin.create({
      discordUserId: '123456789012345678',
      discordUsername: 'TestAdmin',
      guildId: '987654321098765432',
      adminLevel: 'admin'
    });
    console.log(`   ✅ Created test admin: ${testAdmin.discordUsername} (ID: ${testAdmin.id})`);
        
    // Test Server model
    console.log('   🖥️ Testing Server model...');
    const testServer = await Server.create({
      serverId: 'test-server-1',
      serverName: 'Test Squad Server',
      guildId: '987654321098765432',
      isActive: true
    });
    console.log(`   ✅ Created test server: ${testServer.serverName} (ID: ${testServer.id})`);
        
    // Test DutyStatusChange model
    console.log('   📝 Testing DutyStatusChange model...');
    const testDutyChange = await DutyStatusChange.create({
      discordUserId: testAdmin.discordUserId,
      discordUsername: testAdmin.discordUsername,
      status: true,
      previousStatus: false,
      source: 'command',
      guildId: testAdmin.guildId
    });
    console.log(`   ✅ Created test duty change: ${testDutyChange.discordUsername} -> ${testDutyChange.status} (ID: ${testDutyChange.id})`);
        
    // Test AuditLog model
    console.log('   📋 Testing AuditLog model...');
    const testAuditLog = await AuditLog.create({
      actionType: 'admin_duty_on',
      actorType: 'user',
      actorId: testAdmin.discordUserId,
      actorName: testAdmin.discordUsername,
      targetType: 'admin',
      targetId: testAdmin.discordUserId,
      targetName: testAdmin.discordUsername,
      guildId: testAdmin.guildId,
      description: 'Admin went on duty via test',
      success: true
    });
    console.log(`   ✅ Created test audit log: ${testAuditLog.description} (ID: ${testAuditLog.actionId})`);
        
    console.log('');
        
    // Test 5: Model relationships and queries
    console.log('5️⃣ Testing model relationships and queries...');
        
    // Test static methods
    const foundPlayer = await Player.findBySteamId(testPlayer.steamId);
    console.log(`   ✅ Found player by Steam ID: ${foundPlayer ? foundPlayer.username : 'Not found'}`);
        
    const onDutyAdmins = await Admin.getOnDutyAdmins(testAdmin.guildId);
    console.log(`   ✅ Found ${onDutyAdmins.length} on-duty admins`);
        
    const activeServers = await Server.getActiveServers(testServer.guildId);
    console.log(`   ✅ Found ${activeServers.length} active servers`);
        
    const recentAuditLogs = await AuditLog.getRecentActions(24, testAdmin.guildId);
    console.log(`   ✅ Found ${recentAuditLogs.length} recent audit logs`);
        
    // Test instance methods
    await testPlayer.updateActivity(testServer.serverId);
    console.log(`   ✅ Updated player activity for server: ${testServer.serverId}`);
        
    await testAdmin.setDutyStatus(false);
    console.log(`   ✅ Changed admin duty status to: ${testAdmin.isOnDuty}`);
        
    await testServer.updateStatus(true, 25);
    console.log(`   ✅ Updated server status: online=${testServer.isOnline}, players=${testServer.currentPlayers}`);
        
    console.log('');
        
    // Test 6: Cleanup test data
    console.log('6️⃣ Cleaning up test data...');
    await testAuditLog.destroy();
    await testDutyChange.destroy();
    await testServer.destroy();
    await testAdmin.destroy();
    await testPlayer.destroy();
    console.log('   ✅ Test data cleaned up successfully\n');
        
    // Test 7: Final health check
    console.log('7️⃣ Final health check...');
    const isHealthy = await databaseManager.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('   ✅ Database is healthy\n');
        
    console.log('🎉 All database tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Database connection: PASS');
    console.log('   ✅ Migration system: PASS');
    console.log('   ✅ Table verification: PASS');
    console.log('   ✅ Model operations: PASS');
    console.log('   ✅ Relationships & queries: PASS');
    console.log('   ✅ Data cleanup: PASS');
    console.log('   ✅ Health check: PASS');
        
    process.exit(0);
        
  } catch (error) {
    console.error('\n❌ Database test failed:', error);
        
    // Try to get migration status for debugging
    try {
      const status = await migrationManager.getStatus();
      console.error('\n📋 Migration status at failure:', {
        executed: status.executed,
        pending: status.pending,
        total: status.total
      });
    } catch (statusError) {
      console.error('❌ Could not retrieve migration status:', statusError.message);
    }
        
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await databaseManager.disconnect();
    } catch (closeError) {
      console.error('⚠️ Error closing database connection:', closeError.message);
    }
  }
}

// Run if called directly
if (require.main === module) {
  testDatabaseSetup();
}

module.exports = { testDatabaseSetup };