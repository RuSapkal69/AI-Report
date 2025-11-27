import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateUUID } from '../utils/validators.js';
import {
  getDraftByProject,
  getDraftContent,
  saveDraftContent,
} from '../services/draftService.js';
import { getProjectById } from '../services/projectService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/drafts/project/:projectId
 * Get the current draft for a project
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
    
    const draft = await getDraftContent(projectId);
    
    if (!draft) {
      throw Errors.notFound('Draft');
    }
    
    res.json({
      success: true,
      draft,
    });
  })
);

/**
 * PATCH /api/drafts/project/:projectId
 * Save editor changes to draft
 */
router.patch(
  '/project/:projectId',
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { content } = req.body;
    
    const idError = validateUUID(projectId, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    if (!content) {
      throw Errors.badRequest('Content is required');
    }
    
    // Verify project belongs to user
    const project = await getProjectById(projectId, req.user.id);
    if (!project) {
      throw Errors.notFound('Project');
    }
    
    const draft = await saveDraftContent(projectId, content);
    
    res.json({
      success: true,
      message: 'Draft saved successfully',
      draft: {
        id: draft.id,
        version: draft.version,
        updatedAt: draft.updated_at,
      },
    });
  })
);

/**
 * GET /api/drafts/project/:projectId/sections
 * Get list of sections in draft (for navigation)
 */
router.get(
  '/project/:projectId/sections',
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
    
    const draft = await getDraftByProject(projectId);
    
    if (!draft) {
      throw Errors.notFound('Draft');
    }
    
    // Extract section list from draft content
    const sections = (draft.content?.content || [])
      .filter(node => node.attrs?.id)
      .map(node => ({
        id: node.attrs.id,
        title: node.attrs.title || 'Untitled',
        hasContent: node.content?.length > 1, // More than just heading
        warnings: draft.section_sources?.[node.attrs.id]?.warnings || [],
      }));
    
    res.json({
      success: true,
      sections,
      totalSections: sections.length,
    });
  })
);

/**
 * GET /api/drafts/project/:projectId/references
 * Get references from draft
 */
router.get(
  '/project/:projectId/references',
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
    
    const draft = await getDraftByProject(projectId);
    
    if (!draft) {
      throw Errors.notFound('Draft');
    }
    
    res.json({
      success: true,
      references: draft.references || [],
      totalReferences: draft.references?.length || 0,
    });
  })
);

export default router;