const { SlashCommandBuilder } = require('discord.js');
const { sendSuccess, sendError, createResponseEmbed } = require('../utils/messageHandler');
const { TUTOR_LEAD_ROLE_ID, TUTOR_ROLE_ID, TUTOR_ON_DUTY_ROLE_ID, SPECIALTY_ROLES } = require('../../config/discord');
const { AuditLog } = require('../database/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removetutor')
        .setDescription('Remove all tutor roles and specialties from a user (Tutor Lead only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove all tutor roles from')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for removing tutor status')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            // Check if user has the tutor lead role
            if (!interaction.member.roles.cache.has(TUTOR_LEAD_ROLE_ID)) {
                return sendError(interaction, 'You must be a Tutor Program Lead to use this command.');
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) {
                return sendError(interaction, 'Could not find that user in this server.');
            }

            // Prevent removing tutor status from other tutor leads
            if (targetMember.roles.cache.has(TUTOR_LEAD_ROLE_ID) && targetUser.id !== interaction.user.id) {
                return sendError(interaction, 'Cannot remove tutor status from another Tutor Program Lead.');
            }

            const removedRoles = [];
            const failedRoles = [];
            const allTutorRoles = {
                'tutor': TUTOR_ROLE_ID,
                'tutor on-duty': TUTOR_ON_DUTY_ROLE_ID,
                ...Object.fromEntries(
                    Object.entries(SPECIALTY_ROLES).map(([key, value]) => [
                        key.toLowerCase().replace('_', ' ') + ' specialist', 
                        value
                    ])
                )
            };

            // Check if user has any tutor roles
            const hasAnyTutorRole = Object.values(allTutorRoles).some(roleId => 
                targetMember.roles.cache.has(roleId)
            );

            if (!hasAnyTutorRole) {
                return sendError(interaction, `${targetUser} does not have any tutor roles.`);
            }

            // Remove each tutor role that the user has
            for (const [roleName, roleId] of Object.entries(allTutorRoles)) {
                if (targetMember.roles.cache.has(roleId)) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        try {
                            await targetMember.roles.remove(role, `All tutor roles removed by ${interaction.user.tag}: ${reason}`);
                            removedRoles.push(roleName);
                        } catch (error) {
                            console.error(`Failed to remove ${roleName} role:`, error);
                            failedRoles.push(roleName);
                        }
                    }
                }
            }

            if (removedRoles.length === 0) {
                return sendError(interaction, 'Failed to remove any tutor roles. Please check bot permissions.');
            }

            // Log to database
            try {
                await AuditLog.create({
                    actionType: 'TUTOR_STATUS_REMOVED',
                    actorType: 'user',
                    actorId: interaction.user.id,
                    actorName: interaction.user.username,
                    targetType: 'user',
                    targetId: targetUser.id,
                    targetName: targetUser.username,
                    description: `All tutor roles removed from ${targetUser.username} by ${interaction.user.username}: ${reason}`,
                    guildId: interaction.guild.id,
                    channelId: interaction.channelId,
                    metadata: {
                        removedRoles: removedRoles,
                        failedRoles: failedRoles,
                        reason: reason
                    }
                });
            } catch (dbError) {
                console.error('Failed to log tutor removal:', dbError);
                // Continue - roles were removed successfully
            }

            // Create success embed
            const embed = createResponseEmbed({
                title: '🚫 Tutor Status Removed',
                description: `Successfully removed all tutor roles from ${targetUser}`,
                fields: [
                    { name: 'User', value: `${targetUser}`, inline: true },
                    { name: 'Roles Removed', value: removedRoles.join('\n') || 'None', inline: true },
                    { name: 'Removed By', value: `${interaction.user}`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                ],
                color: 0xFF1744
            });

            if (failedRoles.length > 0) {
                embed.fields.push({ 
                    name: '⚠️ Failed to Remove', 
                    value: failedRoles.join('\n'), 
                    inline: false 
                });
            }

            await sendSuccess(interaction, 'Tutor status removed successfully!', embed);

            // Send a public announcement
            try {
                const publicEmbed = createResponseEmbed({
                    title: '👋 Tutor Status Removed',
                    description: `${targetUser} is no longer a tutor.`,
                    fields: [
                        { name: 'Removed Roles', value: removedRoles.join(', '), inline: true },
                        { name: 'Reason', value: reason, inline: true }
                    ],
                    color: 0xFF1744
                });

                await interaction.followUp({
                    embeds: [publicEmbed]
                });
            } catch (followUpError) {
                console.error('Failed to send public announcement:', followUpError);
                // Non-critical error
            }

        } catch (error) {
            console.error('Error in removetutor command:', error);
            return sendError(interaction, 'An error occurred while removing tutor status.');
        }
    },
};