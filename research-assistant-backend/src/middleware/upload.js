import multer from 'multer';
import config from '../config/index.js';
import { ApiError } from './errorHandler.js';

/**
 * Memory storage - files stored in buffer, not on disk
 * We'll upload directly to Supabase Storage from memory
 */
const storage = multer.memoryStorage();

/**
 * File filter for PDF uploads
 */
const pdfFileFilter = (req, file, cb) => {
  // Check MIME type
  if (config.upload.allowedPdfMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Invalid file type. Only PDF files are allowed.'), false);
  }
};

/**
 * File filter for DOCX uploads
 */
const docxFileFilter = (req, file, cb) => {
  // Check MIME type
  if (config.upload.allowedDocxMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Invalid file type. Only DOCX files are allowed.'), false);
  }
};

/**
 * File filter for both PDF and DOCX
 */
const anyDocumentFilter = (req, file, cb) => {
  const allowedTypes = [
    ...config.upload.allowedPdfMimeTypes,
    ...config.upload.allowedDocxMimeTypes,
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Invalid file type. Only PDF and DOCX files are allowed.'), false);
  }
};

/**
 * PDF upload middleware
 * Use: router.post('/upload', uploadPdf.single('file'), handler)
 */
export const uploadPdf = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1,
  },
});

/**
 * DOCX upload middleware (for templates)
 * Use: router.post('/upload', uploadDocx.single('file'), handler)
 */
export const uploadDocx = multer({
  storage,
  fileFilter: docxFileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1,
  },
});

/**
 * Multiple PDF upload middleware (for multi-document projects)
 * Use: router.post('/upload', uploadMultiplePdfs.array('files', 10), handler)
 */
export const uploadMultiplePdfs = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 10, // Max 10 PDFs at once
  },
});

/**
 * Any document upload middleware
 * Use when you accept both PDF and DOCX
 */
export const uploadAnyDocument = multer({
  storage,
  fileFilter: anyDocumentFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1,
  },
});

/**
 * Validate that a file was actually uploaded
 * Use after multer middleware
 */
export const requireFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please provide a file in the request',
    });
  }
  next();
};

/**
 * Validate that files were uploaded (for multiple uploads)
 */
export const requireFiles = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No files uploaded',
      message: 'Please provide at least one file in the request',
    });
  }
  next();
};

export default { uploadPdf, uploadDocx, uploadMultiplePdfs, uploadAnyDocument };
