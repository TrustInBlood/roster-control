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

    // Defer reply since image generation can take a few seconds
    await interaction.deferReply();

    // Get stats for the user (pass member for admin cooldown check)
    const result = await getStatsForUser(interaction.user.id, interaction.member);

    // Handle cooldown
    if (result.cooldown) {
      return await interaction.editReply({
        content: result.message
      });
    }

    // Handle errors
    if (result.error) {
      return await interaction.editReply({
        content: result.message
      });
    }

    // Handle no linked account
    if (result.noLink) {
      return await interaction.editReply({
        embeds: [result.embed],
        components: result.components
      });
    }

    // Send successful stats response with user mention
    const replyOptions = {
      content: `<@${interaction.user.id}>`,
      components: result.components
    };

    // Use image if available, otherwise embed
    if (result.files) {
      replyOptions.files = result.files;
    } else if (result.embed) {
      replyOptions.embeds = [result.embed];
    }

    await interaction.editReply(replyOptions);
  }
};
