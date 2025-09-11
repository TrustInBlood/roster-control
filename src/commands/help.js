const { SlashCommandBuilder } = require('discord.js');
const { createResponseEmbed, sendSuccess, sendError } = require('../utils/messageHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows a list of available commands')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Get detailed help for a specific command')
        .setRequired(false)),

  async execute(interaction) {
    const commandName = interaction.options.getString('command');
    const commands = interaction.client.commands;

    if (commandName) {
      const command = commands.get(commandName);
      if (!command) {
        return sendError(interaction, `Command \`${commandName}\` not found.`);
      }

      const embed = createResponseEmbed({
        title: `Command: /${command.data.name}`,
        description: command.data.description,
        fields: [
          {
            name: 'Usage',
            value: `/${command.data.name} ${command.data.options?.map(opt => `[${opt.name}]`).join(' ') || ''}`
          }
        ]
      });

      if (command.data.options?.length) {
        embed.addFields({
          name: 'Options',
          value: command.data.options.map(opt => 
            `\`${opt.name}\`: ${opt.description} ${opt.required ? '(Required)' : '(Optional)'}`)
            .join('\n')
        });
      }

      return sendSuccess(interaction, `Help for /${command.data.name}`, embed);
    }

    // List all commands
    const embed = createResponseEmbed({
      title: 'Available Commands',
      description: 'Here are all the available commands. Use `/help [command]` for detailed information about a specific command.',
      fields: commands.map(cmd => ({
        name: `/${cmd.data.name}`,
        value: cmd.data.description,
        inline: true
      }))
    });

    embed.setFooter({ 
      text: 'Roster Control Bot',
      iconURL: interaction.client.user.displayAvatarURL()
    });

    return sendSuccess(interaction, 'Command list retrieved successfully!', embed);
  },
};
