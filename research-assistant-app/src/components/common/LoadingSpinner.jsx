import { cn } from '../../utils/helpers';

/**
 * Loading Spinner Component
 * 
 * @param {Object} props
 * @param {'sm'|'md'|'lg'} size - Spinner size
 * @param {string} text - Optional loading text
 * @param {boolean} centered - Center in parent container
 * @param {string} className - Additional classes
 */
export default function LoadingSpinner({
  size = 'md',
  text,
  centered = false,
  className = '',
}) {
  // Size classes
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  
  const spinner = (
    <div className={cn('flex flex-col items-center', className)}>
      <svg
        className={cn('animate-spin text-sky-600', sizes[size])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && (
        <p className="mt-2 text-sm text-gray-600">{text}</p>
      )}
    </div>
  );
  
  if (centered) {
    return (
      <div className="flex items-center justify-center h-64">
        {spinner}
      </div>
    );
  }
  
  return spinner;
}