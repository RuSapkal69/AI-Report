import { estimateTokens } from './geminiClient.js';

/**
 * Base grounding rules included in every prompt
 * These prevent the AI from hallucinating
 */
const GROUNDING_RULES = `
CRITICAL RULES - YOU MUST FOLLOW THESE:
1. Use ONLY information explicitly present in the source content provided above.
2. Do NOT invent, fabricate, or add any facts, statistics, claims, or data not in the source.
3. Do NOT create fake references or citations.
4. Do NOT make assumptions or inferences beyond what is directly stated.
5. If the source lacks information for a section, write: "Insufficient source content for this section."
6. Preserve all citation markers (e.g., [1], [2], (Author, 2020)) exactly as they appear.
7. When paraphrasing, maintain factual accuracy - do not alter the meaning.
`;

/**
 * Length guidance based on target length setting
 */
const LENGTH_GUIDANCE = {
  short: 'Keep the section concise: 1-2 paragraphs (100-200 words).',
  medium: 'Write a moderate-length section: 3-4 paragraphs (300-500 words).',
  long: 'Write a comprehensive section: 5-7 paragraphs (600-1000 words).',
  as_source: 'Match the approximate length of the source content.',
};

/**
 * Build prompt for extracting and identifying sections from a PDF
 * Used as the first step to understand document structure
 */
export const buildSectionExtractionPrompt = (documentContent, metadata = {}) => {
  return `You are a research document analyzer. Your task is to identify and extract the main sections from this academic paper.

DOCUMENT METADATA:
Title: ${metadata.title || 'Unknown'}
Authors: ${metadata.authors?.join(', ') || 'Unknown'}

DOCUMENT CONTENT:
---
${documentContent}
---

TASK:
Analyze this document and identify the following standard sections (if present):
- Abstract
- Introduction
- Literature Review / Related Work
- Methods / Methodology
- Results / Findings
- Discussion
- Conclusion
- References

For each section found, extract:
1. The section name/heading as it appears in the document
2. The complete text content of that section
3. Any subsections within it

Respond with a JSON object in this exact format:
{
  "sections": [
    {
      "name": "Introduction",
      "originalHeading": "1. Introduction",
      "content": "The full text content of this section...",
      "subsections": [
        {
          "name": "Background",
          "content": "Subsection content..."
        }
      ]
    }
  ],
  "documentType": "research_paper|review|case_study|thesis|other",
  "mainTopics": ["topic1", "topic2"],
  "warnings": ["Any issues found during extraction"]
}

${GROUNDING_RULES}`;
};

/**
 * Build prompt for rewriting a single section
 * Used when generating content for one template section
 */
export const buildSectionRewritePrompt = (params) => {
  const {
    sectionTitle,
    sourceContent,
    instructions = '',
    globalInstructions = '',
    targetLength = 'medium',
    purpose = 'full_report',
    documentMetadata = {},
  } = params;
  
  const purposeGuidance = {
    full_report: 'Write for a comprehensive academic report.',
    summary: 'Write a concise summary focusing on key points only.',
    literature_review: 'Write in literature review style, analyzing and synthesizing findings.',
    comparative: 'Write with focus on comparison and contrast of different aspects.',
  };
  
  return `You are an academic writing assistant. Your task is to write the "${sectionTitle}" section of a research document.

DOCUMENT CONTEXT:
Title: ${documentMetadata.title || 'Research Report'}
Authors: ${documentMetadata.authors?.join(', ') || 'Not specified'}
Purpose: ${purposeGuidance[purpose] || purposeGuidance.full_report}

SOURCE CONTENT TO USE:
---
${sourceContent}
---

SECTION TO WRITE: ${sectionTitle}

SPECIFIC INSTRUCTIONS FOR THIS SECTION:
${instructions || 'Write a clear, well-structured section based on the source content.'}

GLOBAL STYLE REQUIREMENTS:
${globalInstructions || 'Write in formal academic tone. Use third person. Be precise and factual.'}

LENGTH GUIDANCE:
${LENGTH_GUIDANCE[targetLength] || LENGTH_GUIDANCE.medium}

${GROUNDING_RULES}

Now write the "${sectionTitle}" section. Start directly with the content (do not include the section heading).`;
};

/**
 * Build prompt for synthesizing multiple documents into one section
 * Used for literature reviews and multi-paper analysis
 */
export const buildMultiDocumentSynthesisPrompt = (params) => {
  const {
    sectionTitle,
    documents, // Array of { title, authors, content }
    instructions = '',
    globalInstructions = '',
    targetLength = 'long',
    purpose = 'literature_review',
  } = params;
  
  // Build source content from multiple documents
  let sourcesText = '';
  documents.forEach((doc, index) => {
    sourcesText += `
[PAPER ${index + 1}]
Title: ${doc.title || `Document ${index + 1}`}
Authors: ${doc.authors?.join(', ') || 'Unknown'}
Content:
${doc.content}

`;
  });
  
  return `You are an academic writing assistant specializing in literature synthesis. Your task is to write the "${sectionTitle}" section by synthesizing content from multiple research papers.

SOURCE PAPERS:
${sourcesText}
---

SECTION TO WRITE: ${sectionTitle}

SYNTHESIS REQUIREMENTS:
1. Compare and contrast findings across all papers
2. Identify common themes, agreements, and contradictions
3. Cite each paper when referencing its findings (use format: Paper 1, Paper 2, etc., or author names if available)
4. Organize thematically rather than paper-by-paper
5. Highlight consensus and disagreements in the literature

SPECIFIC INSTRUCTIONS:
${instructions || 'Synthesize the key findings and themes from all source papers.'}

GLOBAL STYLE REQUIREMENTS:
${globalInstructions || 'Write in formal academic tone. Use third person. Be analytical and balanced.'}

LENGTH GUIDANCE:
${LENGTH_GUIDANCE[targetLength] || LENGTH_GUIDANCE.long}

${GROUNDING_RULES}

Additional rule for multi-document synthesis:
- Every claim must be attributable to at least one source paper
- Clearly indicate when papers agree or disagree
- Do not blend information in ways that misrepresent any single paper's findings

Now write the "${sectionTitle}" section. Start directly with the content.`;
};

