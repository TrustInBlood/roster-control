const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { SeedingSession, SeedingParticipant, AuditLog } = require('../../database/models');

const logger = createServiceLogger('SeedingAPI');

// Service reference - will be set during initialization
let seedingService = null;

/**
 * Set the seeding service reference
 * Called during API initialization
 */
function setSeedingService(service) {
  seedingService = service;
}

// GET /api/v1/seeding/servers - Get available servers for seeding
router.get('/servers', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    if (!seedingService) {
      return res.status(503).json({ error: 'Seeding service not initialized' });
    }

    const servers = seedingService.getAvailableServers();

    res.json({
      success: true,
      data: servers
    });
  } catch (error) {
    logger.error('Error getting servers:', error.message);
    res.status(500).json({ error: 'Failed to get servers' });
  }
});

// GET /api/v1/seeding/sessions - List all seeding sessions
router.get('/sessions', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = null,
      sortBy = 'started_at',
      sortOrder = 'DESC'
    } = req.query;

    const result = await SeedingSession.getSessions({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: {
        sessions: result.rows,
        total: result.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(result.count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error listing sessions:', error.message);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/v1/seeding/sessions/active - Get the current active session
router.get('/sessions/active', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const session = await SeedingSession.getActiveSession();

    if (!session) {
      return res.json({
        success: true,
        data: null
      });
    }

    // Get additional stats
    const stats = await SeedingSession.getSessionWithStats(session.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting active session:', error.message);
    res.status(500).json({ error: 'Failed to get active session' });
  }
});

// GET /api/v1/seeding/sessions/:id - Get session details
router.get('/sessions/:id', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await SeedingSession.getSessionWithStats(parseInt(id));

    if (!stats) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting session:', error.message);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// GET /api/v1/seeding/sessions/:id/participants - List session participants
router.get('/sessions/:id/participants', requireAuth, requirePermission('VIEW_SEEDING'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      limit = 50,
      status = null,
      participantType = null,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Verify session exists
    const session = await SeedingSession.findByPk(parseInt(id));
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await SeedingParticipant.getParticipants(parseInt(id), {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      participantType,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: {
        participants: result.rows,
        total: result.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(result.count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error listing participants:', error.message);
    res.status(500).json({ error: 'Failed to list participants' });
  }
});

// POST /api/v1/seeding/sessions - Create a new seeding session
router.post('/sessions', requireAuth, requirePermission('MANAGE_SEEDING'), async (req, res) => {
  try {
    if (!seedingService) {
      return res.status(503).json({ error: 'Seeding service not initialized' });
    }

    const {
      targetServerId,
      playerThreshold,
      rewards,
      testMode,
      sourceServerIds
    } = req.body;

    // Validate required fields
    if (!targetServerId) {
      return res.status(400).json({ error: 'targetServerId is required' });
    }
    // Test mode allows threshold as low as 1, normal mode requires 10+
    const minThreshold = testMode ? 1 : 10;
    if (!playerThreshold || playerThreshold < minThreshold) {
      return res.status(400).json({ error: `playerThreshold must be at least ${minThreshold}` });
    }
    if (playerThreshold > 99) {
      return res.status(400).json({ error: 'playerThreshold cannot exceed 99' });
    }

    // Validate test mode settings
    if (testMode && (!sourceServerIds || sourceServerIds.length === 0)) {
      return res.status(400).json({ error: 'Test mode requires at least one source server' });
    }

    // Validate rewards structure
    if (!rewards || (!rewards.switch && !rewards.playtime && !rewards.completion)) {
      return res.status(400).json({ error: 'At least one reward tier must be configured' });
    }

    // Validate reward tiers
    if (rewards.switch) {
      if (!rewards.switch.value || !rewards.switch.unit) {
        return res.status(400).json({ error: 'Switch reward requires value and unit' });
      }
      if (!['days', 'months'].includes(rewards.switch.unit)) {
        return res.status(400).json({ error: 'Invalid switch reward unit' });
      }
    }

    if (rewards.playtime) {
      if (!rewards.playtime.value || !rewards.playtime.unit || !rewards.playtime.thresholdMinutes) {
        return res.status(400).json({ error: 'Playtime reward requires value, unit, and thresholdMinutes' });
      }
      if (!['days', 'months'].includes(rewards.playtime.unit)) {
        return res.status(400).json({ error: 'Invalid playtime reward unit' });
      }
    }

    if (rewards.completion) {
      if (!rewards.completion.value || !rewards.completion.unit) {
        return res.status(400).json({ error: 'Completion reward requires value and unit' });
      }
      if (!['days', 'months'].includes(rewards.completion.unit)) {
        return res.status(400).json({ error: 'Invalid completion reward unit' });
      }
    }

    const session = await seedingService.createSession(
      { targetServerId, playerThreshold, rewards, testMode, sourceServerIds },
      req.user.id,
      req.user.username || req.user.displayName
    );

    logger.info(`Session ${session.id} created by ${req.user.username}${testMode ? ' (TEST MODE)' : ''}`);

    res.status(201).json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Error creating session:', error.message);

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message.includes('not connected')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/v1/seeding/sessions/:id/close - Force close a session
router.post('/sessions/:id/close', requireAuth, requirePermission('MANAGE_SEEDING'), async (req, res) => {
  try {
    if (!seedingService) {
      return res.status(503).json({ error: 'Seeding service not initialized' });
    }

    const { id } = req.params;

    const session = await seedingService.closeSession(parseInt(id), 'manual');

    logger.info(`Session ${id} closed by ${req.user.username}`);

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Error closing session:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to close session' });
  }
});

// POST /api/v1/seeding/sessions/:id/cancel - Cancel a session
router.post('/sessions/:id/cancel', requireAuth, requirePermission('MANAGE_SEEDING'), async (req, res) => {
  try {
    if (!seedingService) {
      return res.status(503).json({ error: 'Seeding service not initialized' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const session = await seedingService.cancelSession(
      parseInt(id),
      req.user.id,
      reason || 'Cancelled by admin'
    );

    logger.info(`Session ${id} cancelled by ${req.user.username}: ${reason || 'No reason provided'}`);

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Error cancelling session:', error.message);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

module.exports = router;
module.exports.setSeedingService = setSeedingService;
