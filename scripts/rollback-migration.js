#!/usr/bin/env node

require('dotenv').config();
const { migrationManager } = require('../src/database/migrator');

async function rollbackMigration() {
    try {
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ Cannot rollback migrations in production environment');
            console.error('   For production rollbacks, use a careful manual process');
            process.exit(1);
        }
        
        console.log('⚠️ Rolling back last migration...');
        console.log('   Note: This only works in development/staging environments');
        
        // Connect to database first
        const { databaseManager } = require('../src/database');
        await databaseManager.connect();
        
        const result = await migrationManager.rollbackLast();
        
        if (result.rolledBack) {
            console.log(`✅ Successfully rolled back migration: ${result.rolledBack}`);
        } else {
            console.log('ℹ️ No migrations to roll back');
        }
        
        // Show updated status
        const status = await migrationManager.getStatus();
        console.log(`📊 Updated status: ${status.executed.length} executed, ${status.pending.length} pending`);
        
        console.log('✅ Rollback completed successfully');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    rollbackMigration();
}

module.exports = { rollbackMigration };