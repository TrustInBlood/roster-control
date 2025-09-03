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

    // For ticket auto-linking, we need to check bot messages too (ticket tool creates embeds)
    // But we need to associate the Steam ID with the ticket creator, not the bot
    
    // Skip if this is our own bot to avoid loops
    if (message.author.id === message.client.user.id) return;

    // Check if this is a ticket channel
    if (!isTicketChannel(message.channel)) {
      console.log('DEBUG: Not a ticket channel:', message.channel.name);
      return;
    }
    
    console.log('DEBUG: Processing ticket channel:', message.channel.name);

    // Check if we have message content access or embeds
    if ((!message.content || message.content.length === 0) && (!message.embeds || message.embeds.length === 0)) {
      console.log('DEBUG: No message content or embeds');
      return;
    }

    console.log('DEBUG: Message content:', message.content.substring(0, 100) + '...');
    console.log('DEBUG: Message has embeds:', message.embeds.length);

    // Extract Steam IDs from both message content and embeds
    let steamIds = extractSteamIds(message.content);
    
    // Also check embeds for Steam IDs
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        console.log('DEBUG: Processing embed:', {
          title: embed.title,
          description: embed.description?.substring(0, 100),
          fields: embed.fields?.length || 0,
          fullEmbed: JSON.stringify(embed, null, 2).substring(0, 1000) // Show more details
        });
        
        // Check embed description
        if (embed.description) {
          const embedSteamIds = extractSteamIds(embed.description);
          steamIds = steamIds.concat(embedSteamIds);
        }
        
        // Check embed fields
        if (embed.fields) {
          for (const field of embed.fields) {
            console.log('DEBUG: Checking field:', field.name, '=', field.value?.substring(0, 50));
            if (field.value) {
              const fieldSteamIds = extractSteamIds(field.value);
              steamIds = steamIds.concat(fieldSteamIds);
            }
          }
        }
      }
    }
    
    // Remove duplicates
    steamIds = [...new Set(steamIds)];
    
    console.log('DEBUG: Extracted Steam IDs (content + embeds):', steamIds);
    
    if (steamIds.length === 0) {
      console.log('DEBUG: No Steam IDs found in message');
      return; // No Steam IDs found
    }

    // Determine who to associate the Steam ID with
    let targetUser = message.author;
    
    // If this is a bot message (like ticket tool), try to find the real user
    if (message.author.bot) {
      console.log('DEBUG: Message from bot:', message.author.tag);
      
      // First try to extract user from embed mentions
      const mentionedUsers = extractUserMentionsFromEmbeds(message);
      if (mentionedUsers.length > 0) {
        targetUser = mentionedUsers[0]; // Use first mentioned user
        console.log('DEBUG: Found mentioned user in embed:', targetUser.tag);
      } else {
        // Look for human users in recent channel messages
        const ticketCreator = await findTicketCreator(message);
        if (ticketCreator) {
          targetUser = ticketCreator;
          console.log('DEBUG: Found ticket creator from channel messages:', targetUser.tag);
        } else {
          console.log('DEBUG: Could not determine target user for bot message, skipping');
          return;
        }
      }
    }

    console.log('DEBUG: Target user for Steam ID association:', targetUser.tag);

    // Process each found Steam ID
    for (const steamId of steamIds) {
      await processTicketSteamId(message, steamId, targetUser);
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
 * Extract user mentions from message embeds
 * @param {Message} message - Discord message object
 * @returns {Array} - Array of mentioned users
 */
function extractUserMentionsFromEmbeds(message) {
  const users = [];
  
  if (message.embeds) {
    for (const embed of message.embeds) {
      // Check embed description for mentions
      if (embed.description) {
        const mentions = embed.description.match(/<@!?(\d+)>/g);
        if (mentions) {
          for (const mention of mentions) {
            const userId = mention.match(/\d+/)[0];
            const user = message.guild.members.cache.get(userId)?.user;
            if (user && !users.find(u => u.id === user.id)) {
              users.push(user);
            }
          }
        }
      }
      
      // Check embed fields for mentions
      if (embed.fields) {
        for (const field of embed.fields) {
          if (field.value) {
            const mentions = field.value.match(/<@!?(\d+)>/g);
            if (mentions) {
              for (const mention of mentions) {
                const userId = mention.match(/\d+/)[0];
                const user = message.guild.members.cache.get(userId)?.user;
                if (user && !users.find(u => u.id === user.id)) {
                  users.push(user);
                }
              }
            }
          }
        }
      }
    }
  }
  
  return users;
}

/**
 * Find the ticket creator by checking recent messages in the channel
 * @param {Message} message - Discord message object
 * @returns {User|null} - Found user or null
 */
async function findTicketCreator(message) {
  try {
    console.log('DEBUG: Looking for ticket creator in recent messages');
    
    // Fetch recent messages from the channel
    const messages = await message.channel.messages.fetch({ limit: 20 });
    
    // Look for non-bot users who have sent messages in this channel
    const humanUsers = [];
    for (const [, msg] of messages) {
      if (!msg.author.bot && !humanUsers.find(u => u.id === msg.author.id)) {
        humanUsers.push(msg.author);
        console.log('DEBUG: Found human user in channel:', msg.author.tag);
      }
    }
    
    // Return the first human user found (likely the ticket creator)
    return humanUsers.length > 0 ? humanUsers[0] : null;
    
  } catch (error) {
    console.error('DEBUG: Error fetching channel messages:', error.message);
    return null;
  }
}

/**
 * Process a Steam ID found in a ticket message
 * @param {Message} message - Discord message object
 * @param {string} steamId - Valid Steam ID64
 * @param {User} targetUser - User to associate the Steam ID with
 */
async function processTicketSteamId(message, steamId, targetUser) {
  try {
    console.log('DEBUG: Processing Steam ID:', steamId, 'for user:', targetUser.tag);
    
    const ticketInfo = {
      channelId: message.channel.id,
      channelName: message.channel.name,
      messageId: message.id,
      messageContent: message.content,
      username: targetUser.displayName || targetUser.username
    };

    // Attempt to create the ticket link
    console.log('DEBUG: Attempting to create ticket link');
    const linkResult = await PlayerDiscordLink.createTicketLink(
      targetUser.id,
      steamId,
      ticketInfo
    );
    
    console.log('DEBUG: Link result:', linkResult);

    // Log important events to Discord channel
    if (TICKET_CONFIG.LOG_AUTO_LINKS) {
      if (linkResult.created) {
        // Log new potential link discovery to Discord
        await logAccountLink(message.client, {
          id: targetUser.id,
          tag: targetUser.tag
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