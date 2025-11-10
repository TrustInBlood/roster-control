const express = require('express');
const crypto = require('crypto');
const { console: loggerConsole, createServiceLogger } = require('../utils/logger');
const { Whitelist } = require('../database/models');
const notificationService = require('../services/NotificationService');

const serviceLogger = createServiceLogger('BattleMetricsWebhook');
const router = express.Router();

/**
 * Validate BattleMetrics webhook authentication
 * Supports two methods:
 * 1. X-Signature header (HMAC-SHA256) - recommended for production
 * 2. Query string token (?token=...) - simpler alternative
 *
 * @param {Object} req - Express request object
 * @returns {boolean} True if authentication is valid or disabled
 */
function validateBattleMetricsWebhook(req) {
  const enableValidation = process.env.BATTLEMETRICS_WEBHOOK_ENABLE_TOKEN === 'true';

  // If validation is disabled, allow all requests
  if (!enableValidation) {
    return true;
  }

  // Method 1: Check X-Signature header (BattleMetrics HMAC-SHA256)
  const signature = req.headers['x-signature'];
  const sharedSecret = process.env.BATTLEMETRICS_WEBHOOK_SECRET;

  if (signature && sharedSecret) {
    try {
      // BattleMetrics signature format: "t=<timestamp>,s=<signature>"
      // Parse the signature to extract timestamp and hash
      const signatureParts = {};
      signature.split(',').forEach(part => {
        const [key, value] = part.split('=', 2);
        signatureParts[key] = value;
      });

      const timestamp = signatureParts.t;
      const providedHash = signatureParts.s;

      if (!timestamp || !providedHash) {
        serviceLogger.warn('Invalid X-Signature format', { signature });
      } else {
        // BattleMetrics signs: timestamp + '.' + raw request body
        // Use req.rawBody which was preserved by express.json verify middleware
        const rawBody = req.rawBody || JSON.stringify(req.body);
        const signedPayload = `${timestamp}.${rawBody}`;

        const expectedSignature = crypto
          .createHmac('sha256', sharedSecret)
          .update(signedPayload)
          .digest('hex');

        if (providedHash === expectedSignature) {
          serviceLogger.debug('BattleMetrics webhook authenticated via X-Signature');
          return true;
        }

        serviceLogger.warn('Invalid X-Signature hash', {
          provided: providedHash.substring(0, 10) + '...',
          expected: expectedSignature.substring(0, 10) + '...',
          timestamp,
          bodyLength: rawBody.length,
          bodySample: rawBody.substring(0, 100),
          hasRawBody: !!req.rawBody
        });
      }
    } catch (error) {
      serviceLogger.error('Error validating X-Signature', { error: error.message });
    }
  }

  // Method 2: Check query string token (fallback)
  const token = req.query.token;
  const expectedToken = process.env.BATTLEMETRICS_WEBHOOK_TOKEN;

  if (token && expectedToken && token === expectedToken) {
    serviceLogger.debug('BattleMetrics webhook authenticated via query token');
    return true;
  }

  // No valid authentication method found
  return false;
}

/**
 * Setup BattleMetrics webhook routes
 * @param {Object} client - Discord client instance
 * @returns {express.Router} Configured Express router
 */
