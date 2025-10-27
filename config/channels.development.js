/**
 * Development Channel configuration
 * Specify Discord channel IDs for different functionalities
 */
const CHANNELS = {
  // Channel where admin duty status changes are announced
  DUTY_LOGS: '1407218430825992243',
  // Voice channel to monitor for joins
  MONITORED_VOICE: '1407218548014579813',
  // Channel for bot activity logs (auto-linking, commands, etc.)
  BOT_LOGS: '1416292357887758439',
  // Channel for donation announcements (public, no email)
  DONATION_ANNOUNCEMENTS: '1432404113601335447',
  // Channel for donation admin logs (includes email)
  DONATION_ADMIN_LOGS: '1432404161521127547',
};

/**
 * Notification routing configuration
 * Maps notification types to their target channels
 */
const NOTIFICATION_ROUTES = {
  // Duty-related notifications
  duty_status: 'DUTY_LOGS',
  duty_change: 'DUTY_LOGS',

  // Bot operation logs
  tutor_management: 'BOT_LOGS',
  account_link: 'BOT_LOGS',
  whitelist: 'BOT_LOGS',
  command_usage: 'BOT_LOGS',
  error: 'BOT_LOGS',
  warning: 'BOT_LOGS',
  info: 'BOT_LOGS',
  audit: 'BOT_LOGS',

  // Security notifications
  security_transition: 'BOT_LOGS',

  // Donation notifications
  donation_public: 'DONATION_ANNOUNCEMENTS',
  donation_admin: 'DONATION_ADMIN_LOGS',
  donation_error: 'DONATION_ADMIN_LOGS'
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

/**
 * Discord message links
 * Links to specific messages for reference
 */
const MESSAGE_LINKS = {
  // How-to-donate guide message link
  HOW_TO_DONATE: 'https://discord.com/channels/386598132231700481/1202285020480282706/1267563969304989716'
};

module.exports = {
  CHANNELS,
  NOTIFICATION_ROUTES,
  TICKET_CONFIG,
  MESSAGE_LINKS
};