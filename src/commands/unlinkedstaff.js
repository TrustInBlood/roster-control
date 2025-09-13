const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const { getRoleChangeHandler } = require('../handlers/roleChangeHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlinkedstaff')
    .setDescription('List staff members who haven\'t linked their Steam accounts'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();
        
        // Get role change handler to access role-based cache
        const roleChangeHandler = getRoleChangeHandler();
        
        if (!roleChangeHandler || !roleChangeHandler.roleBasedCache) {
          await sendError(interaction, 'Role-based cache not available. Please contact an administrator.');
          return;
        }
        
        const unlinkedStaff = roleChangeHandler.roleBasedCache.getUnlinkedStaff();
        
        if (unlinkedStaff.length === 0) {
          const embed = createResponseEmbed({
            title: '✅ All Staff Linked',
            description: 'All staff members have linked their Steam accounts!',
            color: 0x00FF00
          });
          
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Group by role for better organization
        const groupedStaff = {};
        unlinkedStaff.forEach(staff => {
          if (!groupedStaff[staff.group]) {
            groupedStaff[staff.group] = [];
          }
          groupedStaff[staff.group].push(staff);
        });
        
        const embed = createResponseEmbed({
          title: '🔗 Unlinked Staff Members',
          description: `${unlinkedStaff.length} staff member${unlinkedStaff.length === 1 ? '' : 's'} need to link their Steam accounts`,
          color: 0xFF9800
        });
        
        // Add fields for each group, splitting if necessary
        for (const [groupName, staffList] of Object.entries(groupedStaff)) {
          const staffTexts = [];
          let currentText = '';

          for (const staff of staffList) {
            const staffLine = `<@${staff.discordId}> (${staff.username})\n`;

            // Check if adding this line would exceed the limit (with some buffer)
            if (currentText.length + staffLine.length > 1000) {
              staffTexts.push(currentText.trim());
              currentText = staffLine;
            } else {
              currentText += staffLine;
            }
          }

          // Add any remaining text
          if (currentText) {
            staffTexts.push(currentText.trim());
          }

          // Add fields for this group
          staffTexts.forEach((text, index) => {
            const fieldName = staffTexts.length > 1
              ? `${groupName} (${staffList.length}) - Part ${index + 1}`
              : `${groupName} (${staffList.length})`;

            embed.addFields({
              name: fieldName,
              value: text,
              inline: false
            });
          });
        }
        
        embed.addFields({
          name: 'ℹ️ How to Link',
          value: 'Staff members can use `/linkid` command to link their Steam account and gain Squad server access.',
          inline: false
        });
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('Unlinked staff command error:', error);
        await sendError(interaction, error.message || 'An error occurred while retrieving unlinked staff.');
      }
    });
  }
};