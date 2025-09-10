const { SlashCommandBuilder } = require('discord.js');
const { sendSuccess, sendError, createResponseEmbed } = require('../utils/messageHandler');
const { TUTOR_LEAD_ROLE_ID, SPECIALTY_ROLES } = require('../../config/discord');
const { AuditLog } = require('../database/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addspecialty')
        .setDescription('Assign a specialty role to a tutor (Tutor Lead only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('helicopter')
                .setDescription('Assign helicopter specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to assign the specialty to')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('armor')
                .setDescription('Assign armor specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to assign the specialty to')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('infantry')
                .setDescription('Assign infantry specialist role')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to assign the specialty to')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('expert')
                .setDescription('Assign squad expert role (all specialties)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to assign the specialty to')
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

            // Check if user already has the role
            if (targetMember.roles.cache.has(specialty.role)) {
                return sendError(interaction, `${targetUser} already has the ${specialty.name} role.`);
            }

            // Add the role
            try {
                await targetMember.roles.add(role, `Specialty assigned by ${interaction.user.tag}`);
            } catch (error) {
                console.error('Failed to add specialty role:', error);
                return sendError(interaction, 'Failed to assign the specialty role. Please check bot permissions.');
            }

            // Log to database
            try {
                await AuditLog.create({
                    actionType: 'SPECIALTY_ASSIGNED',
                    actorId: interaction.user.id,
                    actorUsername: interaction.user.username,
                    targetId: targetUser.id,
                    targetUsername: targetUser.username,
                    reason: `${specialty.name} role assigned`,
                    metadata: {
                        specialty: subcommand,
                        roleId: specialty.role,
                        roleName: specialty.name,
                        guildId: interaction.guild.id,
                        channelId: interaction.channelId
                    }
                });
            } catch (dbError) {
                console.error('Failed to log specialty assignment:', dbError);
                // Continue - role was assigned successfully
            }

            // Create success embed
            const embed = createResponseEmbed({
                title: '✅ Specialty Assigned',
                description: `Successfully assigned **${specialty.name}** role to ${targetUser}`,
                fields: [
                    { name: 'User', value: `${targetUser}`, inline: true },
                    { name: 'Specialty', value: specialty.name, inline: true },
                    { name: 'Assigned By', value: `${interaction.user}`, inline: true }
                ],
                color: 0x00FF00
            });

            await sendSuccess(interaction, 'Specialty assigned successfully!', embed);

            // Send a public announcement
            try {
                const publicEmbed = createResponseEmbed({
                    title: '🎓 Specialty Assigned',
                    description: `${targetUser} has been recognized as a **${specialty.name}**!`,
                    color: 0x00BFFF
                });

                await interaction.followUp({
                    embeds: [publicEmbed]
                });
            } catch (followUpError) {
                console.error('Failed to send public announcement:', followUpError);
                // Non-critical error
            }

        } catch (error) {
            console.error('Error in addspecialty command:', error);
            return sendError(interaction, 'An error occurred while assigning the specialty.');
        }
    },
};