const { SlashCommandBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { createResponseEmbed, sendError } = require('../utils/messageHandler');
const { Whitelist, PlayerDiscordLink } = require('../database/models');
const { getHighestPriorityGroup, squadGroups } = require('../utils/environment');
const { getAllTrackedRoles } = squadGroups;
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlinkedstaff')
    .setDescription('List staff members who haven\'t linked their Steam accounts'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
        await interaction.deferReply();

        const guild = interaction.guild;
        const trackedRoles = getAllTrackedRoles();

        // Fetch all guild members
        const members = await guild.members.fetch();

        // Find staff members (non-Member roles) who lack proper Steam links
        const unlinkedStaff = [];

        for (const [memberId, member] of members) {
          if (member.user.bot) continue; // Skip bots

          const userGroup = getHighestPriorityGroup(member.roles.cache);

          // Only check staff members (not regular Members)
          if (!userGroup || userGroup === 'Member') continue;

          // Check if they have a high-confidence Steam link
          const primaryLink = await PlayerDiscordLink.findOne({
            where: {
              discord_user_id: memberId,
              is_primary: true,
              confidence_score: { [require('sequelize').Op.gte]: 1.0 }
            }
          });

          // If no high-confidence link, they're considered unlinked staff
          if (!primaryLink) {
            unlinkedStaff.push({
              discordId: memberId,
              username: member.displayName || member.user.username,
              userTag: member.user.tag,
              group: userGroup
            });
          }
        }
        
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
          description: `${unlinkedStaff.length} staff member${unlinkedStaff.length === 1 ? '' : 's'} need to link their Steam accounts with high confidence (≥1.0)`,
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
          value: 'Staff members can use `/linkid` command to link their Steam account and gain Squad server admin permissions and whitelist access.',
          inline: false
        });
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        loggerConsole.error('Unlinked staff command error:', error);
        await sendError(interaction, error.message || 'An error occurred while retrieving unlinked staff.');
      }
    });
  }
};