const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requirePermission } = require('../middleware/auth');
const { InfoPostButton, AuditLog } = require('../../database/models');

const logger = createServiceLogger('InfoButtonsAPI');

// Cache for info buttons (used by WhitelistPostService and buttonInteractionHandler)
let buttonCache = null;
let buttonCacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all buttons from cache or database
 * @returns {Promise<Array>}
 */
async function getButtonsFromCache() {
  if (buttonCache && buttonCacheTimestamp && (Date.now() - buttonCacheTimestamp) < CACHE_TTL) {
    return buttonCache;
  }

  const buttons = await InfoPostButton.getAllOrdered();
  buttonCache = buttons;
  buttonCacheTimestamp = Date.now();
  return buttons;
}

/**
 * Invalidate the button cache
 */
function invalidateButtonCache() {
  buttonCache = null;
  buttonCacheTimestamp = null;
  logger.debug('Info button cache invalidated');
}

/**
 * Get enabled buttons for use by WhitelistPostService
 * @returns {Promise<Array>}
 */
async function getEnabledButtonsForPost() {
  const buttons = await getButtonsFromCache();
  return buttons.filter(b => b.enabled);
}

/**
 * Find a button by its button_id
 * @param {string} buttonId - The button_id to find
 * @returns {Promise<Object|null>}
 */
async function findButtonByButtonId(buttonId) {
  const buttons = await getButtonsFromCache();
  return buttons.find(b => b.button_id === buttonId) || null;
}

/**
 * Validate emoji format for Discord buttons
 * @param {string} emoji - The emoji string to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEmoji(emoji) {
  if (!emoji) return { valid: true };

  // Reject Discord shortcodes like :emoji_name:
  if (/^:[a-zA-Z0-9_]+:$/.test(emoji)) {
    return {
      valid: false,
      error: 'Emoji must be an actual emoji character (like 🎮), not a shortcode (like :game:). Copy and paste the emoji directly.'
    };
  }

  // Reject if it's just text without any emoji characters
  // Unicode emoji ranges: most emojis are in these ranges
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{203C}-\u{3299}]/u;

  if (!emojiRegex.test(emoji)) {
    return {
      valid: false,
      error: `"${emoji}" is not a valid emoji. Use an actual emoji character (like 🎮 or ❓) or leave empty.`
    };
  }

  return { valid: true };
}

// ============================================
// List/Get Endpoints
// ============================================

/**
 * GET /api/v1/info-buttons
 * List all info buttons
 * Requires: MANAGE_INFO_BUTTONS
 */
router.get('/', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const buttons = await InfoPostButton.getAllOrdered();

    res.json({
      success: true,
      buttons: buttons.map(b => ({
        id: b.id,
        button_id: b.button_id,
        button_label: b.button_label,
        button_emoji: b.button_emoji,
        channels: b.channels,
        embed: b.embed,
        display_order: b.display_order,
        enabled: b.enabled,
        created_at: b.created_at,
        updated_at: b.updated_at
      }))
    });
  } catch (error) {
    logger.error('Failed to fetch info buttons', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch info buttons' });
  }
});

/**
 * GET /api/v1/info-buttons/:id
 * Get single info button
 * Requires: MANAGE_INFO_BUTTONS
 */
router.get('/:id', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { id } = req.params;
    const button = await InfoPostButton.findByPk(parseInt(id, 10));

    if (!button) {
      return res.status(404).json({ error: 'Info button not found' });
    }

    res.json({
      success: true,
      button: {
        id: button.id,
        button_id: button.button_id,
        button_label: button.button_label,
        button_emoji: button.button_emoji,
        channels: button.channels,
        embed: button.embed,
        display_order: button.display_order,
        enabled: button.enabled,
        created_at: button.created_at,
        updated_at: button.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to fetch info button', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch info button' });
  }
});

// ============================================
// Create/Update/Delete Endpoints
// ============================================

/**
 * POST /api/v1/info-buttons
 * Create a new info button
 * Requires: MANAGE_INFO_BUTTONS
 */
