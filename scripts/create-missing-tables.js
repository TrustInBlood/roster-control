#!/usr/bin/env node

require('dotenv').config();
const { databaseManager } = require('../src/database');
const { Admin, Server, AuditLog } = require('../src/database/models');

async function createMissingTables() {
    try {
        console.log('🔧 Creating missing database tables...');
        
        // Connect to database
        await databaseManager.connect();
        console.log('✅ Database connected');
        
        // Sync only the new models (force: false means don't drop existing tables)
        console.log('📋 Creating Admin table...');
        await Admin.sync({ force: false, alter: false });
        console.log('✅ Admin table ready');
        
        console.log('📋 Creating Server table...');
        await Server.sync({ force: false, alter: false });
        console.log('✅ Server table ready');
        
        console.log('📋 Creating AuditLog table...');
        await AuditLog.sync({ force: false, alter: false });
        console.log('✅ AuditLog table ready');
        
        console.log('🎉 All missing tables created successfully!');
        
        // Test basic functionality
        console.log('🧪 Testing new models...');
        
        // Test Admin model
        const adminCount = await Admin.count();
        console.log(`✅ Admin model working (${adminCount} records)`);
        
        // Test Server model
        const serverCount = await Server.count();
        console.log(`✅ Server model working (${serverCount} records)`);
        
        // Test AuditLog model
        const auditCount = await AuditLog.count();
        console.log(`✅ AuditLog model working (${auditCount} records)`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Failed to create missing tables:', error);
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
    createMissingTables();
}

module.exports = { createMissingTables };