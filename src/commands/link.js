const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendSuccess, sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { logAccountLink } = require('../utils/discordLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Admin command to link a Steam ID to a Discord user')
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
    // Use permission middleware - will use the 'duty' permission group
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

        // Log to Discord
        await logAccountLink(interaction.client, targetUser, steamId, 'admin', {
          confidence: '0.7 (Admin created)',
          'Created By': `${interaction.user.tag}`,
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

      } catch (error) {
        console.error('Link command error:', error);
        await sendError(interaction, `Failed to create link: ${error.message}`);
      }
    });
  }
};