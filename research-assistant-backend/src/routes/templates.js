import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadDocx, requireFile } from '../middleware/upload.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateUUID, validatePagination } from '../utils/validators.js';
import {
  createTemplate,
  getTemplateById,
  getTemplatesByUser,
  getTemplateStructure,
  deleteTemplate,
} from '../services/templateService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/templates
 * Upload a new DOCX template
 */
router.post(
  '/',
  uploadDocx.single('file'),
  requireFile,
  asyncHandler(async (req, res) => {
    const template = await createTemplate(req.user.id, req.file);
    
    res.status(201).json({
      success: true,
      message: 'Template uploaded and parsed successfully',
      template: {
        id: template.id,
        filename: template.filename,
        sectionCount: template.structure?.length || 0,
        warnings: template.warnings || [],
        createdAt: template.created_at,
      },
    });
  })
);

/**
 * GET /api/templates
 * List all templates for the current user
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    
    // Validate pagination
    const paginationErrors = validatePagination(page, limit);
    if (paginationErrors) {
      throw Errors.badRequest('Invalid pagination parameters', paginationErrors);
    }
    
    const result = await getTemplatesByUser(req.user.id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
    
    // Add section count to each template
    const templatesWithCounts = result.templates.map(t => ({
      ...t,
      sectionCount: t.structure?.length || 0,
      placeholders: t.structure?.filter(s => s.placeholder).map(s => s.placeholder) || [],
    }));
    
    res.json({
      success: true,
      ...result,
      templates: templatesWithCounts,
    });
  })
);

/**
 * GET /api/templates/:id
 * Get a specific template with full details
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Template ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const template = await getTemplateById(id, req.user.id);
    
    if (!template) {
      throw Errors.notFound('Template');
    }
    
    res.json({
      success: true,
      template,
    });
  })
);

/**
 * GET /api/templates/:id/structure
 * Get template structure (sections, placeholders, styles)
 */
router.get(
  '/:id/structure',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Template ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const structure = await getTemplateStructure(id, req.user.id);
    
    if (!structure) {
      throw Errors.notFound('Template');
    }
    
    res.json({
      success: true,
      ...structure,
    });
  })
);

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Template ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const deleted = await deleteTemplate(id, req.user.id);
    
    if (!deleted) {
      throw Errors.notFound('Template');
    }
    
    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  })
);

export default router;