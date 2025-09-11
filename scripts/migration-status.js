#!/usr/bin/env node

require('dotenv').config();
const { migrationManager } = require('../src/database/migrator');

async function showMigrationStatus() {
  try {
    console.log('📋 Checking migration status...');
        
    // Connect to database first
    const { databaseManager } = require('../src/database');
    await databaseManager.connect();
        
    const status = await migrationManager.getStatus();
        
    console.log('\n📊 Migration Status:');
    console.log(`   Total migrations: ${status.total}`);
    console.log(`   Executed: ${status.executed.length}`);
    console.log(`   Pending: ${status.pending.length}`);
        
    if (status.executed.length > 0) {
      console.log('\n✅ Executed migrations:');
      status.executed.forEach((name, index) => {
        console.log(`   ${index + 1}. ${name}`);
      });
    }
        
    if (status.pending.length > 0) {
      console.log('\n⏳ Pending migrations:');
      status.pending.forEach((name, index) => {
        console.log(`   ${index + 1}. ${name}`);
      });
    } else {
      console.log('\n✅ All migrations are up to date!');
    }
        
    process.exit(0);
        
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  showMigrationStatus();
}

module.exports = { showMigrationStatus };