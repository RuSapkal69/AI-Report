import { supabaseAdmin } from '../config/supabase.js';
import { uploadDocument, downloadFile, deleteFile, BUCKETS } from '../utils/storage.js';
import { generateId } from '../utils/helpers.js';
import { processPdf } from '../processors/pdfProcessor.js';
import { processWithGrobid } from '../processors/grobidProcessor.js';

/**
 * Upload and process a new PDF document
 * 
 * @param {string} userId - User ID
 * @param {Object} file - Multer file object { buffer, originalname, mimetype }
 * @returns {Promise<Object>} Created document record
 */
export const createDocument = async (userId, file) => {
  const documentId = generateId();
  
  // 1. Upload file to storage
  const { storagePath } = await uploadDocument(userId, file.originalname, file.buffer);
  
  // 2. Create initial database record
  const { data: document, error: insertError } = await supabaseAdmin
    .from('source_documents')
    .insert({
      id: documentId,
      user_id: userId,
      filename: file.originalname,
      storage_path: storagePath,
      status: 'processing',
      parsing_warnings: [],
      metadata: {},
      extracted_content: {},
      references: [],
    })
    .select()
    .single();
  
  if (insertError) {
    // Clean up uploaded file if DB insert fails
    await deleteFile(BUCKETS.DOCUMENTS, storagePath).catch(console.error);
    throw new Error(`Failed to create document record: ${insertError.message}`);
  }
  
  // 3. Process document asynchronously
  // We don't await this - it runs in background
  processDocumentAsync(documentId, file.buffer).catch(error => {
    console.error(`Background processing failed for document ${documentId}:`, error);
  });
  
  return document;
};

/**
 * Process document in background
 * Updates database with results as processing completes
 */
const processDocumentAsync = async (documentId, pdfBuffer) => {
  const warnings = [];
  let status = 'ready';
  
  try {
    // 1. Process PDF for text extraction
    const pdfResult = await processPdf(pdfBuffer);
    warnings.push(...pdfResult.warnings);
    
    if (!pdfResult.success) {
      status = 'partial';
    }
    
    // 2. Process with GROBID for metadata/references
    const grobidResult = await processWithGrobid(pdfBuffer);
    warnings.push(...grobidResult.warnings);
    
    // 3. Merge metadata (prefer GROBID metadata if available)
    const metadata = {
      title: grobidResult.metadata?.title || pdfResult.extractedContent.metadata?.title || null,
      authors: grobidResult.metadata?.authors || [],
      abstract: grobidResult.metadata?.abstract || null,
      journal: grobidResult.metadata?.journal || null,
      year: grobidResult.metadata?.year || null,
      doi: grobidResult.metadata?.doi || null,
      keywords: grobidResult.metadata?.keywords || [],
      pageCount: pdfResult.extractedContent.pageCount || 0,
    };
    
    // 4. Update database with results
    const { error: updateError } = await supabaseAdmin
      .from('source_documents')
      .update({
        status,
        parsing_warnings: warnings,
        metadata,
        extracted_content: pdfResult.extractedContent,
        references: grobidResult.references || [],
      })
      .eq('id', documentId);
    
    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log(`Document ${documentId} processed successfully with status: ${status}`);
    
  } catch (error) {
    console.error(`Document processing failed for ${documentId}:`, error);
    
    // Update status to error
    await supabaseAdmin
      .from('source_documents')
      .update({
        status: 'error',
        parsing_warnings: [...warnings, error.message],
      })
      .eq('id', documentId);
  }
};

/**
 * Get document by ID
 * 
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object|null>} Document or null if not found
 */
export const getDocumentById = async (documentId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('source_documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get document: ${error.message}`);
  }
  
  return data;
};

/**
 * Get all documents for a user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options { page, limit, status }
 * @returns {Promise<{ documents: Object[], total: number }>}
 */
export const getDocumentsByUser = async (userId, options = {}) => {
  const { page = 1, limit = 20, status = null } = options;
  const offset = (page - 1) * limit;
  
  let query = supabaseAdmin
    .from('source_documents')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    throw new Error(`Failed to get documents: ${error.message}`);
  }
  
  return {
    documents: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
};

/**
 * Get document processing status
 * 
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Status info
 */
export const getDocumentStatus = async (documentId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('source_documents')
    .select('id, status, parsing_warnings, created_at')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get document status: ${error.message}`);
  }
  
  return data;
};

/**
 * Get multiple documents by IDs
 * 
 * @param {string[]} documentIds - Array of document IDs
 * @param {string} userId - User ID
 * @returns {Promise<Object[]>} Documents
 */
export const getDocumentsByIds = async (documentIds, userId) => {
  if (!documentIds || documentIds.length === 0) {
    return [];
  }
  
  const { data, error } = await supabaseAdmin
    .from('source_documents')
    .select('*')
    .in('id', documentIds)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to get documents: ${error.message}`);
  }
  
  return data || [];
};

/**
 * Delete a document
 * 
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export const deleteDocument = async (documentId, userId) => {
  // Get document first to get storage path
  const document = await getDocumentById(documentId, userId);
  
  if (!document) {
    return false;
  }
  
  // Delete from database
  const { error } = await supabaseAdmin
    .from('source_documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
  
  // Delete from storage (don't fail if storage delete fails)
  try {
    const storagePath = document.storage_path.replace(`${BUCKETS.DOCUMENTS}/`, '');
    await deleteFile(BUCKETS.DOCUMENTS, storagePath);
  } catch (storageError) {
    console.error('Failed to delete document from storage:', storageError);
  }
  
  return true;
};

/**
 * Get extracted content summary for a document
 * Useful for displaying document preview
 */
export const getDocumentSummary = async (documentId, userId) => {
  const document = await getDocumentById(documentId, userId);
  
  if (!document) return null;
  
  const content = document.extracted_content || {};
  const sections = content.sections || {};
  
  return {
    id: document.id,
    filename: document.filename,
    status: document.status,
    metadata: document.metadata,
    sectionCount: Object.keys(sections).length,
    sections: Object.keys(sections).map(key => ({
      key,
      wordCount: sections[key]?.text?.split(/\s+/).length || 0,
      hasContent: !!sections[key]?.text,
    })),
    tableCount: content.tables?.length || 0,
    figureCount: content.figures?.length || 0,
    referenceCount: document.references?.length || 0,
    warnings: document.parsing_warnings || [],
  };
};

/**
 * Reprocess a document
 * Useful if processing failed or GROBID was unavailable
 */
export const reprocessDocument = async (documentId, userId) => {
  const document = await getDocumentById(documentId, userId);
  
  if (!document) {
    throw new Error('Document not found');
  }
  
  // Download file from storage
  const storagePath = document.storage_path.replace(`${BUCKETS.DOCUMENTS}/`, '');
  const pdfBuffer = await downloadFile(BUCKETS.DOCUMENTS, storagePath);
  
  // Update status to processing
  await supabaseAdmin
    .from('source_documents')
    .update({ status: 'processing', parsing_warnings: [] })
    .eq('id', documentId);
  
  // Reprocess
  await processDocumentAsync(documentId, pdfBuffer);
  
  return { success: true, message: 'Document reprocessing started' };
};

export default {
  createDocument,
  getDocumentById,
  getDocumentsByUser,
  getDocumentStatus,
  getDocumentsByIds,
  deleteDocument,
  getDocumentSummary,
  reprocessDocument,
};