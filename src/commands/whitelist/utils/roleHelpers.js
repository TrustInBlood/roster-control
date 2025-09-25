const { WHITELIST_AWARD_ROLES } = require('../../../../config/discord');

/**
 * Helper function to get role ID based on whitelist reason
 */
function getRoleForReason(reason) {
  const roleMapping = {
    'service-member': WHITELIST_AWARD_ROLES.SERVICE_MEMBER,
    'first-responder': WHITELIST_AWARD_ROLES.FIRST_RESPONDER,
    'donator': WHITELIST_AWARD_ROLES.DONATOR,
    // 'reporting' has no specific role
  };

  return roleMapping[reason] || null;
}

module.exports = {
  getRoleForReason
};