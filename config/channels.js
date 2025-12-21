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
  // Channel for member addition logs
  MEMBER_ADDITION_LOGS: '1412709300941492246',  // Member additions via /addmember command
  // Channel for member welcome messages
  MEMBER_CHAT: '787108437611249694',  // Public member chat where welcome messages are sent
  // Channel for member rules reference
  MEMBER_RULES: '1226929135582969967',  // Member rules channel
  // Channel for donation announcements (public, no email)
  DONATION_ANNOUNCEMENTS: '1350251098547683459',
  // Channel for donation admin logs (includes email)
  DONATION_ADMIN_LOGS: '1310841642928050186',
  // Channel for persistent whitelist management post
  WHITELIST_POST: '1232593940587479041', // Whitelist channel
  // Channel where /stats command can be used
  STATS_COMMAND: '1366492682934948010', // Replace with stats channel ID
  // Moderator channels
  MODERATOR_CHAT: '1330573264921296986',  // Moderator chat for welcome messages
  ADMIN_ACADEMY: '1317340932911398932',   // Admin academy channel reference
  MOD_RULES: '1330574550039134290',       // Moderator rules channel reference
};

/**
 * Discord message links
 * Links to specific messages for reference
 */
const MESSAGE_LINKS = {
  // How-to-donate guide message link
  HOW_TO_DONATE: 'https://discord.com/channels/386598132231700481/1202285020480282706/1267563969304989716'
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
  member_addition: 'MEMBER_ADDITION_LOGS',
  moderator_addition: 'MODERATOR_CHAT',
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
  LOG_AUTO_LINKS: true,

  // BattleMetrics integration settings
  BATTLEMETRICS_LOOKUP_ENABLED: true,  // Enable automatic BM profile lookup for Steam IDs
  LOOKUP_ALL_STEAMIDS: true,            // If false, only lookup first Steam ID in ticket
  PROMPT_MISSING_STEAMID: true,         // Ask user for Steam ID if none provided
  BATTLEMETRICS_TIMEOUT_MS: 5000,       // Timeout for BM API calls in milliseconds

  // Community Ban List integration settings
  CBL_LOOKUP_ENABLED: true,             // Enable automatic CBL lookup for Steam IDs
  CBL_TIMEOUT_MS: 5000                  // Timeout for CBL API calls in milliseconds
};

module.exports = {
  CHANNELS,
  NOTIFICATION_ROUTES,
  TICKET_CONFIG,
  MESSAGE_LINKS
};