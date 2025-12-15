const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendError } = require('../utils/messageHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Get the link to the admin dashboard'),
  async execute(interaction) {
    const dashboardUrl = process.env.DASHBOARD_URL;

    if (!dashboardUrl) {
      return sendError(interaction, 'Dashboard URL not configured. Please set DASHBOARD_URL in environment variables.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Admin Dashboard')
      .setDescription('Access the admin dashboard to manage whitelist entries, view statistics, and more.')
      .addFields(
        { name: 'Dashboard Link', value: `[Click here to open](${dashboardUrl})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Roster Control Dashboard' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
