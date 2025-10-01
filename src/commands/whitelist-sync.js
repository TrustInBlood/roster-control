const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed } = require('../utils/messageHandler');
const RoleWhitelistSyncService = require('../services/RoleWhitelistSyncService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-sync')
    .setDescription('Sync Discord roles to database whitelist entries (super admin only)')
    .addBooleanOption(option =>
      option.setName('dry-run')
        .setDescription('Preview changes without making them')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const dryRun = interaction.options.getBoolean('dry-run') || false;
        const guildId = interaction.guild.id;

        loggerConsole.info('Whitelist sync initiated', {
          guildId,
          dryRun,
          requestedBy: interaction.user.id
        });

        // Create sync service with Discord client
        const syncService = new RoleWhitelistSyncService(loggerConsole, interaction.client);

        // Show initial message
        const initialEmbed = createResponseEmbed({
          title: dryRun ? '🔍 Whitelist Sync Preview' : '🔄 Syncing Whitelist',
          description: dryRun
            ? 'Analyzing Discord roles and database entries...'
            : 'Syncing Discord roles to database whitelist entries...',
          color: dryRun ? 0xffa500 : 0x3498db
        });

        await interaction.editReply({ embeds: [initialEmbed] });

        // Perform the sync
        const result = await syncService.bulkSyncGuild(guildId, {
          dryRun,
          batchSize: 25
        });

        // Create result embed
        const resultEmbed = createResponseEmbed({
          title: dryRun ? '🔍 Sync Preview Results' : '✅ Sync Complete',
          description: dryRun
            ? 'Preview of changes that would be made:'
            : 'Successfully synced Discord roles to database whitelist entries.',
          fields: [
            { name: 'Total Members', value: result.totalMembers?.toString() || 'Unknown', inline: true },
            { name: 'Members with Roles', value: (result.membersToSync || result.totalProcessed || 0).toString(), inline: true },
            { name: 'Successful', value: result.successful?.toString() || '0', inline: true }
          ],
          color: result.success ? 0x00ff00 : 0xff0000
        });

        if (result.failed && result.failed > 0) {
          resultEmbed.addFields({
            name: 'Failed',
            value: result.failed.toString(),
            inline: true
          });
        }

        if (result.withoutSteamLinks && result.withoutSteamLinks > 0) {
          resultEmbed.addFields({
            name: 'Without Steam Links',
            value: result.withoutSteamLinks.toString(),
            inline: true
          });
        }

        if (result.staffWithoutLinks && result.staffWithoutLinks > 0) {
          resultEmbed.addFields({
            name: '⚠️ Staff Without Links',
            value: result.staffWithoutLinks.toString(),
            inline: true
          });
        }

        if (dryRun && result.groups) {
          const groupInfo = Object.entries(result.groups)
            .map(([group, count]) => `• ${group}: ${count}`)
            .join('\n');

          if (groupInfo) {
            resultEmbed.addFields({
              name: 'Role Distribution',
              value: groupInfo,
              inline: false
            });
          }
        }

        if (!dryRun && result.staffWithoutLinks && result.staffWithoutLinks > 0) {
          resultEmbed.addFields({
            name: '📝 Next Steps',
            value: 'Some staff members don\'t have Steam account links. Use `/unlinkedstaff` to see who needs to link their accounts.',
            inline: false
          });
        }

        await interaction.editReply({ embeds: [resultEmbed] });

        loggerConsole.info('Whitelist sync completed', {
          guildId,
          dryRun,
          result: {
            success: result.success,
            totalProcessed: result.totalProcessed || result.membersToSync,
            successful: result.successful,
            failed: result.failed,
            withoutSteamLinks: result.withoutSteamLinks,
            staffWithoutLinks: result.staffWithoutLinks
          }
        });

      } catch (error) {
        loggerConsole.error('Whitelist sync failed', {
          error: error.message,
          stack: error.stack
        });

        const errorEmbed = createResponseEmbed({
          title: '❌ Sync Failed',
          description: `Failed to sync whitelist: ${error.message}`,
          color: 0xff0000
        });

        await interaction.editReply({ embeds: [errorEmbed] });
      }
    });
  }
};
