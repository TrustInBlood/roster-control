const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createResponseEmbed } = require('../../../utils/messageHandler');
const { console: loggerConsole } = require('../../../utils/logger');

/**
 * Handle confirmation step for whitelist grant
 */
async function handleConfirmation(interaction, grantData) {
  const { reason, discordUser, userInfo, durationValue, durationType, durationText } = grantData;

  const confirmEmbed = createResponseEmbed({
    title: '✅ Confirm Whitelist Grant',
    description: 'Please confirm the whitelist details below:',
    fields: [
      { name: 'Discord User', value: discordUser ? `<@${discordUser.id}>` : 'Not linked', inline: true },
      { name: 'Steam ID', value: userInfo.steamid64, inline: true },
      { name: 'Type', value: reason.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true },
      { name: 'Duration', value: durationText, inline: true },
      { name: 'Granted By', value: `<@${grantData.originalUser.id}>`, inline: true }
    ],
    color: 0x4caf50
  });

  const confirmRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_grant')
        .setLabel('Confirm & Grant')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_grant')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [confirmRow]
  });

  // Handle confirmation
  const confirmCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === 'confirm_grant' || i.customId === 'cancel_grant') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  confirmCollector.on('collect', async (buttonInteraction) => {
    try {
      if (buttonInteraction.customId === 'cancel_grant') {
        await buttonInteraction.update({
          content: '❌ Whitelist grant cancelled.',
          embeds: [],
          components: []
        });
        return;
      }

      // Process the actual grant
      if (!buttonInteraction.deferred && !buttonInteraction.replied && buttonInteraction.customId !== 'whitelist_cancel') {
        await buttonInteraction.deferUpdate();
      }

      const { processWhitelistGrant } = require('../handlers/grantHandler');
      await processWhitelistGrant(buttonInteraction, {
        ...grantData,
        durationValue,
        durationType,
        durationText
      });
    } catch (error) {
      loggerConsole.error('Error handling confirmation:', error);
    }
  });
}

module.exports = {
  handleConfirmation
};