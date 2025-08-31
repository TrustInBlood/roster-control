/**
 * Command permissions configuration - EXAMPLE FILE
 * Copy this to roles.js and update with your Discord role IDs
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
    // Admin commands
    'whitelist': ['YOUR_ADMIN_ROLE_ID', 'YOUR_MOD_ROLE_ID'],  // Same as duty commands
    'duty': ['YOUR_ADMIN_ROLE_ID', 'YOUR_MOD_ROLE_ID'],       // Roles that can use duty commands
    
    // Public commands
    'ping': [],  // Everyone can use
    'help': []   // Everyone can use
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty
const ON_DUTY_ROLE_ID = 'YOUR_ON_DUTY_ROLE_ID'; // Replace with actual role ID

// Special roles that can award whitelist access - Replace with your server role IDs
const WHITELIST_AWARD_ROLES = {
    DONATOR: 'YOUR_DONATOR_ROLE_ID',         // Replace with actual donator role ID
    FIRST_RESPONDER: 'YOUR_FIRST_RESPONDER_ROLE_ID', // Replace with actual first responder role ID
    SERVICE_MEMBER: 'YOUR_SERVICE_MEMBER_ROLE_ID'    // Replace with actual service member role ID
};

module.exports = {
    COMMAND_PERMISSIONS,
    ON_DUTY_ROLE_ID,
    WHITELIST_AWARD_ROLES
};