function setupBattleMetricsWebhook(client) {
  /**
   * POST /webhook/battlemetrics/whitelist
   * Receives BattleMetrics webhook to add temporary whitelist
   *
   * BattleMetrics Template Variables (to use in webhook configuration):
   * - player.steamID → Steam64 (maps to 'steamid64' field)
   * - player.name → Player's in-game name (maps to 'username' field)
   * - user.nickname or user.id → Admin who triggered the action (maps to 'admin' field)
   *
   * Expected JSON format from BattleMetrics:
   * {
   *   steamid64: '76561198XXXXXXXXX',
   *   username: 'Player Name',
   *   days: 30,
   *   reason: 'BattleMetrics subscription',
   *   admin: 'BattleMetrics_Admin_Name'
   * }
   *
   * Required fields: steamid64, days, admin
   * Optional fields: username, reason
   *
   * Authentication:
   * - BattleMetrics does NOT send Authorization headers
   * - Option 1: Pass token in query string (?token=your_secret)
   * - Option 2: Use X-Signature header with HMAC-SHA256 verification (recommended)
   *   Set BATTLEMETRICS_WEBHOOK_SECRET to your BattleMetrics "Shared Secret"
   */
  router.post('/battlemetrics/whitelist', async (req, res) => {
    try {
      serviceLogger.info('Received BattleMetrics whitelist webhook');

      // Validate webhook authentication
      const isValid = validateBattleMetricsWebhook(req);
      if (!isValid) {
        serviceLogger.warn('Unauthorized BattleMetrics webhook attempt', {
          ip: req.ip,
          hasSignature: !!req.headers['x-signature'],
          hasToken: !!req.query.token
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Parse webhook data
      const { steamid64, username, days, reason, admin } = req.body;

      // Validate required fields
      if (!steamid64) {
        serviceLogger.error('Missing required field: steamid64', { body: req.body });
        return res.status(400).json({ error: 'Missing required field: steamid64' });
      }

      if (!days || days <= 0) {
        serviceLogger.error('Invalid days value', { days, body: req.body });
        return res.status(400).json({ error: 'Invalid days value. Must be a positive number.' });
      }

      if (!admin) {
        serviceLogger.error('Missing required field: admin', { body: req.body });
        return res.status(400).json({ error: 'Missing required field: admin (admin identifier or name)' });
      }

      // Validate Steam ID format (basic check)
      const steamIdPattern = /^765\d{14}$/;
      if (!steamIdPattern.test(steamid64)) {
        serviceLogger.error('Invalid Steam ID format', { steamid64 });
        return res.status(400).json({ error: 'Invalid Steam ID format' });
      }

      serviceLogger.info('Processing BattleMetrics whitelist request', {
        steamid64,
        username,
        days,
        reason,
        admin
      });

      // Process the whitelist grant
      const result = await grantBattleMetricsWhitelist({
        steamid64,
        username,
        days,
        reason: reason || 'BattleMetrics subscription',
        admin
      });

      if (!result.success) {
        serviceLogger.error('Failed to grant whitelist', {
          steamid64,
          error: result.error
        });
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }

      serviceLogger.info('BattleMetrics whitelist granted successfully', {
        steamid64,
        username,
        days,
        expirationDate: result.expirationDate
      });

      // Send Discord notification
      try {
        const expirationDateFormatted = new Date(result.expirationDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC'
        });

        await notificationService.send('whitelist', {
          title: 'BattleMetrics Whitelist Granted',
          description: 'A new whitelist has been granted via BattleMetrics webhook.',
          fields: [
            { name: 'Player', value: username || 'Unknown', inline: true },
            { name: 'Steam ID', value: `\`${steamid64}\``, inline: true },
            { name: 'Duration', value: `${days} days`, inline: true },
            { name: 'Reason', value: reason || 'BattleMetrics Webhook', inline: false },
            { name: 'Granted By', value: admin, inline: true },
            { name: 'Expires', value: `${expirationDateFormatted} UTC`, inline: true }
          ],
          colorType: 'whitelist_grant',
          timestamp: true
        });
      } catch (notificationError) {
        serviceLogger.error('Failed to send BattleMetrics whitelist notification', {
          error: notificationError.message,
          steamid64,
          username
        });
        // Don't fail the webhook if notification fails
      }

      // Respond to webhook with success
      res.status(200).json({
        success: true,
        message: 'Whitelist granted',
        steamid64: result.steamid64,
        expirationDate: result.expirationDate,
        daysGranted: days
      });

    } catch (error) {
      serviceLogger.error('Error processing BattleMetrics webhook', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({ error: 'Internal server error processing whitelist request' });
    }
  });

  /**
   * GET /webhook/battlemetrics/health
   * Health check endpoint for BattleMetrics webhook
   */
  router.get('/battlemetrics/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'battlemetrics-webhook',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

/**
 * Grant a BattleMetrics whitelist entry
 * @param {Object} params - Whitelist parameters
 * @param {string} params.steamid64 - Steam ID
 * @param {string} params.username - Player username
 * @param {number} params.days - Duration in days
 * @param {string} params.reason - Reason for whitelist
 * @param {string} params.admin - Admin identifier or name who issued the whitelist
 * @returns {Promise<Object>} Result object with success status
 */
async function grantBattleMetricsWhitelist({ steamid64, username, days, reason, admin }) {
  try {
    // Create whitelist entry using existing model method
    const whitelistEntry = await Whitelist.grantWhitelist({
      steamid64,
      eosID: null,
      username: username || null,
      discord_username: null,
      reason: reason || 'BattleMetrics subscription',
      duration_value: days,
      duration_type: 'days',
      granted_by: admin,
      note: null,
      metadata: {
        source: 'battlemetrics',
        webhookTimestamp: new Date().toISOString(),
        admin: admin
      }
    });

    // Calculate expiration date for response
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);

    serviceLogger.info('BattleMetrics whitelist entry created', {
      id: whitelistEntry.id,
      steamid64: whitelistEntry.steamid64,
      username: whitelistEntry.username,
      expirationDate: whitelistEntry.expiration,
      durationDays: days
    });

    return {
      success: true,
      steamid64: whitelistEntry.steamid64,
      expirationDate: whitelistEntry.expiration,
      entryId: whitelistEntry.id
    };

  } catch (error) {
    serviceLogger.error('Failed to grant BattleMetrics whitelist', {
      steamid64,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { setupBattleMetricsWebhook };
