const { SlashCommandBuilder } = require('discord.js');
const WhitelistPostService = require('../services/WhitelistPostService');
const { invalidateButtonCache, getEnabledButtonsForPost } = require('../api/v1/infoButtons');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const { createServiceLogger } = require('../utils/logger');

const serviceLogger = createServiceLogger('ReloadPostsCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reloadposts')
    .setDescription('Reload info button configuration and update the whitelist post')
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
      // Invalidate the cache to fetch fresh buttons from database
      invalidateButtonCache();

      // Get enabled buttons count from database
      const buttons = await getEnabledButtonsForPost();
      const buttonCount = buttons.length;

      serviceLogger.info('Info buttons cache invalidated', {
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
        : `Cache invalidated. Updated whitelist post with ${buttonCount} info button(s).`;

      await sendSuccess(interaction, message);

    } catch (error) {
      serviceLogger.error('Failed to reload info posts:', error);
      await sendError(interaction, `Failed to reload: ${error.message}`);
    }
  }
};
