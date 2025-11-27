import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadPdf, requireFile } from '../middleware/upload.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateUUID, validatePagination } from '../utils/validators.js';
import {
  createDocument,
  getDocumentById,
  getDocumentsByUser,
  getDocumentStatus,
  getDocumentSummary,
  deleteDocument,
  reprocessDocument,
} from '../services/documentService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/documents
 * Upload a new PDF document
 */
router.post(
  '/',
  uploadPdf.single('file'),
  requireFile,
  asyncHandler(async (req, res) => {
    const document = await createDocument(req.user.id, req.file);
    
    res.status(201).json({
      success: true,
      message: 'Document uploaded and processing started',
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        createdAt: document.created_at,
      },
    });
  })
);

/**
 * GET /api/documents
 * List all documents for the current user
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    
    // Validate pagination
    const paginationErrors = validatePagination(page, limit);
    if (paginationErrors) {
      throw Errors.badRequest('Invalid pagination parameters', paginationErrors);
    }
    
    const result = await getDocumentsByUser(req.user.id, {
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
 * GET /api/documents/:id
 * Get a specific document with full details
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Document ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const document = await getDocumentById(id, req.user.id);
    
    if (!document) {
      throw Errors.notFound('Document');
    }
    
    res.json({
      success: true,
      document,
    });
  })
);

/**
 * GET /api/documents/:id/status
 * Get document processing status (for polling)
 */
router.get(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Document ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const status = await getDocumentStatus(id, req.user.id);
    
    if (!status) {
      throw Errors.notFound('Document');
    }
    
    res.json({
      success: true,
      ...status,
    });
  })
);

/**
 * GET /api/documents/:id/summary
 * Get document summary (sections, counts, warnings)
 */
router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Document ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const summary = await getDocumentSummary(id, req.user.id);
    
    if (!summary) {
      throw Errors.notFound('Document');
    }
    
    res.json({
      success: true,
      summary,
    });
  })
);

/**
 * POST /api/documents/:id/reprocess
 * Reprocess a document (retry parsing)
 */
router.post(
  '/:id/reprocess',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Document ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const result = await reprocessDocument(id, req.user.id);
    
    res.json({
      success: true,
      ...result,
    });
  })
);

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const idError = validateUUID(id, 'Document ID');
    if (idError) {
      throw Errors.badRequest(idError);
    }
    
    const deleted = await deleteDocument(id, req.user.id);
    
    if (!deleted) {
      throw Errors.notFound('Document');
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  })
);

export default router;