// Centralized authentication utilities for handling token expiration and logout
// ✅ SECURE VERSION - No localStorage token storage

import { createLogger } from './logger'
const logger = createLogger('Auth')

// Global reference to NextAuth signOut function
let globalSignOutFunction = null

/**
 * Register the NextAuth signOut function globally
 * Call this from your root component/layout
 * @param {function} signOutFn - NextAuth signOut function
 */
export const registerSignOut = (signOutFn) => {
  globalSignOutFunction = signOutFn
  logger.debug('NextAuth signOut function registered')
}

/**
 * Get the registered signOut function
 * @returns {function|null} - The registered signOut function or null
 */
export const getSignOutFunction = () => {
  return globalSignOutFunction
}

/**
 * Check if the error response indicates token expiration
 * @param {Object} errorData - Error response data
 * @returns {boolean} - True if token is expired
 */
export const isTokenExpired = (errorData) => {
  if (!errorData) return false
  
  // Check for the specific token expired error format
  // Format: { code: "token_not_valid", detail: "Given token not valid for any token type", messages: [...] }
  if (errorData.code === 'token_not_valid') {
    // Check detail message - this is a strong indicator
    if (errorData.detail === 'Given token not valid for any token type') {
      return true
    }
    
    // Check messages array for token expiration
    if (errorData.messages && Array.isArray(errorData.messages)) {
      const hasExpiredMessage = errorData.messages.some(msg => {
        // Check for "Token is expired" message (exact match)
        if (msg.message === 'Token is expired') {
          return true
        }
        // Check for access token type with expired status
        if (msg.token_type === 'access' && msg.message && msg.message.toLowerCase().includes('expired')) {
          return true
        }
        // Check token_class
        if (msg.token_class === 'AccessToken' && msg.message && msg.message.toLowerCase().includes('expired')) {
          return true
        }
        // Check for any message containing "expired" with AccessToken
        if (msg.token_class === 'AccessToken' && msg.token_type === 'access') {
          const msgText = (msg.message || '').toLowerCase()
          if (msgText.includes('expired') || msgText.includes('invalid') || msgText.includes('not valid')) {
            return true
          }
        }
        return false
      })
      
      if (hasExpiredMessage) {
        return true
      }
    }
    
    // If code is token_not_valid, it's likely expired even without specific messages
    // This is a fallback for cases where the error format might vary slightly
    return true
  }
  
  // Check messages array directly (in case code is missing)
  if (errorData.messages && Array.isArray(errorData.messages)) {
    const hasExpiredMessage = errorData.messages.some(msg => {
      if (msg.message === 'Token is expired') {
        return true
      }
      if (msg.token_type === 'access' && msg.message && msg.message.toLowerCase().includes('expired')) {
        return true
      }
      if (msg.token_class === 'AccessToken' && msg.message && msg.message.toLowerCase().includes('expired')) {
        return true
      }
      // Check for AccessToken with any error message
      if (msg.token_class === 'AccessToken' && msg.token_type === 'access') {
        const msgText = (msg.message || '').toLowerCase()
        if (msgText.includes('expired') || msgText.includes('invalid') || msgText.includes('not valid')) {
          return true
        }
      }
      return false
    })
    
    if (hasExpiredMessage) {
      return true
    }
  }
  
  // Additional checks for common token expiration messages
  if (errorData.detail && typeof errorData.detail === 'string') {
    const detail = errorData.detail.toLowerCase()
    if (detail.includes('token') && (
      detail.includes('expired') || 
      detail.includes('invalid') || 
      detail.includes('not valid')
    )) {
      return true
    }
  }
  
  // Check error message field
  if (errorData.message && typeof errorData.message === 'string') {
    const message = errorData.message.toLowerCase()
    if (message.includes('token') && (
      message.includes('expired') || 
      message.includes('invalid') || 
      message.includes('not valid')
    )) {
      return true
    }
  }
  
  return false
}

/**
 * Get the appropriate redirect URL based on current path
 * @param {string} currentPath - Current pathname
 * @returns {string} - Redirect URL
 */
