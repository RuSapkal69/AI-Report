import { geminiModel } from '../config/gemini.js';
import { retryWithBackoff, sleep } from '../utils/helpers.js';

/**
 * Maximum tokens for Gemini 2.5 Pro context window
 * Actual limit is ~1M tokens, but we leave room for response
 */
const MAX_INPUT_TOKENS = 900000;

/**
 * Estimate token count from text
 * Rough estimate: ~4 characters per token for English
 */
export const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

/**
 * Check if content fits within context window
 */
export const fitsInContext = (text) => {
  return estimateTokens(text) < MAX_INPUT_TOKENS;
};

/**
 * Generate content with Gemini
 * 
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Generated text
 */
export const generateContent = async (prompt, options = {}) => {
  const {
    maxRetries = 3,
    temperature = 0.3,
    maxOutputTokens = 8192,
  } = options;
  
  // Validate prompt size
  if (!fitsInContext(prompt)) {
    throw new Error('Prompt exceeds maximum context length');
  }
  
  const generate = async () => {
    try {
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          topP: 0.8,
          topK: 40,
        },
      });
      
      const response = result.response;
      const text = response.text();
      
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      
      return text;
      
    } catch (error) {
      // Handle specific Gemini errors
      if (error.message?.includes('SAFETY')) {
        throw new Error('Content was blocked by safety filters');
      }
      
      if (error.message?.includes('RECITATION')) {
        throw new Error('Response blocked due to recitation concerns');
      }
      
      if (error.status === 429) {
        // Rate limited - wait longer before retry
        await sleep(5000);
        throw error; // Will be retried
      }
      
      if (error.status === 503 || error.status === 500) {
        // Service error - retry
        throw error;
      }
      
      // Unknown error - don't retry
      throw new Error(`Gemini API error: ${error.message}`);
    }
  };
  
  // Retry with exponential backoff
  return retryWithBackoff(generate, maxRetries, 1000);
};

/**
 * Generate content with streaming
 * Yields chunks as they arrive
 * 
 * @param {string} prompt - The prompt to send
 * @param {Function} onChunk - Callback for each chunk
 * @returns {Promise<string>} Complete generated text
 */
export const generateContentStream = async (prompt, onChunk) => {
  if (!fitsInContext(prompt)) {
    throw new Error('Prompt exceeds maximum context length');
  }
  
  try {
    const result = await geminiModel.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        topP: 0.8,
        topK: 40,
      },
    });
    
    let fullText = '';
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullText += chunkText;
        if (onChunk) {
          onChunk(chunkText);
        }
      }
    }
    
    return fullText;
    
  } catch (error) {
    throw new Error(`Gemini streaming error: ${error.message}`);
  }
};

/**
 * Generate structured JSON response
 * Prompts Gemini to return valid JSON and parses it
 * 
 * @param {string} prompt - The prompt (should ask for JSON output)
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Parsed JSON response
 */
export const generateJson = async (prompt, options = {}) => {
  const jsonPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only. No markdown code blocks, no explanation, just the JSON object.`;
  
  const response = await generateContent(jsonPrompt, {
    ...options,
    temperature: 0.2, // Lower temperature for more consistent JSON
  });
  
  // Clean up response - remove any markdown code blocks
  let cleaned = response.trim();
  
  // Remove ```json ... ``` wrapper if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.error('Failed to parse JSON response:', cleaned);
    throw new Error(`Invalid JSON response from Gemini: ${parseError.message}`);
  }
};

/**
 * Generate content for a specific section
 * Wrapper that adds section-specific handling
 * 
 * @param {string} sectionPrompt - Section generation prompt
 * @param {string} sectionTitle - Title for logging/tracking
 * @returns {Promise<{content: string, success: boolean, error?: string}>}
 */
export const generateSection = async (sectionPrompt, sectionTitle) => {
  try {
    const content = await generateContent(sectionPrompt, {
      maxRetries: 3,
      temperature: 0.3,
    });
    
    return {
      success: true,
      content,
      sectionTitle,
    };
    
  } catch (error) {
    console.error(`Failed to generate section "${sectionTitle}":`, error);
    
    return {
      success: false,
      content: '',
      sectionTitle,
      error: error.message,
    };
  }
};

/**
 * Check if Gemini API is available and working
 */
export const healthCheck = async () => {
  try {
    const result = await generateContent('Respond with exactly: OK', {
      maxRetries: 1,
      maxOutputTokens: 10,
    });
    
    return {
      available: true,
      response: result.trim(),
    };
    
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
};

export default {
  generateContent,
  generateContentStream,
  generateJson,
  generateSection,
  estimateTokens,
  fitsInContext,
  healthCheck,
};