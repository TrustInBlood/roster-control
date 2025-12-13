const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const BattleMetricsService = require('../../services/BattleMetricsService');
const { isValidSteamId } = require('../../utils/steamId');
const { createServiceLogger } = require('../../utils/logger');

const logger = createServiceLogger('BattleMetricsAPI');

/**
 * GET /api/v1/battlemetrics/player/:steamid
 * Lookup a player by Steam ID in BattleMetrics
 * Permission: ADD_MEMBER
 */
router.get('/player/:steamid', requirePermission('ADD_MEMBER'), async (req, res) => {
  try {
    const { steamid } = req.params;

    // Validate Steam ID format
    if (!isValidSteamId(steamid)) {
      return res.status(400).json({
        found: false,
        error: 'Invalid Steam ID format. Must be 17 digits starting with 7656119.',
        code: 'INVALID_STEAM_ID'
      });
    }

    logger.info(`BattleMetrics lookup requested for Steam ID: ${steamid}`, {
      requestedBy: req.user?.username
    });

    // Search BattleMetrics with 5 second timeout
    const result = await BattleMetricsService.searchPlayerBySteamId(steamid, 5000);

    if (!result.found) {
      logger.info(`BattleMetrics lookup: Player not found for ${steamid}`);
      return res.json({
        found: false,
        profileUrl: null,
        playerData: null,
        error: result.error || 'Player not found in BattleMetrics'
      });
    }

    logger.info(`BattleMetrics lookup successful for ${steamid}: ${result.playerData.name}`);

    res.json({
      found: true,
      profileUrl: result.profileUrl,
      playerData: {
        id: result.playerData.id,
        name: result.playerData.name,
        steamId: steamid
      }
    });

  } catch (error) {
    logger.error('Error looking up player in BattleMetrics:', error);
    res.status(500).json({
      found: false,
      error: 'Failed to lookup player in BattleMetrics',
      code: 'LOOKUP_ERROR',
      message: error.message
    });
  }
});

module.exports = router;
