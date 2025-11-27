import { supabaseAdmin } from '../config/supabase.js';
import { generateId } from '../utils/helpers.js';

/**
 * Create a new draft for a project
 * 
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>} Created draft
 */
export const createDraft = async (projectId) => {
  const draftId = generateId();
  
  // Check for existing draft
  const { data: existingDraft } = await supabaseAdmin
    .from('drafts')
    .select('id, version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  const version = existingDraft ? existingDraft.version + 1 : 1;
  
  const { data: draft, error } = await supabaseAdmin
    .from('drafts')
    .insert({
      id: draftId,
      project_id: projectId,
      version,
      content: {
        type: 'doc',
        content: [],
      },
      section_sources: {},
      references: [],
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create draft: ${error.message}`);
  }
  
  return draft;
};

/**
 * Get current draft for a project
 * 
 * @param {string} projectId - Project ID
 * @returns {Promise<Object|null>} Draft or null
 */
export const getDraftByProject = async (projectId) => {
  const { data, error } = await supabaseAdmin
    .from('drafts')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get draft: ${error.message}`);
  }
  
  return data;
};

/**
 * Get draft by ID
 * 
 * @param {string} draftId - Draft ID
 * @returns {Promise<Object|null>} Draft or null
 */
export const getDraftById = async (draftId) => {
  const { data, error } = await supabaseAdmin
    .from('drafts')
    .select('*')
    .eq('id', draftId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get draft: ${error.message}`);
  }
  
  return data;
};

/**
 * Update a specific section in the draft
 * Called during generation as each section completes
 * 
 * @param {string} draftId - Draft ID
 * @param {Object} sectionData - Section to add/update
 */
export const updateDraftSection = async (draftId, sectionData) => {
  const { templateSectionId, templateSectionTitle, content, sourceRefs, warnings } = sectionData;
  
  // Get current draft
  const draft = await getDraftById(draftId);
  
  if (!draft) {
    throw new Error('Draft not found');
  }
  
  // Build new section node for ProseMirror-compatible structure
  const sectionNode = {
    type: 'section',
    attrs: {
      id: templateSectionId,
      title: templateSectionTitle,
    },
    content: [
      {
        type: 'heading',
        attrs: { level: 1, id: templateSectionId },
        content: [{ type: 'text', text: templateSectionTitle }],
      },
      ...convertContentToProseMirror(content),
    ],
  };
  
  // Update content array
  const currentContent = draft.content?.content || [];
  
  // Find if section already exists
  const existingIndex = currentContent.findIndex(
    node => node.attrs?.id === templateSectionId
  );
  
  let newContent;
  if (existingIndex >= 0) {
    // Replace existing section
    newContent = [...currentContent];
    newContent[existingIndex] = sectionNode;
  } else {
    // Add new section
    newContent = [...currentContent, sectionNode];
  }
  
  // Update section sources
  const sectionSources = {
    ...draft.section_sources,
    [templateSectionId]: {
      sourceDocuments: sourceRefs?.map(r => r.documentId) || [],
      sourceSections: sourceRefs?.flatMap(r => r.sections) || [],
      aiGenerated: true,
      warnings: warnings || [],
      generatedAt: new Date().toISOString(),
    },
  };
  
  // Save update
  const { error } = await supabaseAdmin
    .from('drafts')
    .update({
      content: {
        type: 'doc',
        content: newContent,
      },
      section_sources: sectionSources,
    })
    .eq('id', draftId);
  
  if (error) {
    throw new Error(`Failed to update draft section: ${error.message}`);
  }
};

/**
 * Convert plain text content to ProseMirror-compatible structure
 */
const convertContentToProseMirror = (content) => {
  if (!content) return [];
  
  const nodes = [];
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  
  for (const para of paragraphs) {
    // Check if it's a table (contains | characters on multiple lines)
    if (para.includes('|') && para.split('\n').length > 1) {
      nodes.push({
        type: 'table',
        attrs: {},
        content: parseMarkdownTableToNodes(para),
      });
      continue;
    }
    
    // Check if it's a list
    if (/^[-*]\s/m.test(para) || /^\d+\.\s/m.test(para)) {
      const listItems = para.split('\n').filter(line => line.trim());
      const isOrdered = /^\d+\.\s/.test(listItems[0]);
      
      nodes.push({
        type: isOrdered ? 'orderedList' : 'bulletList',
        content: listItems.map(item => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: item.replace(/^[-*\d.]\s*/, '').trim() }],
          }],
        })),
      });
      continue;
    }
    
    // Regular paragraph
    nodes.push({
      type: 'paragraph',
      content: parseInlineFormatting(para.trim()),
    });
  }
  
  return nodes;
};

/**
 * Parse inline formatting (**bold**, *italic*)
 */
const parseInlineFormatting = (text) => {
  const nodes = [];
  let remaining = text;
  let lastIndex = 0;
  
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.substring(lastIndex, match.index) });
    }
    
    // Add formatted text
    if (match[2]) {
      // Bold
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] });
    } else if (match[3]) {
      // Italic
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.substring(lastIndex) });
  }
  
  // If no formatting found
  if (nodes.length === 0) {
    nodes.push({ type: 'text', text });
  }
  
  return nodes;
};

/**
 * Parse markdown table to ProseMirror table nodes
 */
const parseMarkdownTableToNodes = (tableText) => {
  const lines = tableText.trim().split('\n').filter(line => line.trim());
  const rows = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Skip separator line
    if (lines[i].includes('---')) continue;
    
    const cells = lines[i]
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell);
    
    const isHeader = i === 0;
    
    rows.push({
      type: 'tableRow',
      content: cells.map(cell => ({
        type: isHeader ? 'tableHeader' : 'tableCell',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: cell }],
        }],
      })),
    });
  }
  
  return rows;
};

/**
 * Save editor content (from frontend)
 * 
 * @param {string} projectId - Project ID
 * @param {Object} content - ProseMirror document JSON
 * @returns {Promise<Object>} Updated draft
 */
export const saveDraftContent = async (projectId, content) => {
  const draft = await getDraftByProject(projectId);
  
  if (!draft) {
    throw new Error('No draft found for this project');
  }
  
  const { data, error } = await supabaseAdmin
    .from('drafts')
    .update({
      content,
      // Mark sections as manually edited
      section_sources: markSectionsAsEdited(draft.section_sources),
    })
    .eq('id', draft.id)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to save draft: ${error.message}`);
  }
  
  return data;
};

/**
 * Mark all sections as manually edited
 */
const markSectionsAsEdited = (sectionSources) => {
  const updated = {};
  
  for (const [key, value] of Object.entries(sectionSources || {})) {
    updated[key] = {
      ...value,
      manuallyEdited: true,
      lastEditedAt: new Date().toISOString(),
    };
  }
  
  return updated;
};

/**
 * Get draft content for editor
 */
export const getDraftContent = async (projectId) => {
  const draft = await getDraftByProject(projectId);
  
  if (!draft) return null;
  
  return {
    id: draft.id,
    version: draft.version,
    content: draft.content,
    sectionSources: draft.section_sources,
    references: draft.references,
    updatedAt: draft.updated_at,
  };
};

export default {
  createDraft,
  getDraftByProject,
  getDraftById,
  updateDraftSection,
  saveDraftContent,
  getDraftContent,
};