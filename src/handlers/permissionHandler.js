const { COMMAND_PERMISSIONS } = require('../../config/discord');
const { sendError } = require('../utils/messageHandler');

/**
 * Checks if a user has permission to use a command
 * @param {Object} interaction - The Discord interaction object
 * @param {string} commandName - The name of the command being executed
 * @returns {boolean} - Whether the user has permission to use the command
 */
function checkPermissions(interaction, commandName) {
  const allowedRoles = COMMAND_PERMISSIONS[commandName];

  // If command is not in permissions config, deny by default for safety
  if (allowedRoles === undefined) {
    console.error(`WARNING: Command '${commandName}' has no permission configuration. Denying access by default.`);
    return false;
  }

  // Check for disabled commands
  if (Array.isArray(allowedRoles) && allowedRoles.includes('DISABLED')) {
    return false;
  }

  // If explicitly set to empty array, it means everyone can use the command
  // This should only be used for public commands like 'ping' and 'help'
  if (Array.isArray(allowedRoles) && allowedRoles.length === 0) {
    // Log a warning for admin-like command names with empty permissions
    const adminCommands = ['link', 'unlink', 'whitelist', 'duty', 'onduty', 'offduty', 'admin', 'mod', 'ban', 'kick'];
    if (adminCommands.some(cmd => commandName.toLowerCase().includes(cmd))) {
      console.error(`SECURITY WARNING: Admin command '${commandName}' has empty permission array! This allows everyone access!`);
    }
    return true;
  }

  // Check if the user has any of the allowed roles
  return interaction.member.roles.cache.some(role => allowedRoles.includes(role.id));
}

/**
 * Middleware to check permissions before executing commands
 * @param {Object} interaction - The Discord interaction object
 * @param {Function} next - The next function to execute if permissions check passes
 * @returns {Promise} - Resolves when permissions are checked and command is executed
 */
async function permissionMiddleware(interaction, next) {
  const commandName = interaction.commandName;
    
  if (!checkPermissions(interaction, commandName)) {
    await sendError(
      interaction,
      'You do not have permission to use this command.'
    );
    return;
  }

  // If permissions check passes, execute the command
  await next();
}

module.exports = {
  checkPermissions,
  permissionMiddleware
};