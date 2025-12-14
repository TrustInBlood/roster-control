const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createResponseEmbed } = require('../utils/messageHandler');
const { console: loggerConsole } = require('../utils/logger');
const { resolveSteamIdFromDiscord } = require('../utils/accountLinking');
const { createLinkButtonRow, LINK_SOURCES } = require('../utils/linkButton');
const { CHANNELS } = require('../utils/environment');

// API endpoint for player stats - configurable via environment variable
const STATS_API_URL = process.env.STATS_API_URL || 'http://216.114.75.101:12000/stats';

// Cooldown settings
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your player statistics'),

  async execute(interaction) {
    // Check if command is being run in the correct channel
    if (interaction.channelId !== CHANNELS.STATS_COMMAND) {
      return await interaction.reply({
        content: `This command can only be used in <#${CHANNELS.STATS_COMMAND}>.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check cooldown
    const userId = interaction.user.id;
    const now = Date.now();
    const cooldownEnd = cooldowns.get(userId);

    if (cooldownEnd && now < cooldownEnd) {
      const remainingSeconds = Math.ceil((cooldownEnd - now) / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const timeDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      return await interaction.reply({
        content: `This command is on cooldown. Please wait **${timeDisplay}** before using it again.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Set cooldown
    cooldowns.set(userId, now + COOLDOWN_MS);

    // Resolve Steam ID from the user's linked account
    const steamid = await resolveSteamIdFromDiscord(interaction.user.id);

    // If no linked account, show a button to link
    if (!steamid) {
      const embed = createResponseEmbed({
        title: 'No Linked Account',
        description: 'You need to link your Steam account to view your stats.\n\nClick the button below to link your Steam ID.',
        color: 0xffa500
      });

      return await interaction.reply({
        embeds: [embed],
        components: [createLinkButtonRow({ source: LINK_SOURCES.STATS })],
        ephemeral: false
      });
    }

    await interaction.deferReply();

    try {
      // Make HTTP request to stats API
      const response = await fetch(`${STATS_API_URL}?steamid=${steamid}`);

      if (!response.ok) {
        if (response.status === 404) {
          return await interaction.editReply({ content: 'Player not found. You may not have played on our servers yet.' });
        }
        return await interaction.editReply({ content: `Failed to fetch stats: ${response.status} ${response.statusText}` });
      }

      const stats = await response.json();

      // Create embed with player stats
      const embed = createResponseEmbed({
        title: `Player Stats: ${stats.playerName || 'Unknown'}`,
        description: 'Your current statistics',
        fields: [
          { name: 'Kills', value: stats.kills?.toString() || '0', inline: true },
          { name: 'Deaths', value: stats.deaths?.toString() || '0', inline: true },
          { name: 'K/D Ratio', value: stats.kdRatio?.toFixed(2) || '0.00', inline: true },
          { name: 'Teamkills', value: stats.teamkills?.toString() || '0', inline: true },
          { name: 'Revives Given', value: stats.revivesGiven?.toString() || '0', inline: true },
          { name: 'Revives Received', value: stats.revivesReceived?.toString() || '0', inline: true },
          { name: 'Nemesis', value: stats.nemesis || 'None', inline: true }
        ],
        color: 0x3498db
      });

      // Set footer with last seen timestamp (displays in user's local time)
      if (stats.lastSeen) {
        embed.setFooter({ text: 'Last seen' });
        embed.setTimestamp(new Date(stats.lastSeen));
      } else {
        embed.setFooter({ text: 'Last seen: Never' });
        embed.setTimestamp(null);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      loggerConsole.error('Stats command error:', error);
      await interaction.editReply({ content: error.message || 'Failed to retrieve player statistics.' });
    }
  }
};
