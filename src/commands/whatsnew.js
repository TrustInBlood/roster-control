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
            name: 'Improved Whitelist UX & Security (Latest)',
            value: '• **Required Discord User** - `/whitelist grant` now requires Discord user for better linking\n' +
                 '• **Steam ID Only Mode** - New `/whitelist grant-steamid` for admin-only edge cases\n' +
                 '• **Button-Based UI** - Replaced dropdown with intuitive button interface\n' +
                 '• **Enhanced Security** - Steam-only grants restricted to admin roles with warnings\n' +
                 '• **Better Audit Trail** - Logs distinguish between normal and steam-only grants\n' +
                 '• **Consistent Experience** - All selections now use button interface',
            inline: false
          },
          {
            name: 'Whitelist Attribution Bug Fix',
            value: '• **Fixed Bulk Donation Attribution** - Steam-only grants no longer incorrectly link to existing Discord users\n' +
                 '• **Prevented Cross-Contamination** - Standalone Steam ID whitelists remain unattributed\n' +
                 '• **Enhanced Security** - Explicit validation prevents automatic linking during whitelist operations\n' +
                 '• **Preserved Functionality** - Steam ID + Discord user grants still work as expected\n' +
                 '• **Defensive Programming** - Added safeguards against similar attribution issues',
            inline: false
          },
          {
            name: 'Environment & Configuration Improvements',
            value: '• **Unified Whitelist Endpoint** - New `/combined` endpoint with all groups and users\n' +
                 '• **Centralized Environment Detection** - Single source of truth for dev/prod configs\n' +
                 '• **Enhanced Role Detection** - Fixed environment-specific role mapping issues\n' +
                 '• **Improved `/whitelist info`** - Better role-based vs database entry display\n' +
                 '• **Real-time Role Updates** - Role changes immediately update whitelist cache\n' +
                 '• **Better Error Handling** - Resolved database field constraints and logging\n' +
                 '• **Cleaner User Experience** - Removed debug noise, improved command responses',
            inline: false
          },
          {
            name: 'Tutor System & Specialties',
            value: '• **`/ondutytutor` & `/offdutytutor`** - Separate duty tracking for tutors\n' +
                 '• **`/addspecialty` & `/removespecialty`** - Tutor Lead can manage specialty roles\n' +
                 '• **`/removetutor`** - Complete tutor status removal (all roles)\n' +
                 '• **Specialty Types** - Helicopter, Armor, Infantry, Squad Expert\n' +
                 '• **Protection system** - Prevents removing other tutor leads\n' +
                 '• **Separate duty logging** - Tutors tracked independently from admins\n' +
                 '• **Light blue notifications** - Visual distinction for tutor duty status',
            inline: false
          },
          {
            name: 'Account Linking System',
            value: '• **`/link`** - Admins can manually link Steam IDs to Discord users\n' +
                 '• **Confidence-based security** - Only self-verified links can access staff whitelist\n' +
                 '• **Ticket auto-linking** - Automatically detects Steam IDs in ticket channels\n' +
                 '• **Multiple linking methods** - Self-verification, admin linking, whitelist linking',
            inline: false
          },
          {
            name: 'Enhanced Whitelist System',
            value: '• **`/whitelist grant`** - Interactive whitelist granting with duration selection\n' +
                 '• **`/whitelist info`** - Check whitelist status and stacking\n' +
                 '• **`/whitelist extend`** - Extend existing whitelists\n' +
                 '• **`/whitelist revoke`** - Remove whitelist access\n' +
                 '• **Stacking system** - Multiple whitelist entries combine durations',
            inline: false
          },
          {
            name: 'Legacy Command Detection',
            value: '• **Smart deprecation warnings** - Detects old `!addsm` and `!addfr` commands\n' +
                 '• **Migration guidance** - Shows users how to use new slash commands\n' +
                 '• **Steam ID detection** - Only warns when Steam IDs are detected',
            inline: false
          },
          {
            name: 'On-Duty System',
            value: '• **`/onduty` & `/offduty`** - Manage admin duty status\n' +
                 '• **Role-based tracking** - Discord roles determine duty status\n' +
                 '• **External change detection** - Tracks role changes made outside bot\n' +
                 '• **Voice channel monitoring** - Notifications when users join admin channels',
            inline: false
          },
          {
            name: 'Account Verification',
            value: '• **`/linkid`** - Self-verify Steam ID with in-game code\n' +
                 '• **Secure verification** - Time-limited codes with in-game confirmation\n' +
                 '• **High confidence links** - Required for staff whitelist access',
            inline: false
          },
          {
            name: 'Security & Confidence Scores',
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
          .setTitle('Command Overview')
          .setDescription('Available commands and their purposes')
          .addFields(
            {
              name: 'Admin Commands',
              value: '`/link` - Link Steam ID to Discord user\n' +
                   '`/whitelist grant` - Grant whitelist access (requires Discord user)\n' +
                   '`/whitelist grant-steamid` - Grant by Steam ID only (admin-only)\n' +
                   '`/whitelist extend` - Extend whitelist duration\n' +
                   '`/whitelist revoke` - Remove whitelist access\n' +
                   '`/onduty` & `/offduty` - Manage admin duty status\n' +
                   '`/ondutytutor` & `/offdutytutor` - Manage tutor duty\n' +
                   '`/addspecialty` & `/removespecialty` - Manage specialty roles (Lead only)\n' +
                   '`/removetutor` - Remove all tutor roles (Lead only)',
              inline: true
            },
            {
              name: 'User Commands',
              value: '`/linkid` - Self-verify your Steam ID\n' +
                   '`/whitelist info` - Check whitelist status\n' +
                   '`/ping` - Test bot connectivity\n' +
                   '`/help` - View command help\n' +
                   '`/whatsnew` - This command!',
              inline: true
            },
            {
              name: 'Integration Features',
              value: '• **HTTP Whitelist API** - External server access with multiple endpoints\n' +
                   '• **Unified `/combined` Endpoint** - Complete whitelist with group definitions\n' +
                   '• **Individual Endpoints** - `/staff`, `/members`, `/whitelist` for debugging\n' +
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