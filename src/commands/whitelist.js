const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError } = require('../utils/messageHandler');
const { console: loggerConsole } = require('../utils/logger');

// Import handlers
const { handleGrant, handleGrantSteamId } = require('./whitelist/handlers/grantHandler');
const { handleInfo } = require('./whitelist/handlers/infoHandler');
const { handleRevoke } = require('./whitelist/handlers/revokeHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage whitelist entries for Squad servers')

    // Grant subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant')
        .setDescription('Grant whitelist access to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to grant whitelist to')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user (required)')
            .setRequired(true)))

    // Grant Steam ID only subcommand (admin-restricted)
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant-steamid')
        .setDescription('Grant whitelist access by Steam ID only (admin use)')
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 of the user')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('username')
            .setDescription('Username for audit trail (optional but recommended)')
            .setRequired(false)))

    // Info subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Check whitelist status for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to check')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to check')
            .setRequired(false)))


    // Revoke subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke whitelist access for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('steamid')
            .setDescription('Steam ID64 to revoke')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for revocation')
            .setRequired(false))),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
        case 'grant':
          await handleGrant(interaction);
          break;
        case 'grant-steamid':
          await handleGrantSteamId(interaction);
          break;
        case 'info':
          await handleInfo(interaction);
          break;
        case 'revoke':
          await handleRevoke(interaction);
          break;
        default:
          await sendError(interaction, 'Unknown subcommand.');
        }
      } catch (error) {
        loggerConsole.error('Whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the whitelist command.');
      }
    });
  }
};