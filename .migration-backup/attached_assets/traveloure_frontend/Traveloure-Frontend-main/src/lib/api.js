// API utility functions for authenticated requests
// ✅ SECURE VERSION - Uses NextAuth session instead of localStorage
import { getSession } from 'next-auth/react'
import { isTokenExpired, handleTokenExpiration } from './authUtils'
import logger from './logger'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Get auth headers with access token from NextAuth session
export const getAuthHeaders = async () => {
  // ✅ SECURE: Get token from NextAuth session instead of localStorage
  const session = await getSession()
  const accessToken = session?.backendData?.accessToken
  
  return {
    'Content-Type': 'application/json',
    ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
  }
}

// Make authenticated API request
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`
  const headers = await getAuthHeaders()

  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  }

  try {
    const response = await fetch(url, config)
    
    // Clone response to read body multiple times
    const responseClone = response.clone()
    
    // Try to parse response body to check for token expiration
    let responseData = null
    try {
      responseData = await responseClone.json()
    } catch (e) {
      // Response might not be JSON, continue with status code check
    }
    
    // Check if token is expired from response body (check before status code)
    if (responseData && isTokenExpired(responseData)) {
      logger.debug('🔒 Token expired detected from response body:', responseData)
      handleTokenExpiration()
      throw new Error('Token expired')
    }
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Double-check for token expiration in 401 responses - if detected, logout immediately
      if (responseData && isTokenExpired(responseData)) {
        logger.debug('🔒 Token expired detected in 401 response - logging out immediately')
        handleTokenExpiration()
        throw new Error('Token expired')
      }
      
      // Check if this is a login/register endpoint - don't try to refresh on these
      const isAuthEndpoint = url.includes('/auth/login/') || 
                            url.includes('/auth/register/') ||
                            url.includes('/auth/refresh-token/')
      
      // ✅ SECURE: Get refresh token from NextAuth session instead of localStorage
      const session = await getSession()
      const refreshToken = session?.refreshToken
      
      if (!isAuthEndpoint && refreshToken) {
        try {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh-token/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refresh: refreshToken
            }),
          })

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            
            // ✅ SECURE: Do NOT store token in localStorage
            // NextAuth will automatically update the session
            logger.debug('✅ Token refreshed - NextAuth will update session automatically')
            
            // Retry the original request with new token
            const retryConfig = {
              ...config,
              headers: {
                ...config.headers,
                'Authorization': `Bearer ${refreshData.access}`
              }
            }
            
            return await fetch(url, retryConfig)
          } else {
            // Refresh failed, handle token expiration
            logger.debug('🔒 Token refresh failed')
            handleTokenExpiration()
            throw new Error('Authentication failed')
          }
        } catch (error) {
          logger.error('Token refresh failed:', error)
          handleTokenExpiration()
          throw error
        }
      } else {
        // No refresh token or auth endpoint - logout immediately
        if (isAuthEndpoint) {
          // For auth endpoints, just throw error without logout
          throw new Error('Authentication failed')
        }
        logger.debug('🔒 No refresh token available or auth endpoint - logging out')
        handleTokenExpiration()
        throw new Error('Authentication failed')
      }
    }

    return response
  } catch (error) {
    logger.error('API request failed:', error)
    throw error
  }
}

// Convenience methods
export const apiGet = (endpoint) => apiRequest(endpoint, { method: 'GET' })
export const apiPost = (endpoint, data) => apiRequest(endpoint, { 
  method: 'POST', 
  body: JSON.stringify(data) 
})
export const apiPut = (endpoint, data) => apiRequest(endpoint, { 
  method: 'PUT', 
  body: JSON.stringify(data) 
})
export const apiDelete = (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
