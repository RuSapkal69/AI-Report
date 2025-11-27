import mammoth from 'mammoth';
import { generateId } from '../utils/helpers.js';

/**
 * Placeholder pattern: {{PLACEHOLDER_NAME}}
 */
const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * Extract placeholders from text
 */
const extractPlaceholders = (text) => {
  const placeholders = [];
  let match;
  
  while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
    placeholders.push({
      full: match[0],
      name: match[1],
      index: match.index,
    });
  }
  
  return placeholders;
};

/**
 * Determine heading level from style name
 * "Heading 1" → 1, "Heading 2" → 2, etc.
 */
const getHeadingLevel = (styleName) => {
  if (!styleName) return null;
  
  const match = styleName.match(/Heading\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Check for Title style (treat as level 0 or 1)
  if (/^title$/i.test(styleName)) {
    return 1;
  }
  
  return null;
};

/**
 * Parse DOCX template to extract structure
 * 
 * @param {Buffer} docxBuffer - DOCX file as buffer
 * @returns {Promise<Object>} Parsed template structure
 */
export const parseDocxTemplate = async (docxBuffer) => {
  const warnings = [];
  const structure = [];
  
  try {
    // Extract raw text with style information
    const result = await mammoth.convertToHtml(docxBuffer, {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Title'] => h1.title:fresh",
      ],
    });
    
    const html = result.value;
    
    // Also get plain text for placeholder detection
    const textResult = await mammoth.extractRawText(docxBuffer);
    const plainText = textResult.value;
    
    // Parse HTML to extract headings
    const headingPattern = /<h(\d)[^>]*(?:class="([^"]*)")?[^>]*>([^<]+)<\/h\d>/gi;
    let match;
    let order = 1;
    
    while ((match = headingPattern.exec(html)) !== null) {
      const level = parseInt(match[1], 10);
      const className = match[2] || '';
      const title = match[3].trim();
      
      // Check if title contains a placeholder
      const placeholders = extractPlaceholders(title);
      const placeholder = placeholders.length > 0 ? placeholders[0].name : null;
      
      structure.push({
        id: generateId(),
        level,
        title,
        placeholder,
        order: order++,
        isTitle: className.includes('title'),
      });
    }
    
    // If no headings found via HTML, try to detect from plain text
    if (structure.length === 0) {
      warnings.push('No heading styles detected. Using text pattern detection.');
      
      const lines = plainText.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip very long lines (unlikely to be headings)
        if (trimmed.length > 100) continue;
        
        // Check for placeholders
        const placeholders = extractPlaceholders(trimmed);
        if (placeholders.length > 0) {
          structure.push({
            id: generateId(),
            level: 1,
            title: trimmed,
            placeholder: placeholders[0].name,
            order: order++,
            isTitle: false,
          });
          continue;
        }
        
        // Check for numbered headings (1. Introduction, 2.1 Methods)
        if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(trimmed)) {
          const dotCount = (trimmed.match(/\./g) || []).length;
          const level = Math.min(dotCount + 1, 4);
          
          structure.push({
            id: generateId(),
            level,
            title: trimmed,
            placeholder: null,
            order: order++,
            isTitle: false,
          });
        }
      }
    }
    
    // Build parent-child relationships
    const structureWithParents = buildHierarchy(structure);
    
    // Collect mammoth warnings
    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        if (msg.type === 'warning') {
          warnings.push(msg.message);
        }
      }
    }
    
    // Warn if structure is very simple
    if (structure.length < 2) {
      warnings.push('Template has very few sections. Consider adding more heading structure.');
    }
    
    return {
      success: true,
      warnings,
      structure: structureWithParents,
      plainText,
      htmlPreview: html,
    };
    
  } catch (error) {
    console.error('DOCX parsing error:', error);
    warnings.push(`Failed to parse template: ${error.message}`);
    
    return {
      success: false,
      warnings,
      structure: [],
      plainText: '',
      htmlPreview: '',
    };
  }
};

/**
 * Build parent-child hierarchy from flat heading list
 */
const buildHierarchy = (flatStructure) => {
  const result = [];
  const stack = []; // Stack of {level, id} to track parents
  
  for (const section of flatStructure) {
    // Pop items from stack until we find a parent (lower level)
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }
    
    // Set parent ID
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
    
    result.push({
      ...section,
      parentId,
    });
    
    // Push current section to stack
    stack.push({ level: section.level, id: section.id });
  }
  
  return result;
};

/**
 * Extract style information from DOCX
 * Note: This is limited with mammoth - for full style extraction,
 * we'd need to parse the DOCX XML directly
 */
export const extractDocxStyles = async (docxBuffer) => {
  // Mammoth doesn't provide direct style access
  // This is a placeholder for future enhancement
  // Could use 'docx' library or direct XML parsing
  
  return {
    headings: {},
    body: {
      font: 'Times New Roman', // Default assumptions
      size: 12,
    },
    margins: {
      top: 1,
      bottom: 1,
      left: 1.25,
      right: 1.25,
      unit: 'inches',
    },
  };
};

/**
 * Validate that a DOCX file is a valid template
 */
export const validateTemplate = async (docxBuffer) => {
  const errors = [];
  
  try {
    const result = await parseDocxTemplate(docxBuffer);
    
    if (!result.success) {
      errors.push('Could not parse the DOCX file');
      return { valid: false, errors };
    }
    
    if (result.structure.length === 0) {
      errors.push('No sections detected in template. Add headings or placeholders.');
    }
    
    // Check for duplicate placeholders
    const placeholders = result.structure
      .filter(s => s.placeholder)
      .map(s => s.placeholder);
    
    const duplicates = placeholders.filter(
      (p, i) => placeholders.indexOf(p) !== i
    );
    
    if (duplicates.length > 0) {
      errors.push(`Duplicate placeholders found: ${[...new Set(duplicates)].join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      structure: result.structure,
      warnings: result.warnings,
    };
    
  } catch (error) {
    errors.push(`Validation failed: ${error.message}`);
    return { valid: false, errors };
  }
};

export default {
  parseDocxTemplate,
  extractDocxStyles,
  validateTemplate,
  extractPlaceholders,
};