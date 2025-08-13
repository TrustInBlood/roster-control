const { EmbedBuilder, InteractionResponseFlags } = require('discord.js');

/**
 * Sends an ephemeral response to an interaction
 * @param {Object} interaction - The Discord interaction object
 * @param {Object} options - Message options
 * @param {string} options.content - The message content
 * @param {boolean} [options.success=true] - Whether this is a success message
 * @param {Object} [options.embed] - Optional embed object
 * @returns {Promise} - The interaction reply
 */
async function sendEphemeralResponse(interaction, { content, success = true, embed = null }) {
    const response = {
        content: `${success ? '✅' : '❌'} ${content}`,
        flags: InteractionResponseFlags.Ephemeral
    };

    if (embed) {
        response.embeds = [embed];
    }

    if (interaction.replied || interaction.deferred) {
        return await interaction.followUp(response);
    }
    return await interaction.reply(response);
}

/**
 * Creates a standard embed for command responses
 * @param {Object} options - Embed options
 * @param {string} options.title - The embed title
 * @param {string} options.description - The embed description
 * @param {Array} [options.fields] - Optional array of fields
 * @param {string} [options.color] - Hex color code (default: 0x0099FF for info)
 * @returns {EmbedBuilder} - The created embed
 */
function createResponseEmbed({ title, description, fields = [], color = 0x0099FF }) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

/**
 * Sends a success message with optional embed
 * @param {Object} interaction - The Discord interaction object
 * @param {string} content - The success message
 * @param {Object} [embed] - Optional embed to include
 */
async function sendSuccess(interaction, content, embed = null) {
    return sendEphemeralResponse(interaction, { content, success: true, embed });
}

/**
 * Sends an error message with optional embed
 * @param {Object} interaction - The Discord interaction object
 * @param {string} content - The error message
 * @param {Object} [embed] - Optional embed to include
 */
async function sendError(interaction, content, embed = null) {
    return sendEphemeralResponse(interaction, { content, success: false, embed });
}

/**
 * Sends a loading message and executes an async operation
 * @param {Object} interaction - The Discord interaction object
 * @param {string} loadingMessage - Message to show while loading
 * @param {Function} operation - Async operation to execute
 */
async function withLoadingMessage(interaction, loadingMessage, operation) {
    await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });
    try {
        const result = await operation();
        return result;
    } finally {
        if (!interaction.replied) {
            await interaction.deleteReply();
        }
    }
}

module.exports = {
    sendEphemeralResponse,
    createResponseEmbed,
    sendSuccess,
    sendError,
    withLoadingMessage
};
