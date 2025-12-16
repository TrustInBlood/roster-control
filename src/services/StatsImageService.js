const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('StatsImageService');

// Template path
const TEMPLATE_PATH = path.join(__dirname, '../../assets/stats-template.png');

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
 * Apply a simple box blur to a canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} radius - Blur radius
 */
function applyBlur(ctx, width, height, radius) {
  // Use CSS filter if available (node-canvas 2.x+)
  ctx.filter = `blur(${radius}px)`;
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

  // Overlay box dimensions (right side) - scaled for 1227x574 image
  const boxPadding = 25;
  const boxWidth = 450;
  const boxHeight = 450;
  const boxX = template.width - boxWidth - 125;
  const boxY = (template.height - boxHeight) / 2;

  // Draw semi-transparent overlay box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
  ctx.fill();

  // Text styling
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  const maxTextWidth = boxWidth - boxPadding * 2; // Prevent text overrun

  // Player name (title)
  const playerName = stats.playerName || 'Unknown';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(playerName, boxX + boxPadding, boxY + 45, boxWidth - boxPadding * 2);

  // Divider line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(boxX + boxPadding, boxY + 60);
  ctx.lineTo(boxX + boxWidth - boxPadding, boxY + 60);
  ctx.stroke();

  // Stats text
  ctx.font = '22px sans-serif';
  const lineHeight = 50;
  let y = boxY + 105;

  const kills = stats.kills?.toString() || '0';
  const deaths = stats.deaths?.toString() || '0';
  const kdRatio = stats.kdRatio?.toFixed(2) || '0.00';
  const teamkills = stats.teamkills?.toString() || '0';
  const revivesGiven = stats.revivesGiven?.toString() || '0';
  const revivesReceived = stats.revivesReceived?.toString() || '0';
  const nemesis = stats.nemesis || 'None';

  // Draw stat lines
  const statLines = [
    `Kills: ${kills}`,
    `Deaths: ${deaths}`,
    `K/D: ${kdRatio}`,
    `Teamkills: ${teamkills}`,
    `Revives: ${revivesGiven} / ${revivesReceived}`,
    `Nemesis: ${nemesis}`
  ];

  for (const line of statLines) {
    ctx.fillText(line, boxX + boxPadding, y, maxTextWidth);
    y += lineHeight;
  }

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

module.exports = {
  generateStatsImage,
  loadTemplate,
  clearCache
};
