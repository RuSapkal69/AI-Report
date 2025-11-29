import { useId } from 'react';
import { cn } from '../../utils/helpers';

/**
 * Input Component
 * 
 * @param {Object} props
 * @param {string} label - Input label
 * @param {string} error - Error message
 * @param {string} helperText - Helper text below input
 * @param {string} className - Additional classes for wrapper
 * @param {string} inputClassName - Additional classes for input
 */
export default function Input({
  label,
  error,
  helperText,
  className = '',
  inputClassName = '',
  id,
  ...props
}) {
  const generatedId = useId();
  // Generate ID if not provided (for label association)
  const inputId = id || generatedId;
  
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      
      <input
        id={inputId}
        className={cn(
          'w-full px-4 py-2 border rounded-lg transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:border-transparent',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:ring-sky-500',
          inputClassName
        )}
        {...props}
      />
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}