/**
 * Command permissions configuration - EXAMPLE FILE
 * Copy this to roles.js and update with your Discord role IDs
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
    // Admin commands
    'whitelist': ['ADMIN_ROLE_ID', 'MOD_ROLE_ID'],  // Replace with actual role IDs
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

module.exports = {
    COMMAND_PERMISSIONS,
    ON_DUTY_ROLE_ID
};