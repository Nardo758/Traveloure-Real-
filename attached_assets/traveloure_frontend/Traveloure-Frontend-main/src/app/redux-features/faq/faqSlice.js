import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { toast } from 'sonner'
import { isTokenExpired, handleTokenExpiration } from '../../../lib/authUtils'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

// Helper function to get headers with token
const getHeaders = (token) => {
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  }
}

// Helper function to handle network errors (not HTTP errors)
const handleApiError = (error, rejectWithValue) => {
  // This handles network errors (fetch failures, not HTTP errors)
  const errorMessage = error.message || 'Network error occurred'
  console.error('Network error in FAQ thunk:', error)
  return rejectWithValue(errorMessage)
}

// Async thunk for fetching all FAQs
export const fetchFAQs = createAsyncThunk(
  'faq/fetchFAQs',
  async (token, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/faqs/`, {
        method: 'GET',
        headers: getHeaders(token)
      })

      // Clone response to read body multiple times
      const responseClone = response.clone()
      
      // Try to parse response body to check for token expiration
      let errorData = null
      try {
        errorData = await responseClone.json()
      } catch (e) {
        // Response might not be JSON
      }
      
      // Check if token is expired from response body
      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in fetch FAQs')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in fetch FAQs')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        return rejectWithValue(errorData?.message || errorData?.detail || 'Failed to fetch FAQs')
      }

      const data = errorData || await response.json()
      
      // Handle paginated response structure: { count, total_pages, data, status }
      if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
        return data.data
      }
      
      // Handle direct array response (backward compatibility)
      return Array.isArray(data) ? data : []
    } catch (error) {
      return handleApiError(error, rejectWithValue)
    }
  }
)

// Async thunk for creating a FAQ
export const createFAQ = createAsyncThunk(
  'faq/createFAQ',
  async ({ token, question, answer }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/faqs/`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({ question, answer })
      })

      // Clone response to read body multiple times
      const responseClone = response.clone()
      
      // Try to parse response body to check for token expiration
      let errorData = null
      try {
        errorData = await responseClone.json()
      } catch (e) {
        // Response might not be JSON
      }
      
      // Check if token is expired from response body
      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in create FAQ')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in create FAQ')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        const errorMessage = errorData?.message || errorData?.detail || 'Failed to create FAQ'
        toast.error(errorMessage)
        return rejectWithValue(errorMessage)
      }

      const data = errorData || await response.json()
      toast.success('FAQ created successfully!')
      return data
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while creating the FAQ'
      toast.error(errorMessage)
      return handleApiError(error, rejectWithValue)
    }
  }
)

// Async thunk for updating a FAQ
export const updateFAQ = createAsyncThunk(
  'faq/updateFAQ',
  async ({ token, faqId, question, answer }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/faqs/${faqId}/`, {
        method: 'PATCH',
        headers: getHeaders(token),
        body: JSON.stringify({ question, answer })
      })

      // Clone response to read body multiple times
      const responseClone = response.clone()
      
      // Try to parse response body to check for token expiration
      let errorData = null
      try {
        errorData = await responseClone.json()
      } catch (e) {
        // Response might not be JSON
      }
      
      // Check if token is expired from response body
      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in update FAQ')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in update FAQ')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        const errorMessage = errorData?.message || errorData?.detail || 'Failed to update FAQ'
        toast.error(errorMessage)
        return rejectWithValue(errorMessage)
      }

      const data = errorData || await response.json()
      toast.success('FAQ updated successfully!')
      return data
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while updating the FAQ'
      toast.error(errorMessage)
      return handleApiError(error, rejectWithValue)
    }
  }
)

// Async thunk for deleting a FAQ
export const deleteFAQ = createAsyncThunk(
  'faq/deleteFAQ',
  async ({ token, faqId }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${BASE_URL}/faqs/${faqId}/`, {
        method: 'DELETE',
        headers: getHeaders(token)
      })

      // Clone response to read body multiple times
      const responseClone = response.clone()
      
      // Try to parse response body to check for token expiration
      let errorData = null
      try {
        errorData = await responseClone.json()
      } catch (e) {
        // Response might not be JSON
      }
      
      // Check if token is expired from response body
      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in delete FAQ')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in delete FAQ')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        const errorMessage = errorData?.message || errorData?.detail || 'Failed to delete FAQ'
        toast.error(errorMessage)
        return rejectWithValue(errorMessage)
      }

      toast.success('FAQ deleted successfully!')
      return faqId
    } catch (error) {
      const errorMessage = error.message || 'An error occurred while deleting the FAQ'
      toast.error(errorMessage)
      return handleApiError(error, rejectWithValue)
    }
  }
)

const initialState = {
  faqs: [],
  loading: false,
  error: null
}

const faqSlice = createSlice({
  name: 'faq',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    resetFAQState: (state) => {
      state.faqs = []
      state.error = null
    }
  },
  extraReducers: (builder) => {
    // Fetch FAQs
    builder
      .addCase(fetchFAQs.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchFAQs.fulfilled, (state, action) => {
        state.loading = false
        state.faqs = Array.isArray(action.payload) ? action.payload : []
      })
      .addCase(fetchFAQs.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Create FAQ
    builder
      .addCase(createFAQ.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createFAQ.fulfilled, (state, action) => {
        state.loading = false
        // Don't add to state here - we'll refetch the list to ensure consistency
        // The page component will handle refetching after successful creation
      })
      .addCase(createFAQ.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Update FAQ
    builder
      .addCase(updateFAQ.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateFAQ.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.faqs.findIndex(faq => faq.id === action.payload.id)
          if (index !== -1) {
            state.faqs[index] = action.payload
          }
        }
      })
      .addCase(updateFAQ.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Delete FAQ
    builder
      .addCase(deleteFAQ.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteFAQ.fulfilled, (state, action) => {
        state.loading = false
        state.faqs = state.faqs.filter(faq => faq.id !== action.payload)
      })
      .addCase(deleteFAQ.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  }
})

export const { clearError, resetFAQState } = faqSlice.actions
export default faqSlice.reducer

