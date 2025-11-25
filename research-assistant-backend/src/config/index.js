import dotenv from 'dotenv';

// Load .env file into process.env
dotenv.config();

const config = {
  // Server settings
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Supabase settings
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  
  // Gemini AI settings
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-pro-preview-05-06', // Latest Gemini 2.5 Pro
  },
  
  // GROBID settings (for citation extraction)
  grobid: {
    url: process.env.GROBID_URL || 'http://localhost:8070',
    timeout: 60000, // 60 seconds timeout for large PDFs
  },
  
  // File upload settings
  upload: {
    maxFileSize: 50 * 1024 * 1024, // 50MB max
    allowedPdfMimeTypes: ['application/pdf'],
    allowedDocxMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
  },
};

// Validate required config
const requiredVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GEMINI_API_KEY'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.warn(`Warning: ${varName} is not set in environment variables`);
  }
}

export default config;