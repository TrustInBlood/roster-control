const winston = require('winston');

class CommandError extends Error {
    constructor(message, code, userMessage) {
        super(message);
        this.name = 'CommandError';
        this.code = code;
        this.userMessage = userMessage || 'An error occurred while executing the command.';
    }
}

class ValidationError extends CommandError {
    constructor(message, userMessage) {
        super(message, 'VALIDATION_ERROR', userMessage);
        this.name = 'ValidationError';
    }
}

class PermissionError extends CommandError {
    constructor(message, userMessage) {
        super(message, 'PERMISSION_ERROR', userMessage);
        this.name = 'PermissionError';
    }
}

/**
 * Handles errors that occur during command execution
 * @param {Error} error - The error that occurred
 * @param {Object} interaction - The Discord interaction object
 * @param {Object} logger - Winston logger instance
 */
async function handleCommandError(error, interaction, logger) {
    // Log the error with appropriate metadata
    logger.error('Command execution error:', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        error: {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        }
    });

    // Prepare user-facing error message
    let errorMessage = {
        content: error instanceof CommandError ? error.userMessage : 'An unexpected error occurred.',
        ephemeral: true
    };

    // Send error response to user
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    } catch (followUpError) {
        logger.error('Failed to send error message to user:', {
            originalError: error,
            followUpError: followUpError
        });
    }
}

module.exports = {
    CommandError,
    ValidationError,
    PermissionError,
    handleCommandError
};
