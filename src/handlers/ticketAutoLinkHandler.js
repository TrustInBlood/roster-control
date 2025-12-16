/**
 * Ticket Auto-Link Handler
 * Automatically creates soft links between Discord users and Steam IDs
 * when they provide Steam IDs in ticket channels
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { looksLikeSteamId, isValidSteamId } = require('../utils/steamId');
const { PlayerDiscordLink } = require('../database/models');
const { Op } = require('sequelize');
const { channels } = require('../utils/environment');
const { TICKET_CONFIG } = channels;
const { logAccountLink } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');
const battlemetricsService = require('../services/BattleMetricsService');

// Track which tickets we've already handled (either found Steam ID or prompted)
// Populated on bot startup by scanning message history, cleaned up on channel delete
// This prevents repeated prompts after we've either found a Steam ID or asked for one
const handledTickets = new Set();

/**
 * Initialize ticket prompt tracking on bot startup
 * Scans all existing ticket channels to see if we've already handled them
 * (either found a Steam ID or prompted for one)
 * @param {Client} client - Discord client
 */
async function initializeTicketPromptTracking(client) {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const channels = await guild.channels.fetch();

    let ticketChannelCount = 0;
    let alreadyHandledCount = 0;

    for (const [, channel] of channels) {
      // Skip non-text channels
      if (!channel.isTextBased() || channel.isThread()) continue;

      // Check if this is a ticket channel
      if (!isTicketChannel(channel)) continue;

      ticketChannelCount++;

      // Check message history for existing handling
      try {
        const recentMessages = await channel.messages.fetch({ limit: 50 });

        // Check 1: Did the bot already post a BattleMetrics or prompt embed?
        const botAlreadyResponded = recentMessages.some(msg =>
          msg.author.id === client.user.id &&
          msg.embeds.length > 0 &&
          (msg.embeds[0].title === '⚠️ Steam ID Required' ||
           msg.embeds[0].title === '🔍 BattleMetrics Profile Found' ||
           msg.embeds[0].title === '❌ BattleMetrics Profile Not Found')
        );

        if (botAlreadyResponded) {
          handledTickets.add(channel.id);
          alreadyHandledCount++;
          continue;
        }

        // Check 2: Is there already a Steam ID in any message in this channel?
        // This catches cases where Steam ID exists but bot hadn't responded yet (pre-feature)
        // or bot response was deleted
        let steamIdFound = false;
        for (const [, msg] of recentMessages) {
          // Check message content
          const contentSteamIds = extractSteamIds(msg.content);
          if (contentSteamIds.length > 0) {
            steamIdFound = true;
            break;
          }

          // Check embeds
          if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
              if (embed.description) {
                const embedSteamIds = extractSteamIds(embed.description);
                if (embedSteamIds.length > 0) {
                  steamIdFound = true;
                  break;
                }
              }
              if (embed.fields) {
                for (const field of embed.fields) {
                  if (field.value) {
                    const fieldSteamIds = extractSteamIds(field.value);
                    if (fieldSteamIds.length > 0) {
                      steamIdFound = true;
                      break;
                    }
                  }
                }
              }
              if (steamIdFound) break;
            }
          }
          if (steamIdFound) break;
        }

        if (steamIdFound) {
          handledTickets.add(channel.id);
          alreadyHandledCount++;
        }
      } catch (error) {
        loggerConsole.warn(`Failed to check history for ticket channel ${channel.name}:`, error.message);
      }
    }

    loggerConsole.log('Ticket prompt tracking initialized:', {
      ticketChannels: ticketChannelCount,
      alreadyHandled: alreadyHandledCount
    });
  } catch (error) {
    loggerConsole.error('Error initializing ticket prompt tracking:', error);
  }
}

/**
 * Clean up prompt tracking when a channel is deleted
 * @param {Channel} channel - Deleted channel
 */
