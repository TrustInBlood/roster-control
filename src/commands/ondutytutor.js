const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const { getRoleChangeHandler } = require('../handlers/roleChangeHandler');
const DutyStatusFactory = require('../services/DutyStatusFactory');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ondutytutor')
    .setDescription('Set yourself as an on-duty tutor'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        // Use the global duty factory from roleChangeHandler to prevent duplicate logging
        const roleChangeHandler = getRoleChangeHandler();
        const dutyFactory = roleChangeHandler?.dutyFactory || new DutyStatusFactory();
            
        // Attempt to set user on duty as tutor
        const result = await dutyFactory.setTutorOnDuty(interaction, {
          channelId: interaction.channelId,
          metadata: {
            commandName: 'ondutytutor',
            triggeredAt: new Date().toISOString()
          }
        });

        // Handle the result
        if (!result.success) {
          return sendError(interaction, result.error);
        }

        // Create success embed
        const embed = {
          title: 'Tutor Status Updated',
          description: `${interaction.user} is now on duty as a tutor.`,
          color: 0x00BFFF // Light blue color for tutors
        };

        // Add warning if notification failed
        if (result.warning) {
          embed.description += `\n\n⚠️ ${result.warning}`;
        }

        return sendSuccess(
          interaction,
          'You are now on duty as a tutor!',
          embed
        );
      } catch (error) {
        loggerConsole.error('Error in ondutytutor command:', error);
        return sendError(interaction, 'Failed to set you as on duty tutor. Please try again or contact a server administrator.');
      }
    });
  },
};