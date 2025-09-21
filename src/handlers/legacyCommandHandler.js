/**
 * Legacy Command Handler
 * Handles deprecated text commands and provides migration guidance to users
 */

const { createResponseEmbed } = require('../utils/messageHandler');
const { looksLikeSteamId } = require('../utils/steamId');
const { handleTicketAutoLink } = require('./ticketAutoLinkHandler');
const { logLegacyCommand } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');

/**
 * Handles messageCreate events to detect and warn about legacy commands
 * @param {Message} message - Discord message object
 */
async function handleLegacyCommands(message) {
  try {
    // Ignore DMs, but allow some bot messages for ticket processing
    if (!message.guild) return;
    
    // Check if we have message content access
    if (!message.content || message.content.length === 0) {
      // Message content intent might not be enabled
      return;
    }
    
    const content = message.content.trim();
  
    // First, handle ticket auto-linking (runs on all messages in ticket channels)
    await handleTicketAutoLink(message);
  
    // Then check for legacy commands
    // Check for !addsm command with potential Steam ID
    if (content.startsWith('!addsm ')) {
      await handleAddsmDeprecation(message, content);
    }
    
    // Check for !addfr command with potential Steam ID
    if (content.startsWith('!addfr ')) {
      await handleAddfrDeprecation(message, content);
    }
    
  } catch (error) {
    // Don't let legacy command handling crash the bot
    loggerConsole.error('Error in legacy command handler:', error);
  }
}

/**
 * Handles !addsm deprecation warning
 * @param {Message} message - Discord message object  
 * @param {string} content - Message content
 */
async function handleAddsmDeprecation(message, content) {
  // Parse the command: !addsm @user steamid or !addsm @user <steamid>
  const parts = content.split(/\s+/);
  
  // Need at least: !addsm @user steamid
  if (parts.length < 3) return;
  
  // Check if any part looks like a Steam ID
  let foundSteamId = false;
  let steamIdValue = null;
  
  for (let i = 2; i < parts.length; i++) {
    const part = parts[i].replace(/[<>]/g, ''); // Remove angle brackets if present
    if (looksLikeSteamId(part)) {
      foundSteamId = true;
      steamIdValue = part;
      break;
    }
  }
  
  // Only warn if we detected what looks like a Steam ID
  if (!foundSteamId) return;
  
  try {
    // Create deprecation warning embed
    const warningEmbed = createResponseEmbed({
      title: '⚠️ Deprecated Command Detected',
      description: 'The `!addsm` command with Steam ID is **deprecated**. Please use the modern slash command instead!',
      fields: [
        {
          name: '❌ Old Command (Deprecated)',
          value: `\`!addsm @user ${steamIdValue}\``,
          inline: false
        },
        {
          name: '✅ New Command (Recommended)', 
          value: '`/whitelist grant steamid:' + steamIdValue + ' user:@user`',
          inline: false
        },
        {
          name: '📋 Benefits of New Command',
          value: '• Interactive UI with type/duration selection\n• Better error handling\n• Audit logging\n• Account linking support',
          inline: false
        },
        {
          name: '🔄 Migration Note',
          value: 'The `!addsm` command will continue to apply the service member role, but please switch to `/whitelist grant` for whitelist management.',
          inline: false
        }
      ],
      color: 0xffa500 // Orange warning color
    });

    // Send as a reply to the message (ephemeral-like by mentioning the user)
    await message.reply({
      content: `${message.author}, please note:`,
      embeds: [warningEmbed]
    });

    // Log to Discord channel
    await logLegacyCommand(
      message.client,
      { id: message.author.id, tag: message.author.tag },
      `!addsm @user ${steamIdValue}`,
      `/whitelist grant steamid:${steamIdValue} user:@user`,
      message.channel
    );

  } catch (error) {
    loggerConsole.error('Error sending deprecation warning:', error);
  }
}

/**
 * Handles !addfr deprecation warning
 * @param {Message} message - Discord message object  
 * @param {string} content - Message content
 */
async function handleAddfrDeprecation(message, content) {
  // Parse the command: !addfr @user steamid or !addfr @user <steamid>
  const parts = content.split(/\s+/);
  
  // Need at least: !addfr @user steamid
  if (parts.length < 3) return;
  
  // Check if any part looks like a Steam ID
  let foundSteamId = false;
  let steamIdValue = null;
  
  for (let i = 2; i < parts.length; i++) {
    const part = parts[i].replace(/[<>]/g, ''); // Remove angle brackets if present
    if (looksLikeSteamId(part)) {
      foundSteamId = true;
      steamIdValue = part;
      break;
    }
  }
  
  // Only warn if we detected what looks like a Steam ID
  if (!foundSteamId) return;
  
  try {
    // Create deprecation warning embed
    const warningEmbed = createResponseEmbed({
      title: '⚠️ Deprecated Command Detected',
      description: 'The `!addfr` command with Steam ID is **deprecated**. Please use the modern slash command instead!',
      fields: [
        {
          name: '❌ Old Command (Deprecated)',
          value: `\`!addfr @user ${steamIdValue}\``,
          inline: false
        },
        {
          name: '✅ New Command (Recommended)', 
          value: '`/whitelist grant steamid:' + steamIdValue + ' user:@user`\n*Then select "First Responder" type*',
          inline: false
        },
        {
          name: '📋 Benefits of New Command',
          value: '• Interactive UI with type/duration selection\n• Better error handling\n• Audit logging\n• Account linking support',
          inline: false
        },
        {
          name: '🔄 Migration Note',
          value: 'The `!addfr` command will continue to apply the first responder role, but please switch to `/whitelist grant` for whitelist management.',
          inline: false
        }
      ],
      color: 0xffa500 // Orange warning color
    });

    // Send as a reply to the message (ephemeral-like by mentioning the user)
    await message.reply({
      content: `${message.author}, please note:`,
      embeds: [warningEmbed]
    });

    // Log to Discord channel
    await logLegacyCommand(
      message.client,
      { id: message.author.id, tag: message.author.tag },
      `!addfr @user ${steamIdValue}`,
      `/whitelist grant steamid:${steamIdValue} user:@user → First Responder`,
      message.channel
    );

  } catch (error) {
    loggerConsole.error('Error sending deprecation warning:', error);
  }
}

module.exports = {
  handleLegacyCommands
};