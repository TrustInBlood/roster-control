const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs').promises;
const { createServiceLogger } = require('../utils/logger');

// Register bundled fonts with Unicode support
const FONTS_PATH = path.join(__dirname, '../../assets/fonts');
try {
  registerFont(path.join(FONTS_PATH, 'DejaVuSans.ttf'), { family: 'DejaVu Sans' });
  registerFont(path.join(FONTS_PATH, 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' });
} catch {
  // Fonts not available, fall back to system defaults
}

const logger = createServiceLogger('StatsImageService');

// Template directories (new location takes priority, old location for backwards compatibility)
const NEW_TEMPLATES_DIR = path.join(__dirname, '../../assets/stats-templates');
const OLD_TEMPLATES_DIR = path.join(__dirname, '../../assets');

// Cached template images (keyed by template name)
const cachedTemplates = new Map();

// Cached template configs from database
const cachedConfigs = new Map();
let configCacheValid = false;

// Default template name (used as fallback)
let defaultTemplateName = 'wide';

// Concurrency limiter - max 4 simultaneous image generations
const MAX_CONCURRENT = 4;
let activeGenerations = 0;
const queue = [];

function processQueue() {
  while (queue.length > 0 && activeGenerations < MAX_CONCURRENT) {
    const { resolve, reject, stats, templateName } = queue.shift();
    activeGenerations++;
    generateStatsImageInternal(stats, templateName)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeGenerations--;
        processQueue();
      });
  }
}

/**
 * Get template path - checks new location first, then old location
 * @param {string} templateName - Template name
 * @param {string} [filename] - Optional specific filename from database
 * @returns {Promise<string>} Full path to template file
 */
async function getTemplatePath(templateName, filename = null) {
  // If we have a specific filename from the database
  if (filename) {
    const newPath = path.join(NEW_TEMPLATES_DIR, filename);
    try {
      await fs.access(newPath);
      return newPath;
    } catch {
      // File not found in new location
    }
  }

  // Try new location first (assets/stats-templates/{name}.png)
  const newPath = path.join(NEW_TEMPLATES_DIR, `${templateName}.png`);
  try {
    await fs.access(newPath);
    return newPath;
  } catch {
    // Not in new location, try old location
  }

  // Try old location (assets/stats-template-{name}.png)
  const oldPath = path.join(OLD_TEMPLATES_DIR, `stats-template-${templateName}.png`);
  try {
    await fs.access(oldPath);
    return oldPath;
  } catch {
    // Not in old location either
  }

  // Return new path as default (will fail on load if not found)
  return newPath;
}

/**
 * Load template configs from database
 * Falls back to config file if database not available
 */
async function loadConfigsFromDatabase() {
  if (configCacheValid && cachedConfigs.size > 0) {
    return;
  }

  try {
    const { StatsTemplate } = require('../database/models');
    const templates = await StatsTemplate.findAll({
      where: { is_active: true }
    });

    cachedConfigs.clear();
    for (const template of templates) {
      const config = template.toConfig();
      cachedConfigs.set(config.name, config);

      if (config.isDefault) {
        defaultTemplateName = config.name;
      }
    }

    if (cachedConfigs.size > 0) {
      configCacheValid = true;
      logger.info('Loaded template configs from database', { count: cachedConfigs.size });
      return;
    }
  } catch (error) {
    logger.debug('Could not load configs from database, using fallback', { error: error.message });
  }

  // Fallback to config file
  try {
    const { TEMPLATES, DEFAULT_TEMPLATE } = require('../../config/statsTemplates');
    for (const [name, config] of Object.entries(TEMPLATES)) {
      cachedConfigs.set(name, {
        name,
        displayName: name,
        filename: `${name}.png`,
        isActive: true,
        isDefault: name === DEFAULT_TEMPLATE,
        boxWidth: config.boxWidth,
        boxHeight: config.boxHeight,
        boxX: null,
        boxY: null,
        rightMargin: config.rightMargin,
        padding: config.padding,
        titleSize: config.titleSize,
        labelSize: config.labelSize,
        valueSize: config.valueSize,
        rowGap: config.rowGap,
        topGap: config.topGap,
        sectionGap: config.sectionGap
      });
    }
    defaultTemplateName = DEFAULT_TEMPLATE;
    configCacheValid = true;
    logger.info('Loaded template configs from file', { count: cachedConfigs.size });
  } catch (error) {
    logger.warn('Could not load template configs', { error: error.message });
  }
}

