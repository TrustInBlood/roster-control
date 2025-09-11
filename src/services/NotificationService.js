const { EmbedBuilder } = require('discord.js');
const { CHANNELS, NOTIFICATION_ROUTES } = require('../../config/channels');

/**
 * Default colors for different notification types
 */
const NOTIFICATION_COLORS = {
  // Success/positive actions
  success: 0x00FF00,
  duty_on: 0x00FF00,
  whitelist_grant: 0x00FF7F,
  account_link: 0x00FF00,
  
  // Info/neutral actions  
  info: 0x5865F2,
  duty_change: 0x00BFFF,
  tutor_management: 0x00BFFF,
  command_usage: 0x7289DA,
  
  // Warning/caution actions
  warning: 0xFFAA00,
  duty_off: 0xFF0000,
  
  // Error/negative actions
  error: 0xFF0000,
  whitelist_revoke: 0xFF4444,
  tutor_removal: 0xFF1744,
  
  // Default
  default: 0x5865F2
};

/**
 * Unified Notification Service
 * Handles all bot notifications with consistent formatting and error handling
 */
class NotificationService {
  constructor() {
    this.client = null;
    this.failedNotifications = [];
    this.channelCache = new Map();
  }

  /**
   * Initialize the service with the Discord client
   * @param {Client} client - Discord.js client instance
   */
  initialize(client) {
    this.client = client;
    console.log('NotificationService initialized');
  }

  /**
   * Send a notification to the appropriate channel
   * @param {string} type - Notification type (determines routing)
   * @param {Object} options - Notification options
   * @returns {Promise<boolean>} Success status
   */
  async send(type, options = {}) {
    try {
      // Validate initialization
      if (!this.client) {
        console.error('NotificationService not initialized. Call initialize(client) first.');
        return false;
      }

      // Determine target channel
      const channelKey = NOTIFICATION_ROUTES[type] || 'BOT_LOGS';
      const channelId = CHANNELS[channelKey];
      
      if (!channelId) {
        console.error(`No channel configured for ${channelKey}`);
        return false;
      }

      // Get or cache the channel
      let channel = this.channelCache.get(channelId);
      if (!channel) {
        channel = await this.client.channels.fetch(channelId).catch(err => {
          console.error(`Failed to fetch channel ${channelId}:`, err.message);
          return null;
        });
        
        if (channel) {
          this.channelCache.set(channelId, channel);
        }
      }

      if (!channel) {
        // Store failed notification for potential retry
        this.failedNotifications.push({ type, options, timestamp: Date.now() });
        console.error(`Channel ${channelId} not found. Notification queued.`);
        return false;
      }

      // Build the embed
      const embed = this.buildEmbed(type, options);

      // Send the notification
      await channel.send({ embeds: [embed] });
      
      // Log success for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log(`Notification sent: ${type} to ${channelKey}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to send notification (${type}):`, error);
      
      // Store failed notification
      this.failedNotifications.push({ 
        type, 
        options, 
        error: error.message,
        timestamp: Date.now() 
      });
      
      return false;
    }
  }

  /**
   * Build an embed from notification options
   * @param {string} type - Notification type
   * @param {Object} options - Embed options
   * @returns {EmbedBuilder} Discord embed
   */
  buildEmbed(type, options) {
    const embed = new EmbedBuilder();

    // Set color
    if (options.color) {
      embed.setColor(options.color);
    } else {
      const colorKey = options.colorType || type;
      embed.setColor(NOTIFICATION_COLORS[colorKey] || NOTIFICATION_COLORS.default);
    }

    // Set title
    if (options.title) {
      embed.setTitle(options.title);
    }

    // Set description
    if (options.description) {
      embed.setDescription(options.description);
    }

    // Add fields
    if (options.fields && Array.isArray(options.fields)) {
      embed.addFields(...options.fields);
    }

    // Set thumbnail
    if (options.thumbnail) {
      embed.setThumbnail(options.thumbnail);
    }

    // Set image
    if (options.image) {
      embed.setImage(options.image);
    }

    // Set author
    if (options.author) {
      embed.setAuthor(options.author);
    }

    // Set footer
    if (options.footer) {
      embed.setFooter(options.footer);
    } else if (options.includeFooter !== false) {
      // Default footer with timestamp
      embed.setFooter({
        text: 'Roster Control Bot',
        iconURL: this.client?.user?.displayAvatarURL()
      });
    }

    // Set timestamp
    if (options.timestamp !== false) {
      embed.setTimestamp();
    }

    return embed;
  }

