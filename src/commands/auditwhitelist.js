const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const { Whitelist, PlayerDiscordLink } = require('../database/models');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auditwhitelist')
    .setDescription('Audit all staff whitelist entries for security issues'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        loggerConsole.info('Starting whitelist security audit', {
          requestedBy: interaction.user.tag
        });

        // Get all approved, non-revoked staff entries (from any source)
        const staffEntries = await Whitelist.findAll({
          where: {
            type: 'staff',
            approved: true,
            revoked: false
          },
          order: [['source', 'ASC'], ['role_name', 'ASC'], ['steamid64', 'ASC']]
        });

        loggerConsole.info('Found staff entries', { count: staffEntries.length });

        const issues = [];
        const good = [];

        for (const entry of staffEntries) {
          // Skip placeholder entries (unlinked staff)
          if (entry.steamid64 === '00000000000000000') {
            issues.push({
              type: 'UNLINKED',
              severity: 'HIGH',
              entry,
              issue: 'No Steam account linked',
              confidence: 0
            });
            continue;
          }

          // Get the Discord user's primary link
          const primaryLink = await PlayerDiscordLink.findOne({
            where: {
              steamid64: entry.steamid64,
              is_primary: true
            },
            order: [['confidence_score', 'DESC'], ['created_at', 'DESC']]
          });

          if (!primaryLink) {
            issues.push({
              type: 'NO_LINK',
              severity: 'CRITICAL',
              entry,
              issue: 'Approved entry but no link record found',
              confidence: 0
            });
            continue;
          }

          if (primaryLink.confidence_score < 1.0) {
            issues.push({
              type: 'LOW_CONFIDENCE',
              severity: 'CRITICAL',
              entry,
              link: primaryLink,
              issue: `Confidence ${primaryLink.confidence_score}/1.0`,
              confidence: primaryLink.confidence_score
            });
          } else {
            good.push({
              entry,
              link: primaryLink,
              confidence: primaryLink.confidence_score
            });
          }
        }

        // Sort issues by severity
        issues.sort((a, b) => {
          const severityOrder = { CRITICAL: 0, HIGH: 1 };
          return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
        });

        const embed = createResponseEmbed({
          title: '🔍 Whitelist Security Audit',
          description: `Audited ${staffEntries.length} staff whitelist entries`,
          color: issues.length > 0 ? 0xFF0000 : 0x00FF00
        });

        // Summary
        embed.addFields({
          name: '📊 Summary',
          value: [
            `✅ **Secure entries**: ${good.length}`,
            `⚠️  **Security issues**: ${issues.length}`,
            issues.filter(i => i.severity === 'CRITICAL').length > 0 ? `🚨 **Critical issues**: ${issues.filter(i => i.severity === 'CRITICAL').length}` : null
          ].filter(Boolean).join('\n'),
          inline: false
        });

        // Show issues
        if (issues.length > 0) {
          let issueText = '';

          for (const issue of issues.slice(0, 20)) { // Limit to first 20
            const discordMention = issue.entry.discord_user_id ? `<@${issue.entry.discord_user_id}>` : 'Unknown';
            const username = issue.entry.username || issue.entry.discord_username || 'Unknown';

            issueText += `\n**${issue.severity}**: ${discordMention} (${username})`;
            issueText += `\n└─ Steam: \`${issue.entry.steamid64}\``;
            issueText += `\n└─ Role: ${issue.entry.role_name || issue.entry.source}`;
            issueText += `\n└─ Issue: ${issue.issue}`;

            if (issue.link) {
              issueText += `\n└─ Link: ${issue.link.link_source} (confidence: ${issue.link.confidence_score})`;
            }

            issueText += `\n└─ Entry ID: ${issue.entry.id}\n`;
          }

          if (issues.length > 20) {
            issueText += `\n... and ${issues.length - 20} more issues`;
          }

          // Split into multiple fields if too long
          const chunks = [];
          let currentChunk = '';

          for (const line of issueText.split('\n')) {
            if (currentChunk.length + line.length > 1000) {
              chunks.push(currentChunk);
              currentChunk = line + '\n';
            } else {
              currentChunk += line + '\n';
            }
          }
          if (currentChunk) chunks.push(currentChunk);

          chunks.forEach((chunk, idx) => {
            embed.addFields({
              name: idx === 0 ? '🚨 Security Issues' : `🚨 Security Issues (cont. ${idx + 1})`,
              value: chunk || 'None',
              inline: false
            });
          });

          embed.addFields({
            name: '⚙️ Recommended Actions',
            value: [
              '1. Review each critical issue',
              '2. Verify Steam IDs with BattleMetrics',
              '3. Use `/upgradeconfidence <user>` for verified accounts',
              '4. Use `/whitelist revoke <steamid>` for invalid entries',
              '5. Use `/unlink <user>` then `/adminlink <user> <steamid>` to fix wrong Steam IDs'
            ].join('\n'),
            inline: false
          });
        }

        // Show breakdown by source
        const bySource = {};
        staffEntries.forEach(entry => {
          bySource[entry.source] = (bySource[entry.source] || 0) + 1;
        });

        embed.addFields({
          name: '📋 Entries by Source',
          value: Object.entries(bySource).map(([source, count]) => `${source}: ${count}`).join('\n') || 'None',
          inline: true
        });

        // Show breakdown by confidence
        const byConfidence = {
          'High (≥1.0)': good.length,
          'Low (<1.0)': issues.filter(i => i.type === 'LOW_CONFIDENCE').length,
          'Unlinked': issues.filter(i => i.type === 'UNLINKED').length,
          'No Link': issues.filter(i => i.type === 'NO_LINK').length
        };

        embed.addFields({
          name: '🔐 Confidence Breakdown',
          value: Object.entries(byConfidence)
            .filter(([, count]) => count > 0)
            .map(([label, count]) => `${label}: ${count}`)
            .join('\n') || 'None',
          inline: true
        });

        await interaction.editReply({ embeds: [embed] });

        loggerConsole.info('Whitelist audit completed', {
          totalEntries: staffEntries.length,
          secureEntries: good.length,
          issues: issues.length,
          requestedBy: interaction.user.tag
        });

      } catch (error) {
        loggerConsole.error('Audit whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred during the audit.');
      }
    });
  }
};