/**
 * Get template config by name
 * @param {string} templateName - Template name
 * @returns {Promise<Object>} Template configuration
 */
async function getTemplateConfig(templateName) {
  await loadConfigsFromDatabase();

  let config = cachedConfigs.get(templateName);
  if (!config) {
    // Fall back to default
    config = cachedConfigs.get(defaultTemplateName);
  }

  if (!config) {
    // Absolute fallback with sensible defaults
    return {
      name: templateName,
      filename: `${templateName}.png`,
      boxWidth: 800,
      boxHeight: 420,
      boxX: null,
      boxY: null,
      rightMargin: 80,
      padding: 25,
      titleSize: 28,
      labelSize: 18,
      valueSize: 26,
      rowGap: 12,
      topGap: 40,
      sectionGap: 40
    };
  }

  return config;
}

/**
 * Load and cache a template image
 * @param {string} templateName - Name of the template to load
 * @returns {Promise<Image>} The loaded template image
 */
async function loadTemplate(templateName) {
  if (!cachedTemplates.has(templateName)) {
    const config = await getTemplateConfig(templateName);
    const templatePath = await getTemplatePath(templateName, config.filename);

    logger.info(`Loading stats template: ${templateName} from ${templatePath}...`);
    try {
      const image = await loadImage(templatePath);
      cachedTemplates.set(templateName, image);
      logger.info(`Template ${templateName} loaded`, { width: image.width, height: image.height });
    } catch (err) {
      // Fall back to default template if specified template not found
      if (templateName !== defaultTemplateName) {
        logger.warn(`Template ${templateName} not found, falling back to default`);
        return loadTemplate(defaultTemplateName);
      }
      throw err;
    }
  }
  return cachedTemplates.get(templateName);
}

/**
 * Generate a stats image for a player (queued for concurrency control)
 * @param {Object} stats - Player stats object
 * @param {string} [templateName] - Template to use
 * @returns {Promise<Buffer>} PNG image buffer
 */
function generateStatsImage(stats, templateName = null) {
  return new Promise((resolve, reject) => {
    const name = templateName || defaultTemplateName;
    queue.push({ resolve, reject, stats, templateName: name });
    processQueue();
  });
}

// Shared font family
const FONT_FAMILY = 'DejaVu Sans, sans-serif';

/**
 * Draw grid layout for stats
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} stats - Player stats
 * @param {number} boxX - Box X position
 * @param {number} boxY - Box Y position
 * @param {number} boxWidth - Box width
 * @param {Object} config - Template config
 */
