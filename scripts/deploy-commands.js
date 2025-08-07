const { REST, Routes } = require('discord.js');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

// Validate configuration
config.validate();

const commands = [];
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.discord.token);

// Deploy commands to the configured guild
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands for ${config.env} environment.`);
    console.log(`Deploying commands to guild: ${config.discord.guildId}`);
    
    const data = await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${config.discord.guildId}.`);
    console.log('Commands deployed successfully!');
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
})();
