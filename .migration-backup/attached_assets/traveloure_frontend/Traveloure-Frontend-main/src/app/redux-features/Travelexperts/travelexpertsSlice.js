import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";
import { handleReduxApiError, getReduxAuthHeaders } from "../../../lib/reduxHelpers";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Helper function to extract error message (kept for specific error handling)
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
export const fetchExperts = createAsyncThunk(
  "travel-experts/fetch-experts",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      // Build FormData for multipart/form-data
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // For arrays, append each item
          value.forEach((item) => formData.append(key, item));
        } else if (value instanceof FileList) {
          // For file inputs (FileList)
          Array.from(value).forEach((file) => formData.append(key, file));
        } else if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      });

      const response = await axios.post(
        `${BASE_URL}/auth/local-expert/create/`,
        formData,
        {
          headers: {
            ...getReduxAuthHeaders(token),
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get all local experts (admin)
export const getAllLocalExperts = createAsyncThunk(
  "travel-experts/get-all",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-localexpert/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get specific local expert by ID (admin)
export const getLocalExpertById = createAsyncThunk(
  "travel-experts/get-by-id",
  async ({ token, id }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-localexpert/${id}/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Update local expert (admin)
export const updateLocalExpert = createAsyncThunk(
  "travel-experts/update",
  async ({ token, id, payload }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.patch(
        `${BASE_URL}/auth/manage-localexpert/${id}/`,
        payload,
        { headers }
      );
      
      toast.success("Local expert updated successfully!");
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get current user's local expert application status
export const getMyApplicationStatus = createAsyncThunk(
  "travel-experts/get-my-application-status",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/local-expert/my-application/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get local expert status (for checking before showing form)
export const getLocalExpertStatus = createAsyncThunk(
  "travel-experts/get-status",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/local-expert/status/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      // If 404, it means user hasn't applied yet - this is not an error
      if (error?.response?.status === 404) {
        return rejectWithValue({ notFound: true, message: "No application found" });
      }
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get local expert dashboard data (admin)
export const getLocalExpertDashboard = createAsyncThunk(
  "travel-experts/get-dashboard",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/local-expert/dashboard/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get pending local experts (admin)
export const getPendingLocalExperts = createAsyncThunk(
  "travel-experts/get-pending",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-localexpert/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get rejected local experts (admin)
export const getRejectedLocalExperts = createAsyncThunk(
  "travel-experts/get-rejected",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-localexpert/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get local experts by country (admin)
export const getLocalExpertsByCountry = createAsyncThunk(
  "travel-experts/get-by-country",
  async ({ token, countryName }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/local-expert/view/${countryName}`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Redux Slice
const travelexpertsSlice = createSlice({
  name: "Travelexperts",
  initialState: {
    Travelexperts: [],
    currentLocalExpert: null,
    loading: false,
    error: null,
    myApplicationStatus: null,
    expertStatus: null,
    expertStatusLoading: false,
    expertStatusError: null,
    dashboardData: null,
    dashboardLoading: false,
    dashboardError: null,
    pendingExperts: [],
    pendingLoading: false,
    pendingError: null,
    rejectedExperts: [],
    rejectedLoading: false,
    rejectedError: null,
    countryExperts: [],
    countryExpertsLoading: false,
    countryExpertsError: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearLocalExpertData: (state) => {
      state.Travelexperts = [];
      state.currentLocalExpert = null;
      state.myApplicationStatus = null;
    },
    clearDashboardData: (state) => {
      state.dashboardData = null;
      state.dashboardError = null;
    },
    clearPendingData: (state) => {
      state.pendingExperts = [];
      state.pendingError = null;
    },
    clearRejectedData: (state) => {
      state.rejectedExperts = [];
      state.rejectedError = null;
    },
    clearCountryExpertsData: (state) => {
      state.countryExperts = [];
      state.countryExpertsError = null;
    },
    clearExpertStatus: (state) => {
      state.expertStatus = null;
      state.expertStatusError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create local expert
      .addCase(fetchExperts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchExperts.fulfilled, (state, action) => {
        state.loading = false;
        // Optionally add to the list if needed
        if (action.payload) {
          state.Travelexperts.push(action.payload);
        }
      })
      .addCase(fetchExperts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Get all local experts
      .addCase(getAllLocalExperts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllLocalExperts.fulfilled, (state, action) => {
        state.loading = false;
        state.Travelexperts = action.payload;
      })
      .addCase(getAllLocalExperts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Get local expert by ID
      .addCase(getLocalExpertById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getLocalExpertById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentLocalExpert = action.payload;
      })
      .addCase(getLocalExpertById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Update local expert
      .addCase(updateLocalExpert.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateLocalExpert.fulfilled, (state, action) => {
        state.loading = false;
        // Update the specific local expert in the list
        const index = state.Travelexperts.findIndex(
          (expert) => expert.id === action.payload.id
        );
        if (index !== -1) {
          state.Travelexperts[index] = action.payload;
        }
        // Update current local expert if it's the same one
        if (state.currentLocalExpert && state.currentLocalExpert.id === action.payload.id) {
          state.currentLocalExpert = action.payload;
        }
      })
      .addCase(updateLocalExpert.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Get my application status
      .addCase(getMyApplicationStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getMyApplicationStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.myApplicationStatus = action.payload;
      })
      .addCase(getMyApplicationStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Get local expert dashboard
      .addCase(getLocalExpertDashboard.pending, (state) => {
        state.dashboardLoading = true;
        state.dashboardError = null;
      })
      .addCase(getLocalExpertDashboard.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardData = action.payload;
      })
      .addCase(getLocalExpertDashboard.rejected, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardError = action.payload;
      })

      // Get pending local experts
      .addCase(getPendingLocalExperts.pending, (state) => {
        state.pendingLoading = true;
        state.pendingError = null;
      })
      .addCase(getPendingLocalExperts.fulfilled, (state, action) => {
        state.pendingLoading = false;
        // Extract pending experts from the response
        state.pendingExperts = action.payload?.pending || [];
      })
      .addCase(getPendingLocalExperts.rejected, (state, action) => {
        state.pendingLoading = false;
        state.pendingError = action.payload;
      })

      // Get rejected local experts
      .addCase(getRejectedLocalExperts.pending, (state) => {
        state.rejectedLoading = true;
        state.rejectedError = null;
      })
      .addCase(getRejectedLocalExperts.fulfilled, (state, action) => {
        state.rejectedLoading = false;
        // Extract rejected experts from the response
        state.rejectedExperts = action.payload?.rejected || [];
      })
      .addCase(getRejectedLocalExperts.rejected, (state, action) => {
        state.rejectedLoading = false;
        state.rejectedError = action.payload;
      })

      // Get local experts by country
      .addCase(getLocalExpertsByCountry.pending, (state) => {
        state.countryExpertsLoading = true;
        state.countryExpertsError = null;
      })
      .addCase(getLocalExpertsByCountry.fulfilled, (state, action) => {
        state.countryExpertsLoading = false;
        state.countryExperts = action.payload;
      })
      .addCase(getLocalExpertsByCountry.rejected, (state, action) => {
        state.countryExpertsLoading = false;
        state.countryExpertsError = action.payload;
      })

      // Get local expert status
      .addCase(getLocalExpertStatus.pending, (state) => {
        state.expertStatusLoading = true;
        state.expertStatusError = null;
      })
      .addCase(getLocalExpertStatus.fulfilled, (state, action) => {
        state.expertStatusLoading = false;
        state.expertStatus = action.payload;
      })
      .addCase(getLocalExpertStatus.rejected, (state, action) => {
        state.expertStatusLoading = false;
        state.expertStatusError = action.payload;
      });
  },
});

export const { clearError, clearLocalExpertData, clearDashboardData, clearPendingData, clearRejectedData, clearCountryExpertsData, clearExpertStatus } = travelexpertsSlice.actions;
export default travelexpertsSlice.reducer;
