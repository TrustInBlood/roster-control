const { Whitelist } = require('../../../database/models');
const { createResponseEmbed, withLoadingMessage, sendSuccess } = require('../../../utils/messageHandler');
const { console: loggerConsole } = require('../../../utils/logger');
const { resolveUserForInfo } = require('../utils/userResolution');
const { WHITELIST_AWARD_ROLES } = require('../../../../config/discord');

/**
 * Handle revoke subcommand
 */
async function handleRevoke(interaction) {
  await withLoadingMessage(interaction, 'Revoking whitelist...', async () => {
    const discordUser = interaction.options.getUser('user');
    const steamid = interaction.options.getString('steamid');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Use the new helper that works with either user OR steamid
    const { steamid64: resolvedSteamId, discordUser: resolvedDiscordUser } = await resolveUserForInfo(steamid, discordUser);

    // Ensure we have a Steam ID for revocation
    if (!resolvedSteamId) {
      throw new Error('No Steam ID found. Please provide a Steam ID or link the Discord account first.');
    }

    // Revoke the whitelist
    const revokedCount = await Whitelist.revokeWhitelist(
      resolvedSteamId,
      reason,
      interaction.user.id
    );

    if (revokedCount === 0) {
      throw new Error('No active whitelist entries found for this user.');
    }

    // Remove Discord roles based on revoked whitelist entries
    let rolesRemoved = [];
    if (resolvedDiscordUser) {
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(resolvedDiscordUser.id).catch(() => null);

        if (member) {
          // Check if user still has any active whitelist entries
          const whitelistStatus = await Whitelist.getActiveWhitelistForUser(resolvedSteamId);

          // Only remove roles if user has no active whitelist entries
          if (!whitelistStatus.hasWhitelist) {
            // Check which whitelist roles the user has and remove them
            for (const [reasonKey, roleId] of Object.entries(WHITELIST_AWARD_ROLES)) {
              if (roleId && member.roles.cache.has(roleId)) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                  await member.roles.remove(role, `Whitelist revoked by ${interaction.user.tag}`);
                  rolesRemoved.push(reasonKey.toLowerCase().replace('_', ' '));
                }
              }
            }
          }
        }
      } catch (error) {
        loggerConsole.error('Failed to remove whitelist roles:', error);
        // Continue without failing the command
      }
    }

    const embed = createResponseEmbed({
      title: '❌ Whitelist Revoked',
      description: `Successfully revoked whitelist access${rolesRemoved.length > 0 ? ' and removed Discord roles' : ''}`,
      fields: [
        { name: 'User', value: resolvedDiscordUser ? `<@${resolvedDiscordUser.id}>` : 'Unknown Discord User', inline: true },
        { name: 'Steam ID', value: resolvedSteamId, inline: true },
        { name: 'Entries Revoked', value: revokedCount.toString(), inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Revoked By', value: `<@${interaction.user.id}>`, inline: true }
      ],
      color: 0xFF0000
    });

    if (rolesRemoved.length > 0) {
      embed.addFields({
        name: 'Discord Roles',
        value: `✅ Removed: ${rolesRemoved.join(', ')}`,
        inline: true
      });
    } else if (resolvedDiscordUser) {
      embed.addFields({ name: 'Discord Roles', value: '⚠️ Role removal not needed or failed', inline: true });
    }

    await sendSuccess(interaction, 'Whitelist revoked successfully!', embed);
  });
}

module.exports = {
  handleRevoke
};