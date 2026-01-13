import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { isTokenExpired, handleTokenExpiration } from '../../../lib/authUtils'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export const fetchLocalExpertDashboard = createAsyncThunk(
  'localExpert/fetchDashboard',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/local-expert/dashboard/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
        console.log('🔒 Token expired detected in local expert dashboard')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in local expert dashboard')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        return rejectWithValue(errorData?.message || 'Failed to load dashboard')
      }

      const data = errorData || await response.json()
      return data
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to load dashboard')
    }
  }
)

export const fetchLocalExpertEarnings = createAsyncThunk(
  'localExpert/fetchEarnings',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/my-earnings/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
        console.log('🔒 Token expired detected in local expert earnings')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        // Check for 401 status
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in local expert earnings')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }
        
        return rejectWithValue(errorData?.message || errorData?.detail || 'Failed to load earnings')
      }

      const data = errorData || await response.json()
      // Handle response structure: { status, message, data }
      return data?.data || data
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to load earnings')
    }
  }
)

// Fetch local expert business profile
export const fetchLocalExpertBusinessProfile = createAsyncThunk(
  'localExpert/fetchBusinessProfile',
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/my-business-profile/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const responseClone = response.clone()

      let errorData = null
      try {
        errorData = await responseClone.json()
      } catch (e) {
        // Response might not be JSON
      }

      if (errorData && isTokenExpired(errorData)) {
        console.log('🔒 Token expired detected in local expert business profile')
        handleTokenExpiration()
        return rejectWithValue('Token expired - please login again')
      }

      if (!response.ok) {
        if (response.status === 401) {
          console.log('🔒 Unauthorized (401) in local expert business profile')
          handleTokenExpiration()
          return rejectWithValue('Authentication failed - please login again')
        }

        return rejectWithValue(errorData?.message || errorData?.detail || 'Failed to load business profile')
      }

      const data = errorData || await response.json()
      // API shape: { status, message, data }
      return data?.data || data
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to load business profile')
    }
  }
)

const localExpertSlice = createSlice({
  name: 'localExpert',
  initialState: {
    loading: false,
    error: null,
    dashboard: null,
    earnings: null,
    earningsLoading: false,
    earningsError: null,
    businessProfile: null,
    businessProfileLoading: false,
    businessProfileError: null,
  },
  reducers: {
    clearEarningsError: (state) => {
      state.earningsError = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLocalExpertDashboard.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchLocalExpertDashboard.fulfilled, (state, action) => {
        state.loading = false
        state.dashboard = action.payload
      })
      .addCase(fetchLocalExpertDashboard.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || 'Failed to load dashboard'
      })
      .addCase(fetchLocalExpertEarnings.pending, (state) => {
        state.earningsLoading = true
        state.earningsError = null
      })
      .addCase(fetchLocalExpertEarnings.fulfilled, (state, action) => {
        state.earningsLoading = false
        state.earnings = action.payload
      })
      .addCase(fetchLocalExpertEarnings.rejected, (state, action) => {
        state.earningsLoading = false
        state.earningsError = action.payload || 'Failed to load earnings'
      })
      // Business profile
      .addCase(fetchLocalExpertBusinessProfile.pending, (state) => {
        state.businessProfileLoading = true
        state.businessProfileError = null
      })
      .addCase(fetchLocalExpertBusinessProfile.fulfilled, (state, action) => {
        state.businessProfileLoading = false
        state.businessProfile = action.payload
      })
      .addCase(fetchLocalExpertBusinessProfile.rejected, (state, action) => {
        state.businessProfileLoading = false
        state.businessProfileError = action.payload || 'Failed to load business profile'
      })
  }
})

export const { clearEarningsError } = localExpertSlice.actions
export default localExpertSlice.reducer



