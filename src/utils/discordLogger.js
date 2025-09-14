/**
 * Discord Logging Utility
 * Centralized system for logging bot events to Discord channels with consistent formatting
 */

const { createResponseEmbed } = require('./messageHandler');
const { CHANNELS } = require('../../config/channels');

/**
 * Event types and their corresponding colors and icons
 */
const EVENT_TYPES = {
  ACCOUNT_LINK: { color: 0x00ff00, icon: '🔗', name: 'Account Link' },
  ALT_ACCOUNT: { color: 0xffa500, icon: '👥', name: 'Alt Account' },
  WHITELIST_GRANT: { color: 0x00ff7f, icon: '✅', name: 'Whitelist Grant' },
  WHITELIST_REVOKE: { color: 0xff4444, icon: '❌', name: 'Whitelist Revoke' },
  WHITELIST_EXTEND: { color: 0x0099ff, icon: '⏰', name: 'Whitelist Extend' },
  COMMAND_USED: { color: 0x7289da, icon: '💬', name: 'Command Used' },
  DUTY_CHANGE: { color: 0xffaa00, icon: '👮', name: 'Duty Status' },
  ERROR: { color: 0xff0000, icon: '🚨', name: 'Error' },
  WARNING: { color: 0xffaa00, icon: '⚠️', name: 'Warning' },
  INFO: { color: 0x5865f2, icon: 'ℹ️', name: 'Info' },
  SUCCESS: { color: 0x57f287, icon: '✨', name: 'Success' },
  LEGACY_COMMAND: { color: 0xff9500, icon: '📜', name: 'Legacy Command' }
};

/**
 * Log an event to Discord with structured formatting
 * @param {Client} client - Discord client instance
 * @param {string} eventType - Event type from EVENT_TYPES
 * @param {Object} eventData - Event data object
 */
async function logToDiscord(client, eventType, eventData) {
  try {
    // Check if bot logs channel is configured
    if (!CHANNELS.BOT_LOGS || CHANNELS.BOT_LOGS === '1234567890123456789') {
      return; // Skip if no valid channel configured
    }

    const eventConfig = EVENT_TYPES[eventType];
    if (!eventConfig) {
      console.warn(`Unknown event type for Discord logging: ${eventType}`);
      return;
    }

    // Get the log channel
    const logChannel = await client.channels.fetch(CHANNELS.BOT_LOGS).catch(error => {
      console.error('Failed to fetch Discord log channel:', error.message);
      return null;
    });
    
    if (!logChannel) {
      console.warn(`Discord log channel not found: ${CHANNELS.BOT_LOGS}`);
      return;
    }

    // Build the embed
    const embed = createResponseEmbed({
      title: `${eventConfig.icon} ${eventConfig.name}`,
      description: eventData.description || 'Bot event occurred',
      color: eventConfig.color,
      timestamp: true
    });

    // Add user information if available
    if (eventData.user) {
      embed.addFields({
        name: '👤 User',
        value: `<@${eventData.user.id}> (${eventData.user.tag})`,
        inline: true
      });
    }

    // Add Steam ID information if available
    if (eventData.steamId) {
      embed.addFields({
        name: '🎮 Steam ID',
        value: `\`${eventData.steamId}\``,
        inline: true
      });
    }

    // Add channel information if available
    if (eventData.channel) {
      embed.addFields({
        name: '📝 Channel',
        value: `<#${eventData.channel.id}> (\`${eventData.channel.name}\`)`,
        inline: true
      });
    }

    // Add custom fields
    if (eventData.fields && Array.isArray(eventData.fields)) {
      embed.addFields(...eventData.fields);
    }

    // Add details section if available
    if (eventData.details) {
      let detailsText = '';
      for (const [key, value] of Object.entries(eventData.details)) {
        detailsText += `**${key}**: ${value}\n`;
      }
      if (detailsText) {
        embed.addFields({
          name: '📋 Details',
          value: detailsText,
          inline: false
        });
      }
    }

    // Add footer with timestamp
    embed.setFooter({
      text: `Bot Event • ${new Date().toLocaleString()}`,
      iconURL: client.user?.displayAvatarURL()
    });

    // Send the log message
    await logChannel.send({ embeds: [embed] });

    // Log to console in minimalist format
    logToConsole(eventType, eventData);

  } catch (error) {
    console.error('Failed to log event to Discord:', error);
    // Don't let Discord logging failures affect the main functionality
  }
}

/**
 * Log event to console in minimalist format
 * @param {string} eventType - Event type
 * @param {Object} eventData - Event data
 */
