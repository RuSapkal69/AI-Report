import { safeJsonParse, normalizeWhitespace } from '../utils/helpers.js';

/**
 * Patterns that might indicate AI hallucination or uncertainty
 */
const HALLUCINATION_MARKERS = [
  /I don't have (access to|information about)/i,
  /I cannot (find|locate|access)/i,
  /there is no (information|data|content)/i,
  /I would need more (information|context|data)/i,
  /I'm not (sure|certain|able to confirm)/i,
  /this (may|might|could) not be accurate/i,
  /I cannot verify/i,
  /hypothetically/i,
  /I assume/i,
  /let me (imagine|suppose|assume)/i,
];

/**
 * Patterns indicating the AI couldn't complete the task
 */
const FAILURE_MARKERS = [
  /insufficient source content/i,
  /no relevant (content|information) found/i,
  /unable to (generate|create|write)/i,
  /content not available/i,
];

/**
 * Clean up AI-generated text
 * Removes common artifacts and normalizes formatting
 */
export const cleanGeneratedText = (text) => {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove markdown code block wrappers if present
  cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  
  // Remove "Here is the..." preambles
  cleaned = cleaned.replace(/^(Here is|Here's|Below is|The following is)[^:]*:\s*/i, '');
  
  // Remove section heading if AI included it
  // (We add our own headings in the document)
  cleaned = cleaned.replace(/^#+\s*[\w\s]+\n+/, '');
  
  // Remove trailing explanations
  cleaned = cleaned.replace(/\n+(Note:|Please note:|I hope|Let me know|Is there anything)[^]*$/i, '');
  
  // Normalize whitespace but preserve paragraph breaks
  cleaned = cleaned
    .split('\n\n')
    .map(para => normalizeWhitespace(para))
    .filter(para => para.length > 0)
    .join('\n\n');
  
  return cleaned.trim();
};

/**
 * Check if response contains hallucination markers
 */
export const detectHallucination = (text) => {
  const markers = [];
  
  for (const pattern of HALLUCINATION_MARKERS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      markers.push(match[0]);
    }
  }
  
  return {
    detected: markers.length > 0,
    markers,
  };
};

/**
 * Check if response indicates failure to complete task
 */
export const detectFailure = (text) => {
  for (const pattern of FAILURE_MARKERS) {
    if (pattern.test(text)) {
      return {
        failed: true,
        reason: text.match(pattern)[0],
      };
    }
  }
  
  return { failed: false };
};

/**
 * Parse section extraction response
 */
export const parseSectionExtractionResponse = (response) => {
  // Try to parse as JSON
  const parsed = safeJsonParse(response);
  
  if (parsed && parsed.sections) {
    return {
      success: true,
      sections: parsed.sections.map(section => ({
        name: section.name || 'Unnamed Section',
        originalHeading: section.originalHeading || section.name,
        content: cleanGeneratedText(section.content || ''),
        subsections: (section.subsections || []).map(sub => ({
          name: sub.name,
          content: cleanGeneratedText(sub.content || ''),
        })),
      })),
      documentType: parsed.documentType || 'unknown',
      mainTopics: parsed.mainTopics || [],
      warnings: parsed.warnings || [],
    };
  }
  
  // If JSON parsing failed, try to extract sections from plain text
  return {
    success: false,
    error: 'Failed to parse section extraction response',
    rawResponse: response,
    sections: [],
  };
};

/**
 * Parse and validate generated section content
 */
export const parseSectionContent = (response, sectionTitle) => {
  const cleaned = cleanGeneratedText(response);
  
  // Check for failures
  const failure = detectFailure(cleaned);
  if (failure.failed) {
    return {
      success: false,
      content: '',
      sectionTitle,
      error: `Could not generate content: ${failure.reason}`,
      needsManualInput: true,
    };
  }
  
  // Check for hallucination markers
  const hallucination = detectHallucination(cleaned);
  
  // Check if content is too short (might indicate a problem)
  const isTooShort = cleaned.length < 50;
  
  return {
    success: !isTooShort,
    content: cleaned,
    sectionTitle,
    warnings: [
      ...(hallucination.detected 
        ? [`Potential uncertainty detected: ${hallucination.markers.join(', ')}`] 
        : []),
      ...(isTooShort 
        ? ['Generated content is very short. May need additional source material.'] 
        : []),
    ],
    metadata: {
      wordCount: cleaned.split(/\s+/).length,
      paragraphCount: cleaned.split(/\n\n+/).length,
      hasHallucinationMarkers: hallucination.detected,
    },
  };
};

/**
 * Parse multi-document synthesis response
 */
export const parseMultiDocResponse = (response, documentCount) => {
  const cleaned = cleanGeneratedText(response);
  
  // Check that response references multiple sources
  const sourceReferences = [];
  for (let i = 1; i <= documentCount; i++) {
    const patterns = [
      new RegExp(`Paper ${i}`, 'gi'),
      new RegExp(`Study ${i}`, 'gi'),
      new RegExp(`Document ${i}`, 'gi'),
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        sourceReferences.push(i);
        break;
      }
    }
  }
  
  const allSourcesReferenced = sourceReferences.length === documentCount;
  
  return {
    success: true,
    content: cleaned,
    warnings: [
      ...(!allSourcesReferenced 
        ? [`Only ${sourceReferences.length} of ${documentCount} sources were referenced`] 
        : []),
    ],
    metadata: {
      sourcesReferenced: sourceReferences,
      allSourcesUsed: allSourcesReferenced,
      wordCount: cleaned.split(/\s+/).length,
    },
  };
};

/**
 * Extract tables from generated content
 * Returns content with tables separated out
 */
export const extractTables = (content) => {
  const tables = [];
  
  // Match markdown tables
  const tablePattern = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/g;
  
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    tables.push({
      markdown: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return {
    tables,
    contentWithoutTables: content.replace(tablePattern, '\n[TABLE]\n'),
  };
};

/**
 * Validate that generated content is grounded in source
 * Basic check: looks for quoted content or specific facts
 */
export const validateGrounding = (generatedContent, sourceContent) => {
  // This is a basic implementation
  // A more robust version would use semantic similarity
  
  const warnings = [];
  
  // Extract any numbers/statistics from generated content
  const generatedNumbers = generatedContent.match(/\d+(\.\d+)?%?/g) || [];
  const sourceNumbers = sourceContent.match(/\d+(\.\d+)?%?/g) || [];
  
  // Check if generated numbers appear in source
  for (const num of generatedNumbers) {
    // Skip very common numbers
    if (['1', '2', '3', '4', '5', '10', '100'].includes(num)) continue;
    
    if (!sourceNumbers.includes(num)) {
      warnings.push(`Number "${num}" in generated content may not be in source`);
    }
  }
  
  return {
    isGrounded: warnings.length === 0,
    warnings,
  };
};

/**
 * Format AI response for storage
 * Ensures consistent structure for database
 */
export const formatForStorage = (parsedResponse) => {
  return {
    content: parsedResponse.content || '',
    success: parsedResponse.success || false,
    warnings: parsedResponse.warnings || [],
    metadata: {
      wordCount: parsedResponse.metadata?.wordCount || 0,
      generatedAt: new Date().toISOString(),
      ...(parsedResponse.metadata || {}),
    },
  };
};

export default {
  cleanGeneratedText,
  detectHallucination,
  detectFailure,
  parseSectionExtractionResponse,
  parseSectionContent,
  parseMultiDocResponse,
  extractTables,
  validateGrounding,
  formatForStorage,
};