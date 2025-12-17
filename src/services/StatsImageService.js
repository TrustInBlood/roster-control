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

// Template path
const TEMPLATE_PATH = path.join(__dirname, '../../assets/stats-template-banner.png');

// Cached template image
let cachedTemplate = null;

// Concurrency limiter - max 4 simultaneous image generations
const MAX_CONCURRENT = 4;
let activeGenerations = 0;
const queue = [];

function processQueue() {
  while (queue.length > 0 && activeGenerations < MAX_CONCURRENT) {
    const { resolve, reject, stats } = queue.shift();
    activeGenerations++;
    generateStatsImageInternal(stats)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeGenerations--;
        processQueue();
      });
  }
}

/**
 * Load and cache the template image
 * @returns {Promise<Image>} The loaded template image
 */
async function loadTemplate() {
  if (!cachedTemplate) {
    logger.info('Loading stats template image...');
    cachedTemplate = await loadImage(TEMPLATE_PATH);
    logger.info('Template loaded', { width: cachedTemplate.width, height: cachedTemplate.height });
  }
  return cachedTemplate;
}

/**
 * Generate a stats image for a player (queued for concurrency control)
 * @param {Object} stats - Player stats object
 * @returns {Promise<Buffer>} PNG image buffer
 */
function generateStatsImage(stats) {
  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject, stats });
    processQueue();
  });
}

/**
 * Internal image generation (called by queue processor)
 */
async function generateStatsImageInternal(stats) {
  const template = await loadTemplate();

  // Create canvas with template dimensions
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  // Draw blurred background
  ctx.filter = 'blur(2px)';
  ctx.drawImage(template, 0, 0);
  ctx.filter = 'none';

  // Overlay box dimensions for banner template (1344x300)
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

  // Styling constants
  const labelColor = 'rgba(255, 255, 255, 0.7)';
  const valueColor = '#ffffff';
  const titleSize = 22;
  const labelSize = 14;
  const valueSize = 20;
  const rowGap = 8;
  const colWidth = (boxWidth - padding * 2) / 3;
  const fontFamily = 'DejaVu Sans, sans-serif';

  // Player name (centered)
  const playerName = stats.playerName || 'Unknown';
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'center';
  ctx.font = `bold ${titleSize}px ${fontFamily}`;
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
  ctx.font = `${labelSize}px ${fontFamily}`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  ctx.fillText('KILLS', col1, y);
  ctx.fillText('DEATHS', col2, y);
  ctx.fillText('K/D', col3, y);

  // Row 2: Kills / Deaths / K/D values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px ${fontFamily}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(kills, col1, y);
  ctx.fillText(deaths, col2, y);
  ctx.fillText(kdRatio, col3, y);

  // Row 3: Teamkills / Revives Given / Revives Received labels
  y += rowGap + 28;
  ctx.font = `${labelSize}px ${fontFamily}`;
  ctx.fillStyle = labelColor;
  ctx.fillText('TEAMKILLS', col1, y);
  ctx.fillText('REVIVES GIVEN', col2, y);
  ctx.fillText('REVIVES RECEIVED', col3, y);

  // Row 4: Teamkills value + Revives values
  y += rowGap + valueSize;
  ctx.font = `bold ${valueSize}px ${fontFamily}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(teamkills, col1, y);
  ctx.fillText(revivesGiven, col2, y);
  ctx.fillText(revivesReceived, col3, y);

  // Row 5: Nemesis label
  y += rowGap + 28;
  ctx.font = `${labelSize}px ${fontFamily}`;
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'center';
  ctx.fillText('NEMESIS', boxX + boxWidth / 2, y);

  // Row 6: Nemesis value
  y += rowGap + valueSize - 4;
  ctx.font = `bold ${valueSize - 2}px ${fontFamily}`;
  ctx.fillStyle = valueColor;
  ctx.fillText(nemesis, boxX + boxWidth / 2, y);

  // Return PNG buffer
  return canvas.toBuffer('image/png');
}

/**
 * Clear the cached template (for testing/reloading)
 */
function clearCache() {
  cachedTemplate = null;
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
  cachedTemplate = null;
  logger.info('StatsImageService shutdown complete');
}

module.exports = {
  generateStatsImage,
  loadTemplate,
  clearCache,
  shutdown
};
