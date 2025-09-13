/**
 * Development Environment Discord Role ID definitions
 * For Testing Zone Discord server
 */

const DISCORD_ROLES_DEV = {
  // Administrative Roles - Using available and suggested new roles
  EXECUTIVE_ADMIN: '1365205433236717598',     // "Admin" - existing role
  HEAD_ADMIN: null,                           // CREATE: "Test Head Admin" 
  SENIOR_ADMIN: null,                         // CREATE: "Test Senior Admin"
  OG_ADMIN: null,                            // CREATE: "Test OG Admin" 
  SQUAD_ADMIN: null,                         // CREATE: "Test Squad Admin"
  MODERATOR: null,                           // CREATE: "Test Moderator"

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
  return [
    DISCORD_ROLES_DEV.EXECUTIVE_ADMIN,
    DISCORD_ROLES_DEV.HEAD_ADMIN,
    DISCORD_ROLES_DEV.SENIOR_ADMIN,
    DISCORD_ROLES_DEV.OG_ADMIN,
    DISCORD_ROLES_DEV.SQUAD_ADMIN
  ].filter(Boolean);
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

module.exports = {
  DISCORD_ROLES: DISCORD_ROLES_DEV,
  getAllAdminRoles,
  getAllTutorRoles,
  getAllSpecialtyRoles,
  getAllWhitelistAwardRoles,
  getAllMemberRoles
};