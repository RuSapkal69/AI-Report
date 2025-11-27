import { supabaseAdmin } from '../config/supabase.js';
import { generateId } from '../utils/helpers.js';
import { getDocumentsByIds } from './documentService.js';
import { getTemplateById, buildDefaultSectionMapping } from './templateService.js';

/**
 * Create a new project
 * 
 * @param {string} userId - User ID
 * @param {Object} projectData - Project configuration
 * @returns {Promise<Object>} Created project
 */
export const createProject = async (userId, projectData) => {
  const {
    name,
    mode,
    purpose,
    templateId,
    sourceDocumentIds,
    sectionMapping = null,
    globalInstructions = '',
  } = projectData;
  
  const projectId = generateId();
  
  // Validate template exists and belongs to user
  const template = await getTemplateById(templateId, userId);
  if (!template) {
    throw new Error('Template not found');
  }
  
  // Validate documents exist and belong to user
  const documents = await getDocumentsByIds(sourceDocumentIds, userId);
  if (documents.length !== sourceDocumentIds.length) {
    throw new Error('One or more documents not found');
  }
  
  // Check all documents are ready
  const notReady = documents.filter(d => d.status !== 'ready' && d.status !== 'partial');
  if (notReady.length > 0) {
    throw new Error(`Documents still processing: ${notReady.map(d => d.filename).join(', ')}`);
  }
  
  // Build default section mapping if not provided
  const finalMapping = sectionMapping || buildDefaultSectionMapping(template, documents);
  
  // Create project
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      id: projectId,
      user_id: userId,
      name,
      mode,
      purpose,
      template_id: templateId,
      source_document_ids: sourceDocumentIds,
      document_order: sourceDocumentIds,
      section_mapping: finalMapping,
      global_instructions: globalInstructions,
      status: 'draft',
      generation_progress: {},
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }
  
  return project;
};

/**
 * Get project by ID
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Project or null
 */
export const getProjectById = async (projectId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get project: ${error.message}`);
  }
  
  return data;
};

/**
 * Get project with related data (template, documents)
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Project with relations
 */
export const getProjectWithRelations = async (projectId, userId) => {
  const project = await getProjectById(projectId, userId);
  
  if (!project) return null;
  
  // Get template
  const template = await getTemplateById(project.template_id, userId);
  
  // Get documents
  const documents = await getDocumentsByIds(project.source_document_ids, userId);
  
  // Order documents according to project order
  const orderedDocuments = project.document_order.map(
    docId => documents.find(d => d.id === docId)
  ).filter(Boolean);
  
  return {
    ...project,
    template,
    documents: orderedDocuments,
  };
};

/**
 * Get all projects for a user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<{ projects: Object[], total: number }>}
 */
export const getProjectsByUser = async (userId, options = {}) => {
  const { page = 1, limit = 20, status = null } = options;
  const offset = (page - 1) * limit;
  
  let query = supabaseAdmin
    .from('projects')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error, count } = await query;
  
  if (error) {
    throw new Error(`Failed to get projects: ${error.message}`);
  }
  
  return {
    projects: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
};

/**
 * Update project
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated project
 */
export const updateProject = async (projectId, userId, updates) => {
  // Only allow updating certain fields
  const allowedFields = [
    'name',
    'section_mapping',
    'global_instructions',
    'document_order',
  ];
  
  const filteredUpdates = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }
  
  if (Object.keys(filteredUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(filteredUpdates)
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update project: ${error.message}`);
  }
  
  return data;
};

/**
 * Update project status
 * 
 * @param {string} projectId - Project ID
 * @param {string} status - New status
 * @param {Object} progressData - Optional progress data
 */
export const updateProjectStatus = async (projectId, status, progressData = null) => {
  const updates = { status };
  
  if (progressData) {
    updates.generation_progress = progressData;
  }
  
  const { error } = await supabaseAdmin
    .from('projects')
    .update(updates)
    .eq('id', projectId);
  
  if (error) {
    throw new Error(`Failed to update project status: ${error.message}`);
  }
};

/**
 * Delete a project
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export const deleteProject = async (projectId, userId) => {
  const project = await getProjectById(projectId, userId);
  
  if (!project) {
    return false;
  }
  
  // Delete project (cascades to drafts and exports via FK)
  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`);
  }
  
  return true;
};

/**
 * Check if project is ready for generation
 * 
 * @param {string} projectId - Project ID
 * @param {string} userId - User ID
 * @returns {Promise<{ ready: boolean, issues: string[] }>}
 */
export const checkGenerationReadiness = async (projectId, userId) => {
  const issues = [];
  
  const project = await getProjectWithRelations(projectId, userId);
  
  if (!project) {
    return { ready: false, issues: ['Project not found'] };
  }
  
  if (project.status === 'generating') {
    issues.push('Generation already in progress');
  }
  
  if (!project.template) {
    issues.push('Template not found');
  }
  
  if (!project.documents || project.documents.length === 0) {
    issues.push('No source documents');
  }
  
  // Check documents are processed
  const unprocessedDocs = project.documents?.filter(
    d => d.status !== 'ready' && d.status !== 'partial'
  ) || [];
  
  if (unprocessedDocs.length > 0) {
    issues.push(`Documents still processing: ${unprocessedDocs.map(d => d.filename).join(', ')}`);
  }
  
  // Check section mapping
  if (!project.section_mapping || project.section_mapping.length === 0) {
    issues.push('No section mapping configured');
  }
  
  return {
    ready: issues.length === 0,
    issues,
    project: issues.length === 0 ? project : null,
  };
};

/**
 * Get project summary for listing
 */
export const getProjectSummary = async (projectId, userId) => {
  const project = await getProjectById(projectId, userId);
  
  if (!project) return null;
  
  return {
    id: project.id,
    name: project.name,
    mode: project.mode,
    purpose: project.purpose,
    status: project.status,
    documentCount: project.source_document_ids?.length || 0,
    sectionCount: project.section_mapping?.length || 0,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    generationProgress: project.generation_progress,
  };
};

export default {
  createProject,
  getProjectById,
  getProjectWithRelations,
  getProjectsByUser,
  updateProject,
  updateProjectStatus,
  deleteProject,
  checkGenerationReadiness,
  getProjectSummary,
};