import { EventEmitter } from 'events';
import { generateContent, generateSection } from '../ai/geminiClient.js';
import {
  buildSectionRewritePrompt,
  buildMultiDocumentSynthesisPrompt,
  buildComparativeAnalysisPrompt,
  truncateForContext,
} from '../ai/promptBuilder.js';
import { parseSectionContent, parseMultiDocResponse, formatForStorage } from '../ai/responseParser.js';
import { updateProjectStatus } from './projectService.js';
import { createDraft, updateDraftSection } from './draftService.js';

/**
 * Generation event emitter
 * Emits: 'progress', 'section-complete', 'error', 'complete'
 */
export const generationEvents = new EventEmitter();

/**
 * Generate content for a project
 * This is the main entry point for AI generation
 * 
 * @param {Object} project - Project with relations (template, documents)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Generation result
 */
export const generateProjectContent = async (project, userId) => {
  const { id: projectId, mode, purpose, template, documents, section_mapping, global_instructions } = project;
  
  // Update project status to generating
  await updateProjectStatus(projectId, 'generating', {
    totalSections: section_mapping.length,
    completedSections: 0,
    currentSection: null,
    startedAt: new Date().toISOString(),
    errors: [],
  });
  
  // Create initial draft
  const draft = await createDraft(projectId);
  
  const results = {
    draftId: draft.id,
    sections: [],
    errors: [],
    warnings: [],
  };
  
  try {
    // Process each section
    for (let i = 0; i < section_mapping.length; i++) {
      const sectionConfig = section_mapping[i];
      const sectionTitle = sectionConfig.templateSectionTitle;
      
      // Emit progress event
      generationEvents.emit('progress', {
        projectId,
        totalSections: section_mapping.length,
        completedSections: i,
        currentSection: sectionTitle,
      });
      
      // Update project progress
      await updateProjectStatus(projectId, 'generating', {
        totalSections: section_mapping.length,
        completedSections: i,
        currentSection: sectionTitle,
        errors: results.errors,
      });
      
      try {
        // Generate section content based on mode
        let sectionResult;
        
        if (mode === 'single') {
          sectionResult = await generateSingleDocSection(
            sectionConfig,
            documents[0],
            purpose,
            global_instructions
          );
        } else {
          sectionResult = await generateMultiDocSection(
            sectionConfig,
            documents,
            purpose,
            global_instructions
          );
        }
        
        // Update draft with section content
        await updateDraftSection(draft.id, {
          templateSectionId: sectionConfig.templateSectionId,
          templateSectionTitle: sectionTitle,
          content: sectionResult.content,
          sourceRefs: sectionResult.sourceRefs || [],
          warnings: sectionResult.warnings || [],
        });
        
        results.sections.push({
          sectionId: sectionConfig.templateSectionId,
          sectionTitle,
          success: sectionResult.success,
          wordCount: sectionResult.content?.split(/\s+/).length || 0,
        });
        
        // Emit section complete event
        generationEvents.emit('section-complete', {
          projectId,
          sectionId: sectionConfig.templateSectionId,
          sectionTitle,
          preview: sectionResult.content?.substring(0, 200) || '',
          success: sectionResult.success,
        });
        
        if (sectionResult.warnings?.length > 0) {
          results.warnings.push(...sectionResult.warnings.map(w => `${sectionTitle}: ${w}`));
        }
        
      } catch (sectionError) {
        console.error(`Error generating section "${sectionTitle}":`, sectionError);
        
        results.errors.push({
          section: sectionTitle,
          error: sectionError.message,
        });
        
        // Emit error event but continue with other sections
        generationEvents.emit('error', {
          projectId,
          sectionTitle,
          error: sectionError.message,
          recoverable: true,
        });
        
        // Add placeholder content to draft
        await updateDraftSection(draft.id, {
          templateSectionId: sectionConfig.templateSectionId,
          templateSectionTitle: sectionTitle,
          content: `[Generation failed: ${sectionError.message}. Please edit manually.]`,
          sourceRefs: [],
          warnings: [sectionError.message],
        });
      }
    }
    
    // Collect references from all documents
    const allReferences = collectReferences(documents);
    await updateDraftReferences(draft.id, allReferences);
    
    // Update project status to ready
    await updateProjectStatus(projectId, 'ready', {
      totalSections: section_mapping.length,
      completedSections: section_mapping.length,
      currentSection: null,
      completedAt: new Date().toISOString(),
      errors: results.errors,
    });
    
    // Emit complete event
    generationEvents.emit('complete', {
      projectId,
      draftId: draft.id,
      status: 'ready',
      sectionsGenerated: results.sections.length,
      errors: results.errors,
    });
    
    return results;
    
  } catch (error) {
    console.error('Generation failed:', error);
    
    // Update project status to error
    await updateProjectStatus(projectId, 'draft', {
      error: error.message,
      failedAt: new Date().toISOString(),
    });
    
    // Emit error event
    generationEvents.emit('error', {
      projectId,
      error: error.message,
      recoverable: false,
    });
    
    throw error;
  }
};

/**
 * Generate content for a single-document section
 */
