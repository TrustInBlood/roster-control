/**
 * Legacy Command Handler
 * Handles deprecated text commands and provides migration guidance to users
 */

const { createResponseEmbed } = require('../utils/messageHandler');
const { looksLikeSteamId } = require('../utils/steamId');

/**
 * Handles messageCreate events to detect and warn about legacy commands
 * @param {Message} message - Discord message object
 */
async function handleLegacyCommands(message) {
  try {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;
    
    // Check if we have message content access
    if (!message.content || message.content.length === 0) {
      // Message content intent might not be enabled
      return;
    }
    
    const content = message.content.trim();
  
    // Check for !addsm command with potential Steam ID
    if (content.startsWith('!addsm ')) {
      await handleAddsmDeprecation(message, content);
    }
    
    // Future: Add other legacy commands here
    // if (content.startsWith('!addfr ')) { ... }
    
  } catch (error) {
    // Don't let legacy command handling crash the bot
    console.error('Error in legacy command handler:', error);
    
    if (message.client.logger) {
      message.client.logger.error('Legacy command handler error', {
        error: error.message,
        stack: error.stack,
        userId: message.author?.id,
        guildId: message.guild?.id
      });
    }
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

    // Log the deprecation warning for monitoring
    if (message.client.logger) {
      message.client.logger.info('Legacy command deprecation warning sent', {
        userId: message.author.id,
        username: message.author.tag,
        guildId: message.guild.id,
        guildName: message.guild.name,
        command: 'addsm',
        steamId: steamIdValue,
        originalMessage: content
      });
    }

  } catch (error) {
    console.error('Error sending deprecation warning:', error);
    
    if (message.client.logger) {
      message.client.logger.error('Failed to send legacy command warning', {
        userId: message.author.id,
        guildId: message.guild.id,
        error: error.message,
        command: 'addsm'
      });
    }
  }
}

module.exports = {
  handleLegacyCommands
};