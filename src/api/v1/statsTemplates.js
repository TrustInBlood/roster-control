const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const { createServiceLogger } = require('../../utils/logger');
const { requirePermission } = require('../middleware/auth');
const statsTemplateService = require('../../services/StatsTemplateService');
const { AuditLog } = require('../../database/models');

const logger = createServiceLogger('StatsTemplatesAPI');

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept only PNG and JPEG
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'), false);
    }
  }
});

/**
 * Validate image dimensions
 * @param {Buffer} imageBuffer - Image data
 * @returns {Promise<{width: number, height: number, valid: boolean}>}
 */
async function validateImageDimensions(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    valid: metadata.width === statsTemplateService.REQUIRED_WIDTH &&
           metadata.height === statsTemplateService.REQUIRED_HEIGHT
  };
}

/**
 * Convert image to PNG if needed
 * @param {Buffer} imageBuffer - Image data
 * @returns {Promise<Buffer>} PNG buffer
 */
async function convertToPng(imageBuffer) {
  return sharp(imageBuffer).png().toBuffer();
}

// ============================================
// Template List Endpoint (before parameterized routes)
// ============================================

/**
 * GET /api/v1/stats-templates
 * List all templates
 * Requires: VIEW_STATS_TEMPLATES
 */
router.get('/', requirePermission('VIEW_STATS_TEMPLATES'), async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const templates = await statsTemplateService.getAllTemplates(activeOnly);

    res.json({ templates });
  } catch (error) {
    logger.error('Failed to fetch templates', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================
// Role Mapping Endpoints (MUST be before /:id routes)
// ============================================

/**
 * GET /api/v1/stats-templates/role-mappings
 * List all role mappings
 * Requires: VIEW_STATS_TEMPLATES
 */
router.get('/role-mappings', requirePermission('VIEW_STATS_TEMPLATES'), async (req, res) => {
  try {
    const mappings = await statsTemplateService.getAllRoleMappings();

    // Enrich with Discord role info
    const discordClient = global.discordClient;
    let enrichedMappings = mappings;

    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildRoles = await guild.roles.fetch();

        enrichedMappings = mappings.map(mapping => {
          const discordRole = guildRoles.get(mapping.roleId);
          return {
            ...mapping,
            roleName: discordRole?.name || 'Unknown Role',
            roleColor: discordRole?.hexColor || '#99AAB5',
            rolePosition: discordRole?.position ?? 0
          };
        });

        // Sort by role position (highest first)
        enrichedMappings.sort((a, b) => b.rolePosition - a.rolePosition);
      }
    }

    res.json({ mappings: enrichedMappings });
  } catch (error) {
    logger.error('Failed to fetch role mappings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch role mappings' });
  }
});

/**
 * POST /api/v1/stats-templates/role-mappings
 * Add a role mapping
 * Requires: MANAGE_STATS_TEMPLATES
 * Body: { roleId, templateId, priority? }
 */
router.post('/role-mappings', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { roleId, templateId, priority = 0 } = req.body;

    if (!roleId || !templateId) {
      return res.status(400).json({ error: 'roleId and templateId are required' });
    }

    // Verify template exists
    const template = await statsTemplateService.getTemplateById(parseInt(templateId, 10));
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get role name for audit log
    let roleName = roleId;
    const discordClient = global.discordClient;
    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          roleName = discordRole.name;
        }
      }
    }

    const mapping = await statsTemplateService.setRoleMapping(
      roleId,
      parseInt(templateId, 10),
      parseInt(priority, 10),
      req.user.id
    );

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_MAPPING_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template_mapping',
      targetId: roleId,
      targetName: roleName,
      description: `Mapped role "${roleName}" to template "${template.displayName}"`,
      details: JSON.stringify({ roleId, templateId, templateName: template.name, priority }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Role mapping created', { roleId, roleName, templateId, createdBy: req.user.username });

    res.status(201).json({ success: true, mapping });
  } catch (error) {
    logger.error('Failed to create role mapping', { error: error.message });
    res.status(500).json({ error: 'Failed to create role mapping' });
  }
});

