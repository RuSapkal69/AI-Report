import { useState, useRef } from 'react';
import { cn, formatFileSize } from '../../utils/helpers';

/**
 * File Upload Component
 * 
 * @param {Object} props
 * @param {Function} onFileSelect - Called when file is selected
 * @param {string[]} acceptedTypes - Accepted file extensions (e.g., ['.pdf', '.docx'])
 * @param {string} acceptedTypesLabel - Display text for accepted types
 * @param {number} maxSize - Maximum file size in bytes
 * @param {boolean} disabled - Disable upload
 * @param {string} className - Additional classes
 */
export default function FileUpload({
  onFileSelect,
  acceptedTypes = ['.pdf'],
  acceptedTypesLabel = 'PDF files',
  maxSize = 50 * 1024 * 1024, // 50MB default
  disabled = false,
  className = '',
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  
  // Validate file
  const validateFile = (file) => {
    // Check file type
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    if (!acceptedTypes.includes(extension)) {
      return `Invalid file type. Please upload ${acceptedTypesLabel}.`;
    }
    
    // Check file size
    if (file.size > maxSize) {
      return `File too large. Maximum size is ${formatFileSize(maxSize)}.`;
    }
    
    return null;
  };
  
  // Handle file selection
  const handleFile = (file) => {
    setError('');
    
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    onFileSelect(file);
  };
  
  // Handle drag events
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };
  
  // Handle click to browse
  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };
  
  // Handle input change
  const handleInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };
  
  return (
    <div className={className}>
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-sky-500 bg-sky-50'
            : 'border-gray-300 hover:border-gray-400',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-red-300'
        )}
      >
        {/* Upload Icon */}
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        
        {/* Text */}
        <p className="text-gray-600 mb-1">
          <span className="text-sky-600 font-medium">Click to upload</span>
          {' '}or drag and drop
        </p>
        <p className="text-sm text-gray-500">
          {acceptedTypesLabel} up to {formatFileSize(maxSize)}
        </p>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      
      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}