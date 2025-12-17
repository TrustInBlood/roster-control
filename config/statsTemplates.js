/**
 * Stats Image Template Configuration
 * Defines template styling and role-based template selection
 */
const { discordRoles: { DISCORD_ROLES } } = require('../src/utils/environment');

/**
 * Template box configurations
 * Each template can have custom positioning/sizing for the stats overlay
 *
 * To add a new template:
 * 1. Create assets/stats-template-{name}.png
 * 2. Add config below with appropriate dimensions
 * 3. Add role mapping to TEMPLATE_MAPPING if needed
 */
const TEMPLATES = {
  // Default template - uses stats-template-wide.png (2048x512)
  wide: {
    boxWidth: 800,
    boxHeight: 420,
    rightMargin: 80,
    padding: 25,
    titleSize: 28,
    labelSize: 18,
    valueSize: 26,
    rowGap: 12,
    topGap: 40,
    sectionGap: 40
  },
  // Tank template (2048x512)
  tank: {
    boxWidth: 800,
    boxHeight: 420,
    rightMargin: 80,
    padding: 25,
    titleSize: 28,
    labelSize: 18,
    valueSize: 26,
    rowGap: 12,
    topGap: 40,
    sectionGap: 40
  }
};

/**
 * Role to template mapping
 * Order matters - first matching role wins (highest priority first)
 */
const TEMPLATE_MAPPING = [
  // { roleId: DISCORD_ROLES.SUPER_ADMIN, template: 'wide' },
  // { roleId: DISCORD_ROLES.DONATOR, template: 'vip' },
];

// Default template name
const DEFAULT_TEMPLATE = 'wide';

/**
 * Get template name for a user based on their roles
 * @param {string[]} roleIds - Array of role IDs the user has
 * @returns {string} Template name (or default)
 */
function getTemplateForRoles(roleIds) {
  // Check role mappings first
  for (const mapping of TEMPLATE_MAPPING) {
    if (roleIds.includes(mapping.roleId)) {
      return mapping.template;
    }
  }

  // No role match - pick a random template
  return getRandomTemplate();
}

/**
 * Get a random template name from available templates
 * @returns {string} Random template name
 */
function getRandomTemplate() {
  const templateNames = Object.keys(TEMPLATES);
  return templateNames[Math.floor(Math.random() * templateNames.length)];
}

/**
 * Get template box configuration
 * @param {string} templateName - Template name
 * @returns {Object} Box configuration (falls back to default if not found)
 */
function getTemplateConfig(templateName) {
  return TEMPLATES[templateName] || TEMPLATES[DEFAULT_TEMPLATE];
}

module.exports = {
  TEMPLATES,
  TEMPLATE_MAPPING,
  DEFAULT_TEMPLATE,
  getTemplateForRoles,
  getTemplateConfig,
  getRandomTemplate
};
