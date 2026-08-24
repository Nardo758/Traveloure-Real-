'use client'

/**
 * Reusable Loading Spinner Component
 * Provides consistent loading UI across the application
 */

export const LoadingSpinner = ({ 
  size = 'md', 
  color = 'pink',
  text = null,
  fullScreen = false 
}) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  const colors = {
    pink: 'border-pink-500',
    blue: 'border-blue-500',
    gray: 'border-gray-500',
    white: 'border-white',
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`
          ${sizes[size]}
          border-4
          ${colors[color]}
          border-t-transparent
          rounded-full
          animate-spin
        `}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <p className="text-sm text-gray-600 animate-pulse">{text}</p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {spinner}
      </div>
    )
  }

  return spinner
}

/**
 * Loading Skeleton for Content
 */
export const LoadingSkeleton = ({ 
  lines = 3,
  className = '' 
}) => {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 rounded"
          style={{ width: `${100 - (i * 10)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * Loading Card Skeleton
 */
export const LoadingCard = ({ count = 1 }) => {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg shadow-md p-6 animate-pulse"
        >
          {/* Image skeleton */}
          <div className="h-48 bg-gray-200 rounded-lg mb-4" />
          
          {/* Title skeleton */}
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-3" />
          
          {/* Description skeleton */}
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded w-5/6" />
          </div>
          
          {/* Button skeleton */}
          <div className="h-10 bg-gray-200 rounded w-1/3 mt-4" />
        </div>
      ))}
    </>
  )
}

/**
 * Loading Table Skeleton
 */
export const LoadingTable = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 mb-4 pb-3 border-b">
        {[...Array(cols)].map((_, i) => (
          <div key={i} className="h-5 bg-gray-200 rounded flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 mb-3">
          {[...Array(cols)].map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 bg-gray-200 rounded flex-1"
              style={{ opacity: 1 - (rowIndex * 0.1) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Page Loading Component
 */
export const PageLoading = ({ message = 'Loading...' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="xl" color="pink" />
        <p className="mt-4 text-gray-600 text-lg">{message}</p>
      </div>
    </div>
  )
}

export default LoadingSpinner
