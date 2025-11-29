import axios from 'axios';
import { supabase } from './supabase';

// ==============================================
// AXIOS INSTANCE SETUP
// ==============================================

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - runs before every request
// Automatically adds the auth token from Supabase session
api.interceptors.request.use(
  async (config) => {
    // Get current session from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    
    // If user is logged in, attach their token
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - runs after every response
// Handles common errors like expired tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If we get 401 Unauthorized, token is expired or invalid
    if (error.response?.status === 401) {
      // Redirect to login page
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==============================================
// DOCUMENTS API
// ==============================================

export const documentsApi = {
  /**
   * Upload a PDF document
   * @param {File} file - PDF file to upload
   * @param {Function} onProgress - Progress callback (0-100)
   */
  upload: async (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    
    return response.data;
  },
  
  /**
   * Get all documents for current user
   * @param {Object} params - Query params { page, limit, status }
   */
  list: async (params = {}) => {
    const response = await api.get('/documents', { params });
    return response.data;
  },
  
  /**
   * Get a single document by ID
   * @param {string} id - Document ID
   */
  get: async (id) => {
    const response = await api.get(`/documents/${id}`);
    return response.data;
  },
  
  /**
   * Get document processing status (for polling)
   * @param {string} id - Document ID
   */
  getStatus: async (id) => {
    const response = await api.get(`/documents/${id}/status`);
    return response.data;
  },
  
  /**
   * Get document summary with section info
   * @param {string} id - Document ID
   */
  getSummary: async (id) => {
    const response = await api.get(`/documents/${id}/summary`);
    return response.data;
  },
  
  /**
   * Reprocess a document (retry extraction)
   * @param {string} id - Document ID
   */
  reprocess: async (id) => {
    const response = await api.post(`/documents/${id}/reprocess`);
    return response.data;
  },
  
  /**
   * Delete a document
   * @param {string} id - Document ID
   */
  delete: async (id) => {
    const response = await api.delete(`/documents/${id}`);
    return response.data;
  },
};

// ==============================================
// TEMPLATES API
// ==============================================

export const templatesApi = {
  /**
   * Upload a DOCX template
   * @param {File} file - DOCX file to upload
   * @param {Function} onProgress - Progress callback (0-100)
   */
  upload: async (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/templates', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    
    return response.data;
  },
  
  /**
   * Get all templates for current user
   * @param {Object} params - Query params { page, limit }
   */
  list: async (params = {}) => {
    const response = await api.get('/templates', { params });
    return response.data;
  },
  
  /**
   * Get a single template by ID
   * @param {string} id - Template ID
   */
  get: async (id) => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },
  
  /**
   * Get template structure (sections, placeholders)
   * @param {string} id - Template ID
   */
  getStructure: async (id) => {
    const response = await api.get(`/templates/${id}/structure`);
    return response.data;
  },
  
  /**
   * Delete a template
   * @param {string} id - Template ID
   */
  delete: async (id) => {
    const response = await api.delete(`/templates/${id}`);
    return response.data;
  },
};

// ==============================================
// PROJECTS API
// ==============================================

export const projectsApi = {
  /**
   * Create a new project
   * @param {Object} data - Project data { name, mode, purpose, templateId, sourceDocumentIds, ... }
   */
  create: async (data) => {
    const response = await api.post('/projects', data);
    return response.data;
  },
  
  /**
   * Get all projects for current user
   * @param {Object} params - Query params { page, limit, status }
   */
  list: async (params = {}) => {
    const response = await api.get('/projects', { params });
    return response.data;
  },
  
  /**
   * Get a single project by ID
   * @param {string} id - Project ID
   * @param {boolean} full - If true, includes template and documents
   */
  get: async (id, full = false) => {
    const response = await api.get(`/projects/${id}`, {
      params: { full: full ? 'true' : undefined },
    });
    return response.data;
  },
  
  /**
   * Get project summary
   * @param {string} id - Project ID
   */
  getSummary: async (id) => {
    const response = await api.get(`/projects/${id}/summary`);
    return response.data;
  },
  
  /**
   * Update project settings
   * @param {string} id - Project ID
   * @param {Object} data - Fields to update { name, sectionMapping, globalInstructions }
   */
  update: async (id, data) => {
    const response = await api.patch(`/projects/${id}`, data);
    return response.data;
  },
  
  /**
   * Start AI generation for a project
   * @param {string} id - Project ID
   */
  generate: async (id) => {
    const response = await api.post(`/projects/${id}/generate`);
    return response.data;
  },
  
  /**
   * Subscribe to generation progress via Server-Sent Events
   * @param {string} id - Project ID
   * @param {Object} handlers - Event handlers { onProgress, onSectionComplete, onError, onComplete }
   * @returns {Function} Unsubscribe function
   */
  subscribeToGeneration: (id, handlers) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const eventSource = new EventSource(`${baseUrl}/projects/${id}/generation-status`);
    
    // Handle generic messages
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handlers.onMessage?.(data);
    };
    
    // Handle progress updates
    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      handlers.onProgress?.(data);
    });
    
    // Handle section completion
    eventSource.addEventListener('section-complete', (event) => {
      const data = JSON.parse(event.data);
      handlers.onSectionComplete?.(data);
    });
    
    // Handle errors during generation
    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse(event.data);
        handlers.onError?.(data);
      } catch {
        handlers.onConnectionError?.();
      }
    });
    
    // Handle generation complete
    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
      handlers.onComplete?.(data);
      eventSource.close();
    });
    
    // Handle connection errors
    eventSource.onerror = () => {
      handlers.onConnectionError?.();
    };
    
    // Return unsubscribe function
    return () => {
      eventSource.close();
    };
  },
  
  /**
   * Delete a project
   * @param {string} id - Project ID
   */
  delete: async (id) => {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },
};

