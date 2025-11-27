import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateUUID } from '../utils/validators.js';
import {
  exportProject,
  getExportById,
  getExportDownloadUrl,
  getExportsByProject,
  deleteExport,
} from '../services/exportService.js';
import { getProjectById } from '../services/projectService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/exports/project/:projectId
 * Generate a new DOCX export for a project
 */
router.post(
  '/project/:projectId',
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { includeReferences = true, includeTableOfContents = false, filename } = req.body;
    
    const idError = validateUUID(projectId, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const exportRecord = await exportProject(projectId, req.user.id, {
      includeReferences,
      includeTableOfContents,
      filename,
    });
    
    res.status(201).json({
      success: true,
      message: 'Export generated successfully',
      export: {
        id: exportRecord.id,
        filename: exportRecord.filename,
        format: exportRecord.format,
        downloadUrl: exportRecord.downloadUrl,
        createdAt: exportRecord.created_at,
      },
    });
  })
);

/**
 * GET /api/exports/project/:projectId
 * List all exports for a project
 */
router.get(
  '/project/:projectId',
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    
    const idError = validateUUID(projectId, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    // Verify project belongs to user
    const project = await getProjectById(projectId, req.user.id);
    if (!project) {
      throw Errors.notFound('Project');
    }
    
    const exports = await getExportsByProject(projectId, req.user.id);
    
    res.json({
      success: true,
      exports: exports.map(e => ({
        id: e.id,
        filename: e.filename,
        format: e.format,
        draftVersion: e.draft_version,
        createdAt: e.created_at,
      })),
      total: exports.length,
    });
  })
);

/**
 * GET /api/exports/:id
 * Get export details
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Export ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const exportRecord = await getExportById(id, req.user.id);
    
    if (!exportRecord) {
      throw Errors.notFound('Export');
    }
    
    res.json({
      success: true,
      export: {
        id: exportRecord.id,
        projectId: exportRecord.project_id,
        filename: exportRecord.filename,
        format: exportRecord.format,
        draftVersion: exportRecord.draft_version,
        exportSettings: exportRecord.export_settings,
        createdAt: exportRecord.created_at,
      },
    });
  })
);

/**
 * GET /api/exports/:id/download
 * Get download URL for an export
 */
router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Export ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const downloadUrl = await getExportDownloadUrl(id, req.user.id);
    
    res.json({
      success: true,
      downloadUrl,
      expiresIn: 3600, // 1 hour
    });
  })
);

/**
 * DELETE /api/exports/:id
 * Delete an export
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Export ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const deleted = await deleteExport(id, req.user.id);
    
    if (!deleted) {
      throw Errors.notFound('Export');
    }
    
    res.json({
      success: true,
      message: 'Export deleted successfully',
    });
  })
);

export default router;