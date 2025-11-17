const { console: loggerConsole, createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');
const { Whitelist } = require('../database/models');
const { looksLikeSteamId } = require('../utils/steamId');

const serviceLogger = createServiceLogger('DonationService');

class DonationService {
  constructor() {
    // Load environment-specific donation configuration
    const donationConfig = loadConfig('donations');
    this.config = donationConfig;
  }

  /**
   * Extract Steam IDs from donation name and/or message
   * Uses the centralized Steam ID validation utility
   * @param {string} name - Donation name field (can contain SteamID)
   * @param {string} message - Donation message text (can contain SteamID)
   * @returns {Array<string>} Array of unique Steam IDs found in either field
   */
  extractSteamIds(name, message) {
    const allSteamIds = [];

    // Check name field for Steam IDs
    if (name) {
      const nameWords = name.match(/\b\d{17}\b/g) || [];
      const nameSteamIds = nameWords.filter(word => looksLikeSteamId(word));
      allSteamIds.push(...nameSteamIds);
    }

    // Check message field for Steam IDs
    if (message) {
      const messageWords = message.match(/\b\d{17}\b/g) || [];
      const messageSteamIds = messageWords.filter(word => looksLikeSteamId(word));
      allSteamIds.push(...messageSteamIds);
    }

    // Return unique Steam IDs (deduplicate if SteamID appears in both fields)
    return [...new Set(allSteamIds)];
  }

  /**
   * Validate donation amount
   * @param {number} amount - Donation amount
   * @returns {Object} Validation result { valid, error }
   */
  validateDonationAmount(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return { valid: false, error: 'Invalid donation amount format' };
    }

    if (amount < this.config.VALIDATION.MIN_DONATION_AMOUNT) {
      return {
        valid: false,
        error: `Donation amount $${amount} is below minimum $${this.config.VALIDATION.MIN_DONATION_AMOUNT}`
      };
    }

    if (this.config.VALIDATION.MAX_DONATION_AMOUNT && amount > this.config.VALIDATION.MAX_DONATION_AMOUNT) {
      return {
        valid: false,
        error: `Donation amount $${amount} exceeds maximum $${this.config.VALIDATION.MAX_DONATION_AMOUNT}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate Steam ID count against donation amount
   * @param {number} amount - Donation amount
   * @param {number} steamIdCount - Number of Steam IDs provided
   * @returns {Object} Validation result { valid, expected, error }
   */
  validateSteamIdCount(amount, steamIdCount) {
    const expectedCount = this.config.calculateExpectedSteamIds(amount);

    if (expectedCount === 0) {
      return {
        valid: false,
        expected: 0,
        error: `No pricing tier found for donation amount $${amount}`
      };
    }

    if (steamIdCount === 0) {
      return {
        valid: false,
        expected: expectedCount,
        error: `No Steam IDs found in donation message (expected ${expectedCount})`
      };
    }

    if (steamIdCount > expectedCount) {
      return {
        valid: false,
        expected: expectedCount,
        error: `Too many Steam IDs: found ${steamIdCount}, expected ${expectedCount} for $${amount}`
      };
    }

    // Allow fewer Steam IDs (user might add more later via ticket)
    if (steamIdCount < expectedCount) {
      serviceLogger.warn(`Donation has fewer Steam IDs than expected: ${steamIdCount}/${expectedCount} for $${amount}`);
    }

    return { valid: true, expected: expectedCount };
  }

  /**
   * Process a donation and create whitelist entries
   * @param {Object} donationData - Donation data from webhook
   * @returns {Promise<Object>} Processing result
   */
  async processDonation(donationData) {
    const { from_name, amount, message, email, type } = donationData;

    serviceLogger.info('Processing donation', {
      from_name,
      amount,
      steamIdCount: 'pending extraction'
    });

    // Parse amount
    const donationAmount = parseFloat(amount);

    // Validate amount
    const amountValidation = this.validateDonationAmount(donationAmount);
    if (!amountValidation.valid) {
      serviceLogger.error('Invalid donation amount', { amount, error: amountValidation.error });
      return {
        success: false,
        error: amountValidation.error,
        errorType: 'INVALID_AMOUNT'
      };
    }

    // Extract Steam IDs from message
    const steamIds = this.extractSteamIds(message);
    serviceLogger.info(`Extracted ${steamIds.length} Steam IDs from donation message`);

    // Validate Steam ID count
    const steamIdValidation = this.validateSteamIdCount(donationAmount, steamIds.length);
    if (!steamIdValidation.valid) {
      serviceLogger.error('Invalid Steam ID count', {
        found: steamIds.length,
        expected: steamIdValidation.expected,
        error: steamIdValidation.error
      });
      return {
        success: false,
        error: steamIdValidation.error,
        errorType: 'INVALID_STEAM_ID_COUNT',
        expected: steamIdValidation.expected,
        found: steamIds.length
      };
    }

    // Get tier information
    const tier = this.config.getTierForAmount(donationAmount);
    if (!tier) {
      serviceLogger.error('No pricing tier found', { amount: donationAmount });
      return {
        success: false,
        error: `No pricing tier found for amount $${donationAmount}`,
        errorType: 'NO_TIER_FOUND'
      };
    }

    // Create whitelist entries for each Steam ID
    const results = [];
    const errors = [];

    for (const steamId of steamIds) {
      try {
        serviceLogger.info(`Creating whitelist entry for Steam ID ${steamId}`);

        const whitelistEntry = await Whitelist.grantWhitelist({
          steamid64: steamId,
          eosID: null,
          username: null,
          discord_username: from_name,
          reason: `Donation - $${amount}`,
          duration_value: tier.duration_value,
          duration_type: tier.duration_type,
          granted_by: 'DONATION_WEBHOOK',
          note: message?.substring(0, 500) || null, // Limit note size
          metadata: {
            donation_amount: amount,
            donor_name: from_name,
            donor_email: email,
            donation_message: message?.substring(0, 500) || null,
            donation_type: type,
            tier_description: tier.description,
            processed_at: new Date().toISOString()
          }
        });

        // Override the source to 'donation' (grantWhitelist defaults to manual)
        await whitelistEntry.update({ source: 'donation' });

        results.push({
          steamId,
          success: true,
          whitelistId: whitelistEntry.id
        });

        serviceLogger.info(`Successfully created whitelist entry for ${steamId}`, {
          id: whitelistEntry.id
        });

      } catch (error) {
        serviceLogger.error(`Failed to create whitelist entry for ${steamId}`, {
          error: error.message
        });
        errors.push({
          steamId,
          error: error.message
        });
        results.push({
          steamId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    serviceLogger.info(`Donation processing complete`, {
      total: steamIds.length,
      success: successCount,
      failed: failureCount
    });

    return {
      success: failureCount === 0,
      partialSuccess: successCount > 0 && failureCount > 0,
      total: steamIds.length,
      successCount,
      failureCount,
      results,
      errors: failureCount > 0 ? errors : [],
      tier,
      expectedSteamIds: steamIdValidation.expected
    };
  }

  /**
   * Format donation data for Discord notifications
   * @param {Object} donationData - Raw donation data
   * @param {Object} processingResult - Result from processDonation
   * @returns {Object} Formatted notification data
   */
  formatNotificationData(donationData, processingResult) {
    const { from_name, amount, message, email } = donationData;
    const steamIds = this.extractSteamIds(message);

    return {
      donorName: from_name,
      amount: amount,
      message: message,
      email: email,
      steamIds: steamIds,
      tier: processingResult.tier,
      expectedSteamIds: processingResult.expectedSteamIds,
      successCount: processingResult.successCount,
      failureCount: processingResult.failureCount,
      results: processingResult.results
    };
  }
}

module.exports = new DonationService();
