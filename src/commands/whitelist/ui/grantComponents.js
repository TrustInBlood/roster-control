const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ComponentType } = require('discord.js');
const { createResponseEmbed } = require('../../../utils/messageHandler');
const { console: loggerConsole } = require('../../../utils/logger');

/**
 * Show reason selection buttons for whitelist grant
 */
async function showReasonSelectionButtons(interaction, grantData) {
  const { discordUser, userInfo, originalUser, isSteamIdOnly } = grantData;

  const reasonEmbed = createResponseEmbed({
    title: '🎯 Select Whitelist Type',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}${isSteamIdOnly ? '\n\n⚠️ **Steam ID Only Grant** - No account linking will occur' : ''}\n\nPlease select the type of whitelist to grant:`,
    color: isSteamIdOnly ? 0xffa500 : 0x3498db
  });

  const reasonRow1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reason_service-member')
        .setLabel('Service Member')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎖️'),
      new ButtonBuilder()
        .setCustomId('reason_first-responder')
        .setLabel('First Responder')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚑'),
      new ButtonBuilder()
        .setCustomId('reason_donator')
        .setLabel('Donator')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('💎'),
      new ButtonBuilder()
        .setCustomId('reason_reporting')
        .setLabel('Reporting')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    );

  // Check if we need to reply or edit reply based on interaction state
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({
      embeds: [reasonEmbed],
      components: [reasonRow1]
    });
  } else {
    await interaction.reply({
      embeds: [reasonEmbed],
      components: [reasonRow1],
      flags: MessageFlags.Ephemeral
    });
  }

  // Handle reason button selection
  const reasonCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId.startsWith('reason_') && i.user.id === originalUser.id,
    time: 300000
  });

  reasonCollector.on('collect', async (reasonInteraction) => {
    const selectedReason = reasonInteraction.customId.replace('reason_', '');

    try {
      if (!reasonInteraction.deferred && !reasonInteraction.replied) {
        await reasonInteraction.deferUpdate();
      }

      // Import here to avoid circular dependency
      const { handleDurationSelection } = require('../handlers/grantHandler');
      await handleDurationSelection(reasonInteraction, {
        reason: selectedReason,
        discordUser,
        userInfo,
        originalUser,
        isSteamIdOnly
      });
    } catch (error) {
      loggerConsole.error('Error handling reason selection:', error);
      if (!reasonInteraction.replied && !reasonInteraction.deferred) {
        try {
          await reasonInteraction.reply({
            content: '❌ An error occurred while processing your selection. Please try again.',
            flags: MessageFlags.Ephemeral
          });
        } catch (replyError) {
          loggerConsole.error('Failed to send error reply:', replyError);
        }
      }
    }
  });

  reasonCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      interaction.editReply({
        content: '❌ Whitelist grant timed out. Please try again.',
        embeds: [],
        components: []
      });
    }
  });
}

/**
 * Show donator duration selection
 */
async function showDonatorDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;

  const durationEmbed = createResponseEmbed({
    title: '💎 Donator Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the donator whitelist duration:`,
    color: 0xe91e63
  });

  const durationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('donator_6m')
        .setLabel('6 Months')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📅'),
      new ButtonBuilder()
        .setCustomId('donator_1y')
        .setLabel('1 Year')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🗓️')
    );

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration button selection
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => (i.customId === 'donator_6m' || i.customId === 'donator_1y') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (buttonInteraction) => {
    try {
      const duration = buttonInteraction.customId === 'donator_6m' ? { value: 6, type: 'months', text: '6 months' } : { value: 12, type: 'months', text: '1 year' };

      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }

      // Import here to avoid circular dependency
      const { handleConfirmation } = require('./confirmationComponents');
      await handleConfirmation(buttonInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
    } catch (error) {
      loggerConsole.error('Error handling donator duration selection:', error);
    }
  });
}

/**
 * Show reporting duration selection
 */
async function showReportingDurationSelection(interaction, grantData) {
  const { discordUser, userInfo } = grantData;

  const durationEmbed = createResponseEmbed({
    title: '📋 Reporting Duration Selection',
    description: `**Steam ID:** ${userInfo.steamid64}\n${discordUser ? `**Discord User:** <@${discordUser.id}>` : '**Discord User:** Not linked'}\n\nSelect the reporting whitelist duration:`,
    color: 0xff9800
  });

  const durationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reporting_3d')
        .setLabel('3 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🕐'),
      new ButtonBuilder()
        .setCustomId('reporting_7d')
        .setLabel('7 Days')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📅'),
      new ButtonBuilder()
        .setCustomId('reporting_14d')
        .setLabel('14 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗓️'),
      new ButtonBuilder()
        .setCustomId('reporting_30d')
        .setLabel('30 Days')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📆'),
      new ButtonBuilder()
        .setCustomId('reporting_custom')
        .setLabel('Custom')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️')
    );

  await interaction.editReply({
    embeds: [durationEmbed],
    components: [durationRow]
  });

  // Handle duration button selection
  const durationCollector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId.startsWith('reporting_') && i.user.id === grantData.originalUser.id,
    time: 300000
  });

  durationCollector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === 'reporting_custom') {
      // Show modal for custom duration input
      const customDaysModal = new ModalBuilder()
        .setCustomId('reporting_custom_modal')
        .setTitle('Custom Reporting Duration');

      const daysInput = new TextInputBuilder()
        .setCustomId('custom_days_input')
        .setLabel('Number of Days')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter number of days (1-365)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(3);

      const daysRow = new ActionRowBuilder().addComponents(daysInput);
      customDaysModal.addComponents(daysRow);

      await buttonInteraction.showModal(customDaysModal);

      // Handle modal submission
      try {
        const modalResponse = await buttonInteraction.awaitModalSubmit({
          filter: (i) => i.customId === 'reporting_custom_modal' && i.user.id === grantData.originalUser.id,
          time: 300000
        });

        const customDays = parseInt(modalResponse.fields.getTextInputValue('custom_days_input'));

        if (isNaN(customDays) || customDays < 1 || customDays > 365) {
          await modalResponse.reply({
            content: '❌ Please enter a valid number of days between 1 and 365.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!modalResponse.deferred && !modalResponse.replied) {
          await modalResponse.deferUpdate();
        }

        // Import here to avoid circular dependency
        const { handleConfirmation } = require('./confirmationComponents');
        await handleConfirmation(modalResponse, {
          ...grantData,
          durationValue: customDays,
          durationType: 'days',
          durationText: `${customDays} day${customDays > 1 ? 's' : ''}`
        });

      } catch (error) {
        loggerConsole.error('Modal submission error:', error);
        // Modal timed out or errored
      }

      return;
    }

    // Handle preset duration buttons
    try {
      const durationMap = {
        'reporting_3d': { value: 3, type: 'days', text: '3 days' },
        'reporting_7d': { value: 7, type: 'days', text: '7 days' },
        'reporting_14d': { value: 14, type: 'days', text: '14 days' },
        'reporting_30d': { value: 30, type: 'days', text: '30 days' }
      };

      const duration = durationMap[buttonInteraction.customId];

      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }

      // Import here to avoid circular dependency
      const { handleConfirmation } = require('./confirmationComponents');
      await handleConfirmation(buttonInteraction, {
        ...grantData,
        durationValue: duration.value,
        durationType: duration.type,
        durationText: duration.text
      });
    } catch (error) {
      loggerConsole.error('Error handling reporting duration selection:', error);
    }
  });
}

module.exports = {
  showReasonSelectionButtons,
  showDonatorDurationSelection,
  showReportingDurationSelection
};