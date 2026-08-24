/**
 * Responsive Design Utilities
 * Helpers for mobile-first, responsive design
 */

import { useState, useEffect } from 'react'

/**
 * Breakpoints (matches Tailwind defaults)
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
}

/**
 * Hook: useMediaQuery
 * Returns true if media query matches
 * 
 * Usage:
 * const isMobile = useMediaQuery('(max-width: 768px)')
 */
export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    if (media.matches !== matches) {
      setMatches(media.matches)
    }

    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)

    return () => media.removeEventListener('change', listener)
  }, [matches, query])

  return matches
}

/**
 * Hook: useBreakpoint
 * Returns current breakpoint
 * 
 * Usage:
 * const breakpoint = useBreakpoint()
 * if (breakpoint === 'sm') { // mobile code }
 */
export const useBreakpoint = () => {
  const [breakpoint, setBreakpoint] = useState('xl')

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      
      if (width < BREAKPOINTS.sm) setBreakpoint('xs')
      else if (width < BREAKPOINTS.md) setBreakpoint('sm')
      else if (width < BREAKPOINTS.lg) setBreakpoint('md')
      else if (width < BREAKPOINTS.xl) setBreakpoint('lg')
      else if (width < BREAKPOINTS['2xl']) setBreakpoint('xl')
      else setBreakpoint('2xl')
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  return breakpoint
}

/**
 * Hook: useIsMobile
 * Simple mobile detection
 * 
 * Usage:
 * const isMobile = useIsMobile()
 */
export const useIsMobile = () => {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.md}px)`)
}

/**
 * Hook: useIsTablet
 * Tablet detection
 */
export const useIsTablet = () => {
  return useMediaQuery(
    `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg}px)`
  )
}

/**
 * Hook: useIsDesktop
 * Desktop detection
 */
export const useIsDesktop = () => {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`)
}

/**
 * Hook: useWindowSize
 * Returns current window dimensions
 * 
 * Usage:
 * const { width, height } = useWindowSize()
 */
export const useWindowSize = () => {
  const [size, setSize] = useState({
    width: undefined,
    height: undefined,
  })

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

/**
 * Hook: useOrientation
 * Returns device orientation
 * 
 * Usage:
 * const orientation = useOrientation() // 'portrait' or 'landscape'
 */
export const useOrientation = () => {
  const [orientation, setOrientation] = useState('portrait')

  useEffect(() => {
    const handleOrientationChange = () => {
      setOrientation(
        window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
      )
    }

    handleOrientationChange()
    window.addEventListener('resize', handleOrientationChange)
    return () => window.removeEventListener('resize', handleOrientationChange)
  }, [])

  return orientation
}

/**
 * Hook: useTouchDevice
 * Detects if device supports touch
 * 
 * Usage:
 * const isTouch = useTouchDevice()
 */
export const useTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    setIsTouch(
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    )
  }, [])

  return isTouch
}

/**
 * Responsive value selector
 * Returns value based on current breakpoint
 * 
 * Usage:
 * const columns = useResponsiveValue({ xs: 1, sm: 2, md: 3, lg: 4 })
 */
export const useResponsiveValue = (values) => {
  const breakpoint = useBreakpoint()
  
  // Find the appropriate value for current breakpoint
  const breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl']
  const currentIndex = breakpointOrder.indexOf(breakpoint)
  
  // Look backwards from current breakpoint to find defined value
  for (let i = currentIndex; i >= 0; i--) {
    const bp = breakpointOrder[i]
    if (values[bp] !== undefined) {
      return values[bp]
    }
  }
  
  // Fallback to smallest defined value
  return values[breakpointOrder.find(bp => values[bp] !== undefined)]
}

/**
 * Responsive class helper
 * Returns Tailwind responsive classes based on configuration
 * 
 * Usage:
 * const classes = responsiveClass({
 *   base: 'p-4',
 *   sm: 'p-6',
 *   md: 'p-8',
 *   lg: 'p-10'
 * })
 */
export const responsiveClass = (config) => {
  const classes = []
  
  if (config.base) classes.push(config.base)
  if (config.sm) classes.push(`sm:${config.sm}`)
  if (config.md) classes.push(`md:${config.md}`)
  if (config.lg) classes.push(`lg:${config.lg}`)
  if (config.xl) classes.push(`xl:${config.xl}`)
  if (config['2xl']) classes.push(`2xl:${config['2xl']}`)
  
  return classes.join(' ')
}

/**
 * Container max-width helper
 * Returns appropriate container class
 */
export const containerClass = (size = 'default') => {
  const sizes = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    default: 'max-w-7xl',
    full: 'max-w-full',
  }
  
  return `${sizes[size]} mx-auto px-4 sm:px-6 lg:px-8`
}

/**
 * Grid columns helper
 * Returns responsive grid classes
 */
export const gridColumns = (config = {}) => {
  const defaults = {
    base: 1,
    sm: 2,
    md: 3,
    lg: 4,
  }
  
  const merged = { ...defaults, ...config }
  
  return `
    grid-cols-${merged.base}
    sm:grid-cols-${merged.sm}
    md:grid-cols-${merged.md}
    lg:grid-cols-${merged.lg}
  `.replace(/\s+/g, ' ').trim()
}

/**
 * Hide/show element based on breakpoint
 * 
 * Usage:
 * <div className={hideOn('sm', 'md')}>Hidden on sm and md</div>
 */
export const hideOn = (...breakpoints) => {
  return breakpoints.map(bp => `${bp}:hidden`).join(' ')
}

export const showOn = (...breakpoints) => {
  return `hidden ${breakpoints.map(bp => `${bp}:block`).join(' ')}`
}

/**
 * Detect if user prefers reduced motion
 */
export const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const listener = (e) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  return prefersReducedMotion
}

/**
 * Detect dark mode preference
 */
export const usePrefersDarkMode = () => {
  const [prefersDark, setPrefersDark] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setPrefersDark(mediaQuery.matches)

    const listener = (e) => setPrefersDark(e.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [])

  return prefersDark
}

export default {
  BREAKPOINTS,
  useMediaQuery,
  useBreakpoint,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useWindowSize,
  useOrientation,
  useTouchDevice,
  useResponsiveValue,
  responsiveClass,
  containerClass,
  gridColumns,
  hideOn,
  showOn,
  usePrefersReducedMotion,
  usePrefersDarkMode,
}
