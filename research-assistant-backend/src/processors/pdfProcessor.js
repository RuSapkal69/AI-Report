import { generateId, normalizeWhitespace } from '../utils/helpers.js';

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pdfParse = require("pdf-parse");

/**
 * Common section headers in research papers
 * Used for detecting document structure
 */
const SECTION_PATTERNS = [
  { key: 'abstract', patterns: [/^abstract$/i, /^summary$/i] },
  { key: 'introduction', patterns: [/^introduction$/i, /^1\.?\s*introduction$/i, /^background$/i] },
  { key: 'literature_review', patterns: [/^literature\s*review$/i, /^related\s*work$/i, /^2\.?\s*literature/i] },
  { key: 'methods', patterns: [/^method(s|ology)?$/i, /^materials?\s*(and|&)\s*methods?$/i, /^\d\.?\s*method/i] },
  { key: 'results', patterns: [/^results?$/i, /^findings?$/i, /^\d\.?\s*results?$/i] },
  { key: 'discussion', patterns: [/^discussion$/i, /^\d\.?\s*discussion$/i] },
  { key: 'conclusion', patterns: [/^conclusions?$/i, /^concluding\s*remarks?$/i, /^\d\.?\s*conclusions?$/i] },
  { key: 'references', patterns: [/^references?$/i, /^bibliography$/i, /^works?\s*cited$/i] },
  { key: 'appendix', patterns: [/^appendix/i, /^appendices$/i, /^supplementary/i] },
];

/**
 * Detect which section a heading belongs to
 */
const detectSectionType = (text) => {
  const normalized = text.trim();
  
  for (const section of SECTION_PATTERNS) {
    for (const pattern of section.patterns) {
      if (pattern.test(normalized)) {
        return section.key;
      }
    }
  }
  
  return null;
};

/**
 * Check if a line looks like a section heading
 * Headings are typically short, may be numbered, and in title case
 */
const isLikelyHeading = (line) => {
  const trimmed = line.trim();
  
  // Too long to be a heading
  if (trimmed.length > 100) return false;
  
  // Too short
  if (trimmed.length < 3) return false;
  
  // Numbered heading (1. Introduction, 2.1 Methods)
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(trimmed)) return true;
  
  // All caps heading
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) return true;
  
  // Known section pattern
  if (detectSectionType(trimmed)) return true;
  
  return false;
};

/**
 * Extract tables from text based on patterns
 * Looks for "Table X:" or "Table X." patterns and captures nearby text
 */
const extractTables = (text, pageNum) => {
  const tables = [];
  const tablePattern = /Table\s+(\d+)[.:]?\s*([^\n]+)?/gi;
  
  let match;
  while ((match = tablePattern.exec(text)) !== null) {
    const tableNum = match[1];
    const caption = match[2] ? match[2].trim() : `Table ${tableNum}`;
    
    // Extract some context around the table mention
    const startIndex = Math.max(0, match.index - 100);
    const endIndex = Math.min(text.length, match.index + 500);
    const context = text.substring(startIndex, endIndex);
    
    tables.push({
      id: generateId(),
      tableNumber: parseInt(tableNum, 10),
      caption: normalizeWhitespace(caption),
      content: normalizeWhitespace(context),
      pageNum,
    });
  }
  
  return tables;
};

/**
 * Extract figure references from text
 */
const extractFigures = (text, pageNum) => {
  const figures = [];
  const figurePattern = /(?:Figure|Fig\.?)\s+(\d+)[.:]?\s*([^\n]+)?/gi;
  
  let match;
  while ((match = figurePattern.exec(text)) !== null) {
    const figNum = match[1];
    const caption = match[2] ? match[2].trim() : `Figure ${figNum}`;
    
    figures.push({
      id: generateId(),
      figureNumber: parseInt(figNum, 10),
      caption: normalizeWhitespace(caption),
      pageNum,
      // Note: actual image extraction would require pdfjs-dist
      // For MVP, we just capture the caption/reference
      imageRef: null,
    });
  }
  
  return figures;
};

/**
 * Extract equations from text
 * Looks for "Equation X" patterns and common math notations
 */
