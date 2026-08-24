import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

// Async thunk for sending a contract
export const sendContract = createAsyncThunk(
  'contract/sendContract',
  async ({ contractData, token }, { rejectWithValue }) => {
    try {
    
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      
      // Handle file uploads with FormData
      let body, headers
      if (contractData.file) {
        // Use FormData for file uploads
        const formData = new FormData()
        formData.append('created_for', contractData.created_for)
        formData.append('title', contractData.title)
        formData.append('trip_to', contractData.trip_to)
        formData.append('description', contractData.description)
        formData.append('amount', parseFloat(contractData.amount))
        formData.append('attachment', contractData.file)
        
        // Add category_ids and subcategory_ids if they exist
        // For FormData, append each ID with the same key name to create an array
        if (contractData.category_ids && Array.isArray(contractData.category_ids)) {
          contractData.category_ids.forEach((id) => {
            formData.append('category_ids', id)
          })
        }
        if (contractData.subcategory_ids && Array.isArray(contractData.subcategory_ids)) {
          contractData.subcategory_ids.forEach((id) => {
            formData.append('subcategory_ids', id)
          })
        }
        
        body = formData
        headers = {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type for FormData, let browser set it with boundary
        }
      } else {
        // Use JSON for non-file uploads
        const payload = {
          created_for: contractData.created_for,
          title: contractData.title,
          trip_to: contractData.trip_to,
          description: contractData.description,
          amount: parseFloat(contractData.amount)
        }
        
        // Add category_ids and subcategory_ids if they exist
        if (contractData.category_ids && Array.isArray(contractData.category_ids)) {
          payload.category_ids = contractData.category_ids
        }
        if (contractData.subcategory_ids && Array.isArray(contractData.subcategory_ids)) {
          payload.subcategory_ids = contractData.subcategory_ids
        }
        
        body = JSON.stringify(payload)
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      }
      
      const response = await fetch(`${apiBaseUrl}/plan/contracts/`, {
        method: 'POST',
        headers,
        body
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // Handle 400 error with status false (Stripe onboarding required)
        if (response.status === 400 && errorData.status === false) {
          // Set onboarding requirement in state and throw error to prevent success toast
          return rejectWithValue({ 
            requiresOnboarding: true, 
            message: errorData.message || 'Stripe onboarding required',
            errorData 
          })
        }
        
        throw new Error(errorData.message || 'Failed to send contract')
      }

      const data = await response.json()
      return data
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Async thunk for getting contracts
export const getContracts = createAsyncThunk(
  'contract/getContracts',
  async (token, { rejectWithValue }) => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/plan/contracts/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch contracts')
      }

      const data = await response.json()
      return data
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Async thunk for accepting a contract
export const acceptContract = createAsyncThunk(
  'contract/acceptContract',
  async ({ contractId, token }, { rejectWithValue }) => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/plan/contracts/decision/${contractId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "accepted"
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // Check if this is a Stripe onboarding requirement
        if (errorData.message && errorData.message.includes('Stripe onboarding')) {
          return rejectWithValue({
            message: errorData.message,
            requiresOnboarding: true,
            status: errorData.status
          })
        }
        
        throw new Error(errorData.message || 'Failed to accept contract')
      }

      const data = await response.json()
      return { contractId, data }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Async thunk for rejecting a contract
export const rejectContract = createAsyncThunk(
  'contract/rejectContract',
  async ({ contractId, token }, { rejectWithValue }) => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBaseUrl}/plan/contracts/decision/${contractId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "rejected"
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // Check if this is a Stripe onboarding requirement
        if (errorData.message && errorData.message.includes('Stripe onboarding')) {
          return rejectWithValue({
            message: errorData.message,
            requiresOnboarding: true,
            status: errorData.status
          })
        }
        
        throw new Error(errorData.message || 'Failed to reject contract')
      }

      const data = await response.json()
      return { contractId, data }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Async thunk for checking contract status
export const checkContractStatus = createAsyncThunk(
  'contract/checkContractStatus',
  async ({ token ,withChat}, { rejectWithValue }) => {
    try {
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      
      // Validate withChat parameter
      if (!withChat || withChat === 'undefined') {
        throw new Error('Invalid chat ID provided')
      }
      
      const response = await fetch(`${apiBaseUrl}/plan/contract-status/check/?with_chat=${withChat}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      })


      if (!response.ok) {
        // Check if response is HTML (error page) instead of JSON
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('text/html')) {
          throw new Error(`Server returned HTML error page (${response.status}): ${response.statusText}`)
        }
        
        let errorData
        try {
          errorData = await response.json()
        } catch (parseError) {
          throw new Error(`Server error (${response.status}): ${response.statusText}`)
        }
        
        // Handle "No contract found" as a valid case (show_contract = false)
        if (response.status === 404 || errorData.message === 'No contract found') {
          return { show_contract: false, message: errorData.message }
        }
        
        throw new Error(errorData.message || 'Failed to check contract status')
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('🔌 checkContractStatus - Error:', error)
      return rejectWithValue(error.message)
    }
  }
)

const contractSlice = createSlice({
  name: 'contract',
  initialState: {
    contracts: [],
    loading: false,
    error: null,
    sendContractLoading: false,
    sendContractError: null,
    requiresOnboarding: false,
    onboardingMessage: null,
    checkContractStatusLoading: false,
    checkContractStatusError: null,
    contractStatusData: null,
    showContract: false, // Controls whether to show Create Contract button
    contractPaymentUrls: {}, // Store payment URLs for shared access across pages
  },
  reducers: {
    clearContractError: (state) => {
      state.error = null
      state.sendContractError = null
    },
    clearOnboardingRequirement: (state) => {
      state.requiresOnboarding = false
      state.onboardingMessage = null
    },
    storePaymentUrl: (state, action) => {
      const { contractId, paymentUrl } = action.payload
      state.contractPaymentUrls[contractId] = paymentUrl
    },
    addContractMessage: (state, action) => {
      // Add a contract message to the contracts array
      state.contracts.unshift(action.payload)
    },
    updateContractStatus: (state, action) => {
      const { contractId, status, payment_url } = action.payload
      const contract = state.contracts.find(c => c.id === contractId)
      if (contract) {
        contract.status = status
        if (payment_url) {
          contract.payment_url = payment_url
        }
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Send contract
      .addCase(sendContract.pending, (state) => {
        state.sendContractLoading = true
        state.sendContractError = null
      })
      .addCase(sendContract.fulfilled, (state, action) => {
        state.sendContractLoading = false
        state.contracts.unshift(action.payload)
      })
      .addCase(sendContract.rejected, (state, action) => {
        state.sendContractLoading = false
        
        // Check if this is an onboarding requirement error
        if (action.payload && action.payload.requiresOnboarding) {
          state.requiresOnboarding = true
          state.onboardingMessage = action.payload.message
        } else {
          state.sendContractError = action.payload
        }
      })
      // Get contracts
      .addCase(getContracts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(getContracts.fulfilled, (state, action) => {
        state.loading = false
        state.contracts = action.payload
      })
      .addCase(getContracts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Accept contract
      .addCase(acceptContract.pending, (state) => {
        state.sendContractLoading = true
        state.sendContractError = null
      })
      .addCase(acceptContract.fulfilled, (state, action) => {
        state.sendContractLoading = false
        // Update the contract status in the contracts array
        const contract = state.contracts.find(c => c.id === action.payload.contractId)
        if (contract) {
          contract.status = 'accepted'
          contract.is_accepted = true
          // Store payment URL from the response
          if (action.payload.data && action.payload.data.payment_url) {
            contract.payment_url = action.payload.data.payment_url
          }
        }
      })
      .addCase(acceptContract.rejected, (state, action) => {
        state.sendContractLoading = false
        
        // Check if this is an onboarding requirement error
        if (action.payload && action.payload.requiresOnboarding) {
          state.requiresOnboarding = true
          state.onboardingMessage = action.payload.message
        } else {
          state.sendContractError = action.payload
        }
      })
      // Reject contract
      .addCase(rejectContract.pending, (state) => {
        state.sendContractLoading = true
        state.sendContractError = null
      })
      .addCase(rejectContract.fulfilled, (state, action) => {
        state.sendContractLoading = false
        // Update the contract status in the contracts array
        const contract = state.contracts.find(c => c.id === action.payload.contractId)
        if (contract) {
          contract.status = 'rejected'
          contract.is_accepted = false
        }
      })
      .addCase(rejectContract.rejected, (state, action) => {
        state.sendContractLoading = false
        
        // Check if this is an onboarding requirement error
        if (action.payload && action.payload.requiresOnboarding) {
          state.requiresOnboarding = true
          state.onboardingMessage = action.payload.message
        } else {
          state.sendContractError = action.payload
        }
      })
      // Check contract status
      .addCase(checkContractStatus.pending, (state) => {
        state.checkContractStatusLoading = true
        state.checkContractStatusError = null
      })
      .addCase(checkContractStatus.fulfilled, (state, action) => {
        state.checkContractStatusLoading = false
        state.contractStatusData = action.payload
        state.showContract = action.payload.show_contract || false
       
      
      })
      .addCase(checkContractStatus.rejected, (state, action) => {
        state.checkContractStatusLoading = false
        state.checkContractStatusError = action.payload
        // Set showContract to false when API fails
        state.showContract = false
        console.error('🔌 Contract status check failed:', action.payload)
      })
  }
})

export const { clearContractError, clearOnboardingRequirement, storePaymentUrl, addContractMessage, updateContractStatus } = contractSlice.actions
export default contractSlice.reducer
