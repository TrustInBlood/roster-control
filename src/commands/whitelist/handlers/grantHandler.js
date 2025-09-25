// Placeholder - TODO: Move grant logic from original whitelist.js
const { sendError } = require('../../../utils/messageHandler');

async function handleGrant(interaction) {
  await sendError(interaction, 'Grant functionality temporarily unavailable during refactor.');
}

async function handleGrantSteamId(interaction) {
  await sendError(interaction, 'Grant Steam ID functionality temporarily unavailable during refactor.');
}

module.exports = {
  handleGrant,
  handleGrantSteamId
};