// ==============================================
// DRAFTS API
// ==============================================

export const draftsApi = {
  /**
   * Get draft content for a project
   * @param {string} projectId - Project ID
   */
  get: async (projectId) => {
    const response = await api.get(`/drafts/project/${projectId}`);
    return response.data;
  },
  
  /**
   * Save draft content (from editor)
   * @param {string} projectId - Project ID
   * @param {Object} content - ProseMirror/Tiptap document JSON
   */
  save: async (projectId, content) => {
    const response = await api.patch(`/drafts/project/${projectId}`, { content });
    return response.data;
  },
  
  /**
   * Get list of sections in draft
   * @param {string} projectId - Project ID
   */
  getSections: async (projectId) => {
    const response = await api.get(`/drafts/project/${projectId}/sections`);
    return response.data;
  },
  
  /**
   * Get references from draft
   * @param {string} projectId - Project ID
   */
  getReferences: async (projectId) => {
    const response = await api.get(`/drafts/project/${projectId}/references`);
    return response.data;
  },
};

// ==============================================
// EXPORTS API
// ==============================================

export const exportsApi = {
  /**
   * Generate a DOCX export
   * @param {string} projectId - Project ID
   * @param {Object} options - Export options { includeReferences, includeTableOfContents, filename }
   */
  create: async (projectId, options = {}) => {
    const response = await api.post(`/exports/project/${projectId}`, options);
    return response.data;
  },
  
  /**
   * Get all exports for a project
   * @param {string} projectId - Project ID
   */
  list: async (projectId) => {
    const response = await api.get(`/exports/project/${projectId}`);
    return response.data;
  },
  
  /**
   * Get export details
   * @param {string} id - Export ID
   */
  get: async (id) => {
    const response = await api.get(`/exports/${id}`);
    return response.data;
  },
  
  /**
   * Get download URL for an export
   * @param {string} id - Export ID
   */
  getDownloadUrl: async (id) => {
    const response = await api.get(`/exports/${id}/download`);
    return response.data;
  },
  
  /**
   * Delete an export
   * @param {string} id - Export ID
   */
  delete: async (id) => {
    const response = await api.delete(`/exports/${id}`);
    return response.data;
  },
};

// Export the base api instance for custom requests
export default api;