function handleChannelDelete(channel) {
  if (handledTickets.has(channel.id)) {
    handledTickets.delete(channel.id);
    loggerConsole.log('Removed deleted channel from ticket tracking:', {
      channelId: channel.id,
      channelName: channel.name
    });
  }
}

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

    // Check if this is a ticket channel
    if (!isTicketChannel(message.channel)) {
      return;
    }

    // Skip our own bot messages to avoid loops
    if (message.author.id === message.client.user.id) return;

    // Check if we have message content access or embeds
    if ((!message.content || message.content.length === 0) && (!message.embeds || message.embeds.length === 0)) {
      return;
    }

    // Extract Steam IDs from both message content and embeds
    let steamIds = extractSteamIds(message.content);

    // Also check embeds for Steam IDs (ticket bot might include Steam IDs in embeds)
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        // Check embed description
        if (embed.description) {
          const embedSteamIds = extractSteamIds(embed.description);
          steamIds = steamIds.concat(embedSteamIds);
        }

        // Check embed fields
        if (embed.fields) {
          for (const field of embed.fields) {
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

    if (steamIds.length === 0) {
      // Only prompt for missing Steam ID on human messages, not bot messages
      // This prevents prompting on ticket tool messages like "Are you sure you want to close?"
      if (!message.author.bot) {
        await checkForMissingSteamId(message);
      }
      return; // No Steam IDs found
    }

    // Determine who to associate the Steam ID with
    let targetUser = message.author;
    
    // If this is a bot message (like ticket tool), try to find the real user
    if (message.author.bot) {
      // First try to extract user from message content mentions
      const contentMentions = extractUserMentionsFromContent(message);
      if (contentMentions.length > 0) {
        targetUser = contentMentions[0]; // Use first mentioned user
      } else {
        // Then try to extract user from embed mentions
        const mentionedUsers = extractUserMentionsFromEmbeds(message);
        if (mentionedUsers.length > 0) {
          targetUser = mentionedUsers[0]; // Use first mentioned user
        } else {
          // Look for human users in recent channel messages
          const ticketCreator = await findTicketCreator(message);
          if (ticketCreator) {
            targetUser = ticketCreator;
          } else {
            return; // Could not determine target user
          }
        }
      }
    }

    // Process each found Steam ID
    for (const steamId of steamIds) {
      await processTicketSteamId(message, steamId, targetUser);
    }

    // Mark this ticket as handled - we found and processed Steam ID(s)
    // This prevents prompting for Steam ID in future messages
    handledTickets.add(message.channel.id);

  } catch (error) {
    // Don't let ticket auto-linking crash the bot
    loggerConsole.error('Error in ticket auto-link handler:', error);
  }
}

/**
 * Check if a channel is a ticket channel based on configuration
 * @param {Channel} channel - Discord channel object
 * @returns {boolean} - True if this is a ticket channel
 */
