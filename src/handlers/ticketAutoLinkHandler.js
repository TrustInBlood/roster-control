/**
 * Ticket Auto-Link Handler
 * Automatically creates soft links between Discord users and Steam IDs
 * when they provide Steam IDs in ticket channels
 */

const { looksLikeSteamId, isValidSteamId } = require('../utils/steamId');
const { PlayerDiscordLink } = require('../database/models');
const { TICKET_CONFIG } = require('../../config/channels');
const { logAccountLink } = require('../utils/discordLogger');

/**
 * Handles message scanning in ticket channels for Steam ID auto-linking
 * @param {Message} message - Discord message object
 */
async function handleTicketAutoLink(message) {
  try {
    // Check if ticket auto-linking is enabled
    if (!TICKET_CONFIG.AUTO_LINK_ENABLED) {
      return;
    }

    // Ignore bot messages
    if (message.author.bot) return;

    // Check if this is a ticket channel
    if (!isTicketChannel(message.channel)) {
      console.log('DEBUG: Not a ticket channel:', message.channel.name);
      return;
    }
    
    console.log('DEBUG: Processing ticket channel:', message.channel.name);

    // Check if we have message content access
    if (!message.content || message.content.length === 0) {
      console.log('DEBUG: No message content access');
      return;
    }

    console.log('DEBUG: Message content:', message.content.substring(0, 100) + '...');

    // Extract Steam IDs from the message content
    const steamIds = extractSteamIds(message.content);
    
    console.log('DEBUG: Extracted Steam IDs:', steamIds);
    
    if (steamIds.length === 0) {
      console.log('DEBUG: No Steam IDs found in message');
      return; // No Steam IDs found
    }

    // Process each found Steam ID
    for (const steamId of steamIds) {
      await processTicketSteamId(message, steamId);
    }

  } catch (error) {
    // Don't let ticket auto-linking crash the bot
    console.error('Error in ticket auto-link handler:', error);
  }
}

/**
 * Check if a channel is a ticket channel based on configuration
 * @param {Channel} channel - Discord channel object
 * @returns {boolean} - True if this is a ticket channel
 */
function isTicketChannel(channel) {
  console.log('DEBUG: Checking channel:', {
    name: channel.name,
    pattern: TICKET_CONFIG.CHANNEL_NAME_PATTERN,
    parentId: channel.parentId,
    categoryId: TICKET_CONFIG.CATEGORY_ID
  });
  
  // Check by channel name pattern
  if (TICKET_CONFIG.CHANNEL_NAME_PATTERN) {
    const isMatch = channel.name && channel.name.startsWith(TICKET_CONFIG.CHANNEL_NAME_PATTERN);
    console.log('DEBUG: Pattern match:', isMatch);
    return isMatch;
  }

  // Check by category ID (if configured)
  if (TICKET_CONFIG.CATEGORY_ID) {
    const isMatch = channel.parentId === TICKET_CONFIG.CATEGORY_ID;
    console.log('DEBUG: Category match:', isMatch);
    return isMatch;
  }

  console.log('DEBUG: No match criteria configured');
  return false;
}

/**
 * Extract Steam IDs from message content
 * @param {string} content - Message content
 * @returns {Array<string>} - Array of valid Steam IDs found
 */
function extractSteamIds(content) {
  const steamIds = [];
  
  // Split by whitespace and common separators
  const words = content.split(/[\s,\n\r\t]+/);
  
  for (const word of words) {
    // Clean the word (remove common punctuation and brackets)
    const cleaned = word.replace(/[<>()[\]{}'".,;:!?]/g, '');
    
    // Check if it looks like a Steam ID
    if (looksLikeSteamId(cleaned) && isValidSteamId(cleaned)) {
      steamIds.push(cleaned);
    }
  }
  
  // Also check for Steam IDs with labels (e.g., "Steam64 ID: 76561198354039964")
  const labelPatterns = [
    /steam\s*(?:64|id)\s*:?\s*([0-9]{17})/gi,
    /steamid\s*:?\s*([0-9]{17})/gi,
    /id\s*:?\s*([0-9]{17})/gi
  ];
  
  for (const pattern of labelPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const steamId = match[1];
      if (isValidSteamId(steamId) && !steamIds.includes(steamId)) {
        steamIds.push(steamId);
      }
    }
  }
  
  return [...new Set(steamIds)]; // Remove duplicates
}

/**
 * Process a Steam ID found in a ticket message
 * @param {Message} message - Discord message object
 * @param {string} steamId - Valid Steam ID64
 */
async function processTicketSteamId(message, steamId) {
  try {
    console.log('DEBUG: Processing Steam ID:', steamId, 'for user:', message.author.tag);
    
    const ticketInfo = {
      channelId: message.channel.id,
      channelName: message.channel.name,
      messageId: message.id,
      messageContent: message.content,
      username: message.author.displayName || message.author.username
    };

    // Attempt to create the ticket link
    console.log('DEBUG: Attempting to create ticket link');
    const linkResult = await PlayerDiscordLink.createTicketLink(
      message.author.id,
      steamId,
      ticketInfo
    );
    
    console.log('DEBUG: Link result:', linkResult);

    // Log important events to Discord channel
    if (TICKET_CONFIG.LOG_AUTO_LINKS) {
      if (linkResult.created) {
        // Log new potential link discovery to Discord
        await logAccountLink(message.client, {
          id: message.author.id,
          tag: message.author.tag
        }, steamId, 'ticket', {
          confidence: '0.3 (Low)',
          'Discovered In': `#${message.channel.name}`,
          'Message ID': message.id
        });
      }
      // Skip logging for duplicates to avoid spam
    }

  } catch (error) {
    console.error('Error processing ticket Steam ID:', error);
  }
}

/**
 * Get statistics about ticket auto-linking
 * @returns {Object} - Statistics object
 */
async function getTicketLinkStats() {
  try {
    const ticketLinks = await PlayerDiscordLink.findBySource('ticket');
    
    return {
      totalTicketLinks: ticketLinks.length,
      recentLinks: ticketLinks.filter(link => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return link.created_at > dayAgo;
      }).length,
      averageConfidence: ticketLinks.length > 0 ? 
        ticketLinks.reduce((sum, link) => sum + parseFloat(link.confidence_score), 0) / ticketLinks.length : 0
    };
  } catch (error) {
    console.error('Error getting ticket link stats:', error);
    return { totalTicketLinks: 0, recentLinks: 0, averageConfidence: 0 };
  }
}

module.exports = {
  handleTicketAutoLink,
  getTicketLinkStats,
  extractSteamIds, // Export for testing
  isTicketChannel   // Export for testing
};