/**
 * Build prompt for comparative analysis
 * Used when comparing methodologies, findings, etc. across papers
 */
export const buildComparativeAnalysisPrompt = (params) => {
  const {
    sectionTitle,
    documents,
    comparisonDimensions = [],
    instructions = '',
    globalInstructions = '',
  } = params;
  
  let sourcesText = '';
  documents.forEach((doc, index) => {
    sourcesText += `
[STUDY ${index + 1}]
Title: ${doc.title || `Study ${index + 1}`}
Authors: ${doc.authors?.join(', ') || 'Unknown'}
Key Content:
${doc.content}

`;
  });
  
  const defaultDimensions = [
    'Research questions/objectives',
    'Methodological approaches',
    'Sample sizes and populations',
    'Key findings and results',
    'Limitations acknowledged',
  ];
  
  const dimensions = comparisonDimensions.length > 0 
    ? comparisonDimensions 
    : defaultDimensions;
  
  return `You are an academic writing assistant specializing in comparative analysis. Your task is to create a structured comparison of multiple research studies.

STUDIES TO COMPARE:
${sourcesText}
---

SECTION TO WRITE: ${sectionTitle}

COMPARISON DIMENSIONS TO ADDRESS:
${dimensions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

COMPARISON REQUIREMENTS:
1. Create a balanced comparison across all studies
2. Highlight similarities and differences clearly
3. Use comparative language (e.g., "while Study 1 found X, Study 2 reported Y")
4. Include a summary of key comparative insights
5. Note any gaps or limitations in comparability

SPECIFIC INSTRUCTIONS:
${instructions || 'Provide a thorough comparative analysis of all studies.'}

GLOBAL STYLE REQUIREMENTS:
${globalInstructions || 'Write in formal academic tone. Be objective and balanced.'}

${GROUNDING_RULES}

You may use tables for structured comparisons where appropriate. Format tables using markdown:
| Dimension | Study 1 | Study 2 |
| --------- | ------- | ------- |
| Finding   | Value   | Value   |

Now write the comparative analysis. Start directly with the content.`;
};

/**
 * Build prompt for generating an abstract/summary
 */
export const buildAbstractPrompt = (params) => {
  const {
    fullContent,
    documentMetadata = {},
    maxWords = 250,
  } = params;
  
  return `You are an academic writing assistant. Your task is to write a concise abstract summarizing the following research document.

DOCUMENT:
Title: ${documentMetadata.title || 'Research Document'}
Authors: ${documentMetadata.authors?.join(', ') || 'Not specified'}

FULL CONTENT:
---
${fullContent}
---

ABSTRACT REQUIREMENTS:
1. Maximum ${maxWords} words
2. Include: background/purpose, methods, key results, and conclusions
3. Write in a single paragraph (or two at most)
4. Use past tense for methods and results
5. Be specific about findings - include key numbers/outcomes if present in source

${GROUNDING_RULES}

Write the abstract now. Do not include a heading, just the abstract text.`;
};

/**
 * Validate that a prompt fits within context limits
 * Returns warnings if close to limit
 */
export const validatePromptSize = (prompt) => {
  const tokens = estimateTokens(prompt);
  const maxTokens = 900000;
  const warningThreshold = 700000;
  
  return {
    tokens,
    withinLimit: tokens < maxTokens,
    warning: tokens > warningThreshold 
      ? `Prompt is large (${tokens} estimated tokens). Consider reducing source content.`
      : null,
  };
};

/**
 * Truncate source content to fit within token limits
 * Preserves beginning and end, truncates middle
 */
export const truncateForContext = (text, maxTokens = 500000) => {
  const currentTokens = estimateTokens(text);
  
  if (currentTokens <= maxTokens) {
    return { text, truncated: false };
  }
  
  // Estimate characters to keep
  const targetChars = maxTokens * 4;
  const halfTarget = Math.floor(targetChars / 2);
  
  const beginning = text.substring(0, halfTarget);
  const ending = text.substring(text.length - halfTarget);
  
  const truncatedText = `${beginning}\n\n[... Content truncated for length ...]\n\n${ending}`;
  
  return {
    text: truncatedText,
    truncated: true,
    originalTokens: currentTokens,
    newTokens: estimateTokens(truncatedText),
  };
};

export default {
  buildSectionExtractionPrompt,
  buildSectionRewritePrompt,
  buildMultiDocumentSynthesisPrompt,
  buildComparativeAnalysisPrompt,
  buildAbstractPrompt,
  validatePromptSize,
  truncateForContext,
  GROUNDING_RULES,
};