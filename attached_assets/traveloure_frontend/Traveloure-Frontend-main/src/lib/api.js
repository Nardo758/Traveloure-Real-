// API utility functions for authenticated requests
import { isTokenExpired, handleTokenExpiration } from './authUtils'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Get auth headers with access token
export const getAuthHeaders = () => {
  const accessToken = localStorage.getItem('accessToken')
  return {
    'Content-Type': 'application/json',
    ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
  }
}

// Make authenticated API request
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`
  const headers = getAuthHeaders()

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
      console.log('🔒 Token expired detected from response body:', responseData)
      handleTokenExpiration()
      throw new Error('Token expired')
    }
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Double-check for token expiration in 401 responses - if detected, logout immediately
      if (responseData && isTokenExpired(responseData)) {
        console.log('🔒 Token expired detected in 401 response - logging out immediately')
        handleTokenExpiration()
        throw new Error('Token expired')
      }
      
      // Check if this is a login/register endpoint - don't try to refresh on these
      const isAuthEndpoint = url.includes('/auth/login/') || 
                            url.includes('/auth/register/') ||
                            url.includes('/auth/refresh-token/')
      
      // If it's not an auth endpoint and we have a refresh token, try to refresh
      const refreshToken = localStorage.getItem('refreshToken')
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
            localStorage.setItem('accessToken', refreshData.access)
            
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
            console.log('🔒 Token refresh failed')
            handleTokenExpiration()
            throw new Error('Authentication failed')
          }
        } catch (error) {
          console.error('Token refresh failed:', error)
          handleTokenExpiration()
          throw error
        }
      } else {
        // No refresh token or auth endpoint - logout immediately
        if (isAuthEndpoint) {
          // For auth endpoints, just throw error without logout
          throw new Error('Authentication failed')
        }
        console.log('🔒 No refresh token available or auth endpoint - logging out')
        handleTokenExpiration()
        throw new Error('Authentication failed')
      }
    }

    return response
  } catch (error) {
    console.error('API request failed:', error)
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