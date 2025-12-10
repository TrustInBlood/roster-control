/**
 * Shared unlink flow logic used by both /unlink command and whitelist post button
 */
const { PlayerDiscordLink, UnlinkHistory } = require('../database/models');
const { createServiceLogger } = require('./logger');

const serviceLogger = createServiceLogger('UnlinkFlow');

/**
 * Build the warning embed shown before unlink confirmation
 * @param {object} existingLink - The user's current PlayerDiscordLink
 * @returns {object} - Discord embed object
 */
function buildWarningEmbed(existingLink) {
  return {
    color: 0xffa500,
    title: 'Unlinking Warning',
    description: 'Are you sure you want to unlink your Steam ID? **This action has consequences.**',
    fields: [
      {
        name: 'Steam ID',
        value: existingLink.steamid64,
        inline: true
      },
      {
        name: 'Link Confidence',
        value: `${(existingLink.confidence_score * 100).toFixed(0)}%`,
        inline: true
      },
      {
        name: 'Linked Since',
        value: `<t:${Math.floor(existingLink.created_at.getTime() / 1000)}:R>`,
        inline: true
      },
      {
        name: 'IMPORTANT: 30-Day Cooldown',
        value: '**You will NOT be able to link a new Steam ID for 30 days after unlinking.**\n\nThis cooldown prevents abuse of the linking system.',
        inline: false
      },
      {
        name: 'What will happen?',
        value: '- Your Steam ID will be unlinked from your Discord account\n- Your whitelist access may be affected\n- You cannot link a different Steam ID for 30 days\n- You can re-link the SAME Steam ID immediately',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Roster Control System - Confirmation Required' }
  };
}

/**
 * Build the success embed shown after successful unlink
 * @param {object} existingLink - The user's unlinked PlayerDiscordLink
 * @param {Date} cooldownEndDate - When the 30-day cooldown ends
 * @returns {object} - Discord embed object
 */
function buildSuccessEmbed(existingLink, cooldownEndDate) {
  return {
    color: 0xff9900,
    title: 'Account Unlinked Successfully',
    fields: [
      {
        name: 'Unlinked Steam ID',
        value: existingLink.steamid64,
        inline: true
      },
      {
        name: 'Username',
        value: existingLink.username || 'Unknown',
        inline: true
      },
      {
        name: '30-Day Cooldown Active',
        value: `You cannot link a **different** Steam ID until:\n<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:F>\n(<t:${Math.floor(cooldownEndDate.getTime() / 1000)}:R>)`,
        inline: false
      },
      {
        name: 'Important Notes',
        value: `- You can re-link the SAME Steam ID (\`${existingLink.steamid64}\`) immediately\n- Linking a different Steam ID will be blocked for 30 days\n- Contact staff if you need urgent assistance`,
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Roster Control System' }
  };
}

/**
 * Build the cancelled embed shown when user cancels unlink
 * @param {object} existingLink - The user's PlayerDiscordLink (may be null)
 * @returns {object} - Discord embed object
 */
function buildCancelledEmbed(existingLink) {
  return {
    color: 0x808080,
    title: 'Unlink Cancelled',
    description: 'Your account link has NOT been changed.',
    fields: existingLink ? [
      {
        name: 'Steam ID',
        value: existingLink.steamid64,
        inline: true
      },
      {
        name: 'Status',
        value: 'Still Linked',
        inline: true
      }
    ] : [],
    timestamp: new Date().toISOString(),
    footer: { text: 'Roster Control System' }
  };
}

/**
 * Build the timeout embed shown when confirmation times out
 * @param {object} existingLink - The user's PlayerDiscordLink
 * @returns {object} - Discord embed object
 */
function buildTimeoutEmbed(existingLink) {
  return {
    color: 0x808080,
    title: 'Confirmation Timeout',
    description: 'The unlink confirmation timed out. Your account link has NOT been changed.',
    fields: [
      {
        name: 'Steam ID',
        value: existingLink.steamid64,
        inline: true
      },
      {
        name: 'Status',
        value: 'Still Linked',
        inline: true
      },
      {
        name: 'Want to unlink?',
        value: 'Try again to restart the process.',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Roster Control System' }
  };
}

/**
 * Perform the actual unlink operation
 * @param {string} discordUserId - Discord user ID
 * @param {object} existingLink - The primary link being unlinked
 * @param {string} source - Source of the unlink request (e.g., '/unlink command', 'whitelist post button')
 * @returns {Promise<{allLinks: Array, cooldownEndDate: Date}>}
 */
async function performUnlink(discordUserId, existingLink, source) {
  // Find ALL links for this user (not just primary)
  const allLinks = await PlayerDiscordLink.findAllByDiscordId(discordUserId);

  // Record ALL links in UnlinkHistory before deletion
  for (const link of allLinks) {
    const isPrimary = link.steamid64 === existingLink.steamid64;
    await UnlinkHistory.recordUnlink(
      discordUserId,
      link.steamid64,
      link.eosID,
      link.username,
      isPrimary
        ? `User request via ${source} (primary link)`
        : `User request via ${source} (secondary link, ${(link.confidence_score * 100).toFixed(0)}% confidence)`
    );
  }

  // Delete ALL links
  for (const link of allLinks) {
    await link.destroy();
  }

  // Calculate cooldown end
  const cooldownEndDate = new Date();
  cooldownEndDate.setDate(cooldownEndDate.getDate() + 30);

  serviceLogger.info('User unlinked account', {
    discordUserId,
    steamid64: existingLink.steamid64,
    linkCount: allLinks.length,
    source,
    cooldownUntil: cooldownEndDate.toISOString()
  });

  return { allLinks, cooldownEndDate };
}

module.exports = {
  buildWarningEmbed,
  buildSuccessEmbed,
  buildCancelledEmbed,
  buildTimeoutEmbed,
  performUnlink
};
