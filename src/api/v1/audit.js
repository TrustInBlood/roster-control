const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { createServiceLogger } = require('../../utils/logger');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { AuditLog } = require('../../database/models');

const logger = createServiceLogger('AuditAPI');

// GET /api/v1/audit - List audit logs with filters and pagination
router.get('/', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      actionType,
      actorId,
      targetId,
      severity,
      success,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100); // Cap at 100

    // Build where clause
    const where = {};

    if (actionType) {
      where.actionType = actionType;
    }

    if (actorId) {
      where.actorId = actorId;
    }

    if (targetId) {
      where.targetId = targetId;
    }

    if (severity) {
      where.severity = severity;
    }

    if (success !== undefined) {
      where.success = success === 'true';
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate);
      }
    }

    if (search) {
      where[Op.or] = [
        { actorName: { [Op.like]: `%${search}%` } },
        { targetName: { [Op.like]: `%${search}%` } },
        { targetId: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Validate sort column
    const validSortColumns = ['createdAt', 'actionType', 'actorName', 'targetName', 'severity'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [[safeSortBy, safeSortOrder]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      attributes: [
        'id', 'actionId', 'actionType', 'actorType', 'actorId', 'actorName',
        'targetType', 'targetId', 'targetName', 'description',
        'success', 'errorMessage', 'severity', 'createdAt'
      ]
    });

    res.json({
      entries: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/v1/audit/stats - Audit log statistics
router.get('/stats', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const { hours = 168 } = req.query; // Default to 7 days
    const hoursNum = Math.min(parseInt(hours), 720); // Cap at 30 days

    const stats = await AuditLog.getActionStatistics(hoursNum);

    // Get action type breakdown
    const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);
    const actionTypes = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        'actionType',
        [require('sequelize').fn('COUNT', require('sequelize').col('actionType')), 'count']
      ],
      group: ['actionType'],
      order: [[require('sequelize').literal('count'), 'DESC']],
      raw: true
    });

    // Get severity breakdown
    const severities = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: since }
      },
      attributes: [
        'severity',
        [require('sequelize').fn('COUNT', require('sequelize').col('severity')), 'count']
      ],
      group: ['severity'],
      raw: true
    });

    // Get recent activity by hour (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = await AuditLog.findAll({
      where: {
        createdAt: { [Op.gte]: last24h }
      },
      attributes: ['createdAt'],
      order: [['createdAt', 'ASC']],
      raw: true
    });

    // Group by hour
    const activityByHour = {};
    recentActivity.forEach(log => {
      const hour = new Date(log.createdAt).toISOString().slice(0, 13);
      activityByHour[hour] = (activityByHour[hour] || 0) + 1;
    });

    res.json({
      summary: stats,
      byActionType: actionTypes.reduce((acc, item) => {
        acc[item.actionType] = parseInt(item.count);
        return acc;
      }, {}),
      bySeverity: severities.reduce((acc, item) => {
        acc[item.severity] = parseInt(item.count);
        return acc;
      }, {}),
      activityByHour,
      timeRange: {
        hours: hoursNum,
        since: since.toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching audit stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

// GET /api/v1/audit/action-types - Get list of distinct action types
router.get('/action-types', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const actionTypes = await AuditLog.findAll({
      attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('actionType')), 'actionType']],
      order: [['actionType', 'ASC']],
      raw: true
    });

    res.json({
      actionTypes: actionTypes.map(row => row.actionType).filter(Boolean)
    });
  } catch (error) {
    logger.error('Error fetching action types', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch action types' });
  }
});

// GET /api/v1/audit/:actionId - Get single audit log with full details
router.get('/:actionId', requireAuth, requirePermission('VIEW_AUDIT'), async (req, res) => {
  try {
    const { actionId } = req.params;

    const entry = await AuditLog.findOne({
      where: { actionId }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Audit log entry not found' });
    }

    // Get related actions if any
    const relatedActions = await AuditLog.getRelatedActions(actionId);

    res.json({
      entry,
      relatedActions
    });
  } catch (error) {
    logger.error('Error fetching audit log detail', { error: error.message, actionId: req.params.actionId });
    res.status(500).json({ error: 'Failed to fetch audit log details' });
  }
});

module.exports = router;
