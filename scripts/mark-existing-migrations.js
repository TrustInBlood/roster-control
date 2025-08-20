#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { sequelize } = require('../config/database');

async function markExistingMigrations() {
    try {
        console.log('🔧 Marking existing database state as migrated...');
        
        // Connect to database
        await databaseManager.connect();
        
        // Check which tables already exist
        const tables = await sequelize.getQueryInterface().showAllTables();
        console.log(`📋 Found existing tables: ${tables.join(', ')}`);
        
        const migrationTable = 'schema_migrations';
        const migrationsToMark = [];
        
        // Check if tables exist and mark corresponding migrations
        if (tables.includes('players')) {
            migrationsToMark.push('001-create-players-table.js');
        }
        
        if (tables.includes('duty_status_changes')) {
            migrationsToMark.push('002-create-duty-status-changes-table.js');
        }
        
        // New tables should still be migrated normally
        if (!tables.includes('admins')) {
            console.log('ℹ️ Admins table does not exist - will be created by migration');
        } else {
            migrationsToMark.push('003-create-admins-table.js');
        }
        
        if (!tables.includes('servers')) {
            console.log('ℹ️ Servers table does not exist - will be created by migration');
        } else {
            migrationsToMark.push('004-create-servers-table.js');
        }
        
        if (!tables.includes('audit_logs')) {
            console.log('ℹ️ Audit logs table does not exist - will be created by migration');
        } else {
            migrationsToMark.push('005-create-audit-logs-table.js');
        }
        
        if (migrationsToMark.length === 0) {
            console.log('✅ No existing tables to mark - all migrations can run normally');
            process.exit(0);
        }
        
        console.log(`📝 Marking ${migrationsToMark.length} migration(s) as completed:`);
        migrationsToMark.forEach(name => console.log(`  - ${name}`));
        
        // Insert migration records directly
        await sequelize.getQueryInterface().bulkInsert(migrationTable, 
            migrationsToMark.map(name => ({ name }))
        );
        
        console.log('✅ Successfully marked existing migrations as completed');
        console.log('ℹ️ You can now run "npm run db:migrate" to apply remaining migrations');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Failed to mark existing migrations:', error);
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
    markExistingMigrations();
}

module.exports = { markExistingMigrations };