function isTicketChannel(channel) {
  // Check by channel name pattern
  if (TICKET_CONFIG.CHANNEL_NAME_PATTERN) {
    return channel.name && channel.name.startsWith(TICKET_CONFIG.CHANNEL_NAME_PATTERN);
  }

  // Check by category ID (if configured)
  if (TICKET_CONFIG.CATEGORY_ID) {
    return channel.parentId === TICKET_CONFIG.CATEGORY_ID;
  }

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
  
  // Also check for Steam IDs with labels and code blocks
  const labelPatterns = [
    /steam\s*(?:64|id)\s*:?\s*([0-9]{17})/gi,
    /steamid\s*:?\s*([0-9]{17})/gi,
    /id\s*:?\s*([0-9]{17})/gi,
    // Handle code blocks: ```\n76561198100210646```
    /```\s*([0-9]{17})\s*```/gi,
    // Handle inline code: `76561198100210646`
    /`([0-9]{17})`/gi,
    // Handle Steam ID in question format: "What is your Steam 64 ID?** ```\n76561198100210646```"
    /steam\s*64\s*id\?\*\*\s*```[^`]*([0-9]{17})[^`]*```/gi,
    // Handle Steam profile URLs: https://steamcommunity.com/profiles/76561198100210646
    /steamcommunity\.com\/profiles\/([0-9]{17})/gi,
    // Handle full Steam URLs with http/https
    /https?:\/\/steamcommunity\.com\/profiles\/([0-9]{17})/gi
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
 * Extract user mentions from message content
 * @param {Message} message - Discord message object
 * @returns {Array} - Array of mentioned users
 */
function extractUserMentionsFromContent(message) {
  const users = [];
  
  if (message.content) {
    const mentions = message.content.match(/<@!?(\d+)>/g);
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
  
  return users;
}

/**
 * Find the ticket creator by checking recent messages in the channel
 * @param {Message} message - Discord message object
 * @returns {User|null} - Found user or null
 */
async function findTicketCreator(message) {
  try {
    // Fetch recent messages from the channel
    const messages = await message.channel.messages.fetch({ limit: 20 });
    
    // Look for non-bot users who have sent messages in this channel
    const humanUsers = [];
    for (const [, msg] of messages) {
      if (!msg.author.bot && !humanUsers.find(u => u.id === msg.author.id)) {
        humanUsers.push(msg.author);
      }
    }
    
    // Return the first human user found (likely the ticket creator)
    return humanUsers.length > 0 ? humanUsers[0] : null;
    
  } catch (error) {
    loggerConsole.error('Error fetching channel messages for ticket creator lookup:', error.message);
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
    // Never soft-link to someone who already has a verified (1.0) account link
    // These are likely admins posting Steam IDs for others
    const existingVerifiedLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: targetUser.id,
        confidence_score: { [Op.gte]: 1.0 }
      }
    });

    if (existingVerifiedLink) {
      loggerConsole.log('Skipping soft-link for user with verified account:', {
        targetUser: targetUser.id,
        targetUsername: targetUser.username,
        steamIdInMessage: steamId,
        existingLinkedSteamId: existingVerifiedLink.steamid64
      });
      // Still post BattleMetrics profile for reference, but skip the soft-link creation
      if (TICKET_CONFIG.BATTLEMETRICS_LOOKUP_ENABLED) {
        await postBattleMetricsProfile(message, steamId, targetUser);
      }
      return;
    }

    const ticketInfo = {
      channelId: message.channel.id,
      channelName: message.channel.name,
      messageId: message.id,
      messageContent: message.content,
      username: targetUser.displayName || targetUser.username
    };

    // Attempt to create the ticket link
    const linkResult = await PlayerDiscordLink.createTicketLink(
      targetUser.id,
      steamId,
      ticketInfo
    );

    // Log important events to Discord channel
    if (TICKET_CONFIG.LOG_AUTO_LINKS) {
      if (linkResult.created) {
        // Fetch guild member to get display name
        let targetMember;
        try {
          targetMember = await message.guild?.members.fetch(targetUser.id);
        } catch (error) {
          // Fallback to basic user object if member fetch fails
          targetMember = {
            id: targetUser.id,
            tag: targetUser.tag,
            username: targetUser.username,
            displayName: targetUser.username
          };
        }

        // Log new potential link discovery to Discord
        await logAccountLink(message.client, targetMember, steamId, 'ticket', {
          confidence: '0.3 (Low)',
          'Discovered In': `#${message.channel.name}`,
          'Message ID': message.id
        });
      }
      // Skip logging for duplicates to avoid spam
    }

    // BattleMetrics profile lookup
    if (TICKET_CONFIG.BATTLEMETRICS_LOOKUP_ENABLED) {
      await postBattleMetricsProfile(message, steamId, targetUser);
    }

  } catch (error) {
    loggerConsole.error('Error processing ticket Steam ID:', error);
  }
}

// Button custom ID prefix for ticket linking
const TICKET_LINK_BUTTON_PREFIX = 'ticket_link_';

/**
 * Post BattleMetrics profile link to ticket channel
 * Also shows link status and provides a Link button if not linked
 * @param {Message} message - Discord message object
 * @param {string} steamId - Valid Steam ID64
 * @param {User} targetUser - The user this Steam ID is associated with
 */
