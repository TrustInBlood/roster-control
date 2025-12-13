const express = require('express');
const router = express.Router();
const passport = require('passport');
const { createServiceLogger } = require('../../utils/logger');
const { DASHBOARD_ACCESS_ROLES, refreshUserRoles } = require('../middleware/auth');

const logger = createServiceLogger('DashboardAuth');

// GET /api/v1/auth/login - Initiate Discord OAuth
router.get('/login', passport.authenticate('discord'));

// GET /api/v1/auth/callback - Discord OAuth callback
router.get('/callback',
  passport.authenticate('discord', {
    failureRedirect: '/login?error=auth_failed'
  }),
  (req, res) => {
    logger.info('User logged in via Discord OAuth', {
      userId: req.user.id,
      username: req.user.username
    });

    // Redirect to dashboard frontend (served from same origin)
    res.redirect('/');
  }
);

// GET /api/v1/auth/me - Get current user info
// refreshUserRoles ensures we return fresh roles from Discord
router.get('/me', refreshUserRoles, (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id, username, discriminator, avatar, roles, guildMember } = req.user;
  const userRoles = roles || [];
  const isStaff = userRoles.some(roleId => DASHBOARD_ACCESS_ROLES.includes(roleId));

  res.json({
    id,
    username,
    discriminator,
    avatar,
    avatarUrl: avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discriminator || '0') % 5}.png`,
    roles: userRoles,
    displayName: guildMember?.displayName || username,
    isStaff
  });
});

// POST /api/v1/auth/logout - Logout
router.post('/logout', (req, res) => {
  if (req.user) {
    logger.info('User logged out', {
      userId: req.user.id,
      username: req.user.username
    });
  }

  req.logout((err) => {
    if (err) {
      logger.error('Error during logout', { error: err.message });
      return res.status(500).json({ error: 'Logout failed' });
    }

    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session', { error: err.message });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

module.exports = router;
