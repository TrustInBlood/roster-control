const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { createResponseEmbed } = require('../utils/messageHandler');
const { console: loggerConsole } = require('../utils/logger');
const { resolveSteamIdFromDiscord } = require('../utils/accountLinking');

// API endpoint for player stats - configurable via environment variable
const STATS_API_URL = process.env.STATS_API_URL || 'http://216.114.75.101:12000/stats';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your player statistics'),

  async execute(interaction) {
    // Resolve Steam ID from the user's linked account
    const steamid = await resolveSteamIdFromDiscord(interaction.user.id);

    // If no linked account, show a button to link (reuses whitelist post button handler)
    if (!steamid) {
      const embed = createResponseEmbed({
        title: 'No Linked Account',
        description: 'You need to link your Steam account to view your stats.\n\nClick the button below to link your Steam ID.',
        color: 0xffa500
      });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('whitelist_post_link')
            .setLabel('Link Steam ID')
            .setStyle(ButtonStyle.Primary)
        );

      return await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

      // Format last seen date
      const lastSeen = stats.lastSeen
        ? new Date(stats.lastSeen).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
        : 'Never';

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
          { name: 'Nemesis', value: stats.nemesis || 'None', inline: true },
          { name: 'Last Seen', value: lastSeen, inline: true }
        ],
        color: 0x3498db
      });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      loggerConsole.error('Stats command error:', error);
      await interaction.editReply({ content: error.message || 'Failed to retrieve player statistics.' });
    }
  }
};
