import { supabaseAdmin } from '../config/supabase.js';
import { generateId } from '../utils/helpers.js';
import { uploadExport, getSignedUrl, BUCKETS } from '../utils/storage.js';
import { generateDocx } from '../processors/docxWriter.js';
import { getDraftByProject } from './draftService.js';
import { getProjectWithRelations } from './projectService.js';

/**
 * Export project to DOCX
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export record with download URL
 */
export const exportProject = async (projectId, userId, options = {}) => {
  const {
    includeReferences = true,
    includeTableOfContents = false,
    filename = null,
  } = options;
  
  // Get project with relations
  const project = await getProjectWithRelations(projectId, userId);
  
  if (!project) {
    throw new Error('Project not found');
  }
  
  if (project.status !== 'ready') {
    throw new Error('Project must be in ready status to export');
  }
  
  // Get draft
  const draft = await getDraftByProject(projectId);
  
  if (!draft) {
    throw new Error('No draft found for this project');
  }
  
  // Convert draft content to export format
  const exportData = convertDraftForExport(draft);
  
  // Generate DOCX
  const docxBuffer = await generateDocx(exportData, project.template, {
    title: project.name,
    includeReferences,
    includeTableOfContents,
  });
  
  // Generate filename
  const exportFilename = filename || generateExportFilename(project.name);
  
  // Upload to storage
  const { exportId, storagePath } = await uploadExport(
    userId,
    projectId,
    exportFilename,
    docxBuffer
  );
  
  // Create export record
  const { data: exportRecord, error } = await supabaseAdmin
    .from('exports')
    .insert({
      id: exportId,
      project_id: projectId,
      draft_version: draft.version,
      format: 'docx',
      storage_path: storagePath,
      filename: exportFilename,
      export_settings: {
        includeReferences,
        includeTableOfContents,
      },
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create export record: ${error.message}`);
  }
  
  // Update project status
  await supabaseAdmin
    .from('projects')
    .update({ status: 'exported' })
    .eq('id', projectId);
  
  // Get download URL
  const downloadUrl = await getSignedUrl(
    BUCKETS.EXPORTS,
    storagePath.replace(`${BUCKETS.EXPORTS}/`, ''),
    3600 // 1 hour expiry
  );
  
  return {
    ...exportRecord,
    downloadUrl,
  };
};

/**
 * Convert draft content to export-friendly format
 */
const convertDraftForExport = (draft) => {
  const sections = [];
  const content = draft.content?.content || [];
  
  for (const node of content) {
    if (node.type === 'section' || node.attrs?.id) {
      sections.push({
        templateSectionId: node.attrs?.id,
        templateSectionTitle: node.attrs?.title || extractHeadingText(node),
        content: extractSectionText(node),
      });
    }
  }
  
  return {
    sections,
    references: draft.references || [],
  };
};

/**
 * Extract heading text from a section node
 */
const extractHeadingText = (node) => {
  const headingNode = node.content?.find(n => n.type === 'heading');
  if (headingNode?.content?.[0]?.text) {
    return headingNode.content[0].text;
  }
  return 'Untitled Section';
};

/**
 * Extract plain text from a section node
 */
const extractSectionText = (node) => {
  const textParts = [];
  
  const extractText = (n) => {
    if (n.type === 'text') {
      textParts.push(n.text);
    } else if (n.type === 'heading') {
      // Skip headings (we add them separately in export)
      return;
    } else if (n.content) {
      n.content.forEach(extractText);
      // Add paragraph breaks
      if (n.type === 'paragraph') {
        textParts.push('\n\n');
      }
    }
  };
  
  if (node.content) {
    node.content.forEach(extractText);
  }
  
  return textParts.join('').trim();
};

/**
 * Generate export filename from project name
 */
const generateExportFilename = (projectName) => {
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  return `${sanitized}_${timestamp}.docx`;
};

/**
 * Get export by ID
 * 
 * @param {string} exportId - Export ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Export record
 */
export const getExportById = async (exportId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('exports')
    .select(`
      *,
      projects!inner(user_id)
    `)
    .eq('id', exportId)
    .eq('projects.user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get export: ${error.message}`);
  }
  
  return data;
};

/**
 * Get download URL for an export
 * 
 * @param {string} exportId - Export ID
 * @param {string} userId - User ID
 * @returns {Promise<string>} Signed download URL
 */
export const getExportDownloadUrl = async (exportId, userId) => {
  const exportRecord = await getExportById(exportId, userId);
  
  if (!exportRecord) {
    throw new Error('Export not found');
  }
  
  const storagePath = exportRecord.storage_path.replace(`${BUCKETS.EXPORTS}/`, '');
  
  return getSignedUrl(BUCKETS.EXPORTS, storagePath, 3600);
};

/**
 * Get all exports for a project
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<Object[]>} Export records
 */
export const getExportsByProject = async (projectId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('exports')
    .select(`
      *,
      projects!inner(user_id)
    `)
    .eq('project_id', projectId)
    .eq('projects.user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to get exports: ${error.message}`);
  }
  
  return data || [];
};

/**
 * Delete an export
 * 
 * @param {string} exportId - Export ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export const deleteExport = async (exportId, userId) => {
  const exportRecord = await getExportById(exportId, userId);
  
  if (!exportRecord) {
    return false;
  }
  
  // Delete from database
  const { error } = await supabaseAdmin
    .from('exports')
    .delete()
    .eq('id', exportId);
  
  if (error) {
    throw new Error(`Failed to delete export: ${error.message}`);
  }
  
  // Delete from storage (don't fail if storage delete fails)
  try {
    const { deleteFile } = await import('../utils/storage.js');
    const storagePath = exportRecord.storage_path.replace(`${BUCKETS.EXPORTS}/`, '');
    await deleteFile(BUCKETS.EXPORTS, storagePath);
  } catch (storageError) {
    console.error('Failed to delete export from storage:', storageError);
  }
  
  return true;
};

export default {
  exportProject,
  getExportById,
  getExportDownloadUrl,
  getExportsByProject,
  deleteExport,
};