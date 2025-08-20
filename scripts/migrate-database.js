#!/usr/bin/env node

require('dotenv').config();
const { migrationManager, databaseManager } = require('../src/database/migrator');

async function runMigrations() {
    try {
        console.log('🔄 Starting database migration process...');
        
        // Connect to database first
        const { databaseManager: dbManager } = require('../src/database');
        await dbManager.connect();
        
        // Run migrations
        const result = await migrationManager.runMigrations();
        
        if (result.migrationsRun > 0) {
            console.log(`✅ Successfully applied ${result.migrationsRun} migration(s):`);
            result.migrations.forEach(name => console.log(`  - ${name}`));
        } else {
            console.log('✅ Database is already up to date');
        }
        
        // Get final status
        const status = await migrationManager.getStatus();
        console.log(`📊 Final status: ${status.executed.length} executed, ${status.pending.length} pending`);
        
        console.log('✅ Migration process completed successfully');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };