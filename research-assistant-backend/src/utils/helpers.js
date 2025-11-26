import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique UUID
 * Used for creating IDs for documents, projects, etc.
 */
export const generateId = () => {
  return uuidv4();
};

/**
 * Generate a short ID (8 characters)
 * Useful for user-facing references like "DOC-a1b2c3d4"
 */
export const generateShortId = () => {
  return uuidv4().split('-')[0];
};

/**
 * Slugify text for use in URLs or filenames
 * "My Research Paper.pdf" → "my-research-paper-pdf"
 */
export const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // Remove special characters
    .replace(/[\s_-]+/g, '-')    // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '');    // Remove leading/trailing hyphens
};

/**
 * Safely parse JSON without throwing
 * Returns null if parsing fails
 */
export const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

/**
 * Format file size in human-readable format
 * 1024 → "1 KB", 1048576 → "1 MB"
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file extension from filename
 * "document.pdf" → "pdf"
 */
export const getFileExtension = (filename) => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

/**
 * Get filename without extension
 * "document.pdf" → "document"
 */
export const getFilenameWithoutExtension = (filename) => {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
};

/**
 * Sleep for specified milliseconds
 * Useful for retries, rate limiting, etc.
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 * Useful for API calls that might fail temporarily
 */
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't wait after the last attempt
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
};

/**
 * Truncate text to specified length with ellipsis
 * "This is a long text" (limit 10) → "This is..."
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Remove extra whitespace from text
 * "Hello    world\n\n\ntest" → "Hello world test"
 */
export const normalizeWhitespace = (text) => {
  return text
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Check if a string is empty or only whitespace
 */
export const isEmpty = (str) => {
  return !str || str.trim().length === 0;
};

/**
 * Pick specific keys from an object
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) → { a: 1, c: 3 }
 */
export const pick = (obj, keys) => {
  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Omit specific keys from an object
 * omit({ a: 1, b: 2, c: 3 }, ['b']) → { a: 1, c: 3 }
 */
export const omit = (obj, keys) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key))
  );
};

/**
 * Deep clone an object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Format date to ISO string without milliseconds
 * Useful for consistent date formatting
 */
export const formatDate = (date = new Date()) => {
  return date.toISOString().split('.')[0] + 'Z';
};

/**
 * Calculate reading time for text
 * Average reading speed: 200 words per minute
 */
export const calculateReadingTime = (text) => {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return minutes;
};

export default {
  generateId,
  generateShortId,
  slugify,
  safeJsonParse,
  formatFileSize,
  getFileExtension,
  getFilenameWithoutExtension,
  sleep,
  retryWithBackoff,
  truncateText,
  normalizeWhitespace,
  isEmpty,
  pick,
  omit,
  deepClone,
  formatDate,
  calculateReadingTime,
};