const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { CHANNELS } = require('../utils/environment');
const { getStatsForUser } = require('../services/StatsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your player statistics'),

  async execute(interaction) {
    // Check if command is being run in the correct channel
    if (interaction.channelId !== CHANNELS.STATS_COMMAND) {
      return await interaction.reply({
        content: `This command can only be used in <#${CHANNELS.STATS_COMMAND}>.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Get stats for the user
    const result = await getStatsForUser(interaction.user.id);

    // Handle cooldown
    if (result.cooldown) {
      return await interaction.reply({
        content: result.message,
        flags: MessageFlags.Ephemeral
      });
    }

    // Handle errors
    if (result.error) {
      return await interaction.reply({
        content: result.message,
        flags: MessageFlags.Ephemeral
      });
    }

    // Handle no linked account
    if (result.noLink) {
      return await interaction.reply({
        embeds: [result.embed],
        components: result.components,
        ephemeral: false
      });
    }

    // Send successful stats response
    await interaction.reply({
      embeds: [result.embed],
      components: result.components
    });
  }
};
