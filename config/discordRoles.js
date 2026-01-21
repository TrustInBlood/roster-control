/**
 * Centralized Discord Role ID definitions
 * All Discord role IDs should be defined here to avoid duplication
 */
const { console: loggerConsole } = require('../src/utils/logger');

const DISCORD_ROLES = {
  // Super Administrator - Highest level access
  SUPER_ADMIN: '680546534013796502',                      // SET THIS: Super admin role for confidence upgrades and critical operations

  // Administrative Roles (actual Discord role names shown in comments)
  EXECUTIVE_ADMIN: '1363025391366967386',  // "Executive Admin"
  HEAD_ADMIN: '1256127324928213012',       // "Head Admin"
  SENIOR_ADMIN: '1363025129814233190',     // "Senior Admin"
  OG_ADMIN: '1363017008039329972',         // "OG Admin"
  SQUAD_ADMIN: '814554233377652736',       // "Squad Admin"
  MODERATOR_T1: '1449608700095496212',    // "Moderator T1" - Entry level moderator
  MODERATOR_T2: '1285786746948423730',    // "Moderator T2" - Senior moderator (formerly just "Moderator")
  STAFF: '1397788169264562267',           // "Staff"
  TICKET_SUPPORT: '1221983850440429608',  // "Ticket Support"
  APPLICATIONS: '1332116503260168233',     // "Applications" - Handles member applications

  // Duty System Roles
  ON_DUTY: '1402396896257118258',
  
  // Tutor System Roles
  TUTOR: '1414863956597801030',
  TUTOR_ON_DUTY: '1414869998870200401',
  TUTOR_LEAD: '1415128641628541080',
  
  // Tutor Specialty Roles
  TUTOR_HELICOPTER: '1414865731304296448',
  TUTOR_ARMOR: '1414865809922068570',
  TUTOR_INFANTRY: '1414865603021242409',
  TUTOR_EXPERT: '1414867846214848512',
  
  // Whitelist Award Roles
  DONATOR: '1246536874059628645',
  FIRST_RESPONDER: '1251387335707459584',
  SERVICE_MEMBER: '1249133598255349840',
  
  // Member Roles (add your member role IDs here)
  MEMBER: '680589344217497617' 
};

// Helper function to get all admin role IDs
function getAllAdminRoles() {
  const adminRoles = [
    DISCORD_ROLES.EXECUTIVE_ADMIN,
    DISCORD_ROLES.HEAD_ADMIN,
    DISCORD_ROLES.SENIOR_ADMIN,
    DISCORD_ROLES.OG_ADMIN,
    DISCORD_ROLES.SQUAD_ADMIN
  ].filter(Boolean); // Remove null values

  // SECURITY: If no admin roles are configured, return a special marker
  // This prevents accidentally allowing everyone to use admin commands
  if (adminRoles.length === 0) {
    loggerConsole.error('CRITICAL: No admin roles configured! Admin commands will be disabled.');
    return ['NO_ADMIN_ROLES_CONFIGURED']; // This ID will never match a real role
  }

  return adminRoles;
}

// Helper function to get all tutor role IDs  
function getAllTutorRoles() {
  return [
    DISCORD_ROLES.TUTOR,
    DISCORD_ROLES.TUTOR_ON_DUTY,
    DISCORD_ROLES.TUTOR_LEAD
  ].filter(Boolean);
}

// Helper function to get all specialty role IDs
function getAllSpecialtyRoles() {
  return [
    DISCORD_ROLES.TUTOR_HELICOPTER,
    DISCORD_ROLES.TUTOR_ARMOR,
    DISCORD_ROLES.TUTOR_INFANTRY,
    DISCORD_ROLES.TUTOR_EXPERT
  ].filter(Boolean);
}

// Helper function to get all whitelist award role IDs
function getAllWhitelistAwardRoles() {
  return [
    DISCORD_ROLES.DONATOR,
    DISCORD_ROLES.FIRST_RESPONDER,
    DISCORD_ROLES.SERVICE_MEMBER
  ].filter(Boolean);
}

// Helper function to get all member role IDs
function getAllMemberRoles() {
  return [
    DISCORD_ROLES.MEMBER
  ].filter(Boolean);
}

// Helper function to get all staff role IDs (admins + moderators + staff)
// Note: TICKET_SUPPORT is intentionally excluded - it's an identifier for bots, not a permission-granting role
function getAllStaffRoles() {
  const staffRoles = [
    ...getAllAdminRoles(),
    DISCORD_ROLES.MODERATOR_T1,
    DISCORD_ROLES.MODERATOR_T2,
    DISCORD_ROLES.STAFF
  ].filter(Boolean);

  // SECURITY: If no staff roles are configured, return a special marker
  if (staffRoles.length === 0) {
    loggerConsole.error('CRITICAL: No staff roles configured! Staff commands will be disabled.');
    return ['NO_STAFF_ROLES_CONFIGURED'];
  }

  return staffRoles;
}

module.exports = {
  DISCORD_ROLES,
  getAllAdminRoles,
  getAllTutorRoles,
  getAllSpecialtyRoles,
  getAllWhitelistAwardRoles,
  getAllMemberRoles,
  getAllStaffRoles
};