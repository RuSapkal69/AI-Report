import { supabaseAdmin } from '../config/supabase.js';
import { uploadTemplate, deleteFile, BUCKETS } from '../utils/storage.js';
import { generateId } from '../utils/helpers.js';
import { parseDocxTemplate, extractDocxStyles, validateTemplate } from '../processors/docxParser.js';

/**
 * Upload and process a new DOCX template
 * 
 * @param {string} userId - User ID
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} Created template record
 */
export const createTemplate = async (userId, file) => {
  const templateId = generateId();
  
  // 1. Validate template first
  const validation = await validateTemplate(file.buffer);
  
  if (!validation.valid) {
    throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
  }
  
  // 2. Parse template structure
  const parseResult = await parseDocxTemplate(file.buffer);
  
  if (!parseResult.success) {
    throw new Error('Failed to parse template structure');
  }
  
  // 3. Extract style information
  const styles = await extractDocxStyles(file.buffer);
  
  // 4. Upload to storage
  const { storagePath } = await uploadTemplate(userId, file.originalname, file.buffer);
  
  // 5. Create database record
  const { data: template, error } = await supabaseAdmin
    .from('templates')
    .insert({
      id: templateId,
      user_id: userId,
      filename: file.originalname,
      storage_path: storagePath,
      structure: parseResult.structure,
      detected_styles: styles,
    })
    .select()
    .single();
  
  if (error) {
    // Clean up storage if DB insert fails
    await deleteFile(BUCKETS.TEMPLATES, storagePath).catch(console.error);
    throw new Error(`Failed to create template: ${error.message}`);
  }
  
  return {
    ...template,
    warnings: parseResult.warnings,
  };
};

/**
 * Get template by ID
 * 
 * @param {string} templateId - Template ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Template or null
 */
export const getTemplateById = async (templateId, userId) => {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get template: ${error.message}`);
  }
  
  return data;
};

/**
 * Get all templates for a user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<{ templates: Object[], total: number }>}
 */
export const getTemplatesByUser = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;
  
  const { data, error, count } = await supabaseAdmin
    .from('templates')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    throw new Error(`Failed to get templates: ${error.message}`);
  }
  
  return {
    templates: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
};

/**
 * Get template structure (sections/placeholders)
 * 
 * @param {string} templateId - Template ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Template structure
 */
export const getTemplateStructure = async (templateId, userId) => {
  const template = await getTemplateById(templateId, userId);
  
  if (!template) return null;
  
  return {
    id: template.id,
    filename: template.filename,
    structure: template.structure,
    styles: template.detected_styles,
    sectionCount: template.structure?.length || 0,
    placeholders: template.structure
      ?.filter(s => s.placeholder)
      .map(s => s.placeholder) || [],
  };
};

/**
 * Delete a template
 * 
 * @param {string} templateId - Template ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success
 */
export const deleteTemplate = async (templateId, userId) => {
  // Check if template is used by any projects
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('template_id', templateId)
    .eq('user_id', userId)
    .limit(1);
  
  if (projects && projects.length > 0) {
    throw new Error('Cannot delete template: it is used by one or more projects');
  }
  
  // Get template for storage path
  const template = await getTemplateById(templateId, userId);
  
  if (!template) {
    return false;
  }
  
  // Delete from database
  const { error } = await supabaseAdmin
    .from('templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`);
  }
  
  // Delete from storage
  try {
    const storagePath = template.storage_path.replace(`${BUCKETS.TEMPLATES}/`, '');
    await deleteFile(BUCKETS.TEMPLATES, storagePath);
  } catch (storageError) {
    console.error('Failed to delete template from storage:', storageError);
  }
  
  return true;
};

/**
 * Build default section mapping from template structure and source documents
 * Creates initial mapping suggestions for user to review
 * 
 * @param {Object} template - Template object with structure
 * @param {Object[]} documents - Source documents with extracted content
 * @returns {Object[]} Suggested section mapping
 */
export const buildDefaultSectionMapping = (template, documents) => {
  const mapping = [];
  
  // Standard section name mappings
  const sectionAliases = {
    introduction: ['introduction', 'background', 'overview', 'preamble'],
    literature_review: ['literature', 'related work', 'prior work', 'background'],
    methods: ['method', 'methodology', 'materials', 'approach', 'procedure'],
    results: ['result', 'finding', 'outcome', 'analysis'],
    discussion: ['discussion', 'interpretation', 'implications'],
    conclusion: ['conclusion', 'summary', 'concluding'],
  };
  
  // Get all available source sections
  const availableSections = new Set();
  for (const doc of documents) {
    const sections = doc.extracted_content?.sections || {};
    Object.keys(sections).forEach(key => availableSections.add(key));
  }
  
  // Map each template section
  for (const templateSection of template.structure) {
    const sectionName = templateSection.title.toLowerCase();
    const placeholder = templateSection.placeholder?.toLowerCase();
    
    // Try to find matching source section
    let matchedSourceSection = null;
    
    for (const [key, aliases] of Object.entries(sectionAliases)) {
      const allAliases = [key, ...aliases];
      
      if (allAliases.some(alias => 
        sectionName.includes(alias) || 
        placeholder?.includes(alias)
      )) {
        // Check if this section exists in source documents
        if (availableSections.has(key)) {
          matchedSourceSection = key;
          break;
        }
      }
    }
    
    mapping.push({
      templateSectionId: templateSection.id,
      templateSectionTitle: templateSection.title,
      sourceMapping: {
        type: matchedSourceSection ? 'auto' : 'manual',
        sourceSections: matchedSourceSection ? [matchedSourceSection] : [],
        sourceDocuments: ['all'],
      },
      instructions: '',
      targetLength: 'medium',
    });
  }
  
  return mapping;
};

export default {
  createTemplate,
  getTemplateById,
  getTemplatesByUser,
  getTemplateStructure,
  deleteTemplate,
  buildDefaultSectionMapping,
};