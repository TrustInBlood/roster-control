const express = require('express');
const { console: loggerConsole, createServiceLogger } = require('../utils/logger');
const { loadConfig } = require('../utils/environment');
const donationService = require('../services/DonationService');

const serviceLogger = createServiceLogger('DonationWebhook');
const router = express.Router();

/**
 * Sanitize user input for Discord messages
 * Prevents Discord markdown injection and other formatting issues
 */
function sanitizeForDiscord(text) {
  if (!text) return '';
  return text
    .replace(/```/g, '\\`\\`\\`')  // Escape code blocks
    .replace(/`/g, '\\`')          // Escape inline code
    .replace(/\*/g, '\\*')          // Escape bold/italic
    .replace(/_/g, '\\_')           // Escape underline
    .replace(/~/g, '\\~')           // Escape strikethrough
    .replace(/\|/g, '\\|')          // Escape spoiler
    .substring(0, 1900);            // Limit length (leaving room for formatting)
}

// Load environment-specific channel configuration
const { CHANNELS, MESSAGE_LINKS } = loadConfig('channels');

/**
 * Setup donation webhook routes
 * @param {Object} client - Discord client instance
 * @returns {express.Router} Configured Express router
 */
function setupDonationWebhook(client) {
  // Load environment-specific donation configuration
  const donationConfig = loadConfig('donations');

  /**
   * POST /webhook/donations
   * Receives donation webhook from Ko-fi or similar platforms
   *
   * Expected format (URL-encoded):
   * {
   *   data: JSON.stringify({
   *     from_name: 'Donor Name',
   *     amount: '25.00',
   *     message: 'Steam ID: 76561198XXXXXXXXX',
   *     email: 'donor@example.com',
   *     type: 'Donation'
   *   })
   * }
   */
  router.post('/donations', async (req, res) => {
    try {
      serviceLogger.info('Received donation webhook');

      // Validate webhook token if enabled
      if (donationConfig.SECURITY.ENABLE_TOKEN_VALIDATION) {
        const providedToken = req.headers['authorization'] || req.query.token;
        const expectedToken = process.env.DONATION_WEBHOOK_TOKEN;

        if (!providedToken || providedToken !== expectedToken) {
          serviceLogger.warn('Unauthorized donation webhook attempt', {
            ip: req.ip,
            hasToken: !!providedToken
          });
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      // Parse donation data (Ko-fi sends URL-encoded JSON in 'data' field)
      let donationData;
      try {
        if (req.body.data) {
          // Ko-fi format: URL-encoded JSON in 'data' field
          donationData = typeof req.body.data === 'string'
            ? JSON.parse(req.body.data)
            : req.body.data;
        } else {
          // Direct JSON format
          donationData = req.body;
        }

        serviceLogger.info('Parsed donation data', {
          from_name: donationData.from_name,
          amount: donationData.amount,
          type: donationData.type
        });

      } catch (parseError) {
        serviceLogger.error('Failed to parse donation data', {
          error: parseError.message,
          body: req.body
        });
        return res.status(400).json({ error: 'Invalid donation data format' });
      }

      // Extract required fields
      const { from_name, amount, message, email, type } = donationData;

      if (!from_name || !amount) {
        serviceLogger.error('Missing required donation fields', { from_name, amount });
        return res.status(400).json({ error: 'Missing required fields: from_name, amount' });
      }

      // Process the donation
      const processingResult = await donationService.processDonation(donationData);

      // Send Discord notifications (even for validation failures)
      await sendDonationNotifications(client, donationConfig, donationData, processingResult);

      // Check if donation processing failed validation
      if (!processingResult.success && !processingResult.partialSuccess) {
        serviceLogger.warn('Donation validation failed', {
          error: processingResult.error,
          errorType: processingResult.errorType
        });
        // Still return 200 so donation platform doesn't retry, but indicate failure
        return res.status(200).json({
          success: false,
          error: processingResult.error,
          errorType: processingResult.errorType,
          expected: processingResult.expected,
          found: processingResult.found
        });
      }

      // Respond to webhook with success
      res.status(200).json({
        success: true,
        message: 'Donation processed',
        processed: processingResult.successCount,
        failed: processingResult.failureCount
      });

    } catch (error) {
      serviceLogger.error('Error processing donation webhook', {
        error: error.message,
        stack: error.stack
      });

      // Send error notification to admin channel
      try {
        const adminChannelId = CHANNELS.DONATION_ADMIN_LOGS;
        const adminChannel = await client.channels.fetch(adminChannelId);
        if (adminChannel) {
          await adminChannel.send(`❌ **Donation Webhook Error**\n\`\`\`${error.message}\`\`\``);
        }
      } catch (notifError) {
        serviceLogger.error('Failed to send error notification', { error: notifError.message });
      }

      res.status(500).json({ error: 'Internal server error processing donation' });
    }
  });

  return router;
}

/**
 * Send Discord notifications for donation processing
 * @param {Object} client - Discord client
 * @param {Object} config - Donation configuration
 * @param {Object} donationData - Original donation data
 * @param {Object} processingResult - Result from donation service
 */
async function sendDonationNotifications(client, config, donationData, processingResult) {
  const { from_name, amount, message, email } = donationData;
  const steamIds = donationService.extractSteamIds(message);

  // Get Discord channels from centralized config
  const publicChannelId = CHANNELS.DONATION_ANNOUNCEMENTS;
  const adminChannelId = CHANNELS.DONATION_ADMIN_LOGS;

  try {
    const publicChannel = await client.channels.fetch(publicChannelId);
    const adminChannel = await client.channels.fetch(adminChannelId);

    // Handle errors in processing (validation failures)
    if (!processingResult.success && !processingResult.partialSuccess) {
      // Complete failure - notify BOTH channels so donor knows we received it
      const publicErrorMessage = formatPublicErrorNotification(donationData, processingResult);
      const adminErrorMessage = formatAdminErrorNotification(donationData, processingResult);

      if (publicChannel) {
        await publicChannel.send(publicErrorMessage);
      }
      if (adminChannel) {
        await adminChannel.send(adminErrorMessage);
      }
      return;
    }

    // Handle partial or complete success
    if (processingResult.failureCount > 0) {
      // Partial success - notify both channels
      const publicMessage = formatPublicNotification(donationData, processingResult, true);
      const adminMessage = formatAdminNotification(donationData, processingResult, true);

      if (publicChannel) {
        await publicChannel.send(publicMessage);
      }
      if (adminChannel) {
        await adminChannel.send(adminMessage);
      }

    } else {
      // Complete success - normal notifications
      const publicMessage = formatPublicNotification(donationData, processingResult, false);
      const adminMessage = formatAdminNotification(donationData, processingResult, false);

      if (publicChannel) {
        await publicChannel.send(publicMessage);
      }
      if (adminChannel) {
        await adminChannel.send(adminMessage);
      }

      // Add how-to-donate link in public channel
      if (publicChannel) {
        await publicChannel.send(MESSAGE_LINKS.HOW_TO_DONATE);
      }
    }

  } catch (error) {
    serviceLogger.error('Failed to send donation notifications', {
      error: error.message
    });
  }
}

/**
 * Format public notification (no email)
 */
function formatPublicNotification(donationData, processingResult, hasErrors) {
  const { from_name, amount, message } = donationData;
  const steamIds = donationService.extractSteamIds(message);
  const tier = processingResult.tier;

  // Sanitize user inputs
  const safeName = sanitizeForDiscord(from_name);
  const safeMessage = sanitizeForDiscord(message);

  const steamIdList = steamIds.join(', ');
  const durationText = tier.duration_value === 12 ? '1-year' : `${tier.duration_value}-month`;

  let notification = '```\n';
  notification += `Name: ${safeName}\n`;
  notification += `Type: Donation\n`;
  notification += `Amount: ${amount}\n`;
  notification += `Message: ${safeMessage}\n`;
  notification += '```\n';

  if (hasErrors) {
    notification += `⚠️ A player has donated **${amount}** but only **${processingResult.successCount}/${steamIds.length}** SteamID(s) were successfully added for **${durationText} whitelist**. Admin attention needed!\n`;
  } else if (steamIds.length < processingResult.expectedSteamIds) {
    notification += `⚠️ A player has donated **${amount}** but only provided **${steamIds.length}/${processingResult.expectedSteamIds}** SteamID(s): **(${steamIdList})** for **${durationText} whitelist**. Admin attention needed!\n`;
  } else {
    notification += `A player has donated **${amount}**. SteamID(s) **(${steamIdList})** added to the whitelist for **${durationText} whitelist**.\n`;
  }

  // Add success/failure details
  if (processingResult.results) {
    for (const result of processingResult.results) {
      if (result.success) {
        notification += `✅ SteamID **(${result.steamId})** successfully added.\n`;
      } else {
        notification += `❌ SteamID **(${result.steamId})** failed to add.\n`;
      }
    }
  }

  return notification;
}

/**
 * Format admin notification (includes email)
 */
function formatAdminNotification(donationData, processingResult, hasErrors) {
  const { from_name, amount, message, email } = donationData;
  const steamIds = donationService.extractSteamIds(message);
  const tier = processingResult.tier;

  // Sanitize user inputs
  const safeName = sanitizeForDiscord(from_name);
  const safeMessage = sanitizeForDiscord(message);
  const safeEmail = sanitizeForDiscord(email);

  const steamIdList = steamIds.join(', ');
  const durationText = tier.duration_value === 12 ? '1-year' : `${tier.duration_value}-month`;

  let notification = '```\n';
  notification += `Name: ${safeName}\n`;
  notification += `Type: Donation\n`;
  notification += `Amount: ${amount}\n`;
  notification += `Message: ${safeMessage}\n`;
  notification += `Email: ${safeEmail}\n`;
  notification += '```\n';

  if (hasErrors) {
    notification += `⚠️ **Admin Attention Required**: Donation of **${amount}** processed with errors.\n`;
    notification += `Successfully added: **${processingResult.successCount}/${steamIds.length}** SteamID(s)\n`;
  } else if (steamIds.length < processingResult.expectedSteamIds) {
    notification += `⚠️ **Admin Attention Required**: Donation of **${amount}** has fewer SteamIDs than expected.\n`;
    notification += `Provided: **${steamIds.length}/${processingResult.expectedSteamIds}** SteamID(s): **(${steamIdList})**\n`;
  } else {
    notification += `✅ Donation of **${amount}** processed successfully.\n`;
    notification += `SteamID(s) **(${steamIdList})** added for **${durationText} whitelist**.\n`;
  }

  return notification;
}

/**
 * Format public error notification (no email)
 * Sent to public channel so donor knows we received their donation
 */
function formatPublicErrorNotification(donationData, processingResult) {
  const { from_name, amount, message } = donationData;

  // Sanitize user inputs
  const safeName = sanitizeForDiscord(from_name);
  const safeMessage = sanitizeForDiscord(message);

  let notification = '```\n';
  notification += `Name: ${safeName}\n`;
  notification += `Type: Donation\n`;
  notification += `Amount: ${amount}\n`;
  notification += `Message: ${safeMessage}\n`;
  notification += '```\n';

  // Format based on whether we have expected/found counts
  if (processingResult.expected !== undefined && processingResult.found !== undefined) {
    notification += `⚠️ Invalid Donation Message: **${processingResult.found}** SteamID(s) for **$${amount}** donation, need Admin attention. Please open a ticket!\n`;
  } else {
    notification += `⚠️ Invalid Donation Message: Issue processing **$${amount}** donation, need Admin attention. Please open a ticket!\n`;
  }

  return notification;
}

/**
 * Format admin error notification (includes email and full details)
 * Sent to admin channel for manual processing
 */
function formatAdminErrorNotification(donationData, processingResult) {
  const { from_name, amount, message, email } = donationData;

  // Sanitize user inputs
  const safeName = sanitizeForDiscord(from_name);
  const safeMessage = sanitizeForDiscord(message);
  const safeEmail = sanitizeForDiscord(email);

  let notification = '❌ **Donation Processing Failed**\n\n';
  notification += '```\n';
  notification += `Name: ${safeName}\n`;
  notification += `Type: Donation\n`;
  notification += `Amount: ${amount}\n`;
  notification += `Email: ${safeEmail}\n`;
  notification += `Message: ${safeMessage}\n`;
  notification += '```\n\n';
  notification += `**Error:** ${processingResult.error}\n`;
  notification += `**Error Type:** ${processingResult.errorType}\n\n`;

  if (processingResult.expected && processingResult.found !== undefined) {
    notification += `Expected SteamIDs: **${processingResult.expected}**\n`;
    notification += `Found SteamIDs: **${processingResult.found}**\n`;
  }

  notification += '\n**Action Required:** Please review and process manually via ticket system.';

  return notification;
}

module.exports = { setupDonationWebhook };
