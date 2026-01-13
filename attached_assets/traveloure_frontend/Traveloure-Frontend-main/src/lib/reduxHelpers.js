// Helper utilities for Redux slices to handle token expiration
import { isTokenExpired, handleTokenExpiration } from './authUtils'

/**
 * Handle API error in Redux async thunk
 * Checks for token expiration and handles it automatically
 * @param {Object} error - Error object from axios or fetch
 * @param {Function} rejectWithValue - Redux Toolkit's rejectWithValue function
 * @returns {Promise} - Rejected promise with error message
 */
export const handleReduxApiError = (error, rejectWithValue) => {
  // Check if error response contains token expiration FIRST (before 401 check)
  if (error.response?.data) {
    const errorData = error.response.data
    
    // Check for token expiration
    if (isTokenExpired(errorData)) {
      console.log('🔒 Token expired detected in Redux thunk:', errorData)
      handleTokenExpiration()
      return rejectWithValue('Token expired - please login again')
    }
  }
  
  // Check for 401 status code (but only if token expiration wasn't already detected)
  if (error.response?.status === 401) {
    // Double-check for token expiration in 401 responses
    if (error.response?.data && isTokenExpired(error.response.data)) {
      console.log('🔒 Token expired detected in 401 response')
      handleTokenExpiration()
      return rejectWithValue('Token expired - please login again')
    }
    
    console.log('🔒 Unauthorized (401) in Redux thunk')
    handleTokenExpiration()
    return rejectWithValue('Authentication failed - please login again')
  }
  
  // Return original error message
  const errorMessage = 
    error.response?.data?.message || 
    error.response?.data?.detail || 
    error.response?.data?.error ||
    error.message || 
    'An error occurred'
  
  return rejectWithValue(errorMessage)
}

/**
 * Wrapper for axios calls in Redux async thunks
 * Automatically handles token expiration
 * @param {Function} axiosCall - Async function that makes axios call
 * @param {Function} rejectWithValue - Redux Toolkit's rejectWithValue function
 * @returns {Promise} - Promise with response data or rejected error
 */
export const withTokenExpirationHandling = async (axiosCall, rejectWithValue) => {
  try {
    const response = await axiosCall()
    return response.data
  } catch (error) {
    return handleReduxApiError(error, rejectWithValue)
  }
}

/**
 * Get auth headers for axios requests in Redux
 * @param {string} token - Access token (optional, will get from localStorage if not provided)
 * @returns {Object} - Headers object with Authorization
 */
export const getReduxAuthHeaders = (token = null) => {
  const accessToken = token || localStorage.getItem('accessToken')
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

