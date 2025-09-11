require('dotenv').config();
const { sequelize } = require('../src/database/index');
const { DutyStatusChange } = require('../src/database/models');

async function testDutyStatusModel() {
  try {
    console.log('🔌 Testing DutyStatusChange model...');
        
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established.');
        
    // Sync the model (create table if it doesn't exist)
    await DutyStatusChange.sync();
    console.log('✅ DutyStatusChange model synced with database.');
        
    // Test creating a record
    const testRecord = await DutyStatusChange.create({
      discordUserId: '123456789012345678',
      discordUsername: 'TestUser',
      status: true,
      previousStatus: false,
      source: 'manual',
      reason: 'Testing DutyStatusChange model',
      guildId: '987654321098765432',
      channelId: '111222333444555666',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      },
      success: true
    });
        
    console.log('✅ Test record created:', {
      id: testRecord.id,
      discordUsername: testRecord.discordUsername,
      status: testRecord.status,
      source: testRecord.source,
      createdAt: testRecord.createdAt
    });
        
    // Test querying the record
    const foundRecord = await DutyStatusChange.findByPk(testRecord.id);
    console.log('✅ Test record retrieved successfully');
        
    // Test the static methods
    const userHistory = await DutyStatusChange.getUserHistory('123456789012345678', 10);
    console.log('✅ getUserHistory method works, found', userHistory.length, 'records');
        
    const recentChanges = await DutyStatusChange.getRecentChanges(24, 10);
    console.log('✅ getRecentChanges method works, found', recentChanges.length, 'records');
        
    // Clean up test record
    await testRecord.destroy();
    console.log('✅ Test record cleaned up');
        
    console.log('🎉 DutyStatusChange model test completed successfully!');
        
  } catch (error) {
    console.error('❌ DutyStatusChange model test failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the test
testDutyStatusModel()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });