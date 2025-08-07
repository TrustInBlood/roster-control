/**
 * Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
    // Admin commands
    'whitelist': ['ADMIN_ROLE_ID', 'MOD_ROLE_ID'],  // Replace with actual role IDs
    'duty': ['1363025391366967386', '1256127324928213012', '1363025129814233190', '1363025129814233190', '1363017008039329972', '814554233377652736'],       // Roles that can use duty commands
    
    // Public commands
    'ping': [],  // Everyone can use
    'help': []   // Everyone can use
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty
const ON_DUTY_ROLE_ID = '1402396896257118258'; // Replace with actual role ID

module.exports = {
    COMMAND_PERMISSIONS,
    ON_DUTY_ROLE_ID
};