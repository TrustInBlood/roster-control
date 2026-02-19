const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { getConnectionConfigService } = require('../../services/ConnectionConfigService');
const { sequelize } = require('../../../config/database');
const { createServiceLogger } = require('../../utils/logger');

const logger = createServiceLogger('ConnectionsAPI');

// ============================================
// Server Endpoints
// ============================================

// GET /api/v1/connections/servers - List all servers with live status
router.get('/servers', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const configService = getConnectionConfigService();
    const servers = await configService.getServers();

    const connectionManager = global.whitelistServices?.connectionManager;
    const liveStatus = connectionManager ? connectionManager.getConnectionStatus() : {};

    const result = servers.map(server => {
      const live = liveStatus[server.serverKey] || {};
      const connection = connectionManager?.getServerConnection(server.serverKey);

      return {
        ...server.toJSON(),
        token: server.token ? '****' + server.token.slice(-4) : null,
        connectionState: live.state || 'unknown',
        connected: live.connected || false,
        reconnectAttempts: live.reconnectAttempts || 0,
        disconnectedAt: live.disconnectedAt || null,
        lastAttemptTime: live.lastAttemptTime || null,
        serverInfo: connection?.serverInfo || null
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to get servers', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/connections/servers/:key - Single server detail
router.get('/servers/:key', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const configService = getConnectionConfigService();
    const server = await configService.getServer(req.params.key);

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const connectionManager = global.whitelistServices?.connectionManager;
    const liveStatus = connectionManager ? connectionManager.getConnectionStatus() : {};
    const live = liveStatus[server.serverKey] || {};
    const connection = connectionManager?.getServerConnection(server.serverKey);

    res.json({
      success: true,
      data: {
        ...server.toJSON(),
        token: server.token ? '****' + server.token.slice(-4) : null,
        connectionState: live.state || 'unknown',
        connected: live.connected || false,
        reconnectAttempts: live.reconnectAttempts || 0,
        disconnectedAt: live.disconnectedAt || null,
        lastAttemptTime: live.lastAttemptTime || null,
        serverInfo: connection?.serverInfo || null
      }
    });
  } catch (error) {
    logger.error('Failed to get server', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/connections/servers - Create new server
router.post('/servers', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const { serverKey, name, host, port, gamePort, token, enabled, seedThreshold } = req.body;

    // Validation
    if (!serverKey || !/^[a-zA-Z0-9_-]+$/.test(serverKey)) {
      return res.status(400).json({ success: false, error: 'serverKey is required and must be alphanumeric (with _ and -)' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!host || !host.trim()) {
      return res.status(400).json({ success: false, error: 'host is required' });
    }
    if (!port || port < 1 || port > 65535) {
      return res.status(400).json({ success: false, error: 'port must be between 1 and 65535' });
    }
    if (!token || !token.trim()) {
      return res.status(400).json({ success: false, error: 'token is required' });
    }
    if (gamePort !== undefined && gamePort !== null && (gamePort < 1 || gamePort > 65535)) {
      return res.status(400).json({ success: false, error: 'gamePort must be between 1 and 65535' });
    }

    const configService = getConnectionConfigService();

    // Check for duplicate serverKey
    const existing = await configService.getServer(serverKey);
    if (existing) {
      return res.status(409).json({ success: false, error: `Server with key '${serverKey}' already exists` });
    }

    const server = await configService.createServer({
      serverKey,
      name: name.trim(),
      host: host.trim(),
      port,
      gamePort: gamePort || null,
      token: token.trim(),
      enabled: enabled !== false,
      seedThreshold: seedThreshold || 50
    }, req.user.id, req.user.username);

    res.json({
      success: true,
      data: {
        ...server.toJSON(),
        token: '****' + token.trim().slice(-4)
      }
    });
  } catch (error) {
    logger.error('Failed to create server', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/connections/servers/:key - Update server
router.put('/servers/:key', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const { name, host, port, gamePort, token, enabled, seedThreshold } = req.body;

    // Validate fields that are provided
    if (port !== undefined && (port < 1 || port > 65535)) {
      return res.status(400).json({ success: false, error: 'port must be between 1 and 65535' });
    }
    if (gamePort !== undefined && gamePort !== null && (gamePort < 1 || gamePort > 65535)) {
      return res.status(400).json({ success: false, error: 'gamePort must be between 1 and 65535' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (host !== undefined) updateData.host = host.trim();
    if (port !== undefined) updateData.port = port;
    if (gamePort !== undefined) updateData.gamePort = gamePort;
    if (token !== undefined && token.trim()) updateData.token = token.trim();
    if (enabled !== undefined) updateData.enabled = enabled;
    if (seedThreshold !== undefined) updateData.seedThreshold = seedThreshold;

    const configService = getConnectionConfigService();
    const server = await configService.updateServer(
      req.params.key,
      updateData,
      req.user.id,
      req.user.username
    );

    res.json({
      success: true,
      data: {
        ...server.toJSON(),
        token: server.token ? '****' + server.token.slice(-4) : null
      }
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    logger.error('Failed to update server', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/connections/servers/:key - Delete server
router.delete('/servers/:key', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== req.params.key) {
      return res.status(400).json({ success: false, error: 'Confirm deletion by providing the server key in the confirm field' });
    }

    const configService = getConnectionConfigService();
    await configService.deleteServer(req.params.key, req.user.id, req.user.username);

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    logger.error('Failed to delete server', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/connections/servers/:key/reconnect - Force reconnect
router.post('/servers/:key/reconnect', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const connectionManager = global.whitelistServices?.connectionManager;
    if (!connectionManager) {
      return res.status(503).json({ success: false, error: 'Connection manager not available' });
    }

    const configService = getConnectionConfigService();
    const server = await configService.getServer(req.params.key);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    await connectionManager.reconnectServer({
      id: server.serverKey,
      name: server.name,
      host: server.host,
      port: server.port,
      gamePort: server.gamePort,
      token: server.token,
      enabled: server.enabled,
      seedThreshold: server.seedThreshold
    });

    logger.info('Server reconnect triggered via API', {
      serverKey: req.params.key,
      triggeredBy: req.user.id
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to reconnect server', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Settings Endpoints
// ============================================

// GET /api/v1/connections/settings - Get all settings with categories
router.get('/settings', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const configService = getConnectionConfigService();
    const result = await configService.getConfigForApi();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to get settings', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/connections/settings - Batch update settings
router.put('/settings', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'updates object is required' });
    }

    const configService = getConnectionConfigService();
    const results = await configService.updateMultiple(updates, req.user.id, req.user.username);

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      logger.warn('Some settings failed to update', { failed });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Failed to update settings', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Database Status
// ============================================

// GET /api/v1/connections/db-status - Database health info
router.get('/db-status', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const startTime = Date.now();
    await sequelize.authenticate();
    const latencyMs = Date.now() - startTime;

    const versionResult = await sequelize.query('SELECT VERSION() as version, DATABASE() as dbName', { type: sequelize.QueryTypes.SELECT });
    const uptimeResult = await sequelize.query("SHOW STATUS LIKE 'Uptime'", { type: sequelize.QueryTypes.SELECT });

    const pool = sequelize.connectionManager.pool;

    res.json({
      success: true,
      data: {
        connected: true,
        latencyMs,
        database: versionResult[0]?.dbName || null,
        version: versionResult[0]?.version || null,
        uptimeSeconds: parseInt(uptimeResult[0]?.Value || '0', 10),
        poolSize: pool?.size || 0,
        poolAvailable: pool?.available || 0
      }
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        connected: false,
        error: error.message
      }
    });
  }
});

// ============================================
// Audit Log
// ============================================

// GET /api/v1/connections/audit - Change history
router.get('/audit', requireAuth, requirePermission('MANAGE_CONNECTIONS'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const configService = getConnectionConfigService();
    const entries = await configService.getAuditLog(limit);
    res.json({ success: true, data: entries });
  } catch (error) {
    logger.error('Failed to get audit log', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
