import { supabaseAdmin } from '../config/supabase.js';
import { generateId } from './helpers.js';

/**
 * Storage bucket names
 */
export const BUCKETS = {
  DOCUMENTS: 'documents',    // Source PDFs
  TEMPLATES: 'templates',    // DOCX templates
  EXPORTS: 'exports',        // Generated DOCX exports
  FIGURES: 'figures',        // Extracted figures from PDFs
};

/**
 * Upload a file to Supabase Storage
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<{path: string, url: string}>}
 */
export const uploadFile = async (bucket, path, fileBuffer, contentType) => {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false, // Don't overwrite existing files
    });
  
  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
  
  return {
    path: data.path,
    fullPath: `${bucket}/${data.path}`,
  };
};

/**
 * Upload a document (PDF) to storage
 * 
 * @param {string} userId - User ID for folder organization
 * @param {string} filename - Original filename
 * @param {Buffer} fileBuffer - File content
 * @returns {Promise<{path: string, storagePath: string}>}
 */
export const uploadDocument = async (userId, filename, fileBuffer) => {
  const fileId = generateId();
  const path = `${userId}/${fileId}.pdf`;
  
  const result = await uploadFile(
    BUCKETS.DOCUMENTS,
    path,
    fileBuffer,
    'application/pdf'
  );
  
  return {
    fileId,
    path: result.path,
    storagePath: result.fullPath,
  };
};

/**
 * Upload a template (DOCX) to storage
 * 
 * @param {string} userId - User ID for folder organization
 * @param {string} filename - Original filename
 * @param {Buffer} fileBuffer - File content
 * @returns {Promise<{path: string, storagePath: string}>}
 */
export const uploadTemplate = async (userId, filename, fileBuffer) => {
  const fileId = generateId();
  const path = `${userId}/${fileId}.docx`;
  
  const result = await uploadFile(
    BUCKETS.TEMPLATES,
    path,
    fileBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  
  return {
    fileId,
    path: result.path,
    storagePath: result.fullPath,
  };
};

/**
 * Upload an exported document to storage
 * 
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} filename - Export filename
 * @param {Buffer} fileBuffer - File content
 * @returns {Promise<{path: string, storagePath: string}>}
 */
export const uploadExport = async (userId, projectId, filename, fileBuffer) => {
  const exportId = generateId();
  const path = `${userId}/${projectId}/${exportId}.docx`;
  
  const result = await uploadFile(
    BUCKETS.EXPORTS,
    path,
    fileBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  
  return {
    exportId,
    path: result.path,
    storagePath: result.fullPath,
  };
};

/**
 * Upload an extracted figure/image
 * 
 * @param {string} documentId - Source document ID
 * @param {string} figureId - Figure identifier
 * @param {Buffer} imageBuffer - Image content
 * @param {string} mimeType - Image MIME type (image/png, image/jpeg)
 * @returns {Promise<{path: string, storagePath: string}>}
 */
export const uploadFigure = async (documentId, figureId, imageBuffer, mimeType) => {
  const extension = mimeType.split('/')[1] || 'png';
  const path = `${documentId}/${figureId}.${extension}`;
  
  const result = await uploadFile(
    BUCKETS.FIGURES,
    path,
    imageBuffer,
    mimeType
  );
  
  return {
    path: result.path,
    storagePath: result.fullPath,
  };
};

/**
 * Get a signed URL for downloading a file
 * URL expires after specified time (default 1 hour)
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @param {number} expiresIn - Expiry time in seconds (default 3600)
 * @returns {Promise<string>} Signed URL
 */
export const getSignedUrl = async (bucket, path, expiresIn = 3600) => {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  
  if (error) {
    console.error('Error creating signed URL:', error);
    throw new Error(`Failed to create download URL: ${error.message}`);
  }
  
  return data.signedUrl;
};

/**
 * Get public URL for a file (if bucket is public)
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @returns {string} Public URL
 */
export const getPublicUrl = (bucket, path) => {
  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return data.publicUrl;
};

/**
 * Download a file from storage
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<Buffer>} File content as buffer
 */
export const downloadFile = async (bucket, path) => {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);
  
  if (error) {
    console.error('Storage download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
  
  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * Delete a file from storage
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<void>}
 */
export const deleteFile = async (bucket, path) => {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);
  
  if (error) {
    console.error('Storage delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Delete multiple files from storage
 * 
 * @param {string} bucket - Bucket name
 * @param {string[]} paths - Array of file paths
 * @returns {Promise<void>}
 */
export const deleteFiles = async (bucket, paths) => {
  if (paths.length === 0) return;
  
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove(paths);
  
  if (error) {
    console.error('Storage bulk delete error:', error);
    throw new Error(`Failed to delete files: ${error.message}`);
  }
};

/**
 * Delete all files in a folder
 * 
 * @param {string} bucket - Bucket name
 * @param {string} folderPath - Folder path within bucket
 * @returns {Promise<void>}
 */
export const deleteFolder = async (bucket, folderPath) => {
  // List all files in the folder
  const { data: files, error: listError } = await supabaseAdmin.storage
    .from(bucket)
    .list(folderPath);
  
  if (listError) {
    console.error('Error listing folder:', listError);
    throw new Error(`Failed to list folder: ${listError.message}`);
  }
  
  if (files.length === 0) return;
  
  // Build full paths and delete
  const paths = files.map(file => `${folderPath}/${file.name}`);
  await deleteFiles(bucket, paths);
};

/**
 * Check if a file exists in storage
 * 
 * @param {string} bucket - Bucket name
 * @param {string} path - File path within bucket
 * @returns {Promise<boolean>}
 */
export const fileExists = async (bucket, path) => {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(path.split('/').slice(0, -1).join('/'), {
        search: path.split('/').pop(),
      });
    
    if (error) return false;
    return data.length > 0;
  } catch {
    return false;
  }
};

export default {
  BUCKETS,
  uploadFile,
  uploadDocument,
  uploadTemplate,
  uploadExport,
  uploadFigure,
  getSignedUrl,
  getPublicUrl,
  downloadFile,
  deleteFile,
  deleteFiles,
  deleteFolder,
  fileExists,
};