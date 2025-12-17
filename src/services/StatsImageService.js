const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
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

// Template directory
const TEMPLATES_DIR = path.join(__dirname, '../../assets');

// Default template name
const DEFAULT_TEMPLATE = 'default';

/**
 * Get template path by name
 * Templates are stored as: assets/stats-template-{name}.png
 * @param {string} templateName - Template name
 * @returns {string} Full path to template file
 */
function getTemplatePath(templateName) {
  const filename = templateName === 'default'
    ? 'stats-template-banner.png'
    : `stats-template-${templateName}.png`;
  return path.join(TEMPLATES_DIR, filename);
}

// Cached template images (keyed by template name)
const cachedTemplates = new Map();

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
 * Load and cache a template image
 * @param {string} templateName - Name of the template to load
 * @returns {Promise<Image>} The loaded template image
 */
async function loadTemplate(templateName) {
  if (!cachedTemplates.has(templateName)) {
    const templatePath = getTemplatePath(templateName);
    logger.info(`Loading stats template: ${templateName} from ${templatePath}...`);
    try {
      const image = await loadImage(templatePath);
      cachedTemplates.set(templateName, image);
      logger.info(`Template ${templateName} loaded`, { width: image.width, height: image.height });
    } catch (err) {
      // Fall back to default template if specified template not found
      if (templateName !== DEFAULT_TEMPLATE) {
        logger.warn(`Template ${templateName} not found, falling back to default`);
        return loadTemplate(DEFAULT_TEMPLATE);
      }
      throw err;
    }
  }
  return cachedTemplates.get(templateName);
}

/**
 * Generate a stats image for a player (queued for concurrency control)
 * @param {Object} stats - Player stats object
 * @param {string} [templateName] - Template to use ('banner' or 'classic')
 * @returns {Promise<Buffer>} PNG image buffer
 */
function generateStatsImage(stats, templateName = DEFAULT_TEMPLATE) {
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject, stats, templateName });
    processQueue();
  });
}

// Shared font family
const FONT_FAMILY = 'DejaVu Sans, sans-serif';

/**
 * Draw grid layout (for banner template)
 */
function drawGridLayout(ctx, stats, boxX, boxY, boxWidth, padding) {
  const labelColor = 'rgba(255, 255, 255, 0.7)';
  const valueColor = '#ffffff';
  const titleSize = 22;
  const labelSize = 14;
  const valueSize = 20;
  const rowGap = 8;
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

  let y = dividerY + 28;

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
  y += rowGap + 28;
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
  y += rowGap + 28;
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
 * All templates use the same grid layout and dimensions (1344x300)
 */
async function generateStatsImageInternal(stats, templateName) {
  const template = await loadTemplate(templateName);

  // Create canvas with template dimensions
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  // Draw blurred background
  ctx.filter = 'blur(2px)';
  ctx.drawImage(template, 0, 0);
  ctx.filter = 'none';

  // Box dimensions for banner templates (1344x300)
  const padding = 20;
  const boxWidth = 600;
  const boxHeight = 260;
  const boxX = template.width - boxWidth - 40;
  const boxY = (template.height - boxHeight) / 2;

  // Draw semi-transparent overlay box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  // Draw stats grid
  drawGridLayout(ctx, stats, boxX, boxY, boxWidth, padding);

  // Return PNG buffer
  return canvas.toBuffer('image/png');
}

/**
 * Clear the cached templates (for testing/reloading)
 */
function clearCache() {
  cachedTemplates.clear();
  logger.info('Template cache cleared');
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
  logger.info('StatsImageService shutdown complete');
}

module.exports = {
  generateStatsImage,
  loadTemplate,
  clearCache,
  shutdown,
  DEFAULT_TEMPLATE
};
