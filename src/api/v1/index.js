const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const whitelistRoutes = require('./whitelist');
const { requireStaff } = require('../middleware/auth');

// Mount routes
router.use('/auth', authRoutes);

// All routes below require staff role
router.use('/whitelist', requireStaff, whitelistRoutes);

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
