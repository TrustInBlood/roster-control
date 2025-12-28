const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const PlayerProfileService = require('../../services/PlayerProfileService');

const logger = createServiceLogger('PlayersAPI');

// GET /api/v1/players - Search/list players
router.get('/', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 25,
      hasWhitelist,
      whitelistStatus,
      isStaff,
      sortBy = 'lastSeen',
      sortOrder = 'DESC'
    } = req.query;

    const result = await PlayerProfileService.searchPlayers(
      search,
      { hasWhitelist, whitelistStatus, isStaff, sortBy, sortOrder },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  } catch (error) {
    logger.error('Error searching players', { error: error.message });
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// GET /api/v1/players/:steamid64 - Get full player profile
router.get('/:steamid64', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;

    // Validate Steam64 format
    if (!/^7656\d{13}$/.test(steamid64)) {
      return res.status(400).json({ error: 'Invalid Steam64 ID format' });
    }

    const profile = await PlayerProfileService.getPlayerProfile(steamid64);

    res.json(profile);
  } catch (error) {
    logger.error('Error getting player profile', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player profile' });
  }
});

// GET /api/v1/players/:steamid64/sessions - Session history (lazy load)
router.get('/:steamid64/sessions', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await PlayerProfileService.getPlayerSessions(
      steamid64,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting player sessions', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player sessions' });
  }
});

// GET /api/v1/players/:steamid64/audit - Audit trail (lazy load)
router.get('/:steamid64/audit', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const { steamid64 } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await PlayerProfileService.getPlayerAuditLogs(
      steamid64,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting player audit logs', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player audit logs' });
  }
});

// GET /api/v1/players/:steamid64/seeding - Seeding activity (lazy load)
router.get('/:steamid64/seeding', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const { steamid64 } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await PlayerProfileService.getPlayerSeedingActivity(
      steamid64,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting player seeding activity', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player seeding activity' });
  }
});

// GET /api/v1/players/:steamid64/duty - Duty history (staff only)
router.get('/:steamid64/duty', requireAuth, requirePermission('VIEW_DUTY'), async (req, res) => {
  try {
    const { steamid64 } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // First, get the Discord user ID for this Steam ID
    const { PlayerDiscordLink } = require('../../database/models');
    const link = await PlayerDiscordLink.findOne({
      where: { steamid64, is_primary: true }
    });

    if (!link?.discord_user_id) {
      return res.json({
        changes: [],
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0 }
      });
    }

    const result = await PlayerProfileService.getPlayerDutyHistory(
      link.discord_user_id,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  } catch (error) {
    logger.error('Error getting player duty history', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player duty history' });
  }
});

// GET /api/v1/players/:steamid64/whitelist - Whitelist entries
router.get('/:steamid64/whitelist', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;

    const result = await PlayerProfileService.getPlayerWhitelistHistory(steamid64);

    res.json(result);
  } catch (error) {
    logger.error('Error getting player whitelist history', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player whitelist history' });
  }
});

// GET /api/v1/players/:steamid64/unlinks - Unlink history
router.get('/:steamid64/unlinks', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;

    // First, get the Discord user ID for this Steam ID
    const { PlayerDiscordLink } = require('../../database/models');
    const link = await PlayerDiscordLink.findOne({
      where: { steamid64, is_primary: true }
    });

    if (!link?.discord_user_id) {
      return res.json({ history: [] });
    }

    const result = await PlayerProfileService.getPlayerUnlinkHistory(link.discord_user_id);

    res.json(result);
  } catch (error) {
    logger.error('Error getting player unlink history', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get player unlink history' });
  }
});

// GET /api/v1/players/:steamid64/linked-accounts - All Steam accounts linked to the same Discord user
router.get('/:steamid64/linked-accounts', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;

    // First, get the Discord user ID for this Steam ID
    const { PlayerDiscordLink } = require('../../database/models');
    const link = await PlayerDiscordLink.findOne({
      where: { steamid64, is_primary: true }
    });

    if (!link?.discord_user_id) {
      return res.json({ accounts: [] });
    }

    const result = await PlayerProfileService.getLinkedAccountsByDiscord(link.discord_user_id);

    res.json(result);
  } catch (error) {
    logger.error('Error getting linked accounts', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get linked accounts' });
  }
});

// GET /api/v1/players/:steamid64/potential-links - Get potential (unverified) links for this Steam ID
router.get('/:steamid64/potential-links', requireAuth, requirePermission('VIEW_PLAYERS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;

    // Validate Steam64 format
    if (!/^7656\d{13}$/.test(steamid64)) {
      return res.status(400).json({ error: 'Invalid Steam64 ID format' });
    }

    const result = await PlayerProfileService.getPotentialLinksForPlayer(steamid64);

    res.json(result);
  } catch (error) {
    logger.error('Error getting potential links', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to get potential links' });
  }
});

// POST /api/v1/players/:steamid64/link - Create a verified link from a potential link
router.post('/:steamid64/link', requireAuth, requirePermission('MANAGE_ACCOUNT_LINKS'), async (req, res) => {
  try {
    const { steamid64 } = req.params;
    const { discordUserId, reason } = req.body;

    // Validate Steam64 format
    if (!/^7656\d{13}$/.test(steamid64)) {
      return res.status(400).json({ error: 'Invalid Steam64 ID format' });
    }

    // Validate Discord user ID
    if (!discordUserId) {
      return res.status(400).json({ error: 'Discord user ID is required' });
    }

    // Validate reason
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const result = await PlayerProfileService.createLinkFromPotential(steamid64, discordUserId, {
      adminId: req.user.id,
      adminTag: req.user.username,
      reason: reason.trim()
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('Error creating link from potential', { error: error.message, steamid64: req.params.steamid64 });
    res.status(500).json({ error: 'Failed to create link' });
  }
});

module.exports = router;
