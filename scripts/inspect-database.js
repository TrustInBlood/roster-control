#!/usr/bin/env node

require('dotenv').config();
const { sequelize } = require('../config/database');

async function inspectDatabase() {
  try {
    console.log('🔍 Inspecting database state...');
        
    await sequelize.authenticate();
    console.log('✅ Connected to database');
        
    // Get table list
    const [results] = await sequelize.query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\'',
      { replacements: [sequelize.getDatabaseName()] }
    );
        
    const tableNames = results.map(row => row.TABLE_NAME);
    console.log(`📋 Tables in database: ${tableNames.join(', ')}`);
        
    // Check for specific tables
    const expectedTables = ['players', 'duty_status_changes', 'admins', 'servers', 'audit_logs'];
        
    for (const tableName of expectedTables) {
      const exists = tableNames.includes(tableName);
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
            
      if (exists) {
        // Check indexes for this table
        const [indexes] = await sequelize.query(
          'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME != \'PRIMARY\'',
          { replacements: [sequelize.getDatabaseName(), tableName] }
        );
                
        const indexNames = indexes.map(row => row.INDEX_NAME);
        console.log(`     Indexes: ${indexNames.length > 0 ? indexNames.join(', ') : 'none'}`);
      }
    }
        
    // Check migration table
    const migrationExists = tableNames.includes('schema_migrations');
    console.log(`📋 Migration table exists: ${migrationExists ? 'YES' : 'NO'}`);
        
    if (migrationExists) {
      const [migrations] = await sequelize.query(
        'SELECT name FROM schema_migrations ORDER BY name'
      );
      console.log(`📝 Applied migrations: ${migrations.length > 0 ? migrations.map(m => m.name).join(', ') : 'none'}`);
    }
        
    await sequelize.close();
    console.log('✅ Inspection completed');
    process.exit(0);
        
  } catch (error) {
    console.error('❌ Inspection failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  inspectDatabase();
}