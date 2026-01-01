const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { InteractivePost } = require('../database/models');
const environment = require('../utils/environment');
const { createServiceLogger } = require('../utils/logger');
const { BUTTON_IDS } = require('../handlers/buttonInteractionHandler');
const { getEnabledButtonsForPost } = require('../api/v1/infoButtons');

// Use getter to always get fresh config after reloads
const CHANNELS = environment.CHANNELS;

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
      if (!channel) {
        serviceLogger.warn('Could not fetch channel for whitelist post update', { channelId });
        return false;
      }

      const message = await channel.messages.fetch(messageId);
      if (!message) {
        serviceLogger.warn('Could not fetch message for whitelist post update', { channelId, messageId });
        return false;
      }

      const embed = this.createEmbed();
      const buttonRows = await this.createButtons();

      serviceLogger.debug('Updating whitelist post', {
        channelId,
        messageId,
        buttonRowCount: buttonRows.length,
        totalButtons: buttonRows.reduce((sum, row) => sum + row.components.length, 0)
      });

      await message.edit({
        embeds: [embed],
        components: buttonRows
      });

      return true;
    } catch (error) {
      // Message doesn't exist or can't be edited
      serviceLogger.error('Could not update existing whitelist post', {
        channelId,
        messageId,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Update the tracked whitelist post from database
   * Does NOT create a new post if it doesn't exist - throws an error instead
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<void>}
   */
  async updateTrackedPost(guildId) {
    const existingPost = await InteractivePost.findByType(guildId, POST_TYPE);

    if (!existingPost) {
      throw new Error('No whitelist post found in database. Use recreate option to create one.');
    }

    const updated = await this.updateExistingPost(existingPost.channel_id, existingPost.message_id);

    if (!updated) {
      throw new Error('Failed to update whitelist post. The message may have been deleted. Use recreate option to create a new one.');
    }

    serviceLogger.info('Whitelist post updated successfully', {
      channelId: existingPost.channel_id,
      messageId: existingPost.message_id
    });
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
      const buttonRows = await this.createButtons();

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
   * @returns {Promise<ActionRowBuilder[]>} - Array of action rows with buttons
   */
  async createButtons() {
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

    // Row 2+: Info buttons (dynamically loaded from database)
    const dbButtons = await getEnabledButtonsForPost();
    const infoButtons = dbButtons
      .filter(btn => btn.button_id && btn.button_label)
      .map(btn => {
        const button = new ButtonBuilder()
          .setCustomId(btn.button_id)
          .setLabel(btn.button_label)
          .setStyle(ButtonStyle.Secondary);

        if (btn.button_emoji) {
          button.setEmoji(btn.button_emoji);
        }

        return button;
      });

    const rows = [row1];

    // Discord allows max 5 buttons per row, so chunk info buttons accordingly
    for (let i = 0; i < infoButtons.length; i += 5) {
      const chunk = infoButtons.slice(i, i + 5);
      if (chunk.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(...chunk));
      }
    }

    return rows;
  }

  /**
   * Force recreate the whitelist post (delete old Discord message, create new one, update DB record)
   * @param {string} guildId - Discord guild ID
   */
  async deleteAndRecreate(guildId) {
    const channelId = CHANNELS.WHITELIST_POST;
    if (!channelId) {
      throw new Error('WHITELIST_POST channel not configured');
    }

    // Delete existing Discord message if it exists (but keep DB record)
    const existingPost = await InteractivePost.findByType(guildId, POST_TYPE);
    if (existingPost) {
      try {
        const channel = await this.client.channels.fetch(existingPost.channel_id);
        if (channel) {
          const message = await channel.messages.fetch(existingPost.message_id);
          await message.delete();
        }
      } catch (error) {
        // Message may already be deleted - that's fine
        serviceLogger.warn('Could not delete existing whitelist post message:', error.message);
      }
    }

    // Create new post (this will upsert the DB record with new message ID)
    await this.createPost(guildId, channelId);
  }
}

module.exports = WhitelistPostService;
