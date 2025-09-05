const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { permissionMiddleware } = require('../handlers/permissionHandler');

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
        .setTitle('🚀 What\'s New - Roster Control Bot')
        .setDescription('Recent updates, new features, and improvements')
        .setTimestamp()
        .setFooter({
          text: 'Roster Control System',
          iconURL: interaction.client.user?.displayAvatarURL()
        });

      // Add recent updates (most recent first)
      updatesEmbed.addFields(
        {
          name: '🔗 Account Linking System (Latest)',
          value: '• **`/link`** - Admins can manually link Steam IDs to Discord users\n' +
                 '• **Confidence-based security** - Only self-verified links can access staff whitelist\n' +
                 '• **Ticket auto-linking** - Automatically detects Steam IDs in ticket channels\n' +
                 '• **Multiple linking methods** - Self-verification, admin linking, whitelist linking',
          inline: false
        },
        {
          name: '📋 Enhanced Whitelist System',
          value: '• **`/whitelist grant`** - Interactive whitelist granting with duration selection\n' +
                 '• **`/whitelist info`** - Check whitelist status and stacking\n' +
                 '• **`/whitelist extend`** - Extend existing whitelists\n' +
                 '• **`/whitelist revoke`** - Remove whitelist access\n' +
                 '• **Stacking system** - Multiple whitelist entries combine durations',
          inline: false
        },
        {
          name: '🎯 Legacy Command Detection',
          value: '• **Smart deprecation warnings** - Detects old `!addsm` and `!addfr` commands\n' +
                 '• **Migration guidance** - Shows users how to use new slash commands\n' +
                 '• **Steam ID detection** - Only warns when Steam IDs are detected',
          inline: false
        },
        {
          name: '👮 On-Duty System',
          value: '• **`/onduty` & `/offduty`** - Manage admin duty status\n' +
                 '• **Role-based tracking** - Discord roles determine duty status\n' +
                 '• **External change detection** - Tracks role changes made outside bot\n' +
                 '• **Voice channel monitoring** - Notifications when users join admin channels',
          inline: false
        },
        {
          name: '🔍 Account Verification',
          value: '• **`/linkid`** - Self-verify Steam ID with in-game code\n' +
                 '• **Secure verification** - Time-limited codes with in-game confirmation\n' +
                 '• **High confidence links** - Required for staff whitelist access',
          inline: false
        },
        {
          name: '📊 Security & Confidence Scores',
          value: '• **1.0** - Self-verified (staff whitelist eligible)\n' +
                 '• **0.7** - Admin-created links\n' +
                 '• **0.5** - Whitelist-created links\n' +
                 '• **0.3** - Auto-detected from tickets\n' +
                 '• **Staff whitelist protection** - Only highest confidence links allowed',
          inline: false
        }
      );

      // Add a second embed for additional info
      const infoEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('📋 Command Overview')
        .setDescription('Available commands and their purposes')
        .addFields(
          {
            name: '👨‍💼 Admin Commands',
            value: '`/link` - Link Steam ID to Discord user\n' +
                   '`/whitelist grant` - Grant whitelist access\n' +
                   '`/whitelist extend` - Extend whitelist duration\n' +
                   '`/whitelist revoke` - Remove whitelist access\n' +
                   '`/onduty` & `/offduty` - Manage duty status',
            inline: true
          },
          {
            name: '🔍 User Commands',
            value: '`/linkid` - Self-verify your Steam ID\n' +
                   '`/whitelist info` - Check whitelist status\n' +
                   '`/ping` - Test bot connectivity\n' +
                   '`/help` - View command help\n' +
                   '`/whatsnew` - This command!',
            inline: true
          },
          {
            name: '🌐 Integration Features',
            value: '• **HTTP Whitelist API** - External server access\n' +
                   '• **SquadJS Integration** - Real-time game events\n' +
                   '• **Discord Logging** - Comprehensive audit trail\n' +
                   '• **Automatic Migrations** - Database updates\n' +
                   '• **Multi-server Support** - 5 Squad servers',
            inline: false
          }
        );

      // Send both embeds (public but admin-only command)
      await interaction.reply({
        embeds: [updatesEmbed, infoEmbed],
        ephemeral: false // Public response so others can see the updates
      });

    } catch (error) {
      console.error('Whatsnew command error:', error);
      
      // Simple fallback response
      await interaction.reply({
        content: '❌ Failed to load updates. Please check with an administrator.',
        ephemeral: true
      });
    }
    });
  }
};