export const getRedirectUrl = (currentPath) => {
  if (!currentPath) return '/login'
  
  // Check which panel the user is in
  if (currentPath.startsWith('/admin')) {
    return '/login' // Admin panel -> login page
  } else if (currentPath.startsWith('/service-provider-panel')) {
    return '/login' // Service provider -> login page
  } else if (currentPath.startsWith('/local-expert')) {
    return '/login' // Local expert -> login page
  } else if (currentPath.startsWith('/dashboard')) {
    return '/login' // User dashboard -> login page
  } else if (currentPath.startsWith('/help-me-decide')) {
    return '/login' // Help me decide -> login page
  }
  
  // Default to login page for authenticated routes
  // Only redirect to home for public routes
  return '/login'
}

/**
 * Clear all authentication data
 * ✅ SECURE: No localStorage token removal needed
 * NextAuth handles token cleanup automatically via signOut
 */
export const clearAuthData = () => {
  logger.auth('Clearing auth data via NextAuth signOut')
  
  // Clear any non-sensitive app-specific data from localStorage if needed
  // DO NOT store or remove tokens from localStorage
  
  // Examples of safe data to clear:
  // localStorage.removeItem('redirect')
  // localStorage.removeItem('helpRedirect')
  // localStorage.removeItem('savedActivities')
  // localStorage.removeItem('savedPlaces')
  
  // ❌ REMOVED (security risk):
  // localStorage.removeItem('accessToken')
  // localStorage.removeItem('refreshToken')
  // localStorage.removeItem('userData')
}

/**
 * Handle token expiration - logout and redirect
 * @param {string} currentPath - Current pathname (optional)
 * @param {function} signOutCallback - NextAuth signOut function (optional, uses global if not provided)
 */
export const handleTokenExpiration = async (currentPath = null, signOutCallback = null) => {
  logger.auth('Token expired - logging out user')
  
  // Clear authentication data (non-sensitive only)
  clearAuthData()
  
  // Use provided signOut or fall back to global signOut
  const signOut = signOutCallback || globalSignOutFunction
  
  // Call NextAuth signOut to clear session
  if (signOut && typeof signOut === 'function') {
    try {
      console.log('🔒 Calling NextAuth signOut to clear session')
      await signOut({ redirect: false }) // Don't let NextAuth redirect, we'll handle it
    } catch (error) {
      console.error('Error calling NextAuth signOut:', error)
    }
  } else {
    console.warn('⚠️ No NextAuth signOut function available. Session may not be fully cleared.')
  }
  
  // Get current path from window if not provided
  const path = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/')
  
  // Get appropriate redirect URL
  const redirectUrl = getRedirectUrl(path)
  
  console.log(`🔒 Redirecting to: ${redirectUrl}`)
  
  // Redirect to appropriate page
  if (typeof window !== 'undefined') {
    // Small delay to ensure signOut completes
    setTimeout(() => {
      // Use window.location.replace to prevent back button navigation
      window.location.replace(redirectUrl)
    }, 100)
  }
}

/**
 * Create a global event listener for token expiration
 * This can be used to broadcast token expiration across tabs/windows
 * ✅ SECURE: Uses temporary flag instead of storing tokens
 */
export const broadcastTokenExpiration = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    // Trigger storage event for other tabs using a temporary flag
    localStorage.setItem('tokenExpired', Date.now().toString())
    localStorage.removeItem('tokenExpired')
  }
}

/**
 * Setup listener for token expiration events from other tabs
 * ✅ SECURE: Only listens for expiration flag, not token values
 * @param {function} callback - Callback to execute when token expiration is detected
 */
export const setupTokenExpirationListener = (callback) => {
  if (typeof window === 'undefined') return null
  
  const handleStorageChange = (e) => {
    // Only respond to tokenExpired flag changes
    if (e.key === 'tokenExpired') {
      callback()
    }
  }
  
  window.addEventListener('storage', handleStorageChange)
  
  // Return cleanup function
  return () => window.removeEventListener('storage', handleStorageChange)
}
