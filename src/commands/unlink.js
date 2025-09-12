const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PlayerDiscordLink, UnlinkHistory } = require('../database/models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Unlink your Discord account from your game account'),
  
  async execute(interaction) {
    try {
      const discordUserId = interaction.user.id;

      const existingLink = await PlayerDiscordLink.findByDiscordId(discordUserId);

      if (!existingLink) {
        await interaction.reply({
          content: 'No linked game account found for your Discord account.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await UnlinkHistory.recordUnlink(
        discordUserId,
        existingLink.steamid64,
        existingLink.eosID,
        existingLink.username,
        'User request via /unlink command'
      );

      await existingLink.destroy();

      const embed = {
        color: 0xff9900,
        title: 'Account Unlinked Successfully',
        fields: [
          {
            name: 'Unlinked Account',
            value: `**Username:** ${existingLink.username || 'Unknown'}\n**Steam ID:** ${existingLink.steamid64 || 'N/A'}\n**EOS ID:** ${existingLink.eosID || 'N/A'}`,
            inline: false
          },
          {
            name: 'What happens now?',
            value: 'Your Discord account is no longer linked to your game account. You can use `/linkid` to create a new link if needed.',
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Roster Control System'
        }
      };

      await interaction.reply({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
      });

      interaction.client.logger?.info('Account unlinked', {
        discordUserId,
        steamid64: existingLink.steamid64,
        eosID: existingLink.eosID,
        username: existingLink.username
      });

    } catch (error) {
      interaction.client.logger?.error('Failed to unlink account', {
        discordUserId: interaction.user.id,
        error: error.message
      });

      await interaction.reply({
        content: 'Failed to unlink your account. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};