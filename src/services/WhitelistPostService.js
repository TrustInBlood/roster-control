const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { InteractivePost } = require('../database/models');
const { CHANNELS, INFO_POSTS } = require('../utils/environment');
const { createServiceLogger } = require('../utils/logger');
const { BUTTON_IDS } = require('../handlers/buttonInteractionHandler');

const serviceLogger = createServiceLogger('WhitelistPostService');

const POST_TYPE = 'whitelist_post';

class WhitelistPostService {
  /**
   * @param {import('discord.js').Client} client - Discord client
   * @param {object} logger - Logger instance
   */
  constructor(client, logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Initialize the service - called on bot startup
   * Creates or validates the whitelist post exists
   */
  async initialize() {
    serviceLogger.info('Initializing WhitelistPostService...');

    // Check if channel is configured
    const channelId = CHANNELS.WHITELIST_POST;
    if (!channelId) {
      serviceLogger.warn('WHITELIST_POST channel not configured, skipping whitelist post initialization');
      return;
    }

    // Get the guild (single-guild bot)
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      serviceLogger.error('No guild found, skipping whitelist post initialization');
      return;
    }

    try {
      await this.ensurePostExists(guild.id, channelId);
      serviceLogger.info('WhitelistPostService initialized successfully');
    } catch (error) {
      serviceLogger.error('Failed to initialize WhitelistPostService:', error);
    }
  }

  /**
   * Ensure the whitelist post exists and is up to date
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Channel ID where post should be
   */
  async ensurePostExists(guildId, channelId) {
    // Check database for existing post record
    const existingPost = await InteractivePost.findByType(guildId, POST_TYPE);

    if (existingPost) {
      // Try to update the existing message
      const updated = await this.updateExistingPost(existingPost.channel_id, existingPost.message_id);

      if (updated) {
        serviceLogger.info('Whitelist post updated successfully', {
          channelId: existingPost.channel_id,
          messageId: existingPost.message_id
        });
        return;
      }

      // Message was deleted or couldn't be updated, remove the stale record
      serviceLogger.warn('Whitelist post message not found in Discord, will recreate', {
        channelId: existingPost.channel_id,
        messageId: existingPost.message_id
      });
      await InteractivePost.deletePost(guildId, POST_TYPE);
    }

    // Create new post
    await this.createPost(guildId, channelId);
  }

  /**
   * Update an existing post with current embed and buttons
   * @param {string} channelId - Channel ID
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>} - Whether update was successful
   */
  async updateExistingPost(channelId, messageId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return false;

      const message = await channel.messages.fetch(messageId);
      if (!message) return false;

      const embed = this.createEmbed();
      const buttonRows = this.createButtons();

      await message.edit({
        embeds: [embed],
        components: buttonRows
      });

      return true;
    } catch (error) {
      // Message doesn't exist or can't be edited
      serviceLogger.warn('Could not update existing whitelist post:', error.message);
      return false;
    }
  }

  /**
   * Create the whitelist post in the configured channel
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Channel ID where post should be created
   */
  async createPost(guildId, channelId) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        serviceLogger.error('Whitelist post channel not found:', channelId);
        return;
      }

      // Check bot permissions
      const permissions = channel.permissionsFor(this.client.user);
      if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
        serviceLogger.error('Bot lacks permissions to send messages in whitelist post channel');
        return;
      }

      const embed = this.createEmbed();
      const buttonRows = this.createButtons();

      const message = await channel.send({
        embeds: [embed],
        components: buttonRows
      });

      // Save to database
      await InteractivePost.upsertPost(guildId, POST_TYPE, channelId, message.id);

      serviceLogger.info('Whitelist post created successfully', {
        channelId,
        messageId: message.id
      });
    } catch (error) {
      serviceLogger.error('Failed to create whitelist post:', error);
      throw error;
    }
  }

  /**
   * Create the embed for the whitelist post
   * @returns {object} - Embed object
   */
  createEmbed() {
    return {
      color: 0x2b82b2,
      title: 'Whitelist Management',
      description: 'Use the buttons below to manage your whitelist access.\n\nYour Steam ID must be linked to your Discord account to manage your whitelist access on our servers.',
      fields: [
        {
          name: 'Link Steam ID',
          value: 'Connect your Steam account to your Discord.',
          inline: false
        },
        {
          name: 'View Whitelist Status',
          value: 'Check your current whitelist status, expiration date, and days remaining.',
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Roster Control System'
      }
    };
  }

  /**
   * Create the buttons for the whitelist post
   * @returns {ActionRowBuilder[]} - Array of action rows with buttons
   */
  createButtons() {
    // Row 1: Account management buttons
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.LINK)
          .setLabel('Link Steam ID')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.STATUS)
          .setLabel('View Whitelist Status')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋')
      );

    // Row 2: Info buttons (from config)
    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.INFO_SEED)
          .setLabel(INFO_POSTS.SEED_REWARD.buttonLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(INFO_POSTS.SEED_REWARD.buttonEmoji),
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.INFO_SERVICE)
          .setLabel(INFO_POSTS.SERVICE_MEMBERS.buttonLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(INFO_POSTS.SERVICE_MEMBERS.buttonEmoji),
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.INFO_TOXIC)
          .setLabel(INFO_POSTS.REPORT_TOXIC.buttonLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(INFO_POSTS.REPORT_TOXIC.buttonEmoji),
        new ButtonBuilder()
          .setCustomId(BUTTON_IDS.INFO_DONATION)
          .setLabel(INFO_POSTS.DONATION.buttonLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(INFO_POSTS.DONATION.buttonEmoji)
      );

    return [row1, row2];
  }

  /**
   * Force recreate the whitelist post (delete and create new)
   * @param {string} guildId - Discord guild ID
   */
  async deleteAndRecreate(guildId) {
    const channelId = CHANNELS.WHITELIST_POST;
    if (!channelId) {
      throw new Error('WHITELIST_POST channel not configured');
    }

    // Delete existing post from Discord if it exists
    const existingPost = await InteractivePost.findByType(guildId, POST_TYPE);
    if (existingPost) {
      try {
        const channel = await this.client.channels.fetch(existingPost.channel_id);
        if (channel) {
          const message = await channel.messages.fetch(existingPost.message_id);
          await message.delete();
        }
      } catch (error) {
        // Message may already be deleted
        serviceLogger.warn('Could not delete existing whitelist post message:', error.message);
      }

      await InteractivePost.deletePost(guildId, POST_TYPE);
    }

    // Create new post
    await this.createPost(guildId, channelId);
  }
}

module.exports = WhitelistPostService;