async function postBattleMetricsProfile(message, steamId, targetUser) {
  try {
    // Call BattleMetrics API with configured timeout
    const timeout = TICKET_CONFIG.BATTLEMETRICS_TIMEOUT_MS || 5000;
    const result = await battlemetricsService.searchPlayerBySteamId(steamId, timeout);

    // Check if this Steam ID is linked to the target user
    const existingLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: targetUser.id,
        steamid64: steamId
      }
    });

    // Check if target user has ANY verified (1.0) link - if so, never show Link button
    const hasVerifiedLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: targetUser.id,
        confidence_score: { [Op.gte]: 1.0 }
      }
    });

    const isLinked = !!existingLink;
    const linkConfidence = existingLink ? parseFloat(existingLink.confidence_score) : 0;
    const userHasVerifiedAccount = !!hasVerifiedLink;

    // Build link status field
    let linkStatusValue;
    let linkStatusEmoji;
    if (userHasVerifiedAccount) {
      // User already has a verified account - show that info
      if (hasVerifiedLink.steamid64 === steamId) {
        linkStatusEmoji = '✅';
        linkStatusValue = `Linked to <@${targetUser.id}> (verified)`;
      } else {
        linkStatusEmoji = '⚠️';
        linkStatusValue = `<@${targetUser.id}> already has a verified account linked (different Steam ID)`;
      }
    } else if (isLinked) {
      linkStatusEmoji = '⚠️';
      linkStatusValue = `Soft-linked to <@${targetUser.id}> (${(linkConfidence * 100).toFixed(0)}% confidence - needs verification)`;
    } else {
      linkStatusEmoji = '❌';
      linkStatusValue = `Not linked to <@${targetUser.id}>`;
    }

    // Post result based on whether player was found
    if (result.found && result.profileUrl) {
      const embed = new EmbedBuilder()
        .setColor(0x00AE86) // BattleMetrics green color
        .setTitle('🔍 BattleMetrics Profile Found')
        .setDescription(`Player profile for Steam ID: \`${steamId}\``)
        .addFields(
          { name: 'Player Name', value: result.playerData.name || 'Unknown', inline: true },
          { name: 'BM Profile', value: `[View Profile](${result.profileUrl})`, inline: true },
          { name: `${linkStatusEmoji} Account Link`, value: linkStatusValue, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'BattleMetrics Profile Lookup' });

      // Create components array (Link button only if user doesn't have any verified link)
      const components = [];
      if (!userHasVerifiedAccount) {
        const buttonLabel = isLinked ? 'Verify Link' : 'Link Account';
        const linkButton = new ButtonBuilder()
          .setCustomId(`${TICKET_LINK_BUTTON_PREFIX}${targetUser.id}_${steamId}`)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗');

        const row = new ActionRowBuilder().addComponents(linkButton);
        components.push(row);
      }

      await message.channel.send({ embeds: [embed], components });

      loggerConsole.log('Posted BattleMetrics profile to ticket:', {
        channelId: message.channel.id,
        steamId,
        playerName: result.playerData.name,
        isLinked,
        linkConfidence,
        userHasVerifiedAccount
      });
    } else if (!result.found && !result.error) {
      // Player not found in BattleMetrics - post notification
      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B) // Red color for not found
        .setTitle('❌ BattleMetrics Profile Not Found')
        .setDescription(`No BattleMetrics profile found for Steam ID: \`${steamId}\``)
        .addFields(
          {
            name: 'What does this mean?',
            value: 'This player has not been seen on any servers tracked by BattleMetrics, or their profile is private.',
            inline: false
          },
          { name: `${linkStatusEmoji} Account Link`, value: linkStatusValue, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'BattleMetrics Profile Lookup' });

      // Create components array (Link button only if user doesn't have any verified link)
      const components = [];
      if (!userHasVerifiedAccount) {
        const buttonLabel = isLinked ? 'Verify Link' : 'Link Account';
        const linkButton = new ButtonBuilder()
          .setCustomId(`${TICKET_LINK_BUTTON_PREFIX}${targetUser.id}_${steamId}`)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗');

        const row = new ActionRowBuilder().addComponents(linkButton);
        components.push(row);
      }

      await message.channel.send({ embeds: [embed], components });

      loggerConsole.log('BattleMetrics profile not found:', {
        channelId: message.channel.id,
        steamId,
        isLinked,
        linkConfidence,
        userHasVerifiedAccount
      });
    } else if (result.error) {
      // Log errors but don't spam the channel with error messages
      loggerConsole.warn('BattleMetrics lookup failed:', {
        steamId,
        error: result.error
      });
    }
  } catch (error) {
    // Non-blocking - don't crash the handler if BM lookup fails
    loggerConsole.error('Error posting BattleMetrics profile:', error);
  }
}

