/**
 * Development Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
  // Super admin commands (highest level access)
  'upgradeconfidence': ['1420532128541835284'], // Super admin only: Upgrade confidence scores to 1.0 (Test Super Admin role)

  // Admin commands - Update these with your development server role IDs
  'whitelist': ['1365205433236717598'], // Admin roles can use whitelist commands
  'duty': ['1365205433236717598'],      // Admin roles can use duty commands
  'dutystats': ['1365205433236717598'], // Admin roles can view duty statistics
  'adminlink': ['1365205433236717598'], // Admin roles can create Steam-Discord account links
  'whatsnew': ['1365205433236717598'],  // Admin roles can use whatsnew command
  'unlinkedstaff': ['1365205433236717598'], // Admin roles can view unlinked staff

  // Public commands
  'ping': [],  // Everyone can use
  'help': [],  // Everyone can use
  'linkid': [] // Everyone can use - self-service account linking
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