function logToConsole(eventType, eventData) {
  switch(eventType) {
    case 'ACCOUNT_LINK':
      if (eventData.user && eventData.steamId) {
        const linkType = eventData.description?.split(' via ')[1] || 'manual';
        const actor = eventData.details?.['Created By'] || eventData.user.tag;
        console.log(`${actor} created link for ${eventData.user.tag} ${eventData.steamId}`);
      }
      break;
    case 'ALT_ACCOUNT':
      if (eventData.user && eventData.steamId) {
        console.log(`Alt account discovered: ${eventData.user.tag} ${eventData.steamId}`);
      }
      break;
    case 'WHITELIST_GRANT':
      if (eventData.steamId) {
        const grantedBy = eventData.details?.['Granted By'] || 'System';
        const target = eventData.user?.tag || 'Unknown';
        console.log(`${grantedBy} granted whitelist to ${target} ${eventData.steamId}`);
      }
      break;
    case 'WHITELIST_REVOKE':
      if (eventData.steamId) {
        const revokedBy = eventData.details?.['Granted By'] || 'System';
        const target = eventData.user?.tag || 'Unknown';
        console.log(`${revokedBy} revoked whitelist from ${target} ${eventData.steamId}`);
      }
      break;
    case 'WHITELIST_EXTEND':
      if (eventData.user && eventData.steamId) {
        console.log(`Whitelist extended for ${eventData.user.tag} ${eventData.steamId}`);
      }
      break;
    case 'COMMAND_USED':
      if (eventData.user && eventData.details?.Command) {
        const status = eventData.details.Status?.includes('Success') ? 'executed' : 'failed';
        console.log(`${eventData.user.tag} ${status} ${eventData.details.Command}`);
      }
      break;
    case 'DUTY_CHANGE':
      if (eventData.description) {
        console.log(eventData.description);
      }
      break;
    case 'LEGACY_COMMAND':
      if (eventData.user && eventData.details?.['Old Command']) {
        console.log(`${eventData.user.tag} used legacy command ${eventData.details['Old Command']}`);
      }
      break;
    case 'ERROR':
      if (eventData.description) {
        console.log(`Error: ${eventData.description}`);
      }
      break;
    case 'WARNING':
      if (eventData.description) {
        console.log(`Warning: ${eventData.description}`);
      }
      break;
    case 'INFO':
      if (eventData.description) {
        console.log(`Info: ${eventData.description}`);
      }
      break;
  }
}

/**
 * Log account linking events
 */
async function logAccountLink(client, user, steamId, linkType = 'manual', details = {}) {
  await logToDiscord(client, 'ACCOUNT_LINK', {
    description: `Account linked via ${linkType}`,
    user: user,
    steamId: steamId,
    details: {
      'Link Type': linkType,
      'Confidence': details.confidence || 'N/A',
      ...details
    }
  });
}

/**
 * Log potential account discovery (no assumptions about relationships)
 */
async function logPotentialAccount(client, user, steamId, discoveredIn = {}) {
  await logToDiscord(client, 'ACCOUNT_LINK', {
    description: 'Potential Steam ID association discovered',
    user: user,
    steamId: steamId,
    channel: discoveredIn.channel,
    details: {
      'Steam ID': steamId,
      'Discovered In': discoveredIn.channelName || 'Unknown',
      'Message ID': discoveredIn.messageId || 'N/A',
      'Note': 'This is a potential association for future analysis'
    }
  });
}

/**
 * Log whitelist operations
 */
async function logWhitelistOperation(client, operation, user, steamId, details = {}) {
  const eventType = operation === 'grant' ? 'WHITELIST_GRANT' : 
    operation === 'revoke' ? 'WHITELIST_REVOKE' : 
      'WHITELIST_EXTEND';
  
  await logToDiscord(client, eventType, {
    description: `Whitelist ${operation}ed`,
    user: user,
    steamId: steamId,
    details: {
      'Operation': operation,
      'Type': details.whitelistType || 'N/A',
      'Duration': details.duration || 'N/A',
      'Granted By': details.grantedBy || 'System',
      'Reason': details.reason || 'N/A'
    }
  });
}

/**
 * Log command usage
 */
async function logCommand(client, user, command, channel, success = true, details = {}) {
  await logToDiscord(client, 'COMMAND_USED', {
    description: `Command ${success ? 'executed' : 'failed'}: \`/${command}\``,
    user: user,
    channel: channel,
    details: {
      'Command': `/${command}`,
      'Status': success ? '✅ Success' : '❌ Failed',
      'Execution Time': details.executionTime || 'N/A',
      ...details
    }
  });
}

/**
 * Log legacy command warnings
 */
async function logLegacyCommand(client, user, oldCommand, newCommand, channel) {
  await logToDiscord(client, 'LEGACY_COMMAND', {
    description: 'Deprecated command detected',
    user: user,
    channel: channel,
    details: {
      'Old Command': oldCommand,
      'Recommended': newCommand,
      'Action': 'Warning sent to user'
    }
  });
}

/**
 * Log errors and warnings
 */
async function logError(client, error, context = {}) {
  await logToDiscord(client, 'ERROR', {
    description: `Error occurred: ${error.message}`,
    details: {
      'Error': error.message,
      'Stack': error.stack?.substring(0, 500) + (error.stack?.length > 500 ? '...' : ''),
      'Context': JSON.stringify(context, null, 2).substring(0, 800)
    }
  });
}

async function logWarning(client, message, context = {}) {
  await logToDiscord(client, 'WARNING', {
    description: message,
    details: context
  });
}

/**
 * Log general info events
 */
async function logInfo(client, message, details = {}) {
  await logToDiscord(client, 'INFO', {
    description: message,
    details: details
  });
}

module.exports = {
  logToDiscord,
  logAccountLink,
  logPotentialAccount,
  logWhitelistOperation,
  logCommand,
  logLegacyCommand,
  logError,
  logWarning,
  logInfo,
  EVENT_TYPES
};