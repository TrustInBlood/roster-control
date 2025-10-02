/**
 * Development Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */

// Import centralized role definitions and squad groups (development-specific)
const { DISCORD_ROLES } = require('./discordRoles.development');
const { SQUAD_GROUPS, getAllTrackedRoles } = require('./squadGroups.development');

const COMMAND_PERMISSIONS = {
  // Super admin commands (highest level access)
  'upgradeconfidence': ['1420532128541835284'], // Super admin only: Upgrade confidence scores to 1.0
  'sync': ['1420532128541835284'],       // Super admin only: Sync Discord roles to database whitelist entries
  'whitelist-sync': ['1420532128541835284'],  // Super admin only: Sync Discord roles to database whitelist entries

  // Admin commands
  'whitelist': ['1365205433236717598', '1420297163166191627'],  // DEPRECATED - Old monolithic whitelist command (use new specific commands)
  'grant-steamid': ['1365205433236717598'], // DEPRECATED - Use /whitelist-grant-steamid instead
  'checkenv': ['1365205433236717598'],   // All admin roles can check environment
  'duty': ['1365205433236717598'],       // All admin roles can use duty commands
  'adminlink': ['1365205433236717598'],  // All admin roles can create Steam-Discord account links
  'whatsnew': ['1365205433236717598'],   // All admin roles can use whatsnew command
  'unlinkedstaff': ['1365205433236717598'], // All admin roles can view unlinked staff

  // New whitelist commands (all staff)
  'whitelist-service-member': ['1365205433236717598', '1420297163166191627'],   // Grant 6mo service member whitelist + role
  'whitelist-first-responder': ['1365205433236717598', '1420297163166191627'],  // Grant 6mo first responder whitelist + role
  'whitelist-donator': ['1365205433236717598', '1420297163166191627'],          // Grant donator whitelist + role (6mo or 1yr)
  'whitelist-reporting': ['1365205433236717598', '1420297163166191627'],        // Grant temporary reporting whitelist (no role)
  'whitelist-grant-steamid': ['1365205433236717598', '1420297163166191627'],    // Donation/external Steam-only grant (6mo or 1yr, no linking)
  'whitelist-revoke': ['1365205433236717598', '1420297163166191627'],           // Revoke whitelist access

  // Tutor management commands (Tutor Lead only) - disabled until tutor roles are created
  'addspecialty': ['DISABLED'],
  'removespecialty': ['DISABLED'],
  'removetutor': ['DISABLED'],

  // Tutor duty commands (All tutors) - disabled until tutor roles are created
  'ondutytutor': ['DISABLED'],
  'offdutytutor': ['DISABLED'],

  // Shelved commands (restricted to no one for now)
  'migratewhitelists': ['DISABLED'],  // SHELVED - Set to invalid role ID to disable

  // Public commands
  'ping': [],      // Everyone can use
  'help': [],      // Everyone can use
  'linkid': [],    // Everyone can use - self-service account linking
  'unlink': [],    // Everyone can use - self-service account unlinking
  'whitelist-info': []  // Everyone can use - check whitelist status
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty
const ON_DUTY_ROLE_ID = '1407218174117679125';

// Tutor system roles - disabled until tutor roles are created
const TUTOR_ROLE_ID = null;
const TUTOR_ON_DUTY_ROLE_ID = null;
const TUTOR_LEAD_ROLE_ID = null;

// Specialty roles that can be assigned by tutor lead - disabled until tutor roles are created
const SPECIALTY_ROLES = {
  HELICOPTER: null,
  ARMOR: null,
  INFANTRY: null,
  EXPERT: null
};

// Special roles that can award whitelist access
const WHITELIST_AWARD_ROLES = {
  DONATOR: '1411597337834426539',
  FIRST_RESPONDER: '1411597443774283859',
  SERVICE_MEMBER: '1411597413176574084'
};

module.exports = {
  COMMAND_PERMISSIONS,
  ON_DUTY_ROLE_ID,
  TUTOR_ROLE_ID,
  TUTOR_ON_DUTY_ROLE_ID,
  TUTOR_LEAD_ROLE_ID,
  SPECIALTY_ROLES,
  WHITELIST_AWARD_ROLES,
  
  // Re-export squad groups for convenience
  SQUAD_GROUPS,
  getAllTrackedRoles
};