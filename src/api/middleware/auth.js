const { createServiceLogger } = require('../../utils/logger');
const { loadConfig } = require('../../utils/environment');
const { getMemberCacheService } = require('../../services/MemberCacheService');
const { permissionService, getDefaultPermissions } = require('../../services/PermissionService');

// Load environment-specific Discord roles
const {
  DISCORD_ROLES,
  getAllStaffRoles
} = loadConfig('discordRoles');

const logger = createServiceLogger('DashboardAuthMiddleware');

// Fallback permissions (used if database unavailable)
const PERMISSIONS = getDefaultPermissions();

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
 * Uses database-backed PermissionService with caching
 * @param {string} permission - The permission name to check
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRoles = req.user.roles || [];

    try {
      // Use PermissionService for database-backed permissions
      const hasPermissionResult = await permissionService.hasPermission(userRoles, permission);

      logger.debug('Permission check', {
        user: req.user.username,
        permission,
        granted: hasPermissionResult
      });

      if (!hasPermissionResult) {
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
    } catch (error) {
      logger.error('Permission check failed, using fallback', { error: error.message, permission });

      // Fallback to hardcoded permissions if service fails
      const requiredRoles = PERMISSIONS[permission];
      if (!requiredRoles) {
        return res.status(500).json({
          error: 'Invalid permission configuration',
          code: 'INVALID_PERMISSION'
        });
      }

      const hasFallbackPermission = userRoles.some(roleId => requiredRoles.includes(roleId));
      if (!hasFallbackPermission) {
        return res.status(403).json({
          error: 'You do not have permission to perform this action',
          code: 'PERMISSION_DENIED',
          required: permission
        });
      }

      next();
    }
  };
}

/**
 * Check if a user has a specific permission (utility function)
 * Uses PermissionService with fallback to hardcoded permissions
 * @param {object} user - The user object with roles array
 * @param {string} permission - The permission name to check
 * @returns {Promise<boolean>}
 */
async function hasPermission(user, permission) {
  if (!user || !user.roles) return false;

  try {
    return await permissionService.hasPermission(user.roles, permission);
  } catch (error) {
    // Fallback to hardcoded permissions
    const requiredRoles = PERMISSIONS[permission];
    if (!requiredRoles) return false;
    return user.roles.some(roleId => requiredRoles.includes(roleId));
  }
}

/**
 * Synchronous permission check (uses fallback only, for non-async contexts)
 * @param {object} user - The user object with roles array
 * @param {string} permission - The permission name to check
 * @returns {boolean}
 */
function hasPermissionSync(user, permission) {
  if (!user || !user.roles) return false;

  const requiredRoles = PERMISSIONS[permission];
  if (!requiredRoles) return false;

  return user.roles.some(roleId => requiredRoles.includes(roleId));
}

/**
 * Get all permissions a user has
 * Uses PermissionService with fallback to hardcoded permissions
 * @param {object} user - The user object with roles array
 * @returns {Promise<string[]>} Array of permission names
 */
async function getUserPermissions(user) {
  if (!user || !user.roles) return [];

  try {
    return await permissionService.getUserPermissions(user.roles);
  } catch (error) {
    // Fallback to hardcoded permissions
    return Object.keys(PERMISSIONS).filter(permission =>
      user.roles.some(roleId => PERMISSIONS[permission].includes(roleId))
    );
  }
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
  hasPermissionSync,
  getUserPermissions,
  refreshUserRoles,
  permissionService,
  PERMISSIONS,
  DASHBOARD_ACCESS_ROLES
};