/**
 * DELETE /api/v1/stats-templates/role-mappings/:roleId
 * Remove a role mapping
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.delete('/role-mappings/:roleId', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { roleId } = req.params;

    // Get role name for audit log
    let roleName = roleId;
    const discordClient = global.discordClient;
    if (discordClient) {
      const guildId = process.env.DISCORD_GUILD_ID;
      const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const discordRole = await guild.roles.fetch(roleId).catch(() => null);
        if (discordRole) {
          roleName = discordRole.name;
        }
      }
    }

    const deleted = await statsTemplateService.removeRoleMapping(roleId);

    if (!deleted) {
      return res.status(404).json({ error: 'Role mapping not found' });
    }

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_MAPPING_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template_mapping',
      targetId: roleId,
      targetName: roleName,
      description: `Removed template mapping for role "${roleName}"`,
      details: JSON.stringify({ roleId, roleName }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Role mapping removed', { roleId, roleName, removedBy: req.user.username });

    res.json({ success: true, message: `Template mapping for "${roleName}" removed` });
  } catch (error) {
    logger.error('Failed to remove role mapping', { roleId: req.params.roleId, error: error.message });
    res.status(500).json({ error: 'Failed to remove role mapping' });
  }
});

// ============================================
// Cache Management Endpoints (MUST be before /:id routes)
// ============================================

/**
 * POST /api/v1/stats-templates/refresh-cache
 * Force cache invalidation
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.post('/refresh-cache', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    statsTemplateService.invalidateImageCache();

    logger.info('Cache refresh triggered', { triggeredBy: req.user.username });

    res.json({ success: true, message: 'Template cache refreshed' });
  } catch (error) {
    logger.error('Failed to refresh cache', { error: error.message });
    res.status(500).json({ error: 'Failed to refresh cache' });
  }
});

/**
 * POST /api/v1/stats-templates/seed
 * Seed templates from config file
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.post('/seed', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const count = await statsTemplateService.seedFromConfig(req.user.id);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_SEED',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'system',
      targetId: 'stats_templates',
      targetName: 'Stats Templates',
      description: `Seeded ${count} templates from config`,
      details: JSON.stringify({ count }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Templates seeded', { count, seededBy: req.user.username });

    res.json({ success: true, message: `Seeded ${count} templates from config` });
  } catch (error) {
    logger.error('Failed to seed templates', { error: error.message });
    res.status(500).json({ error: 'Failed to seed templates' });
  }
});

// ============================================
// Template CRUD Endpoints (parameterized routes last)
// ============================================

/**
 * GET /api/v1/stats-templates/:id
 * Get single template
 * Requires: VIEW_STATS_TEMPLATES
 */
