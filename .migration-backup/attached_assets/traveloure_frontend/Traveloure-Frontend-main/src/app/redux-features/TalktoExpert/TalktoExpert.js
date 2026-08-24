import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Helper function to get headers with token if available
const getHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
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

// ✅ Get local experts
export const getlocalexperts = createAsyncThunk(
  "talktoexpert/getlocalexperts",
  async ({ token, query = "" }, { rejectWithValue }) => {
    try {
      
      const params = {};
      if (query && query.trim()) {
        params.search = query.trim();
      }
      
      const url = `${BASE_URL}/auth/local-experts/`
      
      const response = await axios.get(url, {
        params,
        headers: getHeaders(token),
      });

      
      // Handle different response structures
      const expertsData = response?.data?.data || response?.data || [];
      
      return expertsData;
    } catch (error) {
      console.error("🔍 API: Error fetching local experts:", error);
      const errorMessage = getErrorMessage(error);
      
      // Handle authentication errors specifically
      if (error?.response?.status === 401) {
        return []; // Return empty array instead of rejecting for auth errors
      }
      
      // Only show toast for non-404 and non-401 errors
      if (error?.response?.status !== 404 && error?.response?.status !== 401) {
        toast.error(errorMessage);
      }
      
      return rejectWithValue(errorMessage);
    }
  }
);

// ✅ Get all local experts (without search)
export const getAllLocalExperts = createAsyncThunk(
  "talktoexpert/getAllLocalExperts",
  async ({ token }, { rejectWithValue }) => {
    try {
      
      const response = await axios.get(`${BASE_URL}/auth/local-experts/`, {
        headers: getHeaders(token),
      });

      
      // Handle different response structures
      const expertsData = response?.data?.data || response?.data || [];
      
      return expertsData;
    } catch (error) {
      console.error("Error fetching all local experts:", error);
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// ✅ Redux Slice
const TalktoExpert = createSlice({
  name: "TalktoExpert",
  initialState: {
    Expertlist: [],
    loading: false,
    error: null,
    lastQuery: "",
  },
  reducers: {
    clearExperts: (state) => {
      state.Expertlist = [];
      state.error = null;
      state.lastQuery = "";
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get local experts with search
      .addCase(getlocalexperts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getlocalexperts.fulfilled, (state, action) => {
        state.loading = false;
        state.Expertlist = action.payload;
        state.error = null;
      })
      .addCase(getlocalexperts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.Expertlist = [];
      })
      
      // Get all local experts
      .addCase(getAllLocalExperts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllLocalExperts.fulfilled, (state, action) => {
        state.loading = false;
        state.Expertlist = action.payload;
        state.error = null;
      })
      .addCase(getAllLocalExperts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.Expertlist = [];
      });
  },
});

export const { clearExperts, clearError } = TalktoExpert.actions;
export default TalktoExpert.reducer;
