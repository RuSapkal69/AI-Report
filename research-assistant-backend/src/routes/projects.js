import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateUUID, validateCreateProject, validateUpdateProject } from '../utils/validators.js';
import {
  createProject,
  getProjectById,
  getProjectWithRelations,
  getProjectsByUser,
  updateProject,
  deleteProject,
  checkGenerationReadiness,
  getProjectSummary,
} from '../services/projectService.js';
import { generateProjectContent, generationEvents } from '../services/generationService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/projects
 * Create a new project
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Validate request body
    const validationErrors = validateCreateProject(req.body);
    if (validationErrors) {
      throw Errors.badRequest('Validation failed', validationErrors);
    }
    
    const project = await createProject(req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project,
    });
  })
);

/**
 * GET /api/projects
 * List all projects for the current user
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    
    const result = await getProjectsByUser(req.user.id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status: status || null,
    });
    
    res.json({
      success: true,
      ...result,
    });
  })
);

/**
 * GET /api/projects/:id
 * Get a specific project with full details
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    // Check if full details requested
    const { full } = req.query;
    
    let project;
    if (full === 'true') {
      project = await getProjectWithRelations(id, req.user.id);
    } else {
      project = await getProjectById(id, req.user.id);
    }
    
    if (!project) {
      throw Errors.notFound('Project');
    }
    
    res.json({
      success: true,
      project,
    });
  })
);

/**
 * GET /api/projects/:id/summary
 * Get project summary (for listing cards)
 */
router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const summary = await getProjectSummary(id, req.user.id);
    
    if (!summary) {
      throw Errors.notFound('Project');
    }
    
    res.json({
      success: true,
      summary,
    });
  })
);

/**
 * PATCH /api/projects/:id
 * Update project configuration
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    // Validate updates
    const validationErrors = validateUpdateProject(req.body);
    if (validationErrors) {
      throw Errors.badRequest('Validation failed', validationErrors);
    }
    
    const project = await updateProject(id, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Project updated successfully',
      project,
    });
  })
);

/**
 * POST /api/projects/:id/generate
 * Start AI generation for the project
 */
router.post(
  '/:id/generate',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    // Check if project is ready for generation
    const readiness = await checkGenerationReadiness(id, req.user.id);
    
    if (!readiness.ready) {
      throw Errors.badRequest('Project not ready for generation', {
        issues: readiness.issues,
      });
    }
    
    // Start generation in background
    // Don't await - let it run asynchronously
    generateProjectContent(readiness.project, req.user.id).catch(error => {
      console.error('Generation error:', error);
    });
    
    res.json({
      success: true,
      message: 'Generation started',
      projectId: id,
      status: 'generating',
    });
  })
);

/**
 * GET /api/projects/:id/generation-status
 * Server-Sent Events endpoint for real-time generation progress
 */
router.get(
  '/:id/generation-status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    // Verify project belongs to user
    const project = await getProjectById(id, req.user.id);
    if (!project) {
      throw Errors.notFound('Project');
    }
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });
    
    // Send initial status
    res.write(`data: ${JSON.stringify({
      type: 'status',
      status: project.status,
      progress: project.generation_progress,
    })}\n\n`);
    
    // Event handlers
    const onProgress = (data) => {
      if (data.projectId === id) {
        res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    
    const onSectionComplete = (data) => {
      if (data.projectId === id) {
        res.write(`event: section-complete\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    
    const onError = (data) => {
      if (data.projectId === id) {
        res.write(`event: error\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    
    const onComplete = (data) => {
      if (data.projectId === id) {
        res.write(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
        // Close connection after complete
        cleanup();
        res.end();
      }
    };
    
    // Subscribe to events
    generationEvents.on('progress', onProgress);
    generationEvents.on('section-complete', onSectionComplete);
    generationEvents.on('error', onError);
    generationEvents.on('complete', onComplete);
    
    // Cleanup function
    const cleanup = () => {
      generationEvents.off('progress', onProgress);
      generationEvents.off('section-complete', onSectionComplete);
      generationEvents.off('error', onError);
      generationEvents.off('complete', onComplete);
    };
    
    // Handle client disconnect
    req.on('close', cleanup);
    
    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);
    
    req.on('close', () => {
      clearInterval(pingInterval);
    });
  })
);

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Project ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const deleted = await deleteProject(id, req.user.id);
    
    if (!deleted) {
      throw Errors.notFound('Project');
    }
    
    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  })
);

export default router;