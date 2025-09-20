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
          title: dryRun ? 'Whitelist Sync Preview' : 'Starting Whitelist Sync',
          description: dryRun ? 'Analyzing Discord roles to whitelist database...' : 'Syncing Discord roles to whitelist database...',
          color: dryRun ? 0xFFA500 : 0x3498db
        });

        await interaction.editReply({ embeds: [embed] });

        // Perform the sync
        const result = await syncService.bulkSyncGuild(guildId, {
          dryRun,
          batchSize: 50
        });

        // Create results embed
        const resultDescription = dryRun
          ? `Found ${result.membersToSync || 0} members that would be synced.`
          : `Successfully synced ${result.successful || 0} members to whitelist database.`;

        const resultEmbed = createResponseEmbed({
          title: dryRun ? 'Sync Analysis Results' : 'Sync Complete',
          description: resultDescription,
          color: result.failed > 0 ? 0xFFA500 : 0x00FF00
        });

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

          if (result.withoutSteamLinks > 0) {
            fields.push(
              { name: 'Without Steam Links', value: (result.withoutSteamLinks || 0).toString(), inline: true }
            );
          }

          if (result.staffWithoutLinks > 0) {
            fields.push(
              { name: 'Staff Need Steam Link', value: (result.staffWithoutLinks || 0).toString(), inline: true }
            );
          }
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
          let databaseText = `${result.successful} role-based whitelist entries created/updated in database.`;

          if (result.withoutSteamLinks > 0) {
            databaseText += `\n\n${result.withoutSteamLinks} users without Steam links were processed:`;
            if (result.staffWithoutLinks > 0) {
              databaseText += `\n- ${result.staffWithoutLinks} staff members created as unlinked entries (need Steam account linking)`;
            }
            const membersWithoutLinks = result.withoutSteamLinks - (result.staffWithoutLinks || 0);
            if (membersWithoutLinks > 0) {
              databaseText += `\n- ${membersWithoutLinks} regular members skipped (no database entry needed without Steam link)`;
            }
          }

          resultEmbed.addFields({
            name: 'Database Updated',
            value: databaseText,
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