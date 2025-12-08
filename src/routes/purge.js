const express = require('express');
const path = require('path');
const { createServiceLogger } = require('../utils/logger');
const { getMemberPurgeService } = require('../services/MemberPurgeService');
const { AuditLog } = require('../database/models');

const serviceLogger = createServiceLogger('PurgeRoutes');
const router = express.Router();

/**
 * Token validation middleware
 * Validates PURGE_SECRET_TOKEN from query string
 */
function validatePurgeToken(req, res, next) {
  const token = req.query.token;
  const expectedToken = process.env.PURGE_SECRET_TOKEN;

  if (!expectedToken) {
    serviceLogger.error('PURGE_SECRET_TOKEN not configured');
    return res.status(500).json({ error: 'Purge functionality not configured' });
  }

  if (!token || token !== expectedToken) {
    serviceLogger.warn('Invalid purge token attempt', {
      ip: req.ip,
      providedToken: token ? '[REDACTED]' : 'none'
    });
    return res.status(403).json({ error: 'Invalid or missing authentication token' });
  }

  next();
}

/**
 * Setup purge routes
 * @param {Client} discordClient - Discord.js client
 * @returns {Router} Express router
 */
function setupPurgeRoutes(discordClient) {
  // Initialize the purge service
  const purgeService = getMemberPurgeService(discordClient);

  /**
   * GET /purge - Serve the purge HTML page
   */
  router.get('/', validatePurgeToken, (req, res) => {
    serviceLogger.info('Purge page accessed', { ip: req.ip });
    res.sendFile(path.join(__dirname, '../views/purge.html'));
  });

  /**
   * GET /purge/preview - Get preview data
   */
  router.get('/preview', validatePurgeToken, async (req, res) => {
    try {
      serviceLogger.info('Generating purge preview', { ip: req.ip });

      // Get the guild
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.status(500).json({ error: 'Discord guild not found' });
      }

      // Generate preview
      const preview = await purgeService.generatePreview(guild, 30);

      serviceLogger.info('Preview generated successfully', {
        totalAffected: preview.totalAffected,
        previewCount: preview.affectedUsers.length
      });

      res.json(preview);

    } catch (error) {
      serviceLogger.error('Failed to generate preview', { error: error.message });
      res.status(500).json({ error: 'Failed to generate preview: ' + error.message });
    }
  });

  /**
   * POST /purge/execute - Execute the purge
   */
  router.post('/execute', validatePurgeToken, async (req, res) => {
    try {
      serviceLogger.warn('PURGE EXECUTION REQUESTED', { ip: req.ip });

      // Get the guild
      const guild = discordClient.guilds.cache.first();
      if (!guild) {
        return res.status(500).json({ error: 'Discord guild not found' });
      }

      // For audit purposes, we'll use "Web Admin" as the actor
      // In production, you might want to add additional identification
      const actorId = 'web-purge';
      const actorName = 'Web Admin (Purge Interface)';

      // Log access before execution
      await AuditLog.create({
        actionType: 'MEMBER_PURGE_WEB_ACCESS',
        actorType: 'system',
        actorId: actorId,
        actorName: actorName,
        targetType: 'guild',
        targetId: guild.id,
        targetName: guild.name,
        description: 'Purge execution initiated via web interface',
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        },
        success: true,
        severity: 'warning'
      });

      // Execute the purge
      const result = await purgeService.executePurge(guild, actorId, actorName);

      if (result.success) {
        serviceLogger.warn('PURGE EXECUTED SUCCESSFULLY', {
          processed: result.results.processed,
          successful: result.results.successful,
          failed: result.results.failed
        });
      } else {
        serviceLogger.error('PURGE EXECUTION FAILED', {
          error: result.error,
          results: result.results
        });
      }

      res.json(result);

    } catch (error) {
      serviceLogger.error('Purge execution error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Purge execution failed: ' + error.message,
        results: {
          processed: 0,
          successful: 0,
          failed: 0,
          errors: [{ error: error.message }]
        }
      });
    }
  });

  serviceLogger.info('Purge routes initialized');
  return router;
}

module.exports = { setupPurgeRoutes };
