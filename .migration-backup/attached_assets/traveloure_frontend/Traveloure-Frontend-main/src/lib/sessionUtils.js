/**
 * Utility functions for handling session data with nested structure support
 */

/**
 * Get access token from session with fallback support for nested structure
 * @param {Object} session - NextAuth session object
 * @returns {string|null} - Access token or null if not found
 */
export const getSessionAccessToken = (session) => {
  if (!session) return null
  
  return session?.backendData?.accessToken || 
         session?.backendData?.backendData?.accessToken || 
         null
}

/**
 * Get user ID from session
 * @param {Object} session - NextAuth session object
 * @returns {string|null} - User ID or null if not found
 */
export const getSessionUserId = (session) => {
  if (!session) return null
  
  return session?.user?.id || null
}

/**
 * Get user data from session with fallback support for nested structure
 * @param {Object} session - NextAuth session object
 * @returns {Object|null} - User data or null if not found
 */
export const getSessionUserData = (session) => {
  if (!session) return null
  
  // Try nested backendData first, then fallback to direct backendData
  const nestedBackendData = session?.backendData?.backendData
  const userData = nestedBackendData?.user || session?.backendData?.user || session?.user
  
  return userData || null
}

/**
 * Check if user is authenticated
 * @param {Object} session - NextAuth session object
 * @returns {boolean} - True if authenticated
 */
export const isAuthenticated = (session) => {
  return !!getSessionAccessToken(session)
}

/**
 * Get authorization header for API calls
 * @param {Object} session - NextAuth session object
 * @returns {Object} - Authorization header object
 */
export const getAuthHeader = (session) => {
  const accessToken = getSessionAccessToken(session)
  
  if (!accessToken) {
    throw new Error('No access token available')
  }
  
  return {
    'Authorization': `Bearer ${accessToken}`
  }
}























