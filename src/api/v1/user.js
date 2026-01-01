const express = require('express');
const router = express.Router();
const { createServiceLogger } = require('../../utils/logger');
const { UserPreference } = require('../../database/models');

const logger = createServiceLogger('UserPreferencesAPI');

/**
 * GET /api/v1/user/preferences
 * Fetch current user's preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const pref = await UserPreference.getOrCreate(req.user.id);

    res.json({
      success: true,
      preferences: pref.preferences || {},
      lastSync: pref.updated_at
    });
  } catch (error) {
    logger.error('Failed to fetch user preferences', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/v1/user/preferences
 * Update current user's preferences (deep merge)
 */
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'preferences must be an object' });
    }

    const pref = await UserPreference.updatePreferences(req.user.id, preferences);

    logger.debug('User preferences updated', { userId: req.user.id });

    res.json({
      success: true,
      preferences: pref.preferences,
      lastSync: pref.updated_at
    });
  } catch (error) {
    logger.error('Failed to update user preferences', { userId: req.user.id, error: error.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
