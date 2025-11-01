// Load environment-specific configuration
require('../config/config');

// Validate environment variables before starting
const { validateEnvironment, EnvValidationError } = require('./utils/envValidator');
const { console: loggerConsole } = require('./utils/logger');
try {
  const validatedEnv = validateEnvironment();
  loggerConsole.log('✅ Environment validation passed');
} catch (error) {
  if (error instanceof EnvValidationError) {
    loggerConsole.error('❌ Environment validation failed:');
    for (const err of error.errors) {
      loggerConsole.error(`  - ${err.variable}: ${err.error}`);
    }
    loggerConsole.error('\n💡 Check your .env file against .env.example for required variables');
    process.exit(1);
  } else {
    loggerConsole.error('❌ Unexpected error during environment validation:', error.message);
    process.exit(1);
  }
}

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceStateHandler');
const { setupRoleChangeHandler } = require('./handlers/roleChangeHandler');
const { handleLegacyCommands } = require('./handlers/legacyCommandHandler');
const DutyStatusSyncService = require('./services/DutyStatusSyncService');
const { setupWhitelistRoutes } = require('./services/WhitelistIntegration');
const { databaseManager } = require('./database/index');
const { migrationManager } = require('./database/migrator');
const notificationService = require('./services/NotificationService');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils/logger');
const express = require('express');

// Initialize the Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
    
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    loggerConsole.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Make logger available to commands
client.logger = logger;

// Event handler
client.on('ready', async () => {
  logger.info(`Logged in as ${client.user.tag}`);
  loggerConsole.log(`Bot logged in as ${client.user.tag}`);

  // Make Discord client globally available for background operations (e.g., role sync triggers)
  global.discordClient = client;

  // Initialize NotificationService
  notificationService.initialize(client);
  loggerConsole.log('NotificationService initialized');

  // Log legacy command handler initialization
  loggerConsole.log('Legacy command handler initialized (messageCreate event)');
    
  // Initialize whitelist functionality first (includes role-based cache)
  const whitelistServices = await initializeWhitelist();
    
  // Set up role change handler with new sync service
  const roleChangeHandler = setupRoleChangeHandler(client, logger);
  loggerConsole.log('Role change handler initialized with unified sync service');

  // Start periodic staff role synchronization (runs every hour)
  roleChangeHandler.startStaffRolePeriodicSync(60);
  loggerConsole.log('Periodic staff role synchronization started (60 minute intervals)');

  // Wait a moment for all guilds to be loaded
  setTimeout(async () => {
    await performStartupSync(client);

    // Perform initial staff role sync for all guilds after startup (if not skipped)
    setTimeout(async () => {
      const skipInitialStaffSync = process.env.SKIP_INITIAL_STAFF_SYNC === 'true';

      if (skipInitialStaffSync) {
        loggerConsole.log('Skipping initial staff role synchronization (SKIP_INITIAL_STAFF_SYNC=true)');
        loggerConsole.log('Staff roles will be synced via periodic sync (60 min) and real-time role change events');
        return;
      }

      try {
        loggerConsole.log('Performing initial staff role synchronization...');
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            const result = await roleChangeHandler.bulkSyncGuildStaffRoles(guildId);
            loggerConsole.log(`Staff role sync completed for ${guild.name}:`, {
              processed: result.processed,
              added: result.added,
              removed: result.removed,
              errors: result.errors,
              skipped: result.skipped
            });
          } catch (error) {
            loggerConsole.error(`Failed to sync staff roles for ${guild.name}:`, error.message);
          }
        }
        loggerConsole.log('Initial staff role synchronization completed');
      } catch (error) {
        loggerConsole.error('Initial staff role sync failed:', error.message);
      }
    }, 2000); // Run 2 seconds after startup sync
  }, 5000);
});

// Voice state update handler
client.on('voiceStateUpdate', handleVoiceStateUpdate);

