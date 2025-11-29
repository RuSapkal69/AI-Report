// ==============================================
// FILE UTILITIES
// ==============================================

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 * 
 * Example: formatFileSize(1536) → "1.5 KB"
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
 * @param {string} filename - File name
 * @returns {string} Extension in lowercase
 * 
 * Example: getFileExtension("paper.pdf") → "pdf"
 */
export const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

/**
 * Check if file is a PDF
 * @param {File|string} file - File object or filename
 * @returns {boolean}
 */
export const isPdfFile = (file) => {
  const filename = typeof file === 'string' ? file : file.name;
  return getFileExtension(filename) === 'pdf';
};

/**
 * Check if file is a DOCX
 * @param {File|string} file - File object or filename
 * @returns {boolean}
 */
export const isDocxFile = (file) => {
  const filename = typeof file === 'string' ? file : file.name;
  return getFileExtension(filename) === 'docx';
};

// ==============================================
// DATE UTILITIES
// ==============================================

/**
 * Format date to readable string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 * 
 * Example: formatDate("2024-01-15") → "Jan 15, 2024"
 */
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format date with time
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date and time
 * 
 * Example: formatDateTime("2024-01-15T10:30:00") → "Jan 15, 2024, 10:30 AM"
 */
export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 * 
 * Example: formatRelativeTime(fiveMinutesAgo) → "5 minutes ago"
 */
export const formatRelativeTime = (date) => {
  if (!date) return '';
  
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now - then) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
  
  // Fall back to formatted date for older dates
  return formatDate(date);
};

// ==============================================
// TEXT UTILITIES
// ==============================================

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 * 
 * Example: truncateText("Hello World", 8) → "Hello..."
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Capitalize first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 * 
 * Example: capitalize("hello") → "Hello"
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Generate a random ID
 * @returns {string} Random 9-character ID
 * 
 * Example: generateId() → "k7x9m2p4q"
 */
export const generateId = () => {
  return Math.random().toString(36).substring(2, 11);
};

// ==============================================
// VALIDATION UTILITIES
// ==============================================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Check if a string is empty or only whitespace
 * @param {string} str - String to check
 * @returns {boolean} True if empty or whitespace only
 */
export const isEmpty = (str) => {
  return !str || str.trim().length === 0;
};

// ==============================================
// STATUS UTILITIES
// ==============================================

/**
 * Get Tailwind CSS classes for status badge
 * @param {string} status - Status string
 * @returns {string} Tailwind classes for background and text color
 * 
 * Example: getStatusColor("ready") → "bg-green-100 text-green-700"
 */
export const getStatusColor = (status) => {
  const colors = {
    draft: 'bg-gray-100 text-gray-700',
    processing: 'bg-yellow-100 text-yellow-700',
    generating: 'bg-blue-100 text-blue-700',
    ready: 'bg-green-100 text-green-700',
    exported: 'bg-purple-100 text-purple-700',
    error: 'bg-red-100 text-red-700',
    partial: 'bg-orange-100 text-orange-700',
  };
  return colors[status] || colors.draft;
};

/**
 * Convert project purpose key to display text
 * @param {string} purpose - Purpose key from database
 * @returns {string} Human-readable text
 * 
 * Example: getPurposeDisplay("literature_review") → "Literature Review"
 */
export const getPurposeDisplay = (purpose) => {
  const displays = {
    full_report: 'Full Report',
    summary: 'Summary',
    literature_review: 'Literature Review',
    comparative: 'Comparative Study',
  };
  return displays[purpose] || purpose || '';
};

/**
 * Convert project mode key to display text
 * @param {string} mode - Mode key from database
 * @returns {string} Human-readable text
 * 
 * Example: getModeDisplay("multi") → "Multiple Documents"
 */
export const getModeDisplay = (mode) => {
  const displays = {
    single: 'Single Document',
    multi: 'Multiple Documents',
  };
  return displays[mode] || mode || '';
};

// ==============================================
// FUNCTION UTILITIES
// ==============================================

/**
 * Debounce a function
 * Delays execution until after wait milliseconds have passed since last call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 * 
 * Example:
 * const debouncedSearch = debounce(search, 300);
 * debouncedSearch("query"); // Only runs after 300ms of no calls
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// ==============================================
// BROWSER UTILITIES
// ==============================================

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if successful
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};

/**
 * Trigger file download from URL
 * @param {string} url - File URL
 * @param {string} filename - Name for downloaded file
 */
export const downloadFile = (url, filename) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ==============================================
// CSS UTILITIES
// ==============================================

/**
 * Combine class names conditionally
 * Filters out falsy values and joins with space
 * @param {...any} classes - Class names or falsy values
 * @returns {string} Combined class string
 * 
 * Example: cn("btn", isActive && "btn-active", "ml-2") → "btn btn-active ml-2"
 * Example: cn("btn", false, null, "ml-2") → "btn ml-2"
 */
export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};