const generateSingleDocSection = async (sectionConfig, document, purpose, globalInstructions) => {
  const { sourceMapping, instructions, targetLength, templateSectionTitle } = sectionConfig;
  
  // Get source content from document
  const sourceContent = extractSourceContent(document, sourceMapping.sourceSections);
  
  if (!sourceContent || sourceContent.trim().length < 50) {
    return {
      success: false,
      content: '[Insufficient source content for this section]',
      warnings: ['No relevant content found in source document'],
      sourceRefs: [],
    };
  }
  
  // Truncate if needed
  const { text: truncatedContent, truncated } = truncateForContext(sourceContent, 100000);
  
  // Build prompt
  const prompt = buildSectionRewritePrompt({
    sectionTitle: templateSectionTitle,
    sourceContent: truncatedContent,
    instructions,
    globalInstructions,
    targetLength,
    purpose,
    documentMetadata: document.metadata,
  });
  
  // Generate content
  const response = await generateContent(prompt);
  
  // Parse response
  const parsed = parseSectionContent(response, templateSectionTitle);
  
  return {
    success: parsed.success,
    content: parsed.content,
    warnings: [
      ...(parsed.warnings || []),
      ...(truncated ? ['Source content was truncated due to length'] : []),
    ],
    sourceRefs: [{
      documentId: document.id,
      sections: sourceMapping.sourceSections,
    }],
  };
};

/**
 * Generate content for a multi-document section
 */
const generateMultiDocSection = async (sectionConfig, documents, purpose, globalInstructions) => {
  const { sourceMapping, instructions, targetLength, templateSectionTitle } = sectionConfig;
  
  // Determine which documents to use
  const docsToUse = sourceMapping.sourceDocuments.includes('all')
    ? documents
    : documents.filter(d => sourceMapping.sourceDocuments.includes(d.id));
  
  // Build document content array
  const docContents = docsToUse.map(doc => {
    const content = extractSourceContent(doc, sourceMapping.sourceSections);
    return {
      title: doc.metadata?.title || doc.filename,
      authors: doc.metadata?.authors || [],
      content: content || '',
    };
  }).filter(d => d.content.length > 50);
  
  if (docContents.length === 0) {
    return {
      success: false,
      content: '[Insufficient source content across documents]',
      warnings: ['No relevant content found in source documents'],
      sourceRefs: [],
    };
  }
  
  // Choose prompt type based on purpose
  let prompt;
  
  if (purpose === 'comparative') {
    prompt = buildComparativeAnalysisPrompt({
      sectionTitle: templateSectionTitle,
      documents: docContents,
      instructions,
      globalInstructions,
    });
  } else {
    prompt = buildMultiDocumentSynthesisPrompt({
      sectionTitle: templateSectionTitle,
      documents: docContents,
      instructions,
      globalInstructions,
      targetLength,
      purpose,
    });
  }
  
  // Generate content
  const response = await generateContent(prompt);
  
  // Parse response
  const parsed = parseMultiDocResponse(response, docContents.length);
  
  return {
    success: parsed.success !== false,
    content: parsed.content,
    warnings: parsed.warnings || [],
    sourceRefs: docsToUse.map(doc => ({
      documentId: doc.id,
      sections: sourceMapping.sourceSections,
    })),
  };
};

/**
 * Extract content from document based on section keys
 */
const extractSourceContent = (document, sectionKeys) => {
  const sections = document.extracted_content?.sections || {};
  
  if (!sectionKeys || sectionKeys.length === 0) {
    // Return all content if no specific sections requested
    return document.extracted_content?.fullText || '';
  }
  
  // Collect content from requested sections
  const contents = [];
  
  for (const key of sectionKeys) {
    if (sections[key]?.text) {
      contents.push(sections[key].text);
    }
  }
  
  // If no matching sections, return full text
  if (contents.length === 0) {
    return document.extracted_content?.fullText || '';
  }
  
  return contents.join('\n\n');
};

/**
 * Collect all references from documents
 */
const collectReferences = (documents) => {
  const allRefs = [];
  let refIndex = 1;
  
  for (const doc of documents) {
    const docRefs = doc.references || [];
    
    for (const ref of docRefs) {
      allRefs.push({
        id: `ref_${refIndex}`,
        index: refIndex,
        sourceDocumentId: doc.id,
        sourceRefId: ref.id,
        authors: ref.authors,
        title: ref.title,
        year: ref.year,
        journal: ref.journal,
        doi: ref.doi,
        formatted: ref.rawText || formatReference(ref),
      });
      refIndex++;
    }
  }
  
  return allRefs;
};

/**
 * Format a reference object to citation string
 */
const formatReference = (ref) => {
  const authors = ref.authors?.join(', ') || 'Unknown';
  const year = ref.year || 'n.d.';
  const title = ref.title || 'Untitled';
  const journal = ref.journal ? `. ${ref.journal}` : '';
  
  return `${authors} (${year}). ${title}${journal}.`;
};

/**
 * Update draft references (helper)
 */
const updateDraftReferences = async (draftId, references) => {
  const { supabaseAdmin } = await import('../config/supabase.js');
  
  await supabaseAdmin
    .from('drafts')
    .update({ references })
    .eq('id', draftId);
};

export default {
  generateProjectContent,
  generationEvents,
};