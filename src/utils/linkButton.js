const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Prefix for link button IDs
 * Format: link_button_{source}
 * This is handled by buttonInteractionHandler.js
 */
const LINK_BUTTON_PREFIX = 'link_button_';

/**
 * Known sources for link buttons
 */
const LINK_SOURCES = {
  WHITELIST_POST: 'whitelist_post',
  STATS: 'stats',
  COMMAND: 'command'
};

/**
 * Creates a Steam ID link button
 * @param {Object} options - Button options
 * @param {string} [options.label='Link Steam ID'] - Button label
 * @param {ButtonStyle} [options.style=ButtonStyle.Primary] - Button style
 * @param {string} [options.source='command'] - Source context for tracking
 * @returns {ButtonBuilder} The configured button
 */
function createLinkButton(options = {}) {
  const {
    label = 'Link Steam ID',
    style = ButtonStyle.Primary,
    source = LINK_SOURCES.COMMAND
  } = options;

  return new ButtonBuilder()
    .setCustomId(`${LINK_BUTTON_PREFIX}${source}`)
    .setLabel(label)
    .setStyle(style);
}

/**
 * Creates an ActionRow containing the link button
 * @param {Object} options - Button options (passed to createLinkButton)
 * @returns {ActionRowBuilder} ActionRow with the link button
 */
function createLinkButtonRow(options = {}) {
  return new ActionRowBuilder()
    .addComponents(createLinkButton(options));
}

/**
 * Extract the source from a link button customId
 * @param {string} customId - The button's customId
 * @returns {string|null} The source or null if not a link button
 */
function extractLinkSource(customId) {
  if (!customId.startsWith(LINK_BUTTON_PREFIX)) {
    return null;
  }
  return customId.replace(LINK_BUTTON_PREFIX, '');
}

/**
 * Format source for display in notifications
 * @param {string} source - The source identifier
 * @returns {string} Human-readable source name
 */
function formatSourceForDisplay(source) {
  const displayNames = {
    [LINK_SOURCES.WHITELIST_POST]: 'whitelist post',
    [LINK_SOURCES.STATS]: 'stats command',
    [LINK_SOURCES.COMMAND]: 'link command'
  };
  return displayNames[source] || source;
}

module.exports = {
  LINK_BUTTON_PREFIX,
  LINK_SOURCES,
  createLinkButton,
  createLinkButtonRow,
  extractLinkSource,
  formatSourceForDisplay
};