const extractEquations = (text, pageNum) => {
  const equations = [];
  const equationPattern = /(?:Equation|Eq\.?)\s+(\d+)[.:]?\s*([^\n]+)?/gi;
  
  let match;
  while ((match = equationPattern.exec(text)) !== null) {
    const eqNum = match[1];
    const content = match[2] ? match[2].trim() : '';
    
    equations.push({
      id: generateId(),
      equationNumber: parseInt(eqNum, 10),
      content: normalizeWhitespace(content),
      pageNum,
    });
  }
  
  return equations;
};

/**
 * Parse text into sections based on detected headings
 */
const parseIntoSections = (fullText) => {
  const lines = fullText.split('\n');
  const sections = {};
  
  let currentSection = 'preamble';
  let currentContent = [];
  
  for (const line of lines) {
    if (isLikelyHeading(line)) {
      // Save previous section
      if (currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
          if (!sections[currentSection]) {
            sections[currentSection] = { text: '', headings: [] };
          }
          sections[currentSection].text += content + '\n';
        }
      }
      
      // Detect new section type
      const sectionType = detectSectionType(line);
      if (sectionType) {
        currentSection = sectionType;
        if (!sections[currentSection]) {
          sections[currentSection] = { text: '', headings: [] };
        }
        sections[currentSection].headings.push(line.trim());
      }
      
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content) {
      if (!sections[currentSection]) {
        sections[currentSection] = { text: '', headings: [] };
      }
      sections[currentSection].text += content;
    }
  }
  
  // Clean up sections
  const cleanedSections = {};
  for (const [key, value] of Object.entries(sections)) {
    if (value.text.trim()) {
      cleanedSections[key] = {
        text: normalizeWhitespace(value.text),
        headings: value.headings,
      };
    }
  }
  
  return cleanedSections;
};

/**
 * Main PDF processing function
 * 
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<Object>} Extracted content structure
 */
export const processPdf = async (pdfBuffer) => {
  const warnings = [];
  
  try {
    // Parse PDF
    const data = await pdfParse(pdfBuffer, {
      // Options for pdf-parse
      max: 0, // No page limit
    });
    
    if (!data.text || data.text.trim().length === 0) {
      warnings.push('No text could be extracted from this PDF. It may be scanned or image-based.');
      return {
        success: false,
        warnings,
        extractedContent: {
          fullText: '',
          pageCount: data.numpages || 0,
          sections: {},
          tables: [],
          figures: [],
          equations: [],
        },
      };
    }
    
    const fullText = data.text;
    const pageCount = data.numpages || 0;
    
    // Extract structured content
    const sections = parseIntoSections(fullText);
    const tables = extractTables(fullText, 0); // Page 0 = unknown specific page
    const figures = extractFigures(fullText, 0);
    const equations = extractEquations(fullText, 0);
    
    // Add warnings for potential issues
    if (Object.keys(sections).length <= 1) {
      warnings.push('Could not detect clear section structure. Content may need manual organization.');
    }
    
    if (fullText.length < 1000) {
      warnings.push('Extracted text is very short. Some content may not have been extracted.');
    }
    
    // Check for common OCR artifacts
    if (/[^\x00-\x7F]{10,}/.test(fullText)) {
      warnings.push('Text may contain encoding issues or OCR artifacts.');
    }
    
    return {
      success: true,
      warnings,
      extractedContent: {
        fullText: normalizeWhitespace(fullText),
        pageCount,
        sections,
        tables,
        figures,
        equations,
        metadata: {
          info: data.info || {},
          // PDF metadata if available
          title: data.info?.Title || null,
          author: data.info?.Author || null,
          creationDate: data.info?.CreationDate || null,
        },
      },
    };
    
  } catch (error) {
    console.error('PDF processing error:', error);
    warnings.push(`PDF processing failed: ${error.message}`);
    
    return {
      success: false,
      warnings,
      extractedContent: {
        fullText: '',
        pageCount: 0,
        sections: {},
        tables: [],
        figures: [],
        equations: [],
      },
    };
  }
};

/**
 * Extract just the text from a PDF (simplified version)
 * Useful when you only need raw text without structure
 */
export const extractPdfText = async (pdfBuffer) => {
  try {
    const data = await pdfParse(pdfBuffer);
    return {
      success: true,
      text: data.text || '',
      pageCount: data.numpages || 0,
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      pageCount: 0,
      error: error.message,
    };
  }
};

export default {
  processPdf,
  extractPdfText,
  detectSectionType,
  isLikelyHeading,
};