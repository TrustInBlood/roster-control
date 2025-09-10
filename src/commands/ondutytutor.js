const { SlashCommandBuilder } = require('discord.js');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const DutyStatusFactory = require('../services/DutyStatusFactory');
const { TUTOR_ROLE_ID } = require('../../config/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ondutytutor')
        .setDescription('Set yourself as an on-duty tutor'),
    
    async execute(interaction) {
        try {
            // Check if user has the tutor role
            if (!interaction.member.roles.cache.has(TUTOR_ROLE_ID)) {
                return sendError(interaction, 'You must be a tutor to use this command.');
            }

            const dutyFactory = new DutyStatusFactory();
            
            // Attempt to set user on duty as tutor
            const result = await dutyFactory.setTutorOnDuty(interaction, {
                channelId: interaction.channelId,
                skipNotification: true, // Let the role change handler send the notification
                metadata: {
                    commandName: 'ondutytutor',
                    triggeredAt: new Date().toISOString()
                }
            });

            // Handle the result
            if (!result.success) {
                return sendError(interaction, result.error);
            }

            // Create success embed
            const embed = {
                title: 'Tutor Status Updated',
                description: `${interaction.user} is now on duty as a tutor.`,
                color: 0x00BFFF // Light blue color for tutors
            };

            // Add warning if notification failed
            if (result.warning) {
                embed.description += `\n\n⚠️ ${result.warning}`;
            }

            return sendSuccess(
                interaction,
                'You are now on duty as a tutor!',
                embed
            );
        } catch (error) {
            console.error('Error in ondutytutor command:', error);
            return sendError(interaction, 'Failed to set you as on duty tutor. Please try again or contact a server administrator.');
        }
    },
};