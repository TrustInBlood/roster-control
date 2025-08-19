const { EmbedBuilder } = require('discord.js');
const { CHANNELS } = require('../../config/discord');

/**
 * Sends a notification about an admin's duty status change
 * @param {Object} interaction - The Discord interaction object
 * @param {boolean} isOnDuty - Whether the admin is going on duty (true) or off duty (false)
 * @returns {Object} - Status object indicating success and any warning messages
 */
async function sendDutyNotification(interaction, isOnDuty) {
    try {
        const channel = interaction.guild.channels.cache.get(CHANNELS.DUTY_LOGS);
        if (!channel) {
            return {
                success: false,
                warning: 'Could not find the duty logs channel.'
            };
        }

        const embed = new EmbedBuilder()
            .setColor(isOnDuty ? 0x00FF00 : 0xFF0000)
            .setTitle('Admin Duty Status Update')
            .setDescription(`${interaction.user} is now ${isOnDuty ? 'on' : 'off'} duty`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        return { success: true };
    } catch (error) {
        console.error('Error sending duty notification:', error);
        return {
            success: false,
            warning: 'Failed to send duty notification.'
        };
    }
}

module.exports = {
    sendDutyNotification
};