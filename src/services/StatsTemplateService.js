const path = require('path');
const fs = require('fs').promises;
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('StatsTemplateService');

// Template image directory
const TEMPLATES_DIR = path.join(__dirname, '../../assets/stats-templates');

// Required dimensions for template images
const REQUIRED_WIDTH = 2048;
const REQUIRED_HEIGHT = 512;

// Lazy-load models to avoid circular dependencies
let StatsTemplate = null;
let StatsTemplateRoleMapping = null;

function getModels() {
  if (!StatsTemplate) {
    const models = require('../database/models');
    StatsTemplate = models.StatsTemplate;
    StatsTemplateRoleMapping = models.StatsTemplateRoleMapping;
  }
  return { StatsTemplate, StatsTemplateRoleMapping };
}

/**
 * Ensure the templates directory exists
 */
async function ensureTemplatesDir() {
  try {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      logger.error('Failed to create templates directory', { error: error.message });
      throw error;
    }
  }
}

/**
 * Get path to a template image
 * @param {string} filename - Template filename
 * @returns {string} Full path to template image
 */
function getTemplatePath(filename) {
  return path.join(TEMPLATES_DIR, filename);
}

/**
 * Check if a template image exists
 * @param {string} filename - Template filename
 * @returns {Promise<boolean>}
 */