/**
 * Check if a ticket message is missing a Steam ID and prompt user
 * First checks if user has a linked Steam account - if so, serves their BM profile
 * Otherwise prompts once at ticket start, then never again for that channel
 * @param {Message} message - Discord message object
 */
async function checkForMissingSteamId(message) {
  // Only prompt if configured to do so
  if (!TICKET_CONFIG.PROMPT_MISSING_STEAMID) {
    return;
  }

  // Check cache first (O(1))
  // Cache is populated on startup and tracks both Steam ID processing and prompts
  if (handledTickets.has(message.channel.id)) {
    return; // Already handled this ticket (either found Steam ID or prompted)
  }

  // Check if message has any Steam IDs
  let steamIds = extractSteamIds(message.content);

  // Also check embeds
  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      if (embed.description) {
        const embedSteamIds = extractSteamIds(embed.description);
        steamIds = steamIds.concat(embedSteamIds);
      }
      if (embed.fields) {
        for (const field of embed.fields) {
          if (field.value) {
            const fieldSteamIds = extractSteamIds(field.value);
            steamIds = steamIds.concat(fieldSteamIds);
          }
        }
      }
    }
  }

  // If no Steam ID found in the message, check if ticket creator has a linked account
  if (steamIds.length === 0) {
    // Find the ticket creator (first human user in the channel), not just message.author
    // This prevents serving an admin's BM profile if they respond first
    const ticketCreator = await findTicketCreator(message);
    const targetUser = ticketCreator || message.author;

    // Check if the ticket creator has an existing linked Steam account
    const existingLink = await PlayerDiscordLink.findOne({
      where: {
        discord_user_id: targetUser.id
      },
      order: [['confidence_score', 'DESC']] // Get highest confidence link
    });

    if (existingLink) {
      // Ticket creator has a linked account - serve their BattleMetrics profile
      loggerConsole.log('Ticket creator has existing link, serving BM profile:', {
        channelId: message.channel.id,
        ticketCreatorId: targetUser.id,
        ticketCreatorName: targetUser.username,
        steamId: existingLink.steamid64,
        confidence: existingLink.confidence_score
      });

      // Post BattleMetrics profile using their linked Steam ID
      if (TICKET_CONFIG.BATTLEMETRICS_LOOKUP_ENABLED) {
        await postBattleMetricsProfile(message, existingLink.steamid64, targetUser);
      }

      // Mark this ticket as handled
      handledTickets.add(message.channel.id);
      return;
    }

    // No linked account - prompt for Steam ID
    const embed = new EmbedBuilder()
      .setColor(0xFFA500) // Orange for info/warning
      .setTitle('⚠️ Steam ID Required')
      .setDescription('To help us assist you better, please provide your **Steam ID64**.')
      .addFields(
        {
          name: 'How to find your Steam ID64',
          value: '1. Open your Steam profile\n2. Right-click anywhere and select "Copy Page URL"\n3. Paste the URL here, or just the 17-digit number from the URL',
          inline: false
        },
        {
          name: 'What it looks like',
          value: 'URL: `https://steamcommunity.com/profiles/76561234567890123`\nOr just: `76561234567890123`',
          inline: false
        }
      )
      .setFooter({ text: 'Just paste your Steam profile URL or Steam ID64 in this channel' });

    await message.channel.send({ embeds: [embed] });

    // Mark this ticket as handled (we've prompted for Steam ID)
    handledTickets.add(message.channel.id);

    loggerConsole.log('Prompted for Steam ID in ticket:', {
      channelId: message.channel.id,
      channelName: message.channel.name
    });
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
    loggerConsole.error('Error getting ticket link stats:', error);
    return { totalTicketLinks: 0, recentLinks: 0, averageConfidence: 0 };
  }
}

module.exports = {
  handleTicketAutoLink,
  getTicketLinkStats,
  extractSteamIds, // Export for testing
  isTicketChannel,   // Export for testing
  checkForMissingSteamId,  // Export for use in message handler
  initializeTicketPromptTracking, // Export for bot startup
  handleChannelDelete // Export for channelDelete event
};