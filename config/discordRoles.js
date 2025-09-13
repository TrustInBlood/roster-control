/**
 * Centralized Discord Role ID definitions
 * All Discord role IDs should be defined here to avoid duplication
 */

const DISCORD_ROLES = {
  // Administrative Roles (actual Discord role names shown in comments)
  EXECUTIVE_ADMIN: '1363025391366967386',  // "Executive Admin"
  HEAD_ADMIN: '1256127324928213012',       // "Head Admin"  
  SENIOR_ADMIN: '1363025129814233190',     // "Senior Admin"
  OG_ADMIN: '1363017008039329972',         // "OG Admin"
  SQUAD_ADMIN: '814554233377652736',       // "Squad Admin"
  MODERATOR: '1285786746948423730',       // "Moderator"

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
  MEMBER: '680589344217497617' // Replace with actual member role ID
};

// Helper function to get all admin role IDs
function getAllAdminRoles() {
  return [
    DISCORD_ROLES.EXECUTIVE_ADMIN,
    DISCORD_ROLES.HEAD_ADMIN,
    DISCORD_ROLES.SENIOR_ADMIN,
    DISCORD_ROLES.OG_ADMIN,
    DISCORD_ROLES.SQUAD_ADMIN
  ].filter(Boolean); // Remove null values
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
    DISCORD_ROLES.MEMBER,
    DISCORD_ROLES.VERIFIED_MEMBER
  ].filter(Boolean);
}

module.exports = {
  DISCORD_ROLES,
  getAllAdminRoles,
  getAllTutorRoles,
  getAllSpecialtyRoles,
  getAllWhitelistAwardRoles,
  getAllMemberRoles
};