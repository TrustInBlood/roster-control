const { COMMAND_PERMISSIONS } = require('../../config/discord');
const { sendError } = require('../utils/messageHandler');

/**
 * Checks if a user has permission to use a command
 * @param {Object} interaction - The Discord interaction object
 * @param {string} commandName - The name of the command being executed
 * @returns {boolean} - Whether the user has permission to use the command
 */
function checkPermissions(interaction, commandName) {
    const allowedRoles = COMMAND_PERMISSIONS[commandName] || [];
    
    // If no roles are specified, everyone can use the command
    if (allowedRoles.length === 0) {
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