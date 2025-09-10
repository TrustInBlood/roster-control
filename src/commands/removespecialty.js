const { SlashCommandBuilder } = require('discord.js');
const { sendSuccess, sendError, createResponseEmbed } = require('../utils/messageHandler');
const { TUTOR_LEAD_ROLE_ID, SPECIALTY_ROLES } = require('../../config/discord');
const { AuditLog } = require('../database/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removespecialty')
        .setDescription('Remove a specialty role from a tutor (Tutor Lead only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('helicopter')
                .setDescription('Remove helicopter specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove the specialty from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('armor')
                .setDescription('Remove armor specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove the specialty from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('infantry')
                .setDescription('Remove infantry specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove the specialty from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('expert')
                .setDescription('Remove squad expert role (all specialties)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove the specialty from')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('Remove all specialty roles from a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove all specialties from')
                        .setRequired(true))),
    
    async execute(interaction) {
        try {
            // Check if user has the tutor lead role
            if (!interaction.member.roles.cache.has(TUTOR_LEAD_ROLE_ID)) {
                return sendError(interaction, 'You must be a Tutor Program Lead to use this command.');
            }

            const subcommand = interaction.options.getSubcommand();
            const targetUser = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) {
                return sendError(interaction, 'Could not find that user in this server.');
            }

            // Handle "all" subcommand separately
            if (subcommand === 'all') {
                return await handleRemoveAll(interaction, targetMember, targetUser);
            }

            // Map subcommand to role
            const specialtyMap = {
                'helicopter': { role: SPECIALTY_ROLES.HELICOPTER, name: 'Helicopter Specialist' },
                'armor': { role: SPECIALTY_ROLES.ARMOR, name: 'Armor Specialist' },
                'infantry': { role: SPECIALTY_ROLES.INFANTRY, name: 'Infantry Specialist' },
                'expert': { role: SPECIALTY_ROLES.EXPERT, name: 'Squad Expert' }
            };

            const specialty = specialtyMap[subcommand];
            if (!specialty) {
                return sendError(interaction, 'Invalid specialty selected.');
            }

            // Get the role
            const role = interaction.guild.roles.cache.get(specialty.role);
            if (!role) {
                return sendError(interaction, `The ${specialty.name} role has not been configured. Please contact a server administrator.`);
            }

            // Check if user has the role
            if (!targetMember.roles.cache.has(specialty.role)) {
                return sendError(interaction, `${targetUser} does not have the ${specialty.name} role.`);
            }

            // Remove the role
            try {
                await targetMember.roles.remove(role, `Specialty removed by ${interaction.user.tag}`);
            } catch (error) {
                console.error('Failed to remove specialty role:', error);
                return sendError(interaction, 'Failed to remove the specialty role. Please check bot permissions.');
            }

            // Log to database
            try {
                await AuditLog.create({
                    actionType: 'SPECIALTY_REMOVED',
                    actorId: interaction.user.id,
                    actorUsername: interaction.user.username,
                    targetId: targetUser.id,
                    targetUsername: targetUser.username,
                    reason: `${specialty.name} role removed`,
                    metadata: {
                        specialty: subcommand,
                        roleId: specialty.role,
                        roleName: specialty.name,
                        guildId: interaction.guild.id,
                        channelId: interaction.channelId
                    }
                });
            } catch (dbError) {
                console.error('Failed to log specialty removal:', dbError);
                // Continue - role was removed successfully
            }

            // Create success embed
            const embed = createResponseEmbed({
                title: '✅ Specialty Removed',
                description: `Successfully removed **${specialty.name}** role from ${targetUser}`,
                fields: [
                    { name: 'User', value: `${targetUser}`, inline: true },
                    { name: 'Specialty', value: specialty.name, inline: true },
                    { name: 'Removed By', value: `${interaction.user}`, inline: true }
                ],
                color: 0xFF9800
            });

            await sendSuccess(interaction, 'Specialty removed successfully!', embed);

            // Send a public announcement
            try {
                const publicEmbed = createResponseEmbed({
                    title: '📝 Specialty Removed',
                    description: `${targetUser} no longer holds the **${specialty.name}** role.`,
                    color: 0xFF9800
                });

                await interaction.followUp({
                    embeds: [publicEmbed]
                });
            } catch (followUpError) {
                console.error('Failed to send public announcement:', followUpError);
                // Non-critical error
            }

        } catch (error) {
            console.error('Error in removespecialty command:', error);
            return sendError(interaction, 'An error occurred while removing the specialty.');
        }
    },
};

async function handleRemoveAll(interaction, targetMember, targetUser) {
    const removedRoles = [];
    const failedRoles = [];

    // Try to remove each specialty role
    for (const [specialtyKey, roleId] of Object.entries(SPECIALTY_ROLES)) {
        if (targetMember.roles.cache.has(roleId)) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                try {
                    await targetMember.roles.remove(role, `All specialties removed by ${interaction.user.tag}`);
                    removedRoles.push(specialtyKey.toLowerCase().replace('_', ' '));
                } catch (error) {
                    console.error(`Failed to remove ${specialtyKey} role:`, error);
                    failedRoles.push(specialtyKey.toLowerCase().replace('_', ' '));
                }
            }
        }
    }

    if (removedRoles.length === 0) {
        return sendError(interaction, `${targetUser} does not have any specialty roles.`);
    }

    // Log to database
    try {
        await AuditLog.create({
            actionType: 'ALL_SPECIALTIES_REMOVED',
            actorId: interaction.user.id,
            actorUsername: interaction.user.username,
            targetId: targetUser.id,
            targetUsername: targetUser.username,
            reason: 'All specialty roles removed',
            metadata: {
                removedRoles: removedRoles,
                failedRoles: failedRoles,
                guildId: interaction.guild.id,
                channelId: interaction.channelId
            }
        });
    } catch (dbError) {
        console.error('Failed to log all specialties removal:', dbError);
        // Continue - roles were removed successfully
    }

    // Create success embed
    const embed = createResponseEmbed({
        title: '✅ All Specialties Removed',
        description: `Successfully removed all specialty roles from ${targetUser}`,
        fields: [
            { name: 'User', value: `${targetUser}`, inline: true },
            { name: 'Roles Removed', value: removedRoles.join(', ') || 'None', inline: true },
            { name: 'Removed By', value: `${interaction.user}`, inline: true }
        ],
        color: 0xFF5722
    });

    if (failedRoles.length > 0) {
        embed.fields.push({ 
            name: '⚠️ Failed to Remove', 
            value: failedRoles.join(', '), 
            inline: false 
        });
    }

    await sendSuccess(interaction, 'All specialties removed successfully!', embed);

    // Send a public announcement
    try {
        const publicEmbed = createResponseEmbed({
            title: '🔄 All Specialties Removed',
            description: `${targetUser} has had all specialty roles removed.`,
            fields: [
                { name: 'Roles Removed', value: removedRoles.join(', '), inline: true }
            ],
            color: 0xFF5722
        });

        await interaction.followUp({
            embeds: [publicEmbed]
        });
    } catch (followUpError) {
        console.error('Failed to send public announcement:', followUpError);
        // Non-critical error
    }
}