router.post('/', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { button_id, button_label, button_emoji, channels, embed, enabled = true } = req.body;

    // Validate required fields
    if (!button_id || !button_label || !embed) {
      return res.status(400).json({ error: 'button_id, button_label, and embed are required' });
    }

    // Validate button_id format (must start with info_)
    if (!button_id.startsWith('info_')) {
      return res.status(400).json({ error: 'button_id must start with "info_"' });
    }

    // Validate button_id uniqueness
    const existing = await InfoPostButton.findByButtonId(button_id);
    if (existing) {
      return res.status(409).json({ error: 'A button with this button_id already exists' });
    }

    // Validate embed structure
    if (!embed.title || !embed.description) {
      return res.status(400).json({ error: 'embed must have at least title and description' });
    }

    // Validate emoji format
    const emojiValidation = validateEmoji(button_emoji);
    if (!emojiValidation.valid) {
      return res.status(400).json({ error: emojiValidation.error });
    }

    // Get next display_order
    const maxOrder = await InfoPostButton.max('display_order') || 0;

    const button = await InfoPostButton.create({
      button_id,
      button_label,
      button_emoji: button_emoji || null,
      channels: channels || null,
      embed,
      display_order: maxOrder + 1,
      enabled
    });

    // Invalidate cache
    invalidateButtonCache();

    // Audit log
    await AuditLog.create({
      actionType: 'INFO_BUTTON_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'info_button',
      targetId: button.id.toString(),
      targetName: button_label,
      description: `Created info button: ${button_label}`,
      details: JSON.stringify({ button_id, button_label }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Info button created', { button_id, button_label, createdBy: req.user.username });

    res.status(201).json({
      success: true,
      button: {
        id: button.id,
        button_id: button.button_id,
        button_label: button.button_label,
        button_emoji: button.button_emoji,
        channels: button.channels,
        embed: button.embed,
        display_order: button.display_order,
        enabled: button.enabled,
        created_at: button.created_at,
        updated_at: button.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to create info button', { error: error.message });
    res.status(500).json({ error: 'Failed to create info button' });
  }
});

/**
 * PUT /api/v1/info-buttons/:id
 * Update an info button
 * Requires: MANAGE_INFO_BUTTONS
 */
router.put('/:id', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { id } = req.params;
    const button = await InfoPostButton.findByPk(parseInt(id, 10));

    if (!button) {
      return res.status(404).json({ error: 'Info button not found' });
    }

    const { button_label, button_emoji, channels, embed, enabled } = req.body;

    // Validate emoji format
    const emojiValidation = validateEmoji(button_emoji);
    if (!emojiValidation.valid) {
      return res.status(400).json({ error: emojiValidation.error });
    }

    // Build updates
    const updates = {};
    if (button_label !== undefined) updates.button_label = button_label;
    if (button_emoji !== undefined) updates.button_emoji = button_emoji || null;
    if (channels !== undefined) updates.channels = channels || null;
    if (embed !== undefined) {
      // Validate embed structure
      if (!embed.title || !embed.description) {
        return res.status(400).json({ error: 'embed must have at least title and description' });
      }
      updates.embed = embed;
    }
    if (enabled !== undefined) updates.enabled = enabled;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await button.update(updates);

    // Invalidate cache
    invalidateButtonCache();

    // Audit log
    await AuditLog.create({
      actionType: 'INFO_BUTTON_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'info_button',
      targetId: id,
      targetName: button.button_label,
      description: `Updated info button: ${button.button_label}`,
      details: JSON.stringify({ updates }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Info button updated', { id, button_id: button.button_id, updatedBy: req.user.username });

    res.json({
      success: true,
      button: {
        id: button.id,
        button_id: button.button_id,
        button_label: button.button_label,
        button_emoji: button.button_emoji,
        channels: button.channels,
        embed: button.embed,
        display_order: button.display_order,
        enabled: button.enabled,
        created_at: button.created_at,
        updated_at: button.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to update info button', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to update info button' });
  }
});

/**
 * DELETE /api/v1/info-buttons/:id
 * Delete an info button
 * Requires: MANAGE_INFO_BUTTONS
 */
router.delete('/:id', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { id } = req.params;
    const button = await InfoPostButton.findByPk(parseInt(id, 10));

    if (!button) {
      return res.status(404).json({ error: 'Info button not found' });
    }

    const buttonLabel = button.button_label;
    const buttonId = button.button_id;

    await button.destroy();

    // Invalidate cache
    invalidateButtonCache();

    // Audit log
    await AuditLog.create({
      actionType: 'INFO_BUTTON_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'info_button',
      targetId: id,
      targetName: buttonLabel,
      description: `Deleted info button: ${buttonLabel}`,
      details: JSON.stringify({ button_id: buttonId, button_label: buttonLabel }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Info button deleted', { id, button_id: buttonId, deletedBy: req.user.username });

    res.json({ success: true, message: `Info button "${buttonLabel}" deleted` });
  } catch (error) {
    logger.error('Failed to delete info button', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to delete info button' });
  }
});

// ============================================
// Reorder Endpoint
// ============================================

/**
 * PUT /api/v1/info-buttons/reorder
 * Update display order of buttons
 * Requires: MANAGE_INFO_BUTTONS
 * Body: { order: [{ id: number, display_order: number }] }
 */
router.put('/reorder', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'order must be a non-empty array' });
    }

    // Validate order array
    for (const item of order) {
      if (typeof item.id !== 'number' || typeof item.display_order !== 'number') {
        return res.status(400).json({ error: 'Each order item must have id and display_order as numbers' });
      }
    }

    await InfoPostButton.updateDisplayOrder(order);

    // Invalidate cache
    invalidateButtonCache();

    // Audit log
    await AuditLog.create({
      actionType: 'INFO_BUTTON_REORDER',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'info_button',
      targetId: 'all',
      targetName: 'Info Buttons',
      description: `Reordered ${order.length} info buttons`,
      details: JSON.stringify({ order }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Info buttons reordered', { count: order.length, reorderedBy: req.user.username });

    res.json({ success: true, message: 'Button order updated' });
  } catch (error) {
    logger.error('Failed to reorder info buttons', { error: error.message });
    res.status(500).json({ error: 'Failed to reorder info buttons' });
  }
});

// ============================================
// Reload Post Endpoint
// ============================================

/**
 * POST /api/v1/info-buttons/reload-post
 * Trigger whitelist post refresh
 * Requires: MANAGE_INFO_BUTTONS
 * Body: { recreate?: boolean } - If true, delete and recreate the post
 */
router.post('/reload-post', requirePermission('MANAGE_INFO_BUTTONS'), async (req, res) => {
  try {
    const { recreate = false } = req.body;

    // Invalidate cache first
    invalidateButtonCache();

    // Get Discord client and create WhitelistPostService instance
    const discordClient = global.discordClient;
    if (!discordClient) {
      return res.status(503).json({ error: 'Discord client not available' });
    }

    const WhitelistPostService = require('../../services/WhitelistPostService');
    const whitelistPostService = new WhitelistPostService(discordClient);

    // Get the guild ID from the first guild (single-guild bot)
    const guild = discordClient.guilds.cache.first();
    if (!guild) {
      return res.status(503).json({ error: 'No Discord guild available' });
    }

    if (recreate) {
      // Delete and recreate the post
      await whitelistPostService.deleteAndRecreate(guild.id);
      logger.info('Whitelist post recreated', { recreatedBy: req.user.username });
    } else {
      // Update the tracked post
      await whitelistPostService.updateTrackedPost(guild.id);
      logger.info('Whitelist post reloaded', { reloadedBy: req.user.username });
    }

    // Audit log
    await AuditLog.create({
      actionType: recreate ? 'INFO_BUTTON_RECREATE_POST' : 'INFO_BUTTON_RELOAD_POST',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'whitelist_post',
      targetId: 'whitelist_post',
      targetName: 'Whitelist Post',
      description: recreate ? 'Recreated whitelist post with info buttons' : 'Reloaded whitelist post with updated info buttons',
      details: JSON.stringify({ triggeredBy: req.user.username, recreate }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: recreate ? 'Whitelist post recreated' : 'Whitelist post updated'
    });
  } catch (error) {
    logger.error('Failed to reload whitelist post', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Export router and helper functions for use by other services
module.exports = router;
module.exports.getEnabledButtonsForPost = getEnabledButtonsForPost;
module.exports.findButtonByButtonId = findButtonByButtonId;
module.exports.invalidateButtonCache = invalidateButtonCache;
