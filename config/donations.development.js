/**
 * Donation configuration for development environment
 * Uses development Discord channels and relaxed validation
 */

/**
 * Donation pricing tiers (same as production)
 */
const PRICING_TIERS = [
  {
    minAmount: 10,
    maxAmount: 19.99,
    people: 1,
    duration_value: 6,
    duration_type: 'months',
    description: '1 person, 6 months'
  },
  {
    minAmount: 20,
    maxAmount: 24.99,
    people: 2,
    duration_value: 12,
    duration_type: 'months',
    description: '2 people, 1 year'
  },
  {
    minAmount: 25,
    maxAmount: null,
    people: 3,
    duration_value: 12,
    duration_type: 'months',
    description: '3 people + $5 per additional, 1 year',
    additionalPersonCost: 5
  }
];

/**
 * Validation configuration
 */
const VALIDATION = {
  // Minimum donation amount
  MIN_DONATION_AMOUNT: 10,

  // Maximum donation amount (for sanity check, null = no limit)
  MAX_DONATION_AMOUNT: 10000
};

/**
 * Note: Discord channel configuration is managed in config/channels.development.js
 * Channels used by donation system:
 * - DONATION_ANNOUNCEMENTS: Public donation announcements (sanitized, no email)
 * - DONATION_ADMIN_LOGS: Admin logs with full details (includes email)
 */

/**
 * Webhook security configuration for development
 *
 * WEBHOOK TOKEN EXPLANATION:
 * The webhook token is an optional security feature to verify that donation webhooks
 * are coming from your actual donation platform (Ko-fi, etc.) and not from malicious actors.
 *
 * How it works:
 * 1. Set ENABLE_TOKEN_VALIDATION to true
 * 2. Set DONATION_WEBHOOK_TOKEN in your .env file to a secret string (e.g., "mySecret123")
 * 3. Configure your donation platform to send this token in one of two ways:
 *    - As a query parameter: POST /webhook/donations?token=mySecret123
 *    - As an Authorization header: Authorization: mySecret123
 * 4. The webhook will reject any requests without the correct token
 *
 * For development: Token validation is disabled by default for easier testing
 */
const SECURITY = {
  // Disable token validation for easier testing in development
  ENABLE_TOKEN_VALIDATION: false,

  // Higher rate limit for testing
  RATE_LIMIT_PER_HOUR: 1000
};

/**
 * Calculate expected Steam IDs for a given donation amount
 * @param {number} amount - Donation amount in dollars
 * @returns {number} Expected number of Steam IDs
 */
function calculateExpectedSteamIds(amount) {
  for (const tier of PRICING_TIERS) {
    if (amount >= tier.minAmount && (tier.maxAmount === null || amount <= tier.maxAmount)) {
      if (tier.additionalPersonCost && amount > tier.minAmount) {
        const extraAmount = amount - tier.minAmount;
        const extraPeople = Math.floor(extraAmount / tier.additionalPersonCost);
        return tier.people + extraPeople;
      }
      return tier.people;
    }
  }
  return 0;
}

/**
 * Get tier information for a given donation amount
 * @param {number} amount - Donation amount in dollars
 * @returns {Object|null} Tier object or null if no match
 */
function getTierForAmount(amount) {
  for (const tier of PRICING_TIERS) {
    if (amount >= tier.minAmount && (tier.maxAmount === null || amount <= tier.maxAmount)) {
      return tier;
    }
  }
  return null;
}

module.exports = {
  PRICING_TIERS,
  VALIDATION,
  SECURITY,
  calculateExpectedSteamIds,
  getTierForAmount
};
