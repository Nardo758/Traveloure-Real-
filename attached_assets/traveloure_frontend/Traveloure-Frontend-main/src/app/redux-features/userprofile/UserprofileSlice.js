import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Helper function to get headers with token if available
const getHeaders = (token) => {
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Helper function to extract error message
const getErrorMessage = (error) => {
  console.error("API Error:", error);

  return (
    error?.response?.data?.message ||
    error?.response?.data?.destination?.[0] ||
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.response?.error ||
    error?.message ||
    "An unexpected error occurred."
  );
};

// ✅ Get user itineraries
export const getMyItineraries = createAsyncThunk(
  "userprofile/getMyItineraries",
  async ({ token }, { rejectWithValue }) => {
    try {
      
      const response = await axios.get(`${BASE_URL}/ai/my-itineraries/`, {
        headers: getHeaders(token),
      });

      return response?.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// ✅ Redux Slice
const UserprofileSlice = createSlice({
  name: "UserprofileSlice",
  initialState: {
    alltrip: [],
    loading: false,
    error: null,
  },
  reducers: {
    // Clear error
    clearError: (state) => {
      state.error = null;
    },
    // Reset state
    resetUserProfileState: (state) => {
      state.alltrip = [];
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get my itineraries
      .addCase(getMyItineraries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getMyItineraries.fulfilled, (state, action) => {
        state.loading = false;
        state.alltrip = action.payload;
      })
      .addCase(getMyItineraries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

// Export actions
export const {
  clearError,
  resetUserProfileState,
} = UserprofileSlice.actions;

export default UserprofileSlice.reducer;
