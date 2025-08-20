const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    // This migration handles the transition from sequelize.sync() to proper migrations
    // It checks if tables already exist and marks the corresponding migrations as executed
    
    console.log('🔄 Checking for existing database schema...');
    
    // Get list of existing tables
    const tables = await queryInterface.showAllTables();
    const existingTables = Array.isArray(tables) ? tables : [];
    
    console.log(`📋 Found ${existingTables.length} existing tables: ${existingTables.join(', ')}`);
    
    // Define which migrations correspond to which tables
    const tableMigrations = {
      'players': '001-create-players-table.js',
      'duty_status_changes': '002-create-duty-status-changes-table.js'
      // Note: We don't include the new tables here - they should be created normally
    };
    
    // Check if we need to mark any existing migrations as executed
    const migrationsToMark = [];
    
    for (const [tableName, migrationName] of Object.entries(tableMigrations)) {
      if (existingTables.includes(tableName)) {
        migrationsToMark.push(migrationName);
        console.log(`✅ Table '${tableName}' exists - will mark ${migrationName} as executed`);
      }
    }
    
    if (migrationsToMark.length > 0) {
      console.log(`📝 Marking ${migrationsToMark.length} migration(s) as already executed`);
      
      // Insert the migration records manually
      for (const migrationName of migrationsToMark) {
        try {
          await queryInterface.sequelize.query(
            'INSERT IGNORE INTO schema_migrations (name) VALUES (?)',
            {
              replacements: [migrationName],
              type: queryInterface.sequelize.QueryTypes.INSERT
            }
          );
          console.log(`  ✅ Marked ${migrationName} as executed`);
        } catch (error) {
          console.warn(`  ⚠️ Could not mark ${migrationName}: ${error.message}`);
        }
      }
    } else {
      console.log('ℹ️ No existing tables found - this appears to be a fresh installation');
    }
    
    console.log('✅ Migration state initialization complete');
  },

  async down(queryInterface, Sequelize) {
    // This migration cannot be rolled back as it's an initialization step
    console.log('⚠️ Cannot rollback migration state initialization');
  }
};