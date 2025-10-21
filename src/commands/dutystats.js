const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DutyStatusChange } = require('../database/models');
const { sendError } = require('../utils/messageHandler');

// Helper function to format milliseconds to human-readable duration
function formatDuration(ms) {
  if (ms === 0) return '0m';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// Helper function to get date range from period parameter
function getDateRange(period) {
  const now = new Date();
  let startDate = null;
  let endDate = now;
  let periodLabel = '';

  switch (period) {
  case 'today':
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    periodLabel = 'Today';
    break;
  case 'week':
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 7 Days';
    break;
  case 'month':
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    periodLabel = 'Last 30 Days';
    break;
  case 'all-time':
  default:
    startDate = null;
    endDate = null;
    periodLabel = 'All Time';
    break;
  }

  return { startDate, endDate, periodLabel };
}

// Helper function to format relative time
function formatRelativeTime(date) {
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dutystats')
    .setDescription('View admin duty time statistics')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('View duty time stats for a specific user')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to view stats for (defaults to yourself)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Time period for stats')
            .setRequired(false)
            .addChoices(
              { name: 'Today', value: 'today' },
              { name: 'Last 7 Days', value: 'week' },
              { name: 'Last 30 Days', value: 'month' },
              { name: 'All Time', value: 'all-time' }
            )
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Duty type to filter')
            .setRequired(false)
            .addChoices(
              { name: 'Admin Duty', value: 'admin' },
              { name: 'Tutor Duty', value: 'tutor' },
              { name: 'Both', value: 'both' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View duty time leaderboard')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Time period for leaderboard')
            .setRequired(false)
            .addChoices(
              { name: 'Today', value: 'today' },
              { name: 'Last 7 Days', value: 'week' },
              { name: 'Last 30 Days', value: 'month' },
              { name: 'All Time', value: 'all-time' }
            )
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Duty type to filter')
            .setRequired(false)
            .addChoices(
              { name: 'Admin Duty', value: 'admin' },
              { name: 'Tutor Duty', value: 'tutor' },
              { name: 'Both', value: 'both' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of users to show (max 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('summary')
        .setDescription('View guild-wide duty statistics')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Time period for summary')
            .setRequired(false)
            .addChoices(
              { name: 'Today', value: 'today' },
              { name: 'Last 7 Days', value: 'week' },
              { name: 'Last 30 Days', value: 'month' },
              { name: 'All Time', value: 'all-time' }
            )
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Duty type to filter')
            .setRequired(false)
            .addChoices(
              { name: 'Admin Duty', value: 'admin' },
              { name: 'Tutor Duty', value: 'tutor' },
              { name: 'Both', value: 'both' }
            )
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();
      const period = interaction.options.getString('period') || 'month';
      const dutyType = interaction.options.getString('type') || 'admin';
      const { startDate, endDate, periodLabel } = getDateRange(period);

      if (subcommand === 'user') {
        await handleUserStats(interaction, startDate, endDate, periodLabel, dutyType);
      } else if (subcommand === 'leaderboard') {
        await handleLeaderboard(interaction, startDate, endDate, periodLabel, dutyType);
      } else if (subcommand === 'summary') {
        await handleSummary(interaction, startDate, endDate, periodLabel, dutyType);
      }
    } catch (error) {
      console.error('Error in dutystats command:', error);
      await sendError(interaction, 'Failed to retrieve duty statistics. Please try again later.');
    }
  }
};

async function handleUserStats(interaction, startDate, endDate, periodLabel, dutyType) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  // Calculate duty time for the user
  const stats = await DutyStatusChange.calculateDutyTime(
    targetUser.id,
    startDate,
    endDate,
    dutyType
  );

  if (stats.totalMs === 0) {
    return await sendError(
      interaction,
      `No duty time recorded for ${targetUser.tag} in the selected period.`
    );
  }

  // Get the most recent session
  const lastSession = stats.sessions.length > 0
    ? stats.sessions[stats.sessions.length - 1]
    : null;

  // Build embed
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Duty Time Report - ${targetUser.tag}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(`**Period:** ${periodLabel} | **Type:** ${dutyType === 'both' ? 'All' : dutyType.charAt(0).toUpperCase() + dutyType.slice(1)} Duty`)
    .addFields(
      { name: 'Total Time', value: formatDuration(stats.totalMs), inline: true },
      { name: 'Sessions', value: stats.sessionCount.toString(), inline: true },
      { name: 'Average Session', value: formatDuration(stats.averageSessionMs), inline: true },
      { name: 'Longest Session', value: formatDuration(stats.longestSessionMs), inline: true },
      {
        name: 'Last On Duty',
        value: lastSession ? formatRelativeTime(lastSession.start) : 'Never',
        inline: true
      },
      {
        name: 'Currently On Duty',
        value: lastSession && lastSession.isActive ? 'Yes' : 'No',
        inline: true
      }
    );

  // Add recent sessions (last 5)
  if (stats.sessions.length > 0) {
    const recentSessions = stats.sessions.slice(-5).reverse();
    const sessionsText = recentSessions.map(session => {
      const date = session.start.toLocaleDateString();
      const startTime = session.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const endTime = session.end
        ? session.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : 'Ongoing';
      const duration = formatDuration(session.duration);

      return `${date}: ${duration} (${startTime} - ${endTime})`;
    }).join('\n');

    embed.addFields({
      name: 'Recent Sessions',
      value: sessionsText || 'No sessions',
      inline: false
    });
  }

  embed.setFooter({ text: `Requested by ${interaction.user.tag}` });
  embed.setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleLeaderboard(interaction, startDate, endDate, periodLabel, dutyType) {
  const limit = interaction.options.getInteger('limit') || 10;

  // Get leaderboard data
  const leaderboard = await DutyStatusChange.getLeaderboard(
    interaction.guild.id,
    startDate,
    endDate,
    dutyType,
    limit
  );

  if (leaderboard.length === 0) {
    return await sendError(interaction, 'No duty time recorded in the selected period.');
  }

  // Fetch guild members to get display names
  const leaderboardWithDisplayNames = await Promise.all(
    leaderboard.map(async (entry) => {
      try {
        const member = await interaction.guild.members.fetch(entry.discordUserId);
        return {
          ...entry,
          displayName: member.displayName
        };
      } catch (error) {
        // User may have left the server, use username fallback
        return {
          ...entry,
          displayName: entry.discordUsername
        };
      }
    })
  );

  // Build embed
  const embed = new EmbedBuilder()
    .setColor('#ffa500')
    .setTitle(`Duty Time Leaderboard - ${periodLabel}`)
    .setDescription(`**Type:** ${dutyType === 'both' ? 'All' : dutyType.charAt(0).toUpperCase() + dutyType.slice(1)} Duty`);

  const medals = ['1st', '2nd', '3rd'];
  const leaderboardText = leaderboardWithDisplayNames.map((entry, index) => {
    const position = index < 3 ? medals[index] : `${index + 1}th`;
    const userMention = `<@${entry.discordUserId}>`;
    const time = formatDuration(entry.totalMs);
    const sessions = entry.sessionCount;

    return `${position} ${userMention} - ${time} (${sessions} sessions)`;
  }).join('\n');

  embed.addFields({ name: 'Rankings', value: leaderboardText, inline: false });
  embed.setFooter({ text: `Requested by ${interaction.user.tag}` });
  embed.setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleSummary(interaction, startDate, endDate, periodLabel, dutyType) {
  // Get guild-wide statistics
  const stats = await DutyStatusChange.getDutyStats(
    interaction.guild.id,
    startDate,
    endDate,
    dutyType
  );

  if (stats.totalAdmins === 0) {
    return await sendError(interaction, 'No duty time recorded in the selected period.');
  }

  // Format top contributor with mention
  let topContributorName = 'N/A';
  if (stats.topAdmin) {
    const userMention = `<@${stats.topAdmin.discordUserId}>`;
    topContributorName = `${userMention} (${formatDuration(stats.topAdmin.totalMs)})`;
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle(`Guild Duty Statistics - ${periodLabel}`)
    .setDescription(`**Type:** ${dutyType === 'both' ? 'All' : dutyType.charAt(0).toUpperCase() + dutyType.slice(1)} Duty`)
    .addFields(
      { name: 'Active Admins', value: stats.totalAdmins.toString(), inline: true },
      { name: 'Total Hours', value: stats.totalHours.toFixed(1), inline: true },
      { name: 'Total Sessions', value: stats.totalSessions.toString(), inline: true },
      {
        name: 'Avg Hours/Admin',
        value: stats.averageHoursPerAdmin.toFixed(1),
        inline: true
      },
      {
        name: 'Avg Session Length',
        value: formatDuration(stats.averageSessionMs),
        inline: true
      },
      {
        name: 'Top Contributor',
        value: topContributorName,
        inline: true
      }
    )
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
