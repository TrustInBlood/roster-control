const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const whitelistRoutes = require('./whitelist');
const auditRoutes = require('./audit');
const securityRoutes = require('./security');
const discordRoutes = require('./discord');
const battlemetricsRoutes = require('./battlemetrics');
const membersRoutes = require('./members');
const permissionsRoutes = require('./permissions');
const squadgroupsRoutes = require('./squadgroups');
const statsTemplatesRoutes = require('./statsTemplates');
const seedingRoutes = require('./seeding');
const serversRoutes = require('./servers');
const { requireStaff, refreshUserRoles } = require('../middleware/auth');

// Mount routes
router.use('/auth', authRoutes);

// All routes below require staff role
// refreshUserRoles updates cached roles from Discord (uses MemberCacheService with 1hr TTL)
router.use('/whitelist', refreshUserRoles, requireStaff, whitelistRoutes);
router.use('/audit', refreshUserRoles, requireStaff, auditRoutes);
router.use('/security', refreshUserRoles, requireStaff, securityRoutes);
router.use('/discord', refreshUserRoles, requireStaff, discordRoutes);
router.use('/battlemetrics', refreshUserRoles, requireStaff, battlemetricsRoutes);
router.use('/members', refreshUserRoles, requireStaff, membersRoutes);
router.use('/permissions', refreshUserRoles, requireStaff, permissionsRoutes);
router.use('/squadgroups', refreshUserRoles, requireStaff, squadgroupsRoutes);
router.use('/stats-templates', refreshUserRoles, requireStaff, statsTemplatesRoutes);
router.use('/seeding', refreshUserRoles, requireStaff, seedingRoutes);
router.use('/servers', refreshUserRoles, requireStaff, serversRoutes);

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
