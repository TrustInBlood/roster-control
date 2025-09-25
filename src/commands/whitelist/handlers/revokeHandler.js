// Placeholder - TODO: Move revoke logic from original whitelist.js
const { sendError } = require('../../../utils/messageHandler');

async function handleRevoke(interaction) {
  await sendError(interaction, 'Revoke functionality temporarily unavailable during refactor.');
}

module.exports = {
  handleRevoke
};