router.get('/:id', requirePermission('VIEW_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { id } = req.params;
    const template = await statsTemplateService.getTemplateById(parseInt(id, 10));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get role mappings for this template
    const roleMappings = await statsTemplateService.getRolesForTemplate(parseInt(id, 10));

    res.json({ template, roleMappings });
  } catch (error) {
    logger.error('Failed to fetch template', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/v1/stats-templates
 * Create a new template (multipart upload)
 * Requires: MANAGE_STATS_TEMPLATES
 * Body: name, displayName, and image file
 */
router.post('/', requirePermission('MANAGE_STATS_TEMPLATES'), upload.single('image'), async (req, res) => {
  try {
    const { name, displayName } = req.body;

    // Validate required fields
    if (!name || !displayName) {
      return res.status(400).json({ error: 'name and displayName are required' });
    }

    // Validate name format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(name)) {
      return res.status(400).json({
        error: 'name must contain only lowercase letters, numbers, and hyphens'
      });
    }

    // Check if template already exists
    const existing = await statsTemplateService.getTemplateByName(name);
    if (existing) {
      return res.status(409).json({
        error: 'Template with this name already exists',
        code: 'TEMPLATE_EXISTS'
      });
    }

    // Validate image if provided
    let imageBuffer = null;
    if (req.file) {
      const dimensions = await validateImageDimensions(req.file.buffer);
      if (!dimensions.valid) {
        return res.status(400).json({
          error: `Image must be ${statsTemplateService.REQUIRED_WIDTH}x${statsTemplateService.REQUIRED_HEIGHT} pixels`,
          code: 'INVALID_DIMENSIONS',
          actual: { width: dimensions.width, height: dimensions.height },
          required: {
            width: statsTemplateService.REQUIRED_WIDTH,
            height: statsTemplateService.REQUIRED_HEIGHT
          }
        });
      }
      imageBuffer = await convertToPng(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Parse box config from body if provided
    const config = {
      name,
      displayName,
      boxWidth: req.body.boxWidth ? parseInt(req.body.boxWidth, 10) : undefined,
      boxHeight: req.body.boxHeight ? parseInt(req.body.boxHeight, 10) : undefined,
      boxX: req.body.boxX ? parseInt(req.body.boxX, 10) : undefined,
      boxY: req.body.boxY ? parseInt(req.body.boxY, 10) : undefined,
      rightMargin: req.body.rightMargin ? parseInt(req.body.rightMargin, 10) : undefined,
      padding: req.body.padding ? parseInt(req.body.padding, 10) : undefined,
      titleSize: req.body.titleSize ? parseInt(req.body.titleSize, 10) : undefined,
      labelSize: req.body.labelSize ? parseInt(req.body.labelSize, 10) : undefined,
      valueSize: req.body.valueSize ? parseInt(req.body.valueSize, 10) : undefined,
      rowGap: req.body.rowGap ? parseInt(req.body.rowGap, 10) : undefined,
      topGap: req.body.topGap ? parseInt(req.body.topGap, 10) : undefined,
      sectionGap: req.body.sectionGap ? parseInt(req.body.sectionGap, 10) : undefined
    };

    const template = await statsTemplateService.createTemplate(config, imageBuffer, req.user.id);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_CREATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template',
      targetId: template.id.toString(),
      targetName: name,
      description: `Created stats template: ${displayName}`,
      details: JSON.stringify({ name, displayName }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Template created', { name, id: template.id, createdBy: req.user.username });

    res.status(201).json({ success: true, template });
  } catch (error) {
    logger.error('Failed to create template', { error: error.message });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PUT /api/v1/stats-templates/:id
 * Update template config (not image)
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.put('/:id', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id, 10);

    // Get existing template
    const existing = await statsTemplateService.getTemplateById(templateId);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Build updates from body
    const updates = {};
    const allowedFields = [
      'displayName', 'isActive', 'boxWidth', 'boxHeight', 'boxX', 'boxY',
      'rightMargin', 'padding', 'titleSize', 'labelSize', 'valueSize',
      'rowGap', 'topGap', 'sectionGap'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Convert numeric fields
        if (field !== 'displayName' && field !== 'isActive') {
          updates[field] = req.body[field] === null ? null : parseInt(req.body[field], 10);
        } else if (field === 'isActive') {
          updates[field] = req.body[field] === true || req.body[field] === 'true';
        } else {
          updates[field] = req.body[field];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const template = await statsTemplateService.updateTemplate(templateId, updates, req.user.id);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template',
      targetId: id,
      targetName: existing.name,
      description: `Updated stats template: ${existing.displayName}`,
      details: JSON.stringify({ previous: existing, updates }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Template updated', { id, name: existing.name, updatedBy: req.user.username });

    res.json({ success: true, template });
  } catch (error) {
    logger.error('Failed to update template', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * PUT /api/v1/stats-templates/:id/image
 * Replace template image
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.put('/:id/image', requirePermission('MANAGE_STATS_TEMPLATES'), upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id, 10);

    // Get existing template
    const existing = await statsTemplateService.getTemplateById(templateId);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Validate dimensions
    const dimensions = await validateImageDimensions(req.file.buffer);
    if (!dimensions.valid) {
      return res.status(400).json({
        error: `Image must be ${statsTemplateService.REQUIRED_WIDTH}x${statsTemplateService.REQUIRED_HEIGHT} pixels`,
        code: 'INVALID_DIMENSIONS',
        actual: { width: dimensions.width, height: dimensions.height },
        required: {
          width: statsTemplateService.REQUIRED_WIDTH,
          height: statsTemplateService.REQUIRED_HEIGHT
        }
      });
    }

    const imageBuffer = await convertToPng(req.file.buffer);
    const template = await statsTemplateService.updateTemplateImage(templateId, imageBuffer, req.user.id);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_IMAGE_UPDATE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template',
      targetId: id,
      targetName: existing.name,
      description: `Updated image for stats template: ${existing.displayName}`,
      details: JSON.stringify({ templateId: id, name: existing.name }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Template image updated', { id, name: existing.name, updatedBy: req.user.username });

    res.json({ success: true, template });
  } catch (error) {
    logger.error('Failed to update template image', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to update template image' });
  }
});

/**
 * DELETE /api/v1/stats-templates/:id
 * Delete a template
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.delete('/:id', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id, 10);

    // Get existing template
    const existing = await statsTemplateService.getTemplateById(templateId);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Prevent deleting default template
    if (existing.isDefault) {
      return res.status(400).json({
        error: 'Cannot delete the default template',
        code: 'CANNOT_DELETE_DEFAULT'
      });
    }

    await statsTemplateService.deleteTemplate(templateId);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_DELETE',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template',
      targetId: id,
      targetName: existing.name,
      description: `Deleted stats template: ${existing.displayName}`,
      details: JSON.stringify({ deleted: existing }),
      severity: 'medium',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Template deleted', { id, name: existing.name, deletedBy: req.user.username });

    res.json({ success: true, message: `Template "${existing.displayName}" deleted` });
  } catch (error) {
    logger.error('Failed to delete template', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * POST /api/v1/stats-templates/:id/set-default
 * Set a template as the default
 * Requires: MANAGE_STATS_TEMPLATES
 */
router.post('/:id/set-default', requirePermission('MANAGE_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id, 10);

    // Get template
    const template = await statsTemplateService.getTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await statsTemplateService.setDefaultTemplate(templateId);

    // Audit log
    await AuditLog.create({
      actionType: 'STATS_TEMPLATE_SET_DEFAULT',
      actorType: 'user',
      actorId: req.user.id,
      actorName: req.user.username,
      targetType: 'stats_template',
      targetId: id,
      targetName: template.name,
      description: `Set default stats template to: ${template.displayName}`,
      details: JSON.stringify({ templateId: id, name: template.name }),
      severity: 'low',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info('Default template changed', { id, name: template.name, changedBy: req.user.username });

    res.json({ success: true, message: `"${template.displayName}" is now the default template` });
  } catch (error) {
    logger.error('Failed to set default template', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to set default template' });
  }
});

/**
 * GET /api/v1/stats-templates/:id/image
 * Get template image (for preview)
 * Requires: VIEW_STATS_TEMPLATES
 */
router.get('/:id/image', requirePermission('VIEW_STATS_TEMPLATES'), async (req, res) => {
  try {
    const { id } = req.params;
    const template = await statsTemplateService.getTemplateById(parseInt(id, 10));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const imagePath = statsTemplateService.getTemplatePath(template.filename);
    res.sendFile(imagePath);
  } catch (error) {
    logger.error('Failed to get template image', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to get template image' });
  }
});

module.exports = router;
