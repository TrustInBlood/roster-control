const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { logAccountLink } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminlink')
    .setDescription('Admin command to create Discord-Steam account links')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to link')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 to link')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for creating this link')
        .setRequired(false)),

  async execute(interaction) {
    // Use permission middleware - restricted to admin roles via 'adminlink' permission group
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('user');
        const steamId = interaction.options.getString('steamid');
        const reason = interaction.options.getString('reason') || 'Manual admin link';

        // Validate Steam ID
        if (!isValidSteamId(steamId)) {
          await sendError(interaction, 'Invalid Steam ID format. Please provide a valid Steam ID64.');
          return;
        }

        // Check if this Steam ID is already linked to someone else
        const existingLink = await PlayerDiscordLink.findOne({
          where: {
            steamid64: steamId,
            is_primary: true
          }
        });

        if (existingLink && existingLink.discord_user_id !== targetUser.id) {
          const existingUser = await interaction.client.users.fetch(existingLink.discord_user_id).catch(() => null);
          const warningEmbed = createResponseEmbed({
            title: '⚠️ Steam ID Already Linked',
            description: `This Steam ID is already linked to ${existingUser ? `<@${existingUser.id}>` : 'another user'}`,
            fields: [
              { name: 'Steam ID', value: steamId, inline: true },
              { name: 'Currently Linked To', value: existingUser ? `${existingUser.tag}` : `User ID: ${existingLink.discord_user_id}`, inline: true },
              { name: 'New Link Target', value: `${targetUser.tag}`, inline: true }
            ],
            color: 0xffa500
          });

          await interaction.editReply({
            embeds: [warningEmbed],
            content: '⚠️ **Warning**: This will update the existing link. The previous link will be marked as non-primary.'
          });

          // Give admin a moment to see the warning
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Create or update the link
        const linkResult = await PlayerDiscordLink.createManualLink(
          targetUser.id,
          steamId,
          null, // eosId
          targetUser.username,
          {
            created_by: interaction.user.id,
            created_by_tag: interaction.user.tag,
            reason: reason
          }
        );

        // Log to Discord - fetch member to get display name
        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(targetUser.id);
        } catch (error) {
          // Fallback to user if member fetch fails
          targetMember = targetUser;
        }

        // Get the admin's display name too
        let adminMember;
        try {
          adminMember = await interaction.guild.members.fetch(interaction.user.id);
        } catch (error) {
          adminMember = interaction.user;
        }
        const adminDisplayName = adminMember.displayName || adminMember.username || adminMember.tag;

        await logAccountLink(interaction.client, targetMember, steamId, 'admin', {
          confidence: '0.7 (Admin created)',
          'Created By': adminDisplayName,
          'Reason': reason
        });

        // Create success embed
        const successEmbed = createResponseEmbed({
          title: '✅ Steam ID Linked Successfully',
          description: linkResult.created ? 'New link created' : 'Existing link updated',
          fields: [
            { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Steam ID', value: steamId, inline: true },
            { name: 'Link Type', value: 'Manual (Admin)', inline: true },
            { name: 'Confidence Score', value: '0.7 (Admin Created)', inline: true },
            { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: '⚠️ Important', value: 'This link has confidence score 0.7 and **cannot** grant staff whitelist access. Only self-verified links (confidence 1.0) can access staff whitelist.', inline: false }
          ],
          color: 0xffa500 // Orange to indicate warning
        });

        await interaction.editReply({
          embeds: [successEmbed],
          content: ''
        });

        // Send a public notification (non-ephemeral)
        const publicEmbed = createResponseEmbed({
          title: '🔗 Account Linked',
          description: `<@${targetUser.id}> has been linked to Steam ID \`${steamId}\` by an administrator`,
          fields: [
            { name: 'Linked By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: true }
          ],
          color: 0x5865f2
        });

        await interaction.followUp({
          embeds: [publicEmbed]
        });

        // Trigger role-based whitelist sync for this user
        // This ensures their whitelist access is updated immediately if they have a whitelisted role
        //
        // What this does:
        // - If user has a staff role (HeadAdmin/SquadAdmin/Moderator), creates/upgrades their whitelist entry
        // - If user has a Member role, creates their whitelist entry
        // - Upgrades any existing unapproved/security-blocked entries to approved status
        // - Invalidates whitelist cache so changes appear immediately
        //
        // Note: Admin-created links have 0.7 confidence, which is below the 1.0 threshold for staff whitelist.
        // Users with staff roles will need to use /linkid to self-verify and get 1.0 confidence for staff access.
        if (global.whitelistServices?.roleWhitelistSync) {
          try {
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member) {
              const { getHighestPriorityGroup } = require('../utils/environment');
              const userGroup = getHighestPriorityGroup(member.roles.cache);

              if (userGroup) {
                loggerConsole.log(`Triggering role sync for linked user: ${targetUser.tag} (${userGroup})`);
                await global.whitelistServices.roleWhitelistSync.syncUserRole(
                  targetUser.id,
                  userGroup,
                  member,
                  { source: 'adminlink', skipNotification: false }
                );
                loggerConsole.log(`Role sync completed for ${targetUser.tag}`);
              }
            }
          } catch (syncError) {
            loggerConsole.error('Failed to sync user role after adminlink:', syncError);
            // Don't fail the command if sync fails - the link was still created successfully
          }
        }

      } catch (error) {
        loggerConsole.error('Adminlink command error:', error);
        await sendError(interaction, `Failed to create link: ${error.message}`);
      }
    });
  }
};