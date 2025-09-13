/**
 * Development Channel configuration
 * Specify Discord channel IDs for different functionalities
 */
const CHANNELS = {
  // Channel where admin duty status changes are announced - Update with your dev server channel ID
  DUTY_LOGS: '1407218430825992243',
  // Voice channel to monitor for joins - Update with your dev server voice channel ID
  MONITORED_VOICE: '1407218548014579813',
  // Channel for debug logs and role-based whitelist debugging
  DEBUG_LOGS: '1416292357887758439',
};

module.exports = {
  CHANNELS
};