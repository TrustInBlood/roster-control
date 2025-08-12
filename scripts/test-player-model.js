#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { Player } = require('../src/database/models');

async function testPlayerModel() {
  console.log('🧪 Testing Player model...');
  
  try {
    // Connect to database
    const connected = await databaseManager.connect();
    if (!connected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    
    console.log('✅ Database connected successfully');
    
    // Sync the Player model (this will create the table)
    console.log('🔄 Syncing Player model to database...');
    await Player.sync({ force: false }); // force: false means don't drop existing table
    
    console.log('✅ Player model synced successfully');
    
    // Test creating a sample player
    console.log('👤 Testing player creation...');
    const testPlayer = await Player.create({
      steamId: '76561198012345678',
      eosId: 'EOS_1234567890abcdef1234567890abcdef',
      username: 'TestPlayer',
      rosterStatus: true,
      notes: 'Test player for model validation'
    });
    
    console.log('✅ Test player created successfully:', {
      id: testPlayer.id,
      steamId: testPlayer.steamId,
      eosId: testPlayer.eosId,
      username: testPlayer.username,
      rosterStatus: testPlayer.rosterStatus,
      createdAt: testPlayer.createdAt
    });
    
    // Test finding the player by Steam ID
    console.log('🔍 Testing player retrieval by Steam ID...');
    const foundPlayerBySteam = await Player.findOne({ where: { steamId: '76561198012345678' } });
    
    if (foundPlayerBySteam) {
      console.log('✅ Player found by Steam ID:', foundPlayerBySteam.username);
    } else {
      console.log('❌ Failed to retrieve player by Steam ID');
    }
    
    // Test finding the player by EOS ID
    console.log('🔍 Testing player retrieval by EOS ID...');
    const foundPlayerByEos = await Player.findOne({ where: { eosId: 'EOS_1234567890abcdef1234567890abcdef' } });
    
    if (foundPlayerByEos) {
      console.log('✅ Player found by EOS ID:', foundPlayerByEos.username);
    } else {
      console.log('❌ Failed to retrieve player by EOS ID');
    }
    
    // Test finding the player by primary key
    console.log('🔍 Testing player retrieval by primary key...');
    const foundPlayer = await Player.findByPk(testPlayer.id);
    
    if (foundPlayer) {
      console.log('✅ Player retrieved successfully:', foundPlayer.username);
    } else {
      console.log('❌ Failed to retrieve player');
    }
    
    // Test updating the player
    console.log('✏️ Testing player update...');
    await testPlayer.update({
      username: 'UpdatedTestPlayer',
      notes: 'Updated test notes'
    });
    
    console.log('✅ Player updated successfully');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await testPlayer.destroy();
    console.log('✅ Test data cleaned up');
    
    console.log('🎉 All Player model tests passed!');
    
  } catch (error) {
    console.error('💥 Error testing Player model:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await databaseManager.disconnect();
    console.log('🔌 Test completed.');
  }
}

// Run the test
testPlayerModel();
