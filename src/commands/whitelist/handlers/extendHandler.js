// Placeholder - TODO: Move extend logic from original whitelist.js
const { sendError } = require('../../../utils/messageHandler');

async function handleExtend(interaction) {
  await sendError(interaction, 'Extend functionality temporarily unavailable during refactor.');
}

module.exports = {
  handleExtend
};