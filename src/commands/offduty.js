const { SlashCommandBuilder } = require('discord.js');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const DutyStatusFactory = require('../services/DutyStatusFactory');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('offduty')
        .setDescription('Remove yourself from on-duty status'),
    
    async execute(interaction) {
        try {
            const dutyFactory = new DutyStatusFactory();
            
            // Attempt to set user off duty using the factory
            const result = await dutyFactory.setOffDuty(interaction, {
                channelId: interaction.channelId,
                skipNotification: true, // Let the role change handler send the notification
                metadata: {
                    commandName: 'offduty',
                    triggeredAt: new Date().toISOString()
                }
            });

            // Handle the result
            if (!result.success) {
                return sendError(interaction, result.error);
            }

            // Create success embed
            const embed = {
                title: 'Admin Status Updated',
                description: `${interaction.user} is now off duty.`,
                color: 0xFF0000 // Red color
            };

            // Add warning if notification failed
            if (result.warning) {
                embed.description += `\n\n⚠️ ${result.warning}`;
            }

            return sendSuccess(
                interaction,
                'You are now off duty!',
                embed
            );
        } catch (error) {
            console.error('Error in offduty command:', error);
            return sendError(interaction, 'Failed to set you as off duty. Please try again or contact a server administrator.');
        }
    },
};