function drawGridLayout(ctx, stats, boxX, boxY, boxWidth, config) {
  const { padding, titleSize, labelSize, valueSize, rowGap, topGap, sectionGap } = config;
  const labelColor = 'rgba(255, 255, 255, 0.7)';
  const valueColor = '#ffffff';
  const colWidth = (boxWidth - padding * 2) / 3;

  // Player name (centered)
  const playerName = stats.playerName || 'Unknown';
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'center';
  ctx.font = `bold ${titleSize}px ${FONT_FAMILY}`;
  ctx.fillText(playerName, boxX + boxWidth / 2, boxY + padding + titleSize);

  // Divider line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const dividerY = boxY + padding + titleSize + 10;
  ctx.moveTo(boxX + padding, dividerY);
  ctx.lineTo(boxX + boxWidth - padding, dividerY);
  ctx.stroke();

  // Column positions
  const col1 = boxX + padding + colWidth * 0.5;
  const col2 = boxX + padding + colWidth * 1.5;
  const col3 = boxX + padding + colWidth * 2.5;

  // Stats values with fallbacks
  const kills = stats.kills?.toString() || '0';
  const deaths = stats.deaths?.toString() || '0';
  const kdRatio = stats.kdRatio?.toFixed(2) || '0.00';
  const teamkills = stats.teamkills?.toString() || '0';
  const revivesGiven = stats.revivesGiven?.toString() || '0';
  const revivesReceived = stats.revivesReceived?.toString() || '0';
  const nemesis = stats.nemesis || 'None';

  let y = dividerY + topGap;

  // Row 1: Kills / Deaths / K/D labels
  ctx.font = `${labelSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  ctx.fillText('KILLS', col1, y);
  ctx.fillText('DEATHS', col2, y);
  ctx.fillText('K/D', col3, y);

  // Row 2: values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(kills, col1, y);
  ctx.fillText(deaths, col2, y);
  ctx.fillText(kdRatio, col3, y);

  // Row 3: Teamkills / Revives labels
  y += rowGap + sectionGap;
  ctx.font = `${labelSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = labelColor;
  ctx.fillText('TEAMKILLS', col1, y);
  ctx.fillText('REVIVES GIVEN', col2, y);
  ctx.fillText('REVIVES RECEIVED', col3, y);

  // Row 4: values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(teamkills, col1, y);
  ctx.fillText(revivesGiven, col2, y);
  ctx.fillText(revivesReceived, col3, y);

  // Row 5: Nemesis label
  y += rowGap + sectionGap;
  ctx.font = `${labelSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = labelColor;
  ctx.fillText('NEMESIS', boxX + boxWidth / 2, y);

  // Row 6: Nemesis value
  y += rowGap + valueSize - 4;
  ctx.font = `bold ${valueSize - 2}px ${FONT_FAMILY}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(nemesis, boxX + boxWidth / 2, y);
}

/**
 * Internal image generation (called by queue processor)
 * Box dimensions and styling come from database config
 */
async function generateStatsImageInternal(stats, templateName) {
  const template = await loadTemplate(templateName);
  const config = await getTemplateConfig(templateName);

  // Create canvas with template dimensions
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  // Draw blurred background
  ctx.filter = 'blur(2px)';
  ctx.drawImage(template, 0, 0);
  ctx.filter = 'none';

  // Box dimensions from config
  const { boxWidth, boxHeight, rightMargin, boxX: configBoxX, boxY: configBoxY } = config;

  // Calculate box position (use config values if set, otherwise auto-calculate)
  const boxX = configBoxX !== null && configBoxX !== undefined
    ? configBoxX
    : template.width - boxWidth - rightMargin;
  const boxY = configBoxY !== null && configBoxY !== undefined
    ? configBoxY
    : (template.height - boxHeight) / 2;

  // Draw semi-transparent overlay box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  // Draw stats grid
  drawGridLayout(ctx, stats, boxX, boxY, boxWidth, config);

  // Return PNG buffer
  return canvas.toBuffer('image/png');
}

/**
 * Clear the cached templates and configs (for reloading)
 */
function clearCache() {
  cachedTemplates.clear();
  cachedConfigs.clear();
  configCacheValid = false;
  logger.info('Template cache cleared');
}

/**
 * Get template for user's roles (checks role mappings)
 * @param {string[]} roleIds - Array of Discord role IDs
 * @returns {Promise<string>} Template name
 */
async function getTemplateForRoles(roleIds) {
  if (!roleIds || roleIds.length === 0) {
    return defaultTemplateName;
  }

  try {
    const { StatsTemplateRoleMapping } = require('../database/models');
    const template = await StatsTemplateRoleMapping.getTemplateForRoles(roleIds);
    if (template) {
      return template.name;
    }
  } catch (error) {
    logger.debug('Could not check role mappings', { error: error.message });
  }

  // No role mapping found, return random active template
  return getRandomTemplateName();
}

/**
 * Get a random active template name
 * @returns {Promise<string>} Random template name
 */
async function getRandomTemplateName() {
  await loadConfigsFromDatabase();

  const names = Array.from(cachedConfigs.keys());
  if (names.length === 0) {
    return defaultTemplateName;
  }

  return names[Math.floor(Math.random() * names.length)];
}

/**
 * Get the default template name
 * @returns {string} Default template name
 */
function getDefaultTemplateName() {
  return defaultTemplateName;
}

/**
 * Shutdown - clear queue and cache
 */
function shutdown() {
  // Reject any pending queue items
  while (queue.length > 0) {
    const { reject } = queue.shift();
    reject(new Error('StatsImageService shutting down'));
  }
  activeGenerations = 0;
  cachedTemplates.clear();
  cachedConfigs.clear();
  configCacheValid = false;
  logger.info('StatsImageService shutdown complete');
}

module.exports = {
  generateStatsImage,
  loadTemplate,
  clearCache,
  shutdown,
  getTemplateForRoles,
  getRandomTemplateName,
  getDefaultTemplateName,
  getTemplateConfig,
  // Legacy export for backwards compatibility
  DEFAULT_TEMPLATE: defaultTemplateName
};
