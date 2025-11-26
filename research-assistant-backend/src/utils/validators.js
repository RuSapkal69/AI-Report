/**
 * Validation result type:
 * - null = valid
 * - string = error message
 * - object = multiple field errors { field: message }
 */

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  if (!email) return 'Email is required';
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Invalid email format';
  }
  
  return null;
};

/**
 * Validate project mode
 */
export const validateProjectMode = (mode) => {
  const validModes = ['single', 'multi'];
  
  if (!mode) return 'Project mode is required';
  if (!validModes.includes(mode)) {
    return `Invalid mode. Must be one of: ${validModes.join(', ')}`;
  }
  
  return null;
};

/**
 * Validate project purpose
 */
export const validateProjectPurpose = (purpose) => {
  const validPurposes = ['full_report', 'summary', 'literature_review', 'comparative'];
  
  if (!purpose) return 'Project purpose is required';
  if (!validPurposes.includes(purpose)) {
    return `Invalid purpose. Must be one of: ${validPurposes.join(', ')}`;
  }
  
  return null;
};

/**
 * Validate project name
 */
export const validateProjectName = (name) => {
  if (!name) return 'Project name is required';
  if (typeof name !== 'string') return 'Project name must be a string';
  
  const trimmed = name.trim();
  if (trimmed.length < 1) return 'Project name cannot be empty';
  if (trimmed.length > 200) return 'Project name must be less than 200 characters';
  
  return null;
};

/**
 * Validate UUID format
 */
export const validateUUID = (id, fieldName = 'ID') => {
  if (!id) return `${fieldName} is required`;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return `Invalid ${fieldName} format`;
  }
  
  return null;
};

/**
 * Validate array of UUIDs
 */
export const validateUUIDArray = (ids, fieldName = 'IDs', options = {}) => {
  const { minLength = 0, maxLength = 100, required = false } = options;
  
  if (!ids) {
    return required ? `${fieldName} is required` : null;
  }
  
  if (!Array.isArray(ids)) {
    return `${fieldName} must be an array`;
  }
  
  if (ids.length < minLength) {
    return `${fieldName} must have at least ${minLength} item(s)`;
  }
  
  if (ids.length > maxLength) {
    return `${fieldName} must have at most ${maxLength} items`;
  }
  
  for (let i = 0; i < ids.length; i++) {
    const error = validateUUID(ids[i], `${fieldName}[${i}]`);
    if (error) return error;
  }
  
  return null;
};

/**
 * Validate section mapping structure
 */
export const validateSectionMapping = (mapping) => {
  if (!mapping) return null; // Optional field
  
  if (!Array.isArray(mapping)) {
    return 'Section mapping must be an array';
  }
  
  for (let i = 0; i < mapping.length; i++) {
    const section = mapping[i];
    
    if (!section.templateSectionId) {
      return `Section mapping[${i}] missing templateSectionId`;
    }
    
    if (!section.templateSectionTitle) {
      return `Section mapping[${i}] missing templateSectionTitle`;
    }
  }
  
  return null;
};

/**
 * Validate global instructions
 */
export const validateGlobalInstructions = (instructions) => {
  if (!instructions) return null; // Optional
  
  if (typeof instructions !== 'string') {
    return 'Global instructions must be a string';
  }
  
  if (instructions.length > 5000) {
    return 'Global instructions must be less than 5000 characters';
  }
  
  return null;
};

/**
 * Validate file upload
 */
export const validateFileUpload = (file, options = {}) => {
  const { 
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedTypes = [],
    required = true,
  } = options;
  
  if (!file) {
    return required ? 'File is required' : null;
  }
  
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return `File size must be less than ${maxMB}MB`;
  }
  
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    return `Invalid file type. Allowed: ${allowedTypes.join(', ')}`;
  }
  
  return null;
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (page, limit) => {
  const errors = {};
  
  if (page !== undefined) {
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.page = 'Page must be a positive integer';
    }
  }
  
  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      errors.limit = 'Limit must be between 1 and 100';
    }
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

/**
 * Validate create project request body
 */
export const validateCreateProject = (body) => {
  const errors = {};
  
  const nameError = validateProjectName(body.name);
  if (nameError) errors.name = nameError;
  
  const modeError = validateProjectMode(body.mode);
  if (modeError) errors.mode = modeError;
  
  const purposeError = validateProjectPurpose(body.purpose);
  if (purposeError) errors.purpose = purposeError;
  
  const templateError = validateUUID(body.templateId, 'Template ID');
  if (templateError) errors.templateId = templateError;
  
  // For single mode, need exactly 1 document
  // For multi mode, need at least 1 document
  if (body.mode === 'single') {
    if (!body.sourceDocumentIds || body.sourceDocumentIds.length !== 1) {
      errors.sourceDocumentIds = 'Single mode requires exactly 1 document';
    }
  } else if (body.mode === 'multi') {
    const docsError = validateUUIDArray(body.sourceDocumentIds, 'Source documents', {
      minLength: 1,
      required: true,
    });
    if (docsError) errors.sourceDocumentIds = docsError;
  }
  
  const mappingError = validateSectionMapping(body.sectionMapping);
  if (mappingError) errors.sectionMapping = mappingError;
  
  const instructionsError = validateGlobalInstructions(body.globalInstructions);
  if (instructionsError) errors.globalInstructions = instructionsError;
  
  return Object.keys(errors).length > 0 ? errors : null;
};

/**
 * Validate update project request body
 */
export const validateUpdateProject = (body) => {
  const errors = {};
  
  // All fields optional for update, but validate if provided
  if (body.name !== undefined) {
    const nameError = validateProjectName(body.name);
    if (nameError) errors.name = nameError;
  }
  
  if (body.sectionMapping !== undefined) {
    const mappingError = validateSectionMapping(body.sectionMapping);
    if (mappingError) errors.sectionMapping = mappingError;
  }
  
  if (body.globalInstructions !== undefined) {
    const instructionsError = validateGlobalInstructions(body.globalInstructions);
    if (instructionsError) errors.globalInstructions = instructionsError;
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
};

export default {
  validateEmail,
  validateProjectMode,
  validateProjectPurpose,
  validateProjectName,
  validateUUID,
  validateUUIDArray,
  validateSectionMapping,
  validateGlobalInstructions,
  validateFileUpload,
  validatePagination,
  validateCreateProject,
  validateUpdateProject,
};