require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { handleVoiceStateUpdate } = require('./handlers/voiceStateHandler');
const { setupRoleChangeHandler } = require('./handlers/roleChangeHandler');
const DutyStatusSyncService = require('./services/DutyStatusSyncService');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Initialize the Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
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

// Event handler
client.on('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    console.log(`🤖 Bot logged in as ${client.user.tag}`);
    
    // Set up role change handler
    const roleChangeHandler = setupRoleChangeHandler(client);
    console.log('🔧 Role change handler initialized');
    
    // Wait a moment for all guilds to be loaded
    setTimeout(async () => {
        await performStartupSync(client);
    }, 5000);
});

// Voice state update handler
client.on('voiceStateUpdate', handleVoiceStateUpdate);

// Startup sync function
async function performStartupSync(client) {
    try {
        console.log('🚀 Starting bot startup sync...');
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

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
        logger.error('Failed to login to Discord:', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    });
