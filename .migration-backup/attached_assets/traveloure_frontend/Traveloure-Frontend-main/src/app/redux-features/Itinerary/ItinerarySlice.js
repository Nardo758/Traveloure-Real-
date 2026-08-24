import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";

import { toast } from "sonner";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Helper function to get headers with token if available
const getHeaders = (token) => {
  return token ? { Authorization: `Bearer ${token}` } : {};
};
// Async Thunk for Trip Detail Data
export const tripDetailData = createAsyncThunk( 
  "Itinerary/tripDetailData",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      const headers = getHeaders(token);
         
      const response = await axios.post(
        `${BASE_URL}/ai/affiliate-explore/`,
        payload,
        { headers }
      );

      toast.success(response.data.message || "Data loaded successfully");
      return response.data;
    } catch (error) {
      
      // Check if it's a 402 error (insufficient credits)
      if (error.response?.status === 402) {
        // Don't show toast for 402 errors, let the component handle it
        return rejectWithValue({
          status: 402,
          data: error.response?.data,
          message: error.response?.data?.error || "Insufficient credits"
        });
      }
      
      // Check if it's a 429 error (rate limit / IP restriction)
      if (error.response?.status === 429) {
        const errorMessage = error.response?.data?.error || 
                           error.response?.data?.message ||
                           "This API has already been used from your IP address. Please login to continue using our services.";
        // Don't show toast here, let the component handle it to show dynamic message
        return rejectWithValue({
          status: 429,
          data: error.response?.data,
          message: errorMessage,
          error: errorMessage,
          user_type: error.response?.data?.user_type || 'anonymous'
        });
      }
      
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.response?.data?.destination?.[0] ||
        error.response?.data?.detail ||
        "An error occurred while creating the trip.";

      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);


export const selectservices = createAsyncThunk(
  "Itinerary/selectservices",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/generate-explore/`,
        payload,
        { headers: getHeaders(token) }
      );

      // Store itinerary_id in localStorage if it exists in the response
      if (response.data && response.data.itinerary_id) {
        localStorage.setItem("itinerary_id", response.data.itinerary_id);
      }

      toast.success(response.data.message || "Selected");
      return response.data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.destination?.[0] ||
        error.response?.data?.detail ||
        "An error occurred while creating the trip.";

      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

export const selectai = createAsyncThunk(
  "Itinerary/selectai",
  async ( { token, payload }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/services/save/`,
        payload,
        { headers: getHeaders(token) }
      );

      toast.success(response.data.message || "Selected");
      return response.data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.destination?.[0] ||
        error.response?.data?.detail ||
        "An error occurred while creating the trip.";

      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Wallet Recharge API
export const walletRecharge = createAsyncThunk(
  "Itinerary/walletRecharge",
  async ({ token, amount }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/plan/wallet/recharge/`,
        { amount },
        { headers: getHeaders(token) }
      );

      toast.success(response.data.message || "Payment successful!");
      return response.data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.response?.data?.amount[0]

      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Destination Search API
export const searchDestinations = createAsyncThunk(
  "Itinerary/searchDestinations",
  async ({ token, searchQuery }, { rejectWithValue }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/viator/destination`,
        {
          headers: getHeaders(token),
          params: { search: searchQuery }
        }
      );

      // Don't show toast for search - it's a background operation
      return response.data;
    } catch (error) {
      // Don't show error toast for search failures - handle silently
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.message ||
        "Failed to search destinations";

      // Return empty array on error instead of rejecting
      return rejectWithValue({ message: errorMessage, data: [] });
    }
  }
);

// Wallet Transactions/History API with pagination support
export const getWalletTransactions = createAsyncThunk(
  "Itinerary/getWalletTransactions",
  async ({ token, page = 1, limit = 10, append = false }, { rejectWithValue }) => {
    try {
      // Try multiple possible endpoints with pagination
      const endpoints = [
        `${BASE_URL}/auth/profile/file/`,
        `${BASE_URL}/plan/wallet/transactions/`,
        `${BASE_URL}/plan/wallet/history/`,
        `${BASE_URL}/auth/wallet/transactions/`,
        `${BASE_URL}/plan/wallet/`,
      ];

      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
          // Build query parameters for pagination
          const params = {};
          if (page) params.page = page;
          if (limit) params.limit = limit;
          // Also try common pagination parameter names
          if (page) params.page_number = page;
          if (limit) params.page_size = limit;

          const response = await axios.get(endpoint, {
            headers: getHeaders(token),
            params: Object.keys(params).length > 0 ? params : undefined
          });
          
          // If we get a successful response, return it with pagination info
          if (response.data) {
            return {
              data: response.data,
              page: page,
              append: append,
              hasMore: response.data.has_next_page || response.data.next || response.data.has_more || false,
              total: response.data.total || response.data.count || null,
            };
          }
        } catch (error) {
          lastError = error;
          // Continue to next endpoint if this one fails
          continue;
        }
      }

      // If all endpoints failed, throw the last error
      throw lastError || new Error("No transaction endpoint available");
    } catch (error) {
      // Don't show error toast for 404s (endpoint might not exist yet)
      if (error.response?.status === 404) {
        return rejectWithValue({ status: 404, message: "Transaction endpoint not found" });
      }
      
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.message ||
        "Failed to fetch transaction history";

      // Only show toast for non-404 errors
      if (error.response?.status !== 404) {
        toast.error(errorMessage);
      }
      return rejectWithValue(errorMessage);
    }
  }
);

