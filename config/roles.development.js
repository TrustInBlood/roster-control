/**
 * Development Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
  // Super admin commands (highest level access)
  'adminunlink': ['1420532128541835284'], // Super admin only: Forcibly unlink accounts and revoke all access
  'sync': ['1420532128541835284'], // Super admin only: Sync Discord roles to database whitelist entries

  // Admin commands - Update these with your development server role IDs
  'whitelist': ['1365205433236717598'], // Admin roles can use whitelist commands (parent command check)
  'grant': ['1365205433236717598'],      // Admin roles can grant whitelist with Discord linking
  'grant-steamid': ['1365205433236717598'], // Admin roles can grant Steam ID only whitelist
  'info': ['1365205433236717598'],       // Admin roles can view whitelist info
  'revoke': ['1365205433236717598'],     // Admin roles can revoke whitelist entries
  'duty': ['1365205433236717598'],      // Admin roles can use duty commands
  'dutystats': ['1365205433236717598'], // Admin roles can view duty statistics
  'user': ['1365205433236717598'],      // Subcommand: View duty time stats for a specific user
  'leaderboard': ['1365205433236717598'], // Subcommand: View duty time leaderboard
  'summary': ['1365205433236717598'],   // Subcommand: View guild-wide duty statistics
  'adminlink': ['1365205433236717598'], // Admin roles can create Steam-Discord account links
  'whatsnew': ['1365205433236717598'],  // Admin roles can use whatsnew command
  'unlinkedstaff': ['1365205433236717598'], // Admin roles can view unlinked staff
  'auditwhitelist': ['1365205433236717598'], // Admin roles can audit whitelist security
  'reloadposts': ['1365205433236717598'], // Admin roles can reload info posts config
  'checkenv': ['1365205433236717598'],    // Admin roles can check environment
  'addmember': ['1444815201516912720'],  // Applications role
  'dashboard': ['1365205433236717598'],  // Admin roles can access dashboard link

  // Public commands
  'ping': [],  // Everyone can use
  'help': [],  // Everyone can use
  'linkid': [], // Everyone can use - self-service account linking
  'unlink': [], // Everyone can use - self-service account unlinking
  'stats': []  // Everyone can use - view player statistics
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty - Update with your dev server role ID
const ON_DUTY_ROLE_ID = '1407218174117679125'; // Replace with actual dev role ID

// Special roles that can award whitelist access - Update with your dev server role IDs
const WHITELIST_AWARD_ROLES = {
  DONATOR: '1411597337834426539',         // Replace with actual donator role ID
  FIRST_RESPONDER: '1411597443774283859', // Replace with actual first responder role ID
  SERVICE_MEMBER: '1411597413176574084'    // Replace with actual service member role ID
};

module.exports = {
  COMMAND_PERMISSIONS,
  ON_DUTY_ROLE_ID,
  WHITELIST_AWARD_ROLES
};