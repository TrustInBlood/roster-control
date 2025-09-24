const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendError, createResponseEmbed } = require('../utils/messageHandler');
const { PlayerDiscordLink } = require('../database/models');
const { isValidSteamId } = require('../utils/steamId');
const { logAccountLink } = require('../utils/discordLogger');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminlink')
    .setDescription('Admin commands to manage Discord-Steam account links')

    // Create link subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Link a Steam ID to a Discord user')
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
            .setRequired(false)))

    // Upgrade confidence subcommand (super admin only)
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade-confidence')
        .setDescription('Upgrade confidence score to 1.0 (SUPER ADMIN ONLY)')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Discord user whose confidence to upgrade')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for confidence upgrade')
            .setRequired(true))),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
        case 'create':
          await handleCreateLink(interaction);
          break;
        case 'upgrade-confidence':
          await handleUpgradeConfidence(interaction);
          break;
        default:
          await sendError(interaction, 'Unknown subcommand.');
        }
      } catch (error) {
        loggerConsole.error('Link command error:', error);
        await sendError(interaction, error.message || 'An error occurred while processing the link command.');
      }
    });
  }
};

async function handleCreateLink(interaction) {
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
}

async function handleUpgradeConfidence(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  // Find existing link
  const existingLink = await PlayerDiscordLink.findOne({
    where: {
      discord_user_id: targetUser.id,
      is_primary: true
    }
  });

  if (!existingLink) {
    await sendError(interaction, `No Steam account link found for <@${targetUser.id}>. User must have an existing link before confidence can be upgraded.`);
    return;
  }

  // Check current confidence
  const currentConfidence = existingLink.confidence_score;

  if (currentConfidence >= 1.0) {
    await sendError(interaction, `<@${targetUser.id}> already has maximum confidence score (${currentConfidence}).`);
    return;
  }

  // Show confirmation
  const confirmEmbed = createResponseEmbed({
    title: '🔐 Upgrade Confidence Score',
    description: `You are about to upgrade confidence score to **1.0 (Verified)** for:`,
    fields: [
      { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
      { name: 'Steam ID', value: existingLink.steamid64, inline: true },
      { name: 'Current Confidence', value: currentConfidence.toString(), inline: true },
      { name: 'New Confidence', value: '1.0 (Super Admin Verified)', inline: true },
      { name: 'Reason', value: reason, inline: false },
      { name: '⚠️ WARNING', value: 'This will grant **FULL staff whitelist access**. Only upgrade if you are 100% certain this Steam ID belongs to the Discord user.', inline: false }
    ],
    color: 0xff6b35
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_upgrade')
        .setLabel('Confirm Upgrade to 1.0')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔐'),
      new ButtonBuilder()
        .setCustomId('cancel_upgrade')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmRow],
    flags: MessageFlags.Ephemeral
  });

  // Handle confirmation
  const confirmCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === 'confirm_upgrade' || i.customId === 'cancel_upgrade') && i.user.id === interaction.user.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === 'cancel_upgrade') {
      await buttonInteraction.update({
        content: '❌ Confidence upgrade cancelled.',
        embeds: [],
        components: []
      });
      return;
    }

    // Perform the upgrade
    try {
      await buttonInteraction.deferUpdate();

      // Update the confidence score
      await existingLink.update({
        confidence_score: 1.0,
        link_source: 'manual', // Keep as manual since it's admin-initiated, track super admin in metadata
        metadata: {
          ...existingLink.metadata,
          super_admin_verification: {
            verified_by: interaction.user.id,
            verified_by_tag: interaction.user.tag,
            verified_at: new Date().toISOString(),
            reason: reason,
            previous_confidence: currentConfidence,
            upgrade_type: 'super_admin_confidence_upgrade'
          }
        }
      });

      // Log the upgrade
      await logAccountLink(interaction.client, targetUser, existingLink.steamid64, 'super_admin_upgrade', {
        'Previous Confidence': currentConfidence.toString(),
        'New Confidence': '1.0 (Super Admin Verified)',
        'Upgraded By': interaction.user.tag,
        'Reason': reason
      });

      const successEmbed = createResponseEmbed({
        title: '🔐 Confidence Upgraded Successfully',
        description: `Confidence score has been upgraded to **1.0** for <@${targetUser.id}>`,
        fields: [
          { name: 'Steam ID', value: existingLink.steamid64, inline: true },
          { name: 'Previous Confidence', value: currentConfidence.toString(), inline: true },
          { name: 'New Confidence', value: '1.0 (Super Admin Verified)', inline: true },
          { name: 'Upgraded By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: '✅ Staff Access', value: 'This user now has **FULL staff whitelist access** based on their Discord role.', inline: false }
        ],
        color: 0x00ff00
      });

      await buttonInteraction.editReply({
        content: '',
        embeds: [successEmbed],
        components: []
      });

      // Send public notification
      const publicEmbed = createResponseEmbed({
        title: '🔐 Confidence Score Upgraded',
        description: `<@${targetUser.id}>'s account link confidence has been upgraded to maximum level`,
        fields: [
          { name: 'Steam ID', value: existingLink.steamid64, inline: true },
          { name: 'New Confidence', value: '1.0 (Verified)', inline: true },
          { name: 'Upgraded By', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: 0x5865f2
      });

      await interaction.followUp({
        embeds: [publicEmbed]
      });

    } catch (error) {
      loggerConsole.error('Confidence upgrade error:', error);
      await buttonInteraction.editReply({
        content: `❌ Failed to upgrade confidence: ${error.message}`,
        embeds: [],
        components: []
      });
    }
  });

  confirmCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      interaction.editReply({
        content: '❌ Confidence upgrade timed out.',
        embeds: [],
        components: []
      });
    }
  });
}