// Redux Slice
const ItinerarySlice = createSlice({
  name: "Itinerary",
  initialState: {
    tripDetailData: [],
    hotelDetailData: [],
    srvicesDetailData: [],
    aiDetailData: [],
    paymentData: null,
    walletTransactions: [],
    transactionsLoading: false,
    transactionsPage: 1,
    transactionsHasMore: false,
    transactionsTotal: null,
    loading: false,
    error: null,
    // Destination search state
    destinationSearchResults: [],
    destinationSearchLoading: false,
    destinationSearchError: null,
  },
  reducers: {
    resetItineraryData: (state) => {
      state.tripDetailData = [];
      state.hotelDetailData = [];
      state.srvicesDetailData = [];
      state.aiDetailData = [];
      state.paymentData = null;
      state.error = null;
      state.loading = false;
    },
    clearDestinationSearchResults: (state) => {
      state.destinationSearchResults = [];
      state.destinationSearchError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(tripDetailData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(tripDetailData.fulfilled, (state, action) => {
        state.loading = false;
        // Store the data object from the response
        state.tripDetailData = action.payload?.data || action.payload;
      })
      .addCase(tripDetailData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(selectservices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(selectservices.fulfilled, (state, action) => {
        state.loading = false;
        state.srvicesDetailData = action.payload;
      })
      .addCase(selectservices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(selectai.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(selectai.fulfilled, (state, action) => {
        state.loading = false;
        state.aiDetailData = action.payload;
      })
      .addCase(selectai.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(walletRecharge.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(walletRecharge.fulfilled, (state, action) => {
        state.loading = false;
        state.paymentData = action.payload;
      })
      .addCase(walletRecharge.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(getWalletTransactions.pending, (state) => {
        state.transactionsLoading = true;
        state.error = null;
      })
      .addCase(getWalletTransactions.fulfilled, (state, action) => {
        state.transactionsLoading = false;
        
        // Extract transactions from response
        let newTransactions = [];
        const payload = action.payload?.data || action.payload;
        
        if (Array.isArray(payload)) {
          newTransactions = payload;
        } else if (payload?.data && Array.isArray(payload.data)) {
          newTransactions = payload.data;
        } else if (payload?.transactions && Array.isArray(payload.transactions)) {
          newTransactions = payload.transactions;
        } else if (payload?.results && Array.isArray(payload.results)) {
          newTransactions = payload.results;
        }
        
        // Append or replace based on append flag
        if (action.payload?.append && newTransactions.length > 0) {
          state.walletTransactions = [...state.walletTransactions, ...newTransactions];
        } else {
          state.walletTransactions = newTransactions;
        }
        
        // Update pagination state
        state.transactionsPage = action.payload?.page || 1;
        state.transactionsHasMore = action.payload?.hasMore || false;
        state.transactionsTotal = action.payload?.total || null;
      })
      .addCase(getWalletTransactions.rejected, (state, action) => {
        state.transactionsLoading = false;
        state.error = action.payload;
        // Set empty array if endpoint not found (404)
        if (action.payload?.status === 404) {
          state.walletTransactions = [];
          state.transactionsHasMore = false;
        }
      })
      .addCase(searchDestinations.pending, (state) => {
        state.destinationSearchLoading = true;
        state.destinationSearchError = null;
      })
      .addCase(searchDestinations.fulfilled, (state, action) => {
        state.destinationSearchLoading = false;
        state.destinationSearchResults = action.payload?.data || [];
        state.destinationSearchError = null;
      })
      .addCase(searchDestinations.rejected, (state, action) => {
        state.destinationSearchLoading = false;
        state.destinationSearchError = action.payload?.message || "Failed to search destinations";
        // Set empty array on error
        state.destinationSearchResults = action.payload?.data || [];
      });
  },
});

export default ItinerarySlice.reducer;
export const { resetItineraryData, clearDestinationSearchResults } = ItinerarySlice.actions;
