const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('syncwhitelist')
    .setDescription('Manually sync Discord roles to whitelist database (admin only)')
    .addBooleanOption(option =>
      option.setName('dryrun')
        .setDescription('Preview what would be synced without making changes')
        .setRequired(false)),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const dryRun = interaction.options.getBoolean('dryrun') ?? false;

        // Get the role change handler to access the sync service
        const { getRoleChangeHandler } = require('../handlers/roleChangeHandler');
        const roleChangeHandler = getRoleChangeHandler();

        if (!roleChangeHandler || !roleChangeHandler.roleWhitelistSync) {
          await sendError(interaction, 'Role whitelist sync service not available.');
          return;
        }

        const guildId = interaction.guild.id;
        const syncService = roleChangeHandler.roleWhitelistSync;

        const embed = createResponseEmbed({
          title: dryRun ? '🧪 Whitelist Sync Preview' : '⚡ Starting Whitelist Sync',
          description: `${dryRun ? 'Analyzing' : 'Syncing'} Discord roles to whitelist database...`,
          color: dryRun ? 0xFFA500 : 0x3498db
        });

        await interaction.editReply({ embeds: [embed] });

        // Perform the sync
        const result = await syncService.bulkSyncGuild(guildId, {
          dryRun,
          batchSize: 50
        });

        // Create results embed
        const resultEmbed = createResponseEmbed({
          title: dryRun ? '📊 Sync Analysis Results' : '✅ Sync Complete',
          color: result.failed > 0 ? 0xFFA500 : 0x00FF00
        });

        if (dryRun) {
          resultEmbed.setDescription(`Found ${result.membersToSync || 0} members that would be synced.`);
        } else {
          resultEmbed.setDescription(`Successfully synced ${result.successful || 0} members to whitelist database.`);
        }

        // Add detailed fields
        const fields = [
          { name: 'Total Members Scanned', value: (result.totalMembers || 0).toString(), inline: true },
          { name: 'Members with Tracked Roles', value: (result.membersToSync || 0).toString(), inline: true }
        ];

        if (!dryRun) {
          fields.push(
            { name: 'Successfully Processed', value: (result.successful || 0).toString(), inline: true },
            { name: 'Errors', value: (result.failed || 0).toString(), inline: true }
          );
        }

        if (result.groups && Object.keys(result.groups).length > 0) {
          const groupBreakdown = Object.entries(result.groups)
            .map(([group, count]) => `${group}: ${count}`)
            .join('\n');

          fields.push({
            name: 'Role Groups Found',
            value: groupBreakdown,
            inline: false
          });
        }

        resultEmbed.addFields(fields);

        if (dryRun && result.membersToSync > 0) {
          resultEmbed.addFields({
            name: 'Next Steps',
            value: 'Run this command with `dryrun: False` to perform the actual sync.',
            inline: false
          });
        }

        if (!dryRun && result.successful > 0) {
          resultEmbed.addFields({
            name: 'Database Updated',
            value: `${result.successful} role-based whitelist entries created/updated in database.`,
            inline: false
          });
        }

        await interaction.editReply({ embeds: [resultEmbed] });

      } catch (error) {
        console.error('Sync whitelist command error:', error);
        await sendError(interaction, error.message || 'An error occurred while syncing the whitelist.');
      }
    });
  }
};