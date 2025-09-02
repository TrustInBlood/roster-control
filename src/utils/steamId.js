/**
 * Steam ID validation utilities
 * Shared functions for validating Steam ID formats across the application
 */

/**
 * Validates if a string is a valid Steam ID64 format
 * @param {string} steamid - The Steam ID to validate
 * @returns {boolean} - True if valid Steam ID64, false otherwise
 */
function isValidSteamId(steamid) {
  // Steam ID64 validation - 17 digits, typically starting with 76561197 or 76561198
  if (!steamid || typeof steamid !== 'string') return false;
  
  // Check if it's exactly 17 digits
  if (!/^[0-9]{17}$/.test(steamid)) return false;
  
  // Check if it starts with valid Steam ID64 prefixes
  return steamid.startsWith('76561197') || steamid.startsWith('76561198') || steamid.startsWith('76561199');
}

/**
 * Detects if a string looks like a Steam ID (loose validation for detection purposes)
 * More permissive than isValidSteamId, used for pattern matching in messages
 * @param {string} text - The text to check
 * @returns {boolean} - True if text looks like it could be a Steam ID
 */
function looksLikeSteamId(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Remove any whitespace
  text = text.trim();
  
  // Check if it's 17 digits and starts with 765
  return /^765[0-9]{14}$/.test(text);
}

module.exports = {
  isValidSteamId,
  looksLikeSteamId
};