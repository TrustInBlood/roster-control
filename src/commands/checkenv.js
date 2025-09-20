const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { generateEnvironmentReport } = require('../utils/envValidator');
const { logger } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkenv')
    .setDescription('Check environment variable configuration status (admin only)'),

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
          content: '❌ This command requires Administrator permissions.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const report = generateEnvironmentReport();

      const requiredMissing = report.required.filter(item => !item.hasValue && !item.hasDefault);
      const requiredPresent = report.required.filter(item => item.hasValue || item.hasDefault);
      const optionalPresent = report.optional.filter(item => item.hasValue || item.hasDefault);
      const optionalMissing = report.optional.filter(item => !item.hasValue && !item.hasDefault);

      const statusColor = requiredMissing.length > 0 ? 0xff0000 : 0x00ff00;

      const embed = {
        color: statusColor,
        title: '🔧 Environment Configuration Status',
        description: requiredMissing.length > 0
          ? '⚠️ Some required environment variables are missing!'
          : '✅ All required environment variables are configured',
        fields: [],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Environment Validator'
        }
      };

      if (requiredPresent.length > 0) {
        embed.fields.push({
          name: '✅ Required Variables (Present)',
          value: requiredPresent.map(item => {
            const status = item.hasValue ? '✓' : '🔧 (default)';
            return `${status} \`${item.name}\` (${item.type})`;
          }).join('\n'),
          inline: false
        });
      }

      if (requiredMissing.length > 0) {
        embed.fields.push({
          name: '❌ Required Variables (Missing)',
          value: requiredMissing.map(item => `❌ \`${item.name}\` (${item.type})`).join('\n'),
          inline: false
        });
      }

      if (optionalPresent.length > 0) {
        embed.fields.push({
          name: '🔧 Optional Variables (Present)',
          value: optionalPresent.map(item => {
            const status = item.hasValue ? '✓' : '🔧 (default)';
            return `${status} \`${item.name}\` (${item.type})`;
          }).join('\n'),
          inline: false
        });
      }

      if (optionalMissing.length > 0 && optionalMissing.length <= 10) {
        embed.fields.push({
          name: '⚪ Optional Variables (Not Set)',
          value: optionalMissing.map(item => `⚪ \`${item.name}\` (${item.type})`).join('\n'),
          inline: false
        });
      } else if (optionalMissing.length > 10) {
        embed.fields.push({
          name: '⚪ Optional Variables (Not Set)',
          value: `${optionalMissing.length} optional variables not configured`,
          inline: false
        });
      }

      embed.fields.push({
        name: '📊 Summary',
        value: [
          `Required: ${requiredPresent.length}/${report.required.length}`,
          `Optional: ${optionalPresent.length}/${report.optional.length}`,
          `Total Variables: ${report.current.length}`
        ].join('\n'),
        inline: false
      });

      if (requiredMissing.length > 0) {
        embed.fields.push({
          name: '💡 Next Steps',
          value: [
            '1. Check your `.env` file against `.env.example`',
            '2. Ensure all required variables have values',
            '3. Restart the bot after making changes'
          ].join('\n'),
          inline: false
        });
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

      logger.info('Environment check requested', {
        requestedBy: interaction.user.tag,
        userId: interaction.user.id,
        requiredMissing: requiredMissing.length,
        totalRequired: report.required.length,
        optionalPresent: optionalPresent.length
      });

    } catch (error) {
      logger.error('Failed to check environment configuration', {
        userId: interaction.user.id,
        error: error.message
      });

      await interaction.reply({
        content: '❌ Failed to check environment configuration. Please check the logs.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};