// Message handler for legacy commands
client.on('messageCreate', async (message) => {
  try {
    await handleLegacyCommands(message);
  } catch (error) {
    loggerConsole.error('Error in messageCreate handler:', error);
    logger.error('messageCreate handler failed', {
      error: error.message,
      stack: error.stack,
      userId: message.author?.id,
      guildId: message.guild?.id
    });
  }
});

// Startup sync function
async function performStartupSync(client) {
  try {
    loggerConsole.log('Starting bot startup sync...');
        
    // First, ensure database is connected and run migrations
    await ensureDatabaseReady();
        
    const syncService = new DutyStatusSyncService();
        
    for (const [guildId, guild] of client.guilds.cache) {
      loggerConsole.log(`Syncing guild: ${guild.name}`);
            
      try {
        const syncResults = await syncService.syncGuildDutyStatus(guild);
                
        // Log sync summary
        loggerConsole.log(`Sync completed for ${guild.name}:`, {
          scanned: syncResults.scanned,
          roleHolders: syncResults.discordRoleHolders,
          recordsCreated: syncResults.recordsCreated,
          discrepancies: syncResults.discrepanciesFound,
          resolved: syncResults.discrepanciesResolved,
          errors: syncResults.errors.length
        });

        if (syncResults.errors.length > 0) {
          loggerConsole.warn(`⚠️ Sync errors for ${guild.name}:`, syncResults.errors);
        }
                
      } catch (error) {
        loggerConsole.error(`❌ Failed to sync guild ${guild.name}:`, error);
        logger.error('Guild sync failed', {
          guildId: guild.id,
          guildName: guild.name,
          error: error.message,
          stack: error.stack
        });
      }
    }
        
    loggerConsole.log('Startup sync completed for all guilds');

  } catch (error) {
    loggerConsole.error('❌ Startup sync failed:', error);
    logger.error('Startup sync failed', {
      error: error.message,
      stack: error.stack
    });
  }
}

// Database initialization function using migrations
async function ensureDatabaseReady() {
  try {
    loggerConsole.log('Initializing database connection and schema...');
        
    // Connect to database and set up associations
    const connected = await databaseManager.connect();
    if (!connected) {
      throw new Error('Failed to establish database connection');
    }
    loggerConsole.log('Database connection established successfully.');

    // Run all pending migrations
    const migrationResult = await migrationManager.runMigrations();

    if (migrationResult.migrationsRun > 0) {
      loggerConsole.log(`Applied ${migrationResult.migrationsRun} database migration(s)`);
    } else {
      loggerConsole.log('Database schema is up to date');
    }
        
    // Verify database health
    const isHealthy = await databaseManager.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }
        
    // Get migration status for logging
    const status = await migrationManager.getStatus();
    loggerConsole.log(`Database status: ${status.executed.length} migrations executed, ${status.pending.length} pending`);

    // Verify critical tables exist
    const sequelize = databaseManager.getSequelize();
    const tables = await sequelize.getQueryInterface().showAllTables();
    const tableNames = tables.map(t => t.tableName || t).sort();
    loggerConsole.log(`Active tables: ${tableNames.length} (${tableNames.join(', ')})`);

    const requiredTables = ['players', 'duty_status_changes', 'admins', 'servers', 'audit_logs', 'groups', 'whitelists', 'player_discord_links', 'verification_codes', 'unlink_history'];
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));

    if (missingTables.length > 0) {
      loggerConsole.warn(`⚠️ Warning: Expected tables not found: ${missingTables.join(', ')}`);
      loggerConsole.warn('This might indicate a migration issue or fresh installation');
    }

    loggerConsole.log('Database initialization complete');
        
  } catch (error) {
    loggerConsole.error('❌ Database initialization failed:', error);

    // Log additional migration status information for debugging
    try {
      const status = await migrationManager.getStatus();
      loggerConsole.error('📋 Migration status at failure:', {
        executed: status.executed,
        pending: status.pending,
        total: status.total
      });
    } catch (statusError) {
      loggerConsole.error('❌ Could not retrieve migration status:', statusError.message);
    }
        
    throw error;
  }
}

