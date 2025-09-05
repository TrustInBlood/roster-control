/**
 * Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
    // Admin commands
    'whitelist': ['1363025391366967386', '1256127324928213012', '1363025129814233190', '1363025129814233190', '1363017008039329972', '814554233377652736'],  // Same as duty commands
    'duty': ['1363025391366967386', '1256127324928213012', '1363025129814233190', '1363025129814233190', '1363017008039329972', '814554233377652736'],       // Roles that can use duty commands
    'link': ['1363025391366967386', '1256127324928213012', '1363025129814233190', '1363025129814233190', '1363017008039329972', '814554233377652736'],       // Same as duty commands - admin only
    'whatsnew': ['1363025391366967386', '1256127324928213012', '1363025129814233190', '1363025129814233190', '1363017008039329972', '814554233377652736'],   // Same as duty commands - admin only
    
    // Public commands
    'ping': [],      // Everyone can use
    'help': []       // Everyone can use
};

// Both duty commands use the same permission list
COMMAND_PERMISSIONS.onduty = COMMAND_PERMISSIONS.duty;
COMMAND_PERMISSIONS.offduty = COMMAND_PERMISSIONS.duty;

// The role ID that represents an admin being on duty
const ON_DUTY_ROLE_ID = '1402396896257118258'; // Replace with actual role ID

// Special roles that can award whitelist access - Update with your production server role IDs
const WHITELIST_AWARD_ROLES = {
    DONATOR: '1246536874059628645',         // Replace with actual donator role ID
    FIRST_RESPONDER: '1251387335707459584', // Replace with actual first responder role ID
    SERVICE_MEMBER: '1249133598255349840'    // Replace with actual service member role ID
};

module.exports = {
    COMMAND_PERMISSIONS,
    ON_DUTY_ROLE_ID,
    WHITELIST_AWARD_ROLES
};