  /**
   * Send a duty status notification
   * @param {Object} member - Discord member
   * @param {boolean} isOnDuty - Duty status
   * @param {string} dutyType - 'admin' or 'tutor'
   */
  async sendDutyNotification(member, isOnDuty, dutyType = 'admin') {
    const title = dutyType === 'tutor' ? 'Tutor Duty Status Update' : 'Admin Duty Status Update';
    const colorType = isOnDuty ? 'duty_on' : 'duty_off';
    
    return await this.send('duty_status', {
      title,
      description: `${member} is now ${isOnDuty ? 'on' : 'off'} duty`,
      colorType,
      thumbnail: member.user.displayAvatarURL({ dynamic: true })
    });
  }

  /**
   * Send a tutor management notification
   * @param {string} action - Action performed (assigned, removed, etc.)
   * @param {Object} data - Notification data
   */
  async sendTutorNotification(action, data) {
    const titles = {
      specialty_assigned: '🎓 Tutor Specialty Assigned',
      specialty_removed: '📝 Tutor Specialty Removed',
      all_specialties_removed: '🔄 All Tutor Specialties Removed',
      tutor_removed: '🚫 Tutor Status Removed'
    };

    return await this.send('tutor_management', {
      title: titles[action] || 'Tutor Management',
      description: data.description,
      fields: data.fields,
      colorType: action.includes('removed') ? 'tutor_removal' : 'tutor_management',
      thumbnail: data.thumbnail
    });
  }

  /**
   * Send an error notification
   * @param {string} title - Error title
   * @param {string} description - Error description
   * @param {Object} error - Error object
   * @param {Object} context - Additional context
   */
  async sendError(title, description, error = null, context = {}) {
    const fields = [];
    
    if (error) {
      fields.push({
        name: 'Error Message',
        value: `\`\`\`${error.message || error}\`\`\``,
        inline: false
      });
    }

    if (context && Object.keys(context).length > 0) {
      for (const [key, value] of Object.entries(context)) {
        fields.push({
          name: key,
          value: String(value),
          inline: true
        });
      }
    }

    return await this.send('error', {
      title: `⚠️ ${title}`,
      description,
      fields,
      colorType: 'error'
    });
  }

  /**
   * Send a whitelist notification
   * @param {string} action - Whitelist action (grant, revoke, extend)
   * @param {Object} data - Whitelist data
   */
  async sendWhitelistNotification(action, data) {
    const colorType = action === 'grant' ? 'whitelist_grant' : 
      action === 'revoke' ? 'whitelist_revoke' : 
        'info';

    return await this.send('whitelist', {
      title: data.title || `Whitelist ${action}`,
      description: data.description,
      fields: data.fields,
      colorType,
      thumbnail: data.thumbnail
    });
  }

  /**
   * Send an account link notification
   * @param {Object} data - Link data
   */
  async sendAccountLinkNotification(data) {
    return await this.send('account_link', {
      title: data.success ? '🔗 Account Link' : '⚠️ Account Link Failed',
      description: data.description,
      fields: data.fields,
      colorType: data.success ? 'account_link' : 'error',
      thumbnail: data.thumbnail
    });
  }

  /**
   * Retry failed notifications
   * @param {number} maxAge - Maximum age of notifications to retry (ms)
   * @returns {Promise<number>} Number of successfully retried notifications
   */
  async retryFailedNotifications(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const toRetry = this.failedNotifications.filter(n => 
      (now - n.timestamp) <= maxAge
    );

    let successCount = 0;
    const stillFailed = [];

    for (const notification of toRetry) {
      const success = await this.send(notification.type, notification.options);
      if (success) {
        successCount++;
      } else {
        stillFailed.push(notification);
      }
    }

    this.failedNotifications = stillFailed;
    
    if (successCount > 0) {
      console.log(`Successfully retried ${successCount} notifications`);
    }
    
    return successCount;
  }

  /**
   * Clear the channel cache (useful if channels are deleted/recreated)
   */
  clearChannelCache() {
    this.channelCache.clear();
  }

  /**
   * Get statistics about notifications
   * @returns {Object} Statistics object
   */
  getStatistics() {
    return {
      failedCount: this.failedNotifications.length,
      cachedChannels: this.channelCache.size,
      initialized: !!this.client
    };
  }
}

// Export singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
module.exports.NotificationService = NotificationService;
module.exports.NOTIFICATION_COLORS = NOTIFICATION_COLORS;