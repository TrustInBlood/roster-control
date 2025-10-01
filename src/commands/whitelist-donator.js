const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const WhitelistGrantService = require('../services/WhitelistGrantService');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist-donator')
    .setDescription('Grant donator whitelist and role')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to grant whitelist to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('steamid')
        .setDescription('Steam ID64 of the user')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Whitelist duration')
        .setRequired(true)
        .addChoices(
          { name: '6 Months', value: '6_months' },
          { name: '1 Year', value: '12_months' }
        )),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const discordUser = interaction.options.getUser('user');
        const steamid = interaction.options.getString('steamid');
        const durationChoice = interaction.options.getString('duration');

        // Parse duration
        let duration_value, durationText;
        if (durationChoice === '6_months') {
          duration_value = 6;
          durationText = '6 months';
        } else if (durationChoice === '12_months') {
          duration_value = 12;
          durationText = '1 year';
        } else {
          await sendError(interaction, 'Invalid duration selected.');
          return;
        }

        loggerConsole.info('Donator whitelist grant initiated', {
          discordUserId: discordUser.id,
          steamid,
          duration: durationText,
          grantedBy: interaction.user.id
        });

        // Create service instance
        const grantService = new WhitelistGrantService(interaction.client);

        // Grant whitelist with Discord user
        const result = await grantService.grantWithDiscord({
          discordUser,
          steamid64: steamid,
          reason: 'donator',
          duration_value,
          duration_type: 'months',
          granted_by: interaction.user.id,
          guild: interaction.guild,
          grantedByUser: interaction.user
        });

        if (!result.success) {
          const errorMessage = result.errors?.join('\n') || 'Unknown error occurred';
          await sendError(interaction, errorMessage);
          return;
        }

        // Build success embed
        const successEmbed = createResponseEmbed({
          title: '💎 Donator Whitelist Granted',
          description: 'Donator whitelist access has been granted successfully!',
          fields: [
            { name: 'Discord User', value: `<@${discordUser.id}>`, inline: true },
            { name: 'Steam ID', value: steamid, inline: true },
            { name: 'Type', value: 'Donator', inline: true },
            { name: 'Duration', value: durationText, inline: true },
            { name: 'Expires', value: result.expiration ? result.expiration.toLocaleDateString() : 'Never', inline: true },
            { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: 0xe91e63
        });

        if (result.roleAssigned && result.roleName) {
          successEmbed.addFields({
            name: '✅ Discord Role',
            value: `${result.roleName} role has been assigned`,
            inline: false
          });
        }

        if (result.linkCreated) {
          successEmbed.addFields({
            name: '🔗 Account Link',
            value: '✅ Discord-Steam link created (Confidence: 0.5)\n\n⚠️ **Action Required**: User should verify with `/linkid` to upgrade link confidence for staff whitelist access.',
            inline: false
          });
        } else {
          successEmbed.addFields({
            name: '🔗 Account Link',
            value: '✅ Discord-Steam link updated (existing link preserved)',
            inline: false
          });
        }

        await interaction.editReply({
          embeds: [successEmbed]
        });

        // Send public announcement
        try {
          const publicEmbed = createResponseEmbed({
            title: '💎 Donator Whitelist Granted',
            description: `<@${discordUser.id}> has been granted **Donator** whitelist access${result.roleAssigned ? ' and Discord role' : ''}`,
            fields: [
              { name: 'Duration', value: durationText, inline: true },
              { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true }
            ],
            color: 0xe91e63
          });

          await interaction.followUp({
            embeds: [publicEmbed]
          });
        } catch (publicError) {
          loggerConsole.error('Failed to send public announcement', {
            error: publicError.message
          });
        }

      } catch (error) {
        loggerConsole.error('Donator whitelist grant failed', {
          error: error.message,
          stack: error.stack
        });
        await sendError(interaction, `Failed to grant donator whitelist: ${error.message}`);
      }
    });
  }
};
