const { createServiceLogger } = require('../../utils/logger');
const { loadConfig } = require('../../utils/environment');
const { getMemberCacheService } = require('../../services/MemberCacheService');

// Load environment-specific Discord roles
const {
  DISCORD_ROLES,
  getAllAdminRoles,
  getAllStaffRoles
} = loadConfig('discordRoles');

const logger = createServiceLogger('DashboardAuthMiddleware');

// Permission definitions mapping permission names to required roles
const PERMISSIONS = {
  // Whitelist permissions
  VIEW_WHITELIST: [
    ...getAllStaffRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],
  GRANT_WHITELIST: [
    ...getAllStaffRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],
  REVOKE_WHITELIST: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],

  // Member permissions
  VIEW_MEMBERS: [
    DISCORD_ROLES.APPLICATIONS,
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],
  ADD_MEMBER: [
    DISCORD_ROLES.APPLICATIONS,
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],
  BULK_IMPORT: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],

  // Duty permissions
  VIEW_DUTY: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],

  // Audit permissions
  VIEW_AUDIT: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],

  // Security permissions
  VIEW_SECURITY: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ],

  // Admin-only permissions
  MANAGE_SESSIONS: [
    DISCORD_ROLES.SUPER_ADMIN
  ],
  EXPORT_DATA: [
    ...getAllAdminRoles(),
    DISCORD_ROLES.SUPER_ADMIN
  ]
};

// All staff roles that can access the dashboard
const DASHBOARD_ACCESS_ROLES = [
  ...getAllStaffRoles(),
  DISCORD_ROLES.SUPER_ADMIN
];

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
}

/**
 * Middleware to require staff role (basic dashboard access)
 * Users without a staff role cannot access any dashboard functionality
 */
function requireStaff(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const userRoles = req.user.roles || [];
  const hasStaffRole = userRoles.some(roleId => DASHBOARD_ACCESS_ROLES.includes(roleId));

  if (!hasStaffRole) {
    logger.warn('Dashboard access denied - not staff', {
      userId: req.user.id,
      username: req.user.username,
      userRoles
    });

    return res.status(403).json({
      error: 'You must be a staff member to access the dashboard',
      code: 'NOT_STAFF'
    });
  }

  next();
}

/**
 * Middleware to require specific permission
 * @param {string} permission - The permission name to check
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRoles = req.user.roles || [];
    const requiredRoles = PERMISSIONS[permission];

    if (!requiredRoles) {
      logger.error('Unknown permission requested', { permission });
      return res.status(500).json({
        error: 'Invalid permission configuration',
        code: 'INVALID_PERMISSION'
      });
    }

    // Check if user has any of the required roles
    const hasPermission = userRoles.some(roleId => requiredRoles.includes(roleId));

    logger.debug('Permission check', {
      user: req.user.username,
      permission,
      granted: hasPermission
    });

    if (!hasPermission) {
      logger.warn('Permission denied', {
        user: req.user.username,
        permission
      });

      return res.status(403).json({
        error: 'You do not have permission to perform this action',
        code: 'PERMISSION_DENIED',
        required: permission
      });
    }

    next();
  };
}

/**
 * Check if a user has a specific permission (utility function)
 * @param {object} user - The user object with roles array
 * @param {string} permission - The permission name to check
 * @returns {boolean}
 */
function hasPermission(user, permission) {
  if (!user || !user.roles) return false;

  const requiredRoles = PERMISSIONS[permission];
  if (!requiredRoles) return false;

  return user.roles.some(roleId => requiredRoles.includes(roleId));
}

/**
 * Get all permissions a user has
 * @param {object} user - The user object with roles array
 * @returns {string[]} Array of permission names
 */
function getUserPermissions(user) {
  if (!user || !user.roles) return [];

  return Object.keys(PERMISSIONS).filter(permission =>
    user.roles.some(roleId => PERMISSIONS[permission].includes(roleId))
  );
}

/**
 * Middleware to refresh user roles from Discord
 * Uses MemberCacheService which has 1-hour TTL caching to avoid API spam
 */
async function refreshUserRoles(req, res, next) {
  // Skip if not authenticated
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return next();
  }

  // Skip if Discord client not available
  const discordClient = global.discordClient;
  if (!discordClient) {
    return next();
  }

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return next();
    }

    const cacheService = getMemberCacheService();
    const member = await cacheService.getMember(guild, req.user.id);

    if (member) {
      // Get fresh roles, filtering out @everyone
      const freshRoles = member.roles.cache
        .filter(role => role.id !== guild.id)
        .map(role => role.id);

      // Check if roles changed
      const oldRoles = req.user.roles || [];
      const rolesChanged = JSON.stringify(freshRoles.sort()) !== JSON.stringify(oldRoles.sort());

      if (rolesChanged) {
        logger.info('User roles updated from Discord', {
          user: req.user.username,
          oldCount: oldRoles.length,
          newCount: freshRoles.length
        });

        // Update request user object for this request
        req.user.roles = freshRoles;

        // Update session so changes persist
        if (req.session?.passport?.user) {
          req.session.passport.user.roles = freshRoles;
        }
      }
    }
  } catch (error) {
    // Log but don't fail - use cached roles
    logger.debug('Failed to refresh roles, using cached', {
      userId: req.user.id,
      error: error.message
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireStaff,
  requirePermission,
  hasPermission,
  getUserPermissions,
  refreshUserRoles,
  PERMISSIONS,
  DASHBOARD_ACCESS_ROLES
};
