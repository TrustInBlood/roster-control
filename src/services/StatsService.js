const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createResponseEmbed } = require('../utils/messageHandler');
const { console: loggerConsole } = require('../utils/logger');
const { resolveSteamIdFromDiscord } = require('../utils/accountLinking');
const { createLinkButtonRow, LINK_SOURCES } = require('../utils/linkButton');
const { getAllAdminRoles } = require('../../config/discordRoles');
const { generateStatsImage, DEFAULT_TEMPLATE } = require('./StatsImageService');
const { getTemplateForRoles } = require('../../config/statsTemplates');

// API endpoint for player stats - configurable via environment variable
const STATS_API_URL = process.env.STATS_API_URL || 'http://216.114.75.101:12000/stats';

// Cooldown settings
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes for regular users
const ADMIN_COOLDOWN_MS = 15 * 1000; // 15 seconds for admins
const cooldowns = new Map();

// Button ID for viewing stats
const STATS_BUTTON_ID = 'view_my_stats';

/**
 * Check if a guild member has admin roles
 * @param {GuildMember} member - Discord guild member
 * @returns {boolean} True if member has admin roles
 */
function isAdmin(member) {
  if (!member || !member.roles) return false;
  const adminRoles = getAllAdminRoles();
  return member.roles.cache.some(role => adminRoles.includes(role.id));
}

/**
 * Determine which stats template to use based on member roles
 * @param {GuildMember} [member] - Discord guild member
 * @returns {string} Template name
 */
function getTemplateForMember(member) {
  if (!member || !member.roles) return DEFAULT_TEMPLATE;

  // Get role IDs from member
  const roleIds = member.roles.cache.map(role => role.id);

  // Check config for template mapping
  return getTemplateForRoles(roleIds);
}

/**
 * Check if a user is on cooldown
 * @param {string} userId - Discord user ID
 * @returns {{ onCooldown: boolean, remainingMs: number, displayText: string }}
 */
function checkCooldown(userId) {
  const now = Date.now();
  const cooldownEnd = cooldowns.get(userId);

  if (cooldownEnd && now < cooldownEnd) {
    const remainingMs = cooldownEnd - now;
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const displayText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    return { onCooldown: true, remainingMs, displayText };
  }

  return { onCooldown: false, remainingMs: 0, displayText: '' };
}

/**
 * Set cooldown for a user
 * @param {string} userId - Discord user ID
 * @param {GuildMember} [member] - Optional guild member to check for admin role
 */
function setCooldown(userId, member = null) {
  const cooldownDuration = member && isAdmin(member) ? ADMIN_COOLDOWN_MS : COOLDOWN_MS;
  cooldowns.set(userId, Date.now() + cooldownDuration);
}

/**
 * Fetch stats from the API
 * @param {string} steamId - Steam ID64
 * @returns {Promise<Object>} Stats data or error
 */
