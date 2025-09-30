/**
 * Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */

// Import centralized role definitions and squad groups (environment-specific)
const isDevelopment = process.env.NODE_ENV === 'development';
const { DISCORD_ROLES, getAllAdminRoles, getAllStaffRoles } = require(isDevelopment ? './discordRoles.development' : './discordRoles');
const { SQUAD_GROUPS, getAllTrackedRoles } = require(isDevelopment ? './squadGroups.development' : './squadGroups');
const COMMAND_PERMISSIONS = {
  // Super admin commands (highest level access)
  'upgradeconfidence': [DISCORD_ROLES.SUPER_ADMIN], // Super admin only: Upgrade confidence scores to 1.0
  'sync': [DISCORD_ROLES.SUPER_ADMIN],       // Super admin only: Sync Discord roles to database whitelist entries

  // Admin commands
  'whitelist': getAllStaffRoles(),  // All staff roles can use whitelist commands
  'grant-steamid': getAllAdminRoles(), // Admin-only: Steam ID only whitelist grants (no linking)
  'checkenv': getAllAdminRoles(),   // All admin roles can check environment
  'duty': getAllAdminRoles(),       // All admin roles can use duty commands
  'adminlink': getAllAdminRoles(),  // All admin roles can create Steam-Discord account links
  'whatsnew': getAllAdminRoles(),   // All admin roles can use whatsnew command
  'unlinkedstaff': getAllAdminRoles(), // All admin roles can view unlinked staff

  // Tutor management commands (Tutor Lead only)
  'addspecialty': [DISCORD_ROLES.TUTOR_LEAD],
  'removespecialty': [DISCORD_ROLES.TUTOR_LEAD],
  'removetutor': [DISCORD_ROLES.TUTOR_LEAD],

  // Tutor duty commands (All tutors)
  'ondutytutor': [DISCORD_ROLES.TUTOR],
  'offdutytutor': [DISCORD_ROLES.TUTOR],

  // Shelved commands (restricted to no one for now)
  'migratewhitelists': ['DISABLED'],  // SHELVED - Set to invalid role ID to disable

  // Public commands
  'ping': [],      // Everyone can use
  'help': [],      // Everyone can use
  'linkid': [],    // Everyone can use - self-service account linking
  'unlink': []     // Everyone can use - self-service account unlinking
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty
const ON_DUTY_ROLE_ID = DISCORD_ROLES.ON_DUTY;

// Tutor system roles
const TUTOR_ROLE_ID = DISCORD_ROLES.TUTOR;
const TUTOR_ON_DUTY_ROLE_ID = DISCORD_ROLES.TUTOR_ON_DUTY;
const TUTOR_LEAD_ROLE_ID = DISCORD_ROLES.TUTOR_LEAD;

// Specialty roles that can be assigned by tutor lead
const SPECIALTY_ROLES = {
  HELICOPTER: DISCORD_ROLES.TUTOR_HELICOPTER,
  ARMOR: DISCORD_ROLES.TUTOR_ARMOR,
  INFANTRY: DISCORD_ROLES.TUTOR_INFANTRY,
  EXPERT: DISCORD_ROLES.TUTOR_EXPERT
};

// Special roles that can award whitelist access
const WHITELIST_AWARD_ROLES = {
  DONATOR: DISCORD_ROLES.DONATOR,
  FIRST_RESPONDER: DISCORD_ROLES.FIRST_RESPONDER,
  SERVICE_MEMBER: DISCORD_ROLES.SERVICE_MEMBER
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