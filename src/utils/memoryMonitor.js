/**
 * Memory Monitor Utility
 * Tracks memory usage over time to help identify leaks
 */

const { createServiceLogger } = require('./logger');
const logger = createServiceLogger('MemoryMonitor');

// Store memory history for trend analysis
const memoryHistory = [];
const MAX_HISTORY = 60; // Keep last 60 samples

let monitorInterval = null;
let startTime = null;
let peakMemory = 0;

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "256.5 MB")
 */
function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Get current memory stats
 * @returns {Object} Memory statistics
 */
function getMemoryStats() {
  const usage = process.memoryUsage();
  const uptimeSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers || 0,
    uptimeSeconds,
    timestamp: Date.now()
  };
}

/**
 * Log current memory usage
 * @param {string} [context] - Optional context for the log
 */
function logMemory(context = '') {
  const stats = getMemoryStats();
  const contextStr = context ? ` [${context}]` : '';

  // Track peak memory
  if (stats.rss > peakMemory) {
    peakMemory = stats.rss;
  }

  // Add to history
  memoryHistory.push(stats);
  if (memoryHistory.length > MAX_HISTORY) {
    memoryHistory.shift();
  }

  // Calculate memory growth rate if we have history
  let growthRate = '';
  if (memoryHistory.length >= 2) {
    const oldest = memoryHistory[0];
    const timeDiff = (stats.timestamp - oldest.timestamp) / 1000; // seconds
    const memDiff = stats.rss - oldest.rss;
    const ratePerMinute = (memDiff / timeDiff) * 60;

    if (Math.abs(ratePerMinute) > 1024 * 1024) { // More than 1MB/min
      growthRate = ` | Growth: ${formatBytes(ratePerMinute)}/min`;
    }
  }

  logger.info(`Memory${contextStr}: RSS=${formatBytes(stats.rss)}, Heap=${formatBytes(stats.heapUsed)}/${formatBytes(stats.heapTotal)}${growthRate}`);

  return stats;
}

/**
 * Start periodic memory monitoring
 * @param {number} [intervalMs=60000] - Interval between logs in milliseconds
 */
function startMonitoring(intervalMs = 60000) {
  if (monitorInterval) {
    logger.warn('Memory monitoring already started');
    return;
  }

  startTime = Date.now();

  // Log initial memory
  logMemory('startup');

  // Set up periodic logging
  monitorInterval = setInterval(() => {
    logMemory('periodic');
  }, intervalMs);

  logger.info(`Memory monitoring started (interval: ${intervalMs / 1000}s)`);
}

/**
 * Stop memory monitoring
 */
function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;

    // Log final stats
    const stats = getMemoryStats();
    logger.info(`Memory monitoring stopped. Peak: ${formatBytes(peakMemory)}, Final: ${formatBytes(stats.rss)}, Uptime: ${stats.uptimeSeconds}s`);
  }
}

/**
 * Get memory trend analysis
 * @returns {Object} Trend analysis
 */
function getMemoryTrend() {
  if (memoryHistory.length < 2) {
    return { trend: 'insufficient_data', samples: memoryHistory.length };
  }

  const oldest = memoryHistory[0];
  const newest = memoryHistory[memoryHistory.length - 1];
  const timeDiff = (newest.timestamp - oldest.timestamp) / 1000; // seconds
  const memDiff = newest.rss - oldest.rss;
  const ratePerMinute = (memDiff / timeDiff) * 60;

  let trend = 'stable';
  if (ratePerMinute > 10 * 1024 * 1024) { // Growing > 10MB/min
    trend = 'growing_fast';
  } else if (ratePerMinute > 1024 * 1024) { // Growing > 1MB/min
    trend = 'growing';
  } else if (ratePerMinute < -1024 * 1024) { // Shrinking
    trend = 'shrinking';
  }

  return {
    trend,
    ratePerMinute: formatBytes(ratePerMinute),
    samples: memoryHistory.length,
    peakRss: formatBytes(peakMemory),
    currentRss: formatBytes(newest.rss),
    uptimeSeconds: newest.uptimeSeconds
  };
}

/**
 * Force garbage collection if available (requires --expose-gc flag)
 * @returns {boolean} Whether GC was triggered
 */
function forceGC() {
  if (global.gc) {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    logger.info(`Forced GC: freed ${formatBytes(before - after)}`);
    return true;
  }
  return false;
}

module.exports = {
  logMemory,
  startMonitoring,
  stopMonitoring,
  getMemoryStats,
  getMemoryTrend,
  forceGC,
  formatBytes
};
