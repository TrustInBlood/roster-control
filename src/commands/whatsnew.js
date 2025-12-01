const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');
const { console: loggerConsole } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whatsnew')
    .setDescription('Admin command to view recent bot updates and new features'),

  async execute(interaction) {
    await permissionMiddleware(interaction, async () => {
      try {
      // Create the main updates embed
        const updatesEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('What\'s New - Roster Control Bot')
          .setDescription('Recent updates, new features, and improvements')
          .setTimestamp()
          .setFooter({
            text: 'Roster Control System',
            iconURL: interaction.client.user?.displayAvatarURL()
          });

        // Add recent updates (most recent first)
        updatesEmbed.addFields(
          {
            name: 'Member Addition & BattleMetrics Integration',
            value: '• **New `/addmember`** - Add Discord users as members with automatic role assignment\n' +
                 '• **BattleMetrics Member Flag** - Automatically adds "=B&B= Member" flag to player profiles\n' +
                 '• **Steam Account Linking** - Creates confidence 1.0 link with BattleMetrics validation\n' +
                 '• **Automatic Role Sync** - Triggers whitelist and role synchronization on member addition\n' +
                 '• **Comprehensive Logging** - Full audit trail with BattleMetrics profile metadata\n' +
                 '• **BattleMetrics Verification** - Validates player exists in BattleMetrics before adding\n' +
                 '• **Nickname Management** - Interactive nickname editing with modal dialog during addition\n' +
                 '• **Graceful Error Handling** - Handles existing flags, missing permissions, and API errors',
            inline: false
          }
        );

        // Add a second embed for usage info
        const infoEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('How to Use `/addmember`')
          .setDescription('Complete workflow for adding new members')
          .addFields(
            {
              name: 'Command Syntax',
              value: '`/addmember @discorduser <steamid>`\n\n' +
                   '**Parameters:**\n' +
                   '• `@discorduser` - Discord user to add as member\n' +
                   '• `<steamid>` - Their Steam ID64',
              inline: false
            },
            {
              name: 'What Happens',
              value: '1. Validates Steam ID format\n' +
                   '2. Looks up player in BattleMetrics\n' +
                   '3. Shows confirmation with Discord server nickname preview\n' +
                   '4. Allows editing Discord server nickname before confirming\n' +
                   '5. Creates Steam account link (1.0 confidence)\n' +
                   '6. Adds Member role to Discord user\n' +
                   '7. Sets Discord server nickname\n' +
                   '8. Adds "=B&B= Member" flag in BattleMetrics\n' +
                   '9. Triggers whitelist synchronization\n' +
                   '10. Logs to audit trail and member addition channel',
              inline: false
            },
            {
              name: 'Permissions',
              value: 'Restricted to users with **Applications** role',
              inline: false
            }
          );

        // Send both embeds (public but admin-only command)
        await interaction.reply({
          embeds: [updatesEmbed, infoEmbed],
          flags: 0 // Public response so others can see the updates
        });

      } catch (error) {
        loggerConsole.error('Whatsnew command error:', error);
      
        // Simple fallback response
        await interaction.reply({
          content: 'Failed to load updates. Please check with an administrator.',
          flags: MessageFlags.Ephemeral
        });
      }
    });
  }
};