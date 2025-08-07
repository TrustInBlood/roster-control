const { SlashCommandBuilder } = require('discord.js');
const { ON_DUTY_ROLE_ID } = require('../../config/roles');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const { sendDutyNotification } = require('../utils/dutyNotifications');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('onduty')
        .setDescription('Set yourself as an on-duty admin'),
    
    async execute(interaction) {
        try {
            // Get the on-duty role
            const onDutyRole = interaction.guild.roles.cache.get(ON_DUTY_ROLE_ID);
            if (!onDutyRole) {
                return sendError(interaction, 'The on-duty role could not be found. Please contact a server administrator.');
            }

            // Check if they already have the role
            if (interaction.member.roles.cache.has(ON_DUTY_ROLE_ID)) {
                return sendError(interaction, 'You are already on duty!');
            }

            // Check if bot has necessary permissions
            const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
            if (!botMember.permissions.has('ManageRoles')) {
                return sendError(interaction, 'I don\'t have permission to manage roles. Please ask a server administrator to give me the "Manage Roles" permission.');
            }

            // Check if bot's role is high enough
            if (botMember.roles.highest.position <= onDutyRole.position) {
                return sendError(interaction, 'I can\'t assign the on-duty role because it\'s higher than or equal to my highest role. Please ask a server administrator to move my role above the on-duty role.');
            }

            // Add the role
            await interaction.member.roles.add(onDutyRole);
            
            // Send notification and get result
            const notificationResult = await sendDutyNotification(interaction, true);
            
            // Send success message with warning if notification failed
            const embed = {
                title: 'Admin Status Updated',
                description: `${interaction.user} is now on duty.`,
                color: 0x00FF00 // Green color
            };

            if (!notificationResult.success && notificationResult.warning) {
                embed.description += `\n\n⚠️ ${notificationResult.warning}`;
            }

            return sendSuccess(
                interaction,
                'You are now on duty!',
                embed
            );
        } catch (error) {
            console.error('Error in onduty command:', error);
            if (error.code === 50013) {
                return sendError(interaction, 'I don\'t have permission to manage roles. Please ask a server administrator to check my role permissions and position.');
            }
            return sendError(interaction, 'Failed to set you as on duty. Please try again or contact a server administrator.');
        }
    },
};