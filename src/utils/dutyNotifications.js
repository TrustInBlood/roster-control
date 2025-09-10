const { EmbedBuilder } = require('discord.js');
const { CHANNELS } = require('../../config/discord');

/**
 * Sends a notification about a duty status change
 * @param {Object} interaction - The Discord interaction object
 * @param {boolean} isOnDuty - Whether the user is going on duty (true) or off duty (false)
 * @param {string} dutyType - The type of duty ('admin' or 'tutor')
 * @returns {Object} - Status object indicating success and any warning messages
 */
async function sendDutyNotification(interaction, isOnDuty, dutyType = 'admin') {
    try {
        const channel = interaction.guild.channels.cache.get(CHANNELS.DUTY_LOGS);
        if (!channel) {
            return {
                success: false,
                warning: 'Could not find the duty logs channel.'
            };
        }

        const dutyTitle = dutyType === 'tutor' ? 'Tutor' : 'Admin';
        const embedColor = dutyType === 'tutor' ? (isOnDuty ? 0x00BFFF : 0x808080) : (isOnDuty ? 0x00FF00 : 0xFF0000);

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${dutyTitle} Duty Status Update`)
            .setDescription(`${interaction.user} is now ${isOnDuty ? 'on' : 'off'} duty as a ${dutyType}`)
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