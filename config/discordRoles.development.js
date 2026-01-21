/**
 * Development Environment Discord Role ID definitions
 * For Testing Zone Discord server
 */
const { console: loggerConsole } = require('../src/utils/logger');

const DISCORD_ROLES_DEV = {
  // Super Administrator - Highest level access
  SUPER_ADMIN: '1420532128541835284',                         // CREATE: "Test Super Admin" - Full system access including confidence upgrades

  // Administrative Roles - Using available and suggested new roles
  EXECUTIVE_ADMIN: '1365205433236717598',     // "Admin" - existing role
  HEAD_ADMIN: null,                           // CREATE: "Test Head Admin"
  SENIOR_ADMIN: null,                         // CREATE: "Test Senior Admin"
  OG_ADMIN: null,                            // CREATE: "Test OG Admin"
  SQUAD_ADMIN: '1449526271162712295',        // CREATE: "Test Squad Admin"
  MODERATOR_T1: '1452011419204714678',       // "Test Moderator T1" - Entry level moderator
  MODERATOR_T2: null,                        // CREATE: "Test Moderator T2" - Senior moderator
  STAFF: '1420297163166191627',              // CREATE: "Test Staff"
  TICKET_SUPPORT: null,                      // CREATE: "Test Ticket Support"
  APPLICATIONS: '1444815201516912720',                        // CREATE: "Test Applications" - Handles member applications

  // Duty System Roles
  ON_DUTY: '1407218174117679125',            // "On-Duty Dev" - existing

  // Tutor System Roles - Create if needed for testing
  TUTOR: null,                               // CREATE: "Test Tutor"
  TUTOR_ON_DUTY: null,                       // CREATE: "Test Tutor On-Duty"
  TUTOR_LEAD: null,                          // CREATE: "Test Tutor Lead"

  // Tutor Specialty Roles - Create if needed
  TUTOR_HELICOPTER: null,                    // CREATE: "Test Heli Specialist"
  TUTOR_ARMOR: null,                         // CREATE: "Test Armor Specialist"
  TUTOR_INFANTRY: null,                      // CREATE: "Test Infantry Specialist"
  TUTOR_EXPERT: null,                        // CREATE: "Test Squad Expert"

  // Whitelist Award Roles - Using existing roles
  DONATOR: '1411597337834426539',            // "Donator" - existing
  FIRST_RESPONDER: '1411597443774283859',    // "First Responder" - existing
  SERVICE_MEMBER: '1411597413176574084',     // "Service Member" - existing

  // Member Roles
  MEMBER: '1416279282979962920',             // "Test Member" role
};

// Helper functions (same as production)
function getAllAdminRoles() {
  const adminRoles = [
    DISCORD_ROLES_DEV.EXECUTIVE_ADMIN,
    DISCORD_ROLES_DEV.HEAD_ADMIN,
    DISCORD_ROLES_DEV.SENIOR_ADMIN,
    DISCORD_ROLES_DEV.OG_ADMIN,
    DISCORD_ROLES_DEV.SQUAD_ADMIN
  ].filter(Boolean);

  // SECURITY: If no admin roles are configured, return a special marker
  // This prevents accidentally allowing everyone to use admin commands
  if (adminRoles.length === 0) {
    loggerConsole.error('CRITICAL: No admin roles configured! Admin commands will be disabled.');
    return ['NO_ADMIN_ROLES_CONFIGURED']; // This ID will never match a real role
  }

  return adminRoles;
}

function getAllTutorRoles() {
  return [
    DISCORD_ROLES_DEV.TUTOR,
    DISCORD_ROLES_DEV.TUTOR_ON_DUTY,
    DISCORD_ROLES_DEV.TUTOR_LEAD
  ].filter(Boolean);
}

function getAllSpecialtyRoles() {
  return [
    DISCORD_ROLES_DEV.TUTOR_HELICOPTER,
    DISCORD_ROLES_DEV.TUTOR_ARMOR,
    DISCORD_ROLES_DEV.TUTOR_INFANTRY,
    DISCORD_ROLES_DEV.TUTOR_EXPERT
  ].filter(Boolean);
}

function getAllWhitelistAwardRoles() {
  return [
    DISCORD_ROLES_DEV.DONATOR,
    DISCORD_ROLES_DEV.FIRST_RESPONDER,
    DISCORD_ROLES_DEV.SERVICE_MEMBER
  ].filter(Boolean);
}

function getAllMemberRoles() {
  return [
    DISCORD_ROLES_DEV.MEMBER
  ].filter(Boolean);
}

// Note: TICKET_SUPPORT is intentionally excluded - it's an identifier for bots, not a permission-granting role
function getAllStaffRoles() {
  const staffRoles = [
    ...getAllAdminRoles(),
    DISCORD_ROLES_DEV.MODERATOR_T1,
    DISCORD_ROLES_DEV.MODERATOR_T2,
    DISCORD_ROLES_DEV.STAFF
  ].filter(Boolean);

  // SECURITY: If no staff roles are configured, return a special marker
  if (staffRoles.length === 0) {
    loggerConsole.error('CRITICAL: No staff roles configured! Staff commands will be disabled.');
    return ['NO_STAFF_ROLES_CONFIGURED'];
  }

  return staffRoles;
}

module.exports = {
  DISCORD_ROLES: DISCORD_ROLES_DEV,
  getAllAdminRoles,
  getAllTutorRoles,
  getAllSpecialtyRoles,
  getAllWhitelistAwardRoles,
  getAllMemberRoles,
  getAllStaffRoles
};