// Import handlers
const { permissionMiddleware } = require('./handlers/permissionHandler');
const { handleCommandError } = require('./handlers/errorHandler');

// Command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Use permission middleware
    await permissionMiddleware(interaction, async () => {
      await command.execute(interaction);
    });
  } catch (error) {
    await handleCommandError(error, interaction, logger);
  }
});

// Initialize whitelist functionality
async function initializeWhitelist() {
  try {
    loggerConsole.log('Initializing whitelist integration...');

    // Setup HTTP server
    const app = express();

    // Add middleware to preserve raw body for signature verification
    app.use(express.json({
      verify: (req, res, buf, encoding) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf.toString(encoding || 'utf8');
      }
    }));
    app.use(express.urlencoded({ extended: true }));

    // Setup whitelist routes and services
    const whitelistServices = await setupWhitelistRoutes(
      app,
      databaseManager.getSequelize(),
      logger,
      client
    );

    // Setup donation webhook routes
    const { setupDonationWebhook } = require('./routes/donationWebhook');
    const donationRouter = setupDonationWebhook(client);
    app.use('/webhook', donationRouter);
    loggerConsole.log('Donation webhook routes registered at /webhook/donations');

    // Setup BattleMetrics webhook routes
    const { setupBattleMetricsWebhook } = require('./routes/battlemetricsWebhook');
    const battlemetricsRouter = setupBattleMetricsWebhook(client);
    app.use('/webhook', battlemetricsRouter);
    loggerConsole.log('BattleMetrics webhook routes registered at /webhook/battlemetrics/whitelist');

    // Start HTTP server
    const port = whitelistServices.config.http.port;
    const host = whitelistServices.config.http.host;

    const server = app.listen(port, host, () => {
      logger.info(`HTTP server listening on ${host}:${port}`);
      loggerConsole.log(`HTTP server started on ${host}:${port}`);
      loggerConsole.log(`  - Whitelist endpoint: http://${host}:${port}/whitelist`);
      loggerConsole.log(`  - Donation webhook: http://${host}:${port}/webhook/donations`);
      loggerConsole.log(`  - BattleMetrics webhook: http://${host}:${port}/webhook/battlemetrics/whitelist`);
    });

    // Store for graceful shutdown
    global.whitelistServices = whitelistServices;
    global.httpServer = server;

    loggerConsole.log('Whitelist integration initialized successfully');
    logger.info('Whitelist integration initialized successfully', {
      squadJSServers: whitelistServices.config.squadjs.servers.length,
      squadJSConnected: whitelistServices.connectionManager.isConnected(),
      connectionStatus: whitelistServices.connectionManager.getConnectionStatus(),
      roleWhitelistSyncEnabled: !!whitelistServices.roleWhitelistSync
    });

    return whitelistServices;

  } catch (error) {
    loggerConsole.error('❌ Failed to initialize whitelist integration:', error);
    logger.error('Failed to initialize whitelist integration', { error: error.message });
    return null;
  }
}

// Graceful shutdown handler
process.on('SIGINT', () => {
  loggerConsole.log('\n🛑 Received SIGINT, shutting down gracefully...');

  if (global.whitelistServices) {
    global.whitelistServices.gracefulShutdown();
  }

  if (global.httpServer) {
    global.httpServer.close(() => {
      loggerConsole.log('HTTP server closed');
    });
  }
    
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  loggerConsole.log('\n🛑 Received SIGTERM, shutting down gracefully...');

  if (global.whitelistServices) {
    global.whitelistServices.gracefulShutdown();
  }

  if (global.httpServer) {
    global.httpServer.close(() => {
      loggerConsole.log('HTTP server closed');
    });
  }
    
  client.destroy();
  process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
  .catch(error => {
    logger.error('Failed to login to Discord:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