async function templateImageExists(filename) {
  try {
    await fs.access(getTemplatePath(filename));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a template image
 * @param {Buffer} imageBuffer - Image data
 * @param {string} filename - Target filename
 * @returns {Promise<void>}
 */
async function saveTemplateImage(imageBuffer, filename) {
  await ensureTemplatesDir();
  const filePath = getTemplatePath(filename);
  await fs.writeFile(filePath, imageBuffer);
  logger.info('Template image saved', { filename, path: filePath });
}

/**
 * Delete a template image
 * @param {string} filename - Filename to delete
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteTemplateImage(filename) {
  try {
    const filePath = getTemplatePath(filename);
    await fs.unlink(filePath);
    logger.info('Template image deleted', { filename });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

// ============================================
// Template CRUD Operations
// ============================================

/**
 * Get all templates
 * @param {boolean} [activeOnly=false] - Only return active templates
 * @returns {Promise<Array>} Array of template configs
 */
async function getAllTemplates(activeOnly = false) {
  const { StatsTemplate } = getModels();
  return activeOnly ? StatsTemplate.getAllActive() : StatsTemplate.getAll();
}

/**
 * Get a template by ID
 * @param {number} id - Template ID
 * @returns {Promise<Object|null>} Template config or null
 */
async function getTemplateById(id) {
  const { StatsTemplate } = getModels();
  const template = await StatsTemplate.findByPk(id);
  return template ? template.toConfig() : null;
}

/**
 * Get a template by name
 * @param {string} name - Template name
 * @returns {Promise<Object|null>} Template config or null
 */
async function getTemplateByName(name) {
  const { StatsTemplate } = getModels();
  return StatsTemplate.getByName(name);
}

/**
 * Get the default template
 * @returns {Promise<Object|null>} Default template config
 */
async function getDefaultTemplate() {
  const { StatsTemplate } = getModels();
  return StatsTemplate.getDefault();
}

/**
 * Get a random active template
 * @returns {Promise<Object|null>} Random template config
 */
async function getRandomTemplate() {
  const { StatsTemplate } = getModels();
  return StatsTemplate.getRandom();
}

/**
 * Create a new template
 * @param {Object} config - Template configuration
 * @param {string} config.name - Unique template identifier
 * @param {string} config.displayName - Human-readable name
 * @param {Buffer} [imageBuffer] - Image data (if uploading new image)
 * @param {string} [userId] - User creating the template
 * @returns {Promise<Object>} Created template config
 */
async function createTemplate(config, imageBuffer = null, userId = null) {
  const { StatsTemplate } = getModels();

  // Generate filename from name
  const filename = `${config.name}.png`;

  // Save image if provided
  if (imageBuffer) {
    await saveTemplateImage(imageBuffer, filename);
  }

  const template = await StatsTemplate.upsertFromConfig({
    ...config,
    filename
  }, userId);

  logger.info('Template created', { name: config.name, id: template.id, createdBy: userId });

  // Invalidate StatsImageService cache
  invalidateImageCache();

  return template;
}

/**
 * Update a template
 * @param {number} id - Template ID
 * @param {Object} updates - Fields to update
 * @param {string} [userId] - User making the update
 * @returns {Promise<Object|null>} Updated template config
 */
async function updateTemplate(id, updates, userId = null) {
  const { StatsTemplate } = getModels();

  const template = await StatsTemplate.findByPk(id);
  if (!template) return null;

  // Build update data
  const updateData = {};

  if (updates.displayName !== undefined) updateData.display_name = updates.displayName;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  if (updates.boxWidth !== undefined) updateData.box_width = updates.boxWidth;
  if (updates.boxHeight !== undefined) updateData.box_height = updates.boxHeight;
  if (updates.boxX !== undefined) updateData.box_x = updates.boxX;
  if (updates.boxY !== undefined) updateData.box_y = updates.boxY;
  if (updates.rightMargin !== undefined) updateData.right_margin = updates.rightMargin;
  if (updates.padding !== undefined) updateData.padding = updates.padding;
  if (updates.titleSize !== undefined) updateData.title_size = updates.titleSize;
  if (updates.labelSize !== undefined) updateData.label_size = updates.labelSize;
  if (updates.valueSize !== undefined) updateData.value_size = updates.valueSize;
  if (updates.rowGap !== undefined) updateData.row_gap = updates.rowGap;
  if (updates.topGap !== undefined) updateData.top_gap = updates.topGap;
  if (updates.sectionGap !== undefined) updateData.section_gap = updates.sectionGap;

  updateData.updated_by = userId;
  updateData.updated_at = new Date();

  await template.update(updateData);

  logger.info('Template updated', { id, name: template.name, updatedBy: userId });

  // Invalidate StatsImageService cache
  invalidateImageCache();

  return template.toConfig();
}

/**
 * Update a template's image
 * @param {number} id - Template ID
 * @param {Buffer} imageBuffer - New image data
 * @param {string} [userId] - User making the update
 * @returns {Promise<Object|null>} Updated template config
 */
async function updateTemplateImage(id, imageBuffer, userId = null) {
  const { StatsTemplate } = getModels();

  const template = await StatsTemplate.findByPk(id);
  if (!template) return null;

  // Save new image (overwrites existing)
  await saveTemplateImage(imageBuffer, template.filename);

  await template.update({
    updated_by: userId,
    updated_at: new Date()
  });

  logger.info('Template image updated', { id, name: template.name, updatedBy: userId });

  // Invalidate StatsImageService cache
  invalidateImageCache();

  return template.toConfig();
}

/**
 * Delete a template
 * @param {number} id - Template ID
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteTemplate(id) {
  const { StatsTemplate, StatsTemplateRoleMapping } = getModels();

  const template = await StatsTemplate.findByPk(id);
  if (!template) return false;

  // Delete image file
  await deleteTemplateImage(template.filename);

  // Delete role mappings (cascade should handle this, but be explicit)
  await StatsTemplateRoleMapping.destroy({
    where: { template_id: id }
  });

  // Delete template record
  await template.destroy();

  logger.info('Template deleted', { id, name: template.name });

  // Invalidate StatsImageService cache
  invalidateImageCache();

  return true;
}

/**
 * Set a template as the default
 * @param {number} id - Template ID to set as default
 * @returns {Promise<boolean>} Success
 */
async function setDefaultTemplate(id) {
  const { StatsTemplate } = getModels();
  const success = await StatsTemplate.setDefault(id);

  if (success) {
    logger.info('Default template changed', { templateId: id });
    invalidateImageCache();
  }

  return success;
}

// ============================================
// Role Mapping Operations
// ============================================

/**
 * Get all role mappings with template info
 * @returns {Promise<Array>} Array of mappings
 */
async function getAllRoleMappings() {
  const { StatsTemplateRoleMapping } = getModels();
  return StatsTemplateRoleMapping.getAllWithTemplates();
}

/**
 * Get template for a user's roles
 * @param {string[]} roleIds - Array of Discord role IDs
 * @returns {Promise<Object|null>} Template config or null (fall back to default/random)
 */
async function getTemplateForRoles(roleIds) {
  const { StatsTemplateRoleMapping } = getModels();
  return StatsTemplateRoleMapping.getTemplateForRoles(roleIds);
}

/**
 * Set a role mapping
 * @param {string} roleId - Discord role ID
 * @param {number} templateId - Template ID
 * @param {number} [priority=0] - Priority order
 * @param {string} [userId] - User creating the mapping
 * @returns {Promise<Object>} Created/updated mapping
 */
async function setRoleMapping(roleId, templateId, priority = 0, userId = null) {
  const { StatsTemplateRoleMapping } = getModels();
  const mapping = await StatsTemplateRoleMapping.setMapping(roleId, templateId, priority, userId);

  logger.info('Role mapping set', { roleId, templateId, priority, userId });
  invalidateImageCache();

  return mapping;
}

/**
 * Remove a role mapping
 * @param {string} roleId - Discord role ID
 * @returns {Promise<boolean>} True if deleted
 */
async function removeRoleMapping(roleId) {
  const { StatsTemplateRoleMapping } = getModels();
  const deleted = await StatsTemplateRoleMapping.removeMapping(roleId);

  if (deleted) {
    logger.info('Role mapping removed', { roleId });
    invalidateImageCache();
  }

  return deleted;
}

/**
 * Get roles mapped to a template
 * @param {number} templateId - Template ID
 * @returns {Promise<Array>} Array of {roleId, priority}
 */
async function getRolesForTemplate(templateId) {
  const { StatsTemplateRoleMapping } = getModels();
  return StatsTemplateRoleMapping.getRolesForTemplate(templateId);
}

// ============================================
// Cache Management
// ============================================

/**
 * Invalidate the StatsImageService cache
 * This allows changes to take effect without bot restart
 */
function invalidateImageCache() {
  try {
    const StatsImageService = require('./StatsImageService');
    if (StatsImageService.clearCache) {
      StatsImageService.clearCache();
      logger.debug('StatsImageService cache invalidated');
    }
  } catch (error) {
    logger.warn('Could not invalidate StatsImageService cache', { error: error.message });
  }
}

// ============================================
// Seeding Operations
// ============================================

/**
 * Seed templates from config file (for initial migration)
 * @param {string} [userId] - User performing the seed
 * @returns {Promise<number>} Number of templates seeded
 */
async function seedFromConfig(userId = null) {
  const { StatsTemplate } = getModels();

  // Load existing config
  let configTemplates;
  try {
    const { TEMPLATES, DEFAULT_TEMPLATE } = require('../../config/statsTemplates');
    configTemplates = { templates: TEMPLATES, defaultTemplate: DEFAULT_TEMPLATE };
  } catch (error) {
    logger.warn('Could not load config/statsTemplates.js for seeding', { error: error.message });
    return 0;
  }

  await ensureTemplatesDir();
  let count = 0;

  for (const [name, config] of Object.entries(configTemplates.templates)) {
    // Check if already exists
    const existing = await StatsTemplate.findOne({ where: { name } });
    if (existing) {
      logger.debug('Template already exists, skipping', { name });
      continue;
    }

    // Generate filename
    const filename = `${name}.png`;

    // Copy existing image if it exists in old location
    const oldPath = path.join(__dirname, '../../assets', `stats-template-${name}.png`);
    const newPath = getTemplatePath(filename);

    try {
      await fs.access(oldPath);
      await fs.copyFile(oldPath, newPath);
      logger.info('Copied template image to new location', { from: oldPath, to: newPath });
    } catch {
      logger.warn('Could not find template image to copy', { oldPath, name });
    }

    // Create database record
    await StatsTemplate.create({
      name,
      display_name: name.charAt(0).toUpperCase() + name.slice(1),
      filename,
      is_active: true,
      is_default: name === configTemplates.defaultTemplate,
      box_width: config.boxWidth,
      box_height: config.boxHeight,
      box_x: null,
      box_y: null,
      right_margin: config.rightMargin,
      padding: config.padding,
      title_size: config.titleSize,
      label_size: config.labelSize,
      value_size: config.valueSize,
      row_gap: config.rowGap,
      top_gap: config.topGap,
      section_gap: config.sectionGap,
      created_by: userId,
      created_at: new Date(),
      updated_by: userId,
      updated_at: new Date()
    });

    count++;
    logger.info('Seeded template', { name });
  }

  logger.info('Template seeding complete', { count });
  return count;
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Constants
  TEMPLATES_DIR,
  REQUIRED_WIDTH,
  REQUIRED_HEIGHT,

  // Utility functions
  getTemplatePath,
  templateImageExists,
  ensureTemplatesDir,

  // Template CRUD
  getAllTemplates,
  getTemplateById,
  getTemplateByName,
  getDefaultTemplate,
  getRandomTemplate,
  createTemplate,
  updateTemplate,
  updateTemplateImage,
  deleteTemplate,
  setDefaultTemplate,

  // Role mappings
  getAllRoleMappings,
  getTemplateForRoles,
  setRoleMapping,
  removeRoleMapping,
  getRolesForTemplate,

  // Cache management
  invalidateImageCache,

  // Seeding
  seedFromConfig
};
