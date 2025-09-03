/**
 * Channel configuration
 * Specify Discord channel IDs for different functionalities
 */
const CHANNELS = {
    // Channel where admin duty status changes are announced
    DUTY_LOGS: '1402741241938051183',
    // Voice channel to monitor for joins
    MONITORED_VOICE: '1305677735707934822',  // Replace with the voice channel ID to monitor
    // Channel for bot activity logs (auto-linking, commands, etc.)
    BOT_LOGS: '1412709300941492246',  // Replace with your bot logs channel ID
};

/**
 * Ticket system configuration
 */
const TICKET_CONFIG = {
    // Enable automatic Steam ID linking from ticket channels
    AUTO_LINK_ENABLED: true,
    
    // Pattern to identify ticket channels (channels starting with this will be monitored)
    CHANNEL_NAME_PATTERN: 'ticket-',
    
    // Alternative: Specific category ID to monitor (uncomment to use instead of pattern)
    // CATEGORY_ID: '1234567890123456789',
    
    // Log all automatic linking activities
    LOG_AUTO_LINKS: true
};

module.exports = {
    CHANNELS,
    TICKET_CONFIG
};