const { createServiceLogger } = require('../../utils/logger');
const { loadConfig } = require('../../utils/environment');

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

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        username: req.user.username,
        permission,
        userRoles
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

module.exports = {
  requireAuth,
  requirePermission,
  hasPermission,
  getUserPermissions,
  PERMISSIONS
};
