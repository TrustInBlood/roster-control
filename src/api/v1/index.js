const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const whitelistRoutes = require('./whitelist');

// Mount routes
router.use('/auth', authRoutes);
router.use('/whitelist', whitelistRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
