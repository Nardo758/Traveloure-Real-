'use client'

import Image from 'next/image'
import { useState } from 'react'

/**
 * Optimized Image Component
 * Wraps Next.js Image with loading states and error handling
 * 
 * Usage:
 * <OptimizedImage
 *   src="/path/to/image.jpg"
 *   alt="Description"
 *   width={800}
 *   height={600}
 *   priority={false}
 * />
 */

export const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  quality = 75,
  placeholder = 'blur',
  blurDataURL,
  className = '',
  objectFit = 'cover',
  onLoad,
  onError,
  fallbackSrc = '/images/placeholder.png',
  showLoader = true,
  ...props
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imgSrc, setImgSrc] = useState(src)

  const handleLoad = (e) => {
    setIsLoading(false)
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    setIsLoading(false)
    setImgSrc(fallbackSrc)
    if (onError) onError(e)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Loading skeleton */}
      {isLoading && showLoader && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}

      {/* Image */}
      <Image
        src={imgSrc}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        fill={fill}
        priority={priority}
        quality={quality}
        placeholder={placeholder}
        blurDataURL={blurDataURL}
        onLoad={handleLoad}
        onError={handleError}
        style={{ objectFit }}
        className={`
          transition-opacity duration-300
          ${isLoading ? 'opacity-0' : 'opacity-100'}
          ${className}
        `}
        {...props}
      />

      {/* Error indicator */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
    </div>
  )
}

/**
 * Responsive Image Component
 * Automatically adjusts sizes based on screen size
 */
export const ResponsiveImage = ({
  src,
  alt,
  aspectRatio = '16/9',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  className = '',
  ...props
}) => {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        {...props}
      />
    </div>
  )
}

/**
 * Avatar Image Component
 */
export const AvatarImage = ({
  src,
  alt,
  size = 'md',
  fallback = '/images/default-avatar.png',
  className = '',
  ...props
}) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }

  return (
    <div className={`${sizes[size]} relative rounded-full overflow-hidden ${className}`}>
      <OptimizedImage
        src={src || fallback}
        alt={alt}
        fill
        objectFit="cover"
        quality={90}
        {...props}
      />
    </div>
  )
}

/**
 * Card Image Component
 */
export const CardImage = ({
  src,
  alt,
  aspectRatio = '16/9',
  className = '',
  ...props
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{ aspectRatio }}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        objectFit="cover"
        quality={80}
        {...props}
      />
    </div>
  )
}

/**
 * Hero Image Component
 * For large banner/hero images
 */
export const HeroImage = ({
  src,
  alt,
  height = 'h-96',
  overlay = true,
  overlayOpacity = 0.4,
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`relative ${height} overflow-hidden ${className}`}>
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        priority
        quality={85}
        objectFit="cover"
        {...props}
      />
      
      {overlay && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
        />
      )}
      
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Image Gallery Component
 */
export const ImageGallery = ({
  images,
  columns = 3,
  gap = 4,
  className = '',
}) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }

  const gaps = {
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    6: 'gap-6',
  }

  return (
    <div className={`grid ${gridCols[columns]} ${gaps[gap]} ${className}`}>
      {images.map((image, index) => (
        <CardImage
          key={index}
          src={image.src}
          alt={image.alt || `Image ${index + 1}`}
          aspectRatio={image.aspectRatio || '1/1'}
        />
      ))}
    </div>
  )
}

export default OptimizedImage
