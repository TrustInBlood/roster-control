// Load environment-specific configuration
require('../config/config');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceStateHandler');
const { setupRoleChangeHandler } = require('./handlers/roleChangeHandler');
const { handleLegacyCommands } = require('./handlers/legacyCommandHandler');
const DutyStatusSyncService = require('./services/DutyStatusSyncService');
const { setupWhitelistRoutes } = require('./services/WhitelistIntegration');
const { databaseManager } = require('./database/index');
const { migrationManager } = require('./database/migrator');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
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
        console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Set up Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Make logger available to commands
client.logger = logger;

// Event handler
client.on('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    console.log(`🤖 Bot logged in as ${client.user.tag}`);
    
    // Set up role change handler
    const roleChangeHandler = setupRoleChangeHandler(client);
    console.log('🔧 Role change handler initialized');
    
    // Initialize whitelist functionality
    await initializeWhitelist();
    
    // Wait a moment for all guilds to be loaded
    setTimeout(async () => {
        await performStartupSync(client);
    }, 5000);
});

// Voice state update handler
client.on('voiceStateUpdate', handleVoiceStateUpdate);

// Message handler for legacy commands
client.on('messageCreate', handleLegacyCommands);

// Startup sync function
async function performStartupSync(client) {
    try {
        console.log('🚀 Starting bot startup sync...');
        
        // First, ensure database is connected and run migrations
        await ensureDatabaseReady();
        
        const syncService = new DutyStatusSyncService();
        
        for (const [guildId, guild] of client.guilds.cache) {
            console.log(`🔄 Syncing guild: ${guild.name}`);
            
            try {
                const syncResults = await syncService.syncGuildDutyStatus(guild);
                
                // Log sync summary
                console.log(`📊 Sync completed for ${guild.name}:`, {
                    scanned: syncResults.scanned,
                    roleHolders: syncResults.discordRoleHolders,
                    recordsCreated: syncResults.recordsCreated,
                    discrepancies: syncResults.discrepanciesFound,
                    resolved: syncResults.discrepanciesResolved,
                    errors: syncResults.errors.length
                });
                
                if (syncResults.errors.length > 0) {
                    console.warn(`⚠️ Sync errors for ${guild.name}:`, syncResults.errors);
                }
                
            } catch (error) {
                console.error(`❌ Failed to sync guild ${guild.name}:`, error);
                logger.error('Guild sync failed', {
                    guildId: guild.id,
                    guildName: guild.name,
                    error: error.message,
                    stack: error.stack
                });
            }
        }
        
        console.log('✅ Startup sync completed for all guilds');
        
    } catch (error) {
        console.error('❌ Startup sync failed:', error);
        logger.error('Startup sync failed', {
            error: error.message,
            stack: error.stack
        });
    }
}

// Database initialization function using migrations
async function ensureDatabaseReady() {
    try {
        console.log('🗄️ Initializing database connection and schema...');
        
        // Connect to database and set up associations
        const connected = await databaseManager.connect();
        if (!connected) {
            throw new Error('Failed to establish database connection');
        }
        console.log('✅ Database connection established');
        
        // Run all pending migrations
        const migrationResult = await migrationManager.runMigrations();
        
        if (migrationResult.migrationsRun > 0) {
            console.log(`✅ Applied ${migrationResult.migrationsRun} database migration(s)`);
        } else {
            console.log('✅ Database schema is up to date');
        }
        
        // Verify database health
        const isHealthy = await databaseManager.healthCheck();
        if (!isHealthy) {
            throw new Error('Database health check failed');
        }
        
        // Get migration status for logging
        const status = await migrationManager.getStatus();
        console.log(`📊 Database status: ${status.executed.length} migrations executed, ${status.pending.length} pending`);
        
        // Verify critical tables exist
        const sequelize = databaseManager.getSequelize();
        const tables = await sequelize.getQueryInterface().showAllTables();
        const tableNames = tables.map(t => t.tableName || t).sort();
        console.log(`📋 Active tables: ${tableNames.length} (${tableNames.join(', ')})`);
        
        const requiredTables = ['players', 'duty_status_changes', 'admins', 'servers', 'audit_logs', 'groups', 'whitelists', 'player_discord_links', 'verification_codes', 'unlink_history'];
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));
        
        if (missingTables.length > 0) {
            console.warn(`⚠️ Warning: Expected tables not found: ${missingTables.join(', ')}`);
            console.warn('This might indicate a migration issue or fresh installation');
        }
        
        console.log('✅ Database initialization complete');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        
        // Log additional migration status information for debugging
        try {
            const status = await migrationManager.getStatus();
            console.error('📋 Migration status at failure:', {
                executed: status.executed,
                pending: status.pending,
                total: status.total
            });
        } catch (statusError) {
            console.error('❌ Could not retrieve migration status:', statusError.message);
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
        console.log('🔗 Initializing whitelist integration...');
        
        // Setup HTTP server
        const app = express();
        
        // Setup whitelist routes and services
        const whitelistServices = await setupWhitelistRoutes(
            app, 
            databaseManager.getSequelize(), 
            logger, 
            client
        );

        // Start HTTP server
        const port = whitelistServices.config.http.port;
        const host = whitelistServices.config.http.host;
        
        const server = app.listen(port, host, () => {
            logger.info(`Whitelist HTTP server listening on ${host}:${port}`);
            console.log(`🌐 Whitelist HTTP server started on ${host}:${port}`);
        });

        // Store for graceful shutdown
        global.whitelistServices = whitelistServices;
        global.httpServer = server;

        console.log('✅ Whitelist integration initialized successfully');
        logger.info('Whitelist integration initialized successfully', {
            squadJSServers: whitelistServices.config.squadjs.servers.length,
            squadJSConnected: whitelistServices.connectionManager.isConnected(),
            connectionStatus: whitelistServices.connectionManager.getConnectionStatus()
        });
        
    } catch (error) {
        console.error('❌ Failed to initialize whitelist integration:', error);
        logger.error('Failed to initialize whitelist integration', { error: error.message });
    }
}

// Graceful shutdown handler
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    
    if (global.whitelistServices) {
        global.whitelistServices.gracefulShutdown();
    }
    
    if (global.httpServer) {
        global.httpServer.close(() => {
            console.log('✅ HTTP server closed');
        });
    }
    
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    if (global.whitelistServices) {
        global.whitelistServices.gracefulShutdown();
    }
    
    if (global.httpServer) {
        global.httpServer.close(() => {
            console.log('✅ HTTP server closed');
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
