const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize } = require('./index');
const path = require('path');

// Create Umzug instance for database migrations
const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, '../../migrations/*.js'),
    resolve: ({ name, path: migrationPath }) => {
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up(sequelize.getQueryInterface(), sequelize.constructor),
        down: async () => migration.down(sequelize.getQueryInterface(), sequelize.constructor)
      };
    }
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize,
    tableName: 'schema_migrations',
    modelName: 'SchemaMigration'
  }),
  logger: console,
});

// Migration management functions
const migrationManager = {
  // Run all pending migrations
  async runMigrations() {
    console.log('Checking for pending database migrations...');
    
    try {
      const migrations = await umzug.pending();
      
      if (migrations.length === 0) {
        console.log('No pending migrations found. Database is up to date.');
        return { success: true, migrationsRun: 0 };
      }
      
      console.log(`Found ${migrations.length} pending migration(s):`, 
        migrations.map(m => m.name).join(', '));
      
      // Run migrations
      const results = await umzug.up();
      
      console.log(`Successfully executed ${results.length} migration(s).`);
      return { success: true, migrationsRun: results.length, migrations: results.map(m => m.name) };
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  // Check migration status
  async getStatus() {
    try {
      const executed = await umzug.executed();
      const pending = await umzug.pending();
      
      return {
        executed: executed.map(m => m.name),
        pending: pending.map(m => m.name),
        total: executed.length + pending.length
      };
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      throw error;
    }
  },

  // Rollback last migration (use with caution)
  async rollbackLast() {
    console.log('Rolling back last migration...');
    
    try {
      const result = await umzug.down();
      if (result.length > 0) {
        console.log(`Successfully rolled back migration: ${result[0].name}`);
        return { success: true, rolledBack: result[0].name };
      } else {
        console.log('No migrations to roll back.');
        return { success: true, rolledBack: null };
      }
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  },

  // Reset all migrations (DANGER: Only for development)
  async resetAll() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot reset migrations in production environment');
    }
    
    console.log('DANGER: Resetting all migrations (development only)...');
    
    try {
      await umzug.down({ to: 0 });
      console.log('All migrations have been rolled back.');
      return { success: true };
    } catch (error) {
      console.error('❌ Reset failed:', error);
      throw error;
    }
  }
};

module.exports = {
  umzug,
  migrationManager
};