const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const whitelistRoutes = require('./whitelist');
const { requireStaff, refreshUserRoles } = require('../middleware/auth');

// Mount routes
router.use('/auth', authRoutes);

// All routes below require staff role
// refreshUserRoles updates cached roles from Discord (uses MemberCacheService with 1hr TTL)
router.use('/whitelist', refreshUserRoles, requireStaff, whitelistRoutes);

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
