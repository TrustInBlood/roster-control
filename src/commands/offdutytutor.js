const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { sendSuccess, sendError } = require('../utils/messageHandler');
const DutyStatusFactory = require('../services/DutyStatusFactory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('offdutytutor')
    .setDescription('Remove your on-duty tutor status'),
    
  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
    try {

      const dutyFactory = new DutyStatusFactory();
            
      // Attempt to set user off duty as tutor
      const result = await dutyFactory.setTutorOffDuty(interaction, {
        channelId: interaction.channelId,
        skipNotification: true, // Let the role change handler send the notification
        metadata: {
          commandName: 'offdutytutor',
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
        description: `${interaction.user} is now off duty as a tutor.`,
        color: 0x808080 // Gray color for off duty
      };

      // Add warning if notification failed
      if (result.warning) {
        embed.description += `\n\n⚠️ ${result.warning}`;
      }

      return sendSuccess(
        interaction,
        'You are now off duty as a tutor!',
        embed
      );
    } catch (error) {
      console.error('Error in offdutytutor command:', error);
      return sendError(interaction, 'Failed to set you as off duty tutor. Please try again or contact a server administrator.');
    }
    });
  },
};