/**
 * Command permissions configuration
 * Specify which Discord role IDs are allowed to use each command
 * Empty array means everyone can use the command
 */
const COMMAND_PERMISSIONS = {
    // Admin commands
    'whitelist': ['ADMIN_ROLE_ID', 'MOD_ROLE_ID'],  // Replace with actual role IDs
    'onduty': ['ADMIN_ROLE_ID', 'MOD_ROLE_ID'],
    'offduty': ['ADMIN_ROLE_ID', 'MOD_ROLE_ID'],
    
    // Public commands
    'ping': [],  // Everyone can use
    'help': []   // Everyone can use
};

module.exports = {
    COMMAND_PERMISSIONS
};