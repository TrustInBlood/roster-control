const { SlashCommandBuilder } = require('discord.js');
const { reloadInfoPosts } = require('../utils/environment');
const WhitelistPostService = require('../services/WhitelistPostService');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const { createServiceLogger } = require('../utils/logger');

const serviceLogger = createServiceLogger('ReloadPostsCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reloadposts')
    .setDescription('Reload info post configuration and update the whitelist post')
    .addBooleanOption(option =>
      option
        .setName('recreate')
        .setDescription('Delete and recreate the whitelist post (use if post is broken)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const recreate = interaction.options.getBoolean('recreate') || false;

    try {
      // Reload the config from disk
      const newConfig = reloadInfoPosts();
      const buttonCount = Object.values(newConfig).filter(p => p.buttonId && p.buttonLabel).length;

      serviceLogger.info('Info posts config reloaded', {
        buttonCount,
        recreate,
        reloadedBy: interaction.user.tag
      });

      // Update or recreate the whitelist post
      const whitelistPostService = new WhitelistPostService(interaction.client);

      if (recreate) {
        await whitelistPostService.deleteAndRecreate(interaction.guildId);
      } else {
        await whitelistPostService.updateTrackedPost(interaction.guildId);
      }

      const message = recreate
        ? `Post recreated with ${buttonCount} info button(s).`
        : `Config reloaded. Updated whitelist post with ${buttonCount} info button(s).`;

      await sendSuccess(interaction, message);

    } catch (error) {
      serviceLogger.error('Failed to reload info posts config:', error);
      await sendError(interaction, `Failed to reload: ${error.message}`);
    }
  }
};