async function fetchStats(steamId) {
  try {
    const response = await fetch(`${STATS_API_URL}?steamid=${steamId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Player not found. You may not have played on our servers yet.' };
      }
      return { success: false, error: `Failed to fetch stats: ${response.status} ${response.statusText}` };
    }

    const stats = await response.json();
    return { success: true, stats };
  } catch (error) {
    loggerConsole.error('Stats fetch error:', error);
    return { success: false, error: error.message || 'Failed to retrieve player statistics.' };
  }
}

/**
 * Build the stats embed
 * @param {Object} stats - Stats data from API
 * @returns {EmbedBuilder} The stats embed
 */
function buildStatsEmbed(stats) {
  const embed = createResponseEmbed({
    title: `Player Stats: ${stats.playerName || 'Unknown'}`,
    description: 'Your current statistics',
    fields: [
      { name: 'Kills', value: stats.kills?.toString() || '0', inline: true },
      { name: 'Deaths', value: stats.deaths?.toString() || '0', inline: true },
      { name: 'K/D Ratio', value: stats.kdRatio?.toFixed(2) || '0.00', inline: true },
      { name: 'Teamkills', value: stats.teamkills?.toString() || '0', inline: true },
      { name: 'Revives Given', value: stats.revivesGiven?.toString() || '0', inline: true },
      { name: 'Revives Received', value: stats.revivesReceived?.toString() || '0', inline: true },
      { name: 'Nemesis', value: stats.nemesis || 'None', inline: true }
    ],
    color: 0x3498db
  });

  // Set footer with last seen timestamp (displays in user's local time)
  if (stats.lastSeen) {
    embed.setFooter({ text: 'Last seen' });
    embed.setTimestamp(new Date(stats.lastSeen));
  } else {
    embed.setFooter({ text: 'Last seen: Never' });
    embed.setTimestamp(null);
  }

  return embed;
}

/**
 * Build the "View My Stats" button row
 * @returns {ActionRowBuilder} Action row with the stats button
 */
function buildStatsButtonRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(STATS_BUTTON_ID)
        .setLabel('View My Stats')
        .setStyle(ButtonStyle.Primary)
    );
}

/**
 * Build the "No Linked Account" response with link button
 * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
 */
function buildNoLinkResponse() {
  const embed = createResponseEmbed({
    title: 'No Linked Account',
    description: 'You need to link your Steam account to view your stats.\n\nClick the button below to link your Steam ID.',
    color: 0xffa500
  });

  return {
    embed,
    components: [createLinkButtonRow({ source: LINK_SOURCES.STATS })]
  };
}

/**
 * Get stats for a user (main entry point)
 * @param {string} discordUserId - Discord user ID
 * @param {GuildMember} [member] - Optional guild member for admin cooldown check
 * @returns {Promise<Object>} Result with embed, components, and status
 */
async function getStatsForUser(discordUserId, member = null) {
  // Resolve Steam ID from the user's linked account first
  const steamId = await resolveSteamIdFromDiscord(discordUserId);

  // If no linked account, don't apply cooldown - let them link and try again
  if (!steamId) {
    const noLinkResponse = buildNoLinkResponse();
    return {
      success: true,
      noLink: true,
      embed: noLinkResponse.embed,
      components: noLinkResponse.components
    };
  }

  // Check cooldown (only for linked users)
  const cooldownStatus = checkCooldown(discordUserId);
  if (cooldownStatus.onCooldown) {
    return {
      success: false,
      cooldown: true,
      message: `This command is on cooldown. Please wait **${cooldownStatus.displayText}** before using it again.`
    };
  }

  // Set cooldown (only after confirming they have a linked account)
  // Admins get a shorter cooldown
  setCooldown(discordUserId, member);

  // Fetch stats
  const result = await fetchStats(steamId);

  if (!result.success) {
    return {
      success: false,
      error: true,
      message: result.error
    };
  }

  // Try image generation first, fall back to embed
  const components = [buildStatsButtonRow()];

  // Select template based on member roles
  const templateName = getTemplateForMember(member);

  try {
    loggerConsole.log(`Attempting stats image generation with template: ${templateName}...`);
    const imageBuffer = await generateStatsImage(result.stats, templateName);
    loggerConsole.log('Stats image generated, size:', imageBuffer.length);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'stats.png' });

    return {
      success: true,
      files: [attachment],
      components
    };
  } catch (imageError) {
    loggerConsole.warn('Stats image generation failed, falling back to embed:', imageError.message);
    loggerConsole.warn('Stack:', imageError.stack);

    // Fall back to embed
    const embed = buildStatsEmbed(result.stats);
    return {
      success: true,
      embed,
      components
    };
  }
}

module.exports = {
  STATS_BUTTON_ID,
  COOLDOWN_MS,
  ADMIN_COOLDOWN_MS,
  isAdmin,
  checkCooldown,
  setCooldown,
  fetchStats,
  buildStatsEmbed,
  buildStatsButtonRow,
  buildNoLinkResponse,
  getStatsForUser
};
