// Axios interceptor for handling token expiration globally
import axios from 'axios'
import { isTokenExpired, handleTokenExpiration } from './authUtils'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Request deduplication map to prevent duplicate API calls
const pendingRequests = new Map()

// Generate a unique key for each request
const getRequestKey = (config) => {
  return `${config.method?.toUpperCase() || 'GET'}_${config.url}_${JSON.stringify(config.params || {})}_${JSON.stringify(config.data || {})}`
}

// Create an axios instance
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
})

// Request interceptor to add auth token and deduplicate requests
axiosInstance.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken')
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    
    // Request deduplication - prevent duplicate requests
    const requestKey = getRequestKey(config)
    
    // Check if there's already a pending request with the same key
    if (pendingRequests.has(requestKey)) {
      console.log(`🔄 Deduplicating request: ${requestKey}`)
      // Return the existing promise instead of making a new request
      return Promise.reject({
        ...new Error('Duplicate request cancelled'),
        isDuplicate: true,
        originalPromise: pendingRequests.get(requestKey)
      })
    }
    
    // Create a promise for this request
    const requestPromise = Promise.resolve(config)
    pendingRequests.set(requestKey, requestPromise)
    
    // Remove from map after request completes (success or error)
    requestPromise
      .then(() => {
        setTimeout(() => pendingRequests.delete(requestKey), 100)
      })
      .catch(() => {
        setTimeout(() => pendingRequests.delete(requestKey), 100)
      })
    
    return config
  },
  (error) => {
    // Clean up on request error
    if (error.config) {
      const requestKey = getRequestKey(error.config)
      pendingRequests.delete(requestKey)
    }
    return Promise.reject(error)
  }
)

// Response interceptor to handle token expiration
axiosInstance.interceptors.response.use(
  (response) => {
    // Clean up pending request on success
    if (response.config) {
      const requestKey = getRequestKey(response.config)
      pendingRequests.delete(requestKey)
    }
    // Return successful response
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Clean up pending request on error
    if (originalRequest) {
      const requestKey = getRequestKey(originalRequest)
      pendingRequests.delete(requestKey)
    }

    // Handle duplicate request error
    if (error.isDuplicate && error.originalPromise) {
      return error.originalPromise
    }

    // Check if error response contains token expiration FIRST (before 401 check)
    if (error.response?.data) {
      const errorData = error.response.data
      
      // Check for token expiration using our utility
      if (isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in axios response:', errorData)
        handleTokenExpiration()
        return Promise.reject(new Error('Token expired'))
      }
    }

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const errorData = error.response?.data
      
      // Check if this is a login/register endpoint - don't logout on these
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login/') || 
                            originalRequest.url?.includes('/auth/register/') ||
                            originalRequest.url?.includes('/auth/refresh-token/')
      
      // If it's an auth endpoint, just reject without logout
      if (isAuthEndpoint) {
        return Promise.reject(error)
      }
      
      // Double-check for token expiration in 401 responses - if detected, logout immediately
      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in 401 response - logging out immediately')
        handleTokenExpiration()
        return Promise.reject(new Error('Token expired'))
      }

      // For any 401 on non-auth endpoints, try to refresh token once
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh-token/`, {
            refresh: refreshToken,
          })

          if (response.data?.access) {
            localStorage.setItem('accessToken', response.data.access)
            
            // Update the authorization header
            originalRequest.headers.Authorization = `Bearer ${response.data.access}`
            
            // Retry the original request
            return axiosInstance(originalRequest)
          } else {
            // No access token in refresh response, logout
            console.log('🔒 No access token in refresh response - logging out')
            handleTokenExpiration()
            return Promise.reject(new Error('Token refresh failed'))
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError)
          
          // Check if refresh error also indicates token expiration
          if (refreshError.response?.data && isTokenExpired(refreshError.response.data)) {
            console.log('🔒 Refresh token also expired - logging out')
          }
          
          // Any refresh error means we should logout
          handleTokenExpiration()
          return Promise.reject(refreshError)
        }
      } else {
        // No refresh token - logout immediately
        console.log('🔒 No refresh token available - logging out')
        handleTokenExpiration()
        return Promise.reject(new Error('Authentication failed'))
      }
    }

    return Promise.reject(error)
  }
)

/**
 * Setup axios interceptors for a custom axios instance
 * Use this if you have custom axios instances in your app
 * @param {Object} customAxios - Custom axios instance
 */
export const setupAxiosInterceptors = (customAxios) => {
  // Request interceptor
  customAxios.interceptors.request.use(
    (config) => {
      const accessToken = localStorage.getItem('accessToken')
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor
  customAxios.interceptors.response.use(
    (response) => response,
    async (error) => {
      // Check for token expiration FIRST (before 401 check)
      if (error.response?.data && isTokenExpired(error.response.data)) {
        console.log('🔒 Token expired detected in custom axios response:', error.response.data)
        handleTokenExpiration()
        return Promise.reject(new Error('Token expired'))
      }

      // Handle 401
      if (error.response?.status === 401 && !error.config._retry) {
        error.config._retry = true

        const errorData = error.response?.data
        
        // Check if this is a login/register endpoint - don't logout on these
        const isAuthEndpoint = error.config.url?.includes('/auth/login/') || 
                              error.config.url?.includes('/auth/register/') ||
                              error.config.url?.includes('/auth/refresh-token/')

        // If it's an auth endpoint, just reject without logout
        if (isAuthEndpoint) {
          return Promise.reject(error)
        }
        
        // Double-check for token expiration in 401 responses - if detected, logout immediately
        if (errorData && isTokenExpired(errorData)) {
          console.log('🔒 Token expired detected in 401 response - logging out immediately')
          handleTokenExpiration()
          return Promise.reject(new Error('Token expired'))
        }

        // For any 401 on non-auth endpoints, try to refresh token once
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          try {
            const response = await axios.post(`${API_BASE_URL}/auth/refresh-token/`, {
              refresh: refreshToken,
            })

            if (response.data?.access) {
              localStorage.setItem('accessToken', response.data.access)
              error.config.headers.Authorization = `Bearer ${response.data.access}`
              return customAxios(error.config)
            } else {
              // No access token in refresh response, logout
              console.log('🔒 No access token in refresh response - logging out')
              handleTokenExpiration()
              return Promise.reject(new Error('Token refresh failed'))
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError)
            
            // Check if refresh error also indicates token expiration
            if (refreshError.response?.data && isTokenExpired(refreshError.response.data)) {
              console.log('🔒 Refresh token also expired - logging out')
            }
            
            // Any refresh error means we should logout
            handleTokenExpiration()
            return Promise.reject(refreshError)
          }
        } else {
          // No refresh token - logout immediately
          console.log('🔒 No refresh token available - logging out')
          handleTokenExpiration()
          return Promise.reject(new Error('Authentication failed'))
        }
      }

      return Promise.reject(error)
    }
  )

  return customAxios
}

// Setup default axios instance with interceptors
setupAxiosInterceptors(axios)

export default axiosInstance

