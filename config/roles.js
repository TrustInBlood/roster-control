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

  // Head Admin commands
  'adminunlink': [DISCORD_ROLES.HEAD_ADMIN, DISCORD_ROLES.EXECUTIVE_ADMIN], // head admin only: Forcibly unlink accounts and revoke all access

  // Admin commands
  'whitelist': getAllStaffRoles(),  // All staff roles can use whitelist commands (parent command check)
  'grant': getAllStaffRoles(),      // All staff roles can grant whitelist with Discord linking
  'grant-steamid': getAllAdminRoles(), // Admin-only: Steam ID only whitelist grants (no linking)
  'info': getAllStaffRoles(),       // All staff roles can view whitelist info
  'revoke': getAllAdminRoles(),     // Admin-only: Revoke whitelist entries
  'checkenv': getAllAdminRoles(),   // All admin roles can check environment
  'addmember': [DISCORD_ROLES.APPLICATIONS], // Applications role only: Add new members with account linking
  'duty': getAllAdminRoles(),       // All admin roles can use duty commands
  'dutystats': getAllAdminRoles(),  // All admin roles can view duty statistics
  'user': getAllAdminRoles(),       // Subcommand: View duty time stats for a specific user
  'leaderboard': getAllAdminRoles(), // Subcommand: View duty time leaderboard
  'summary': getAllAdminRoles(),    // Subcommand: View guild-wide duty statistics
  'adminlink': getAllAdminRoles(),  // All admin roles can create Steam-Discord account links
  'whatsnew': getAllAdminRoles(),   // All admin roles can use whatsnew command
  'unlinkedstaff': getAllAdminRoles(), // All admin roles can view unlinked staff
  'auditwhitelist': getAllAdminRoles(), // All admin roles can audit whitelist security

  // Tutor management commands (Tutor Lead only)
  'addspecialty': [DISCORD_ROLES.TUTOR_LEAD],
  'removespecialty': [DISCORD_ROLES.TUTOR_LEAD],
  'removetutor': [DISCORD_ROLES.TUTOR_LEAD],

  // Tutor duty commands (All tutors)
  'ondutytutor': [DISCORD_ROLES.TUTOR],
  'offdutytutor': [DISCORD_ROLES.TUTOR],

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