import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";
import { isTokenExpired, handleTokenExpiration } from "../../../lib/authUtils";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Helper function to get headers with token if available
const getHeaders = (token) => {
  return token ? { Authorization: `Bearer ${token}` } : {};
};
// Helper function to extract error message
const getErrorMessage = (error) => {
  console.error("API Error:", error);

  // Check for token expiration FIRST
  if (error?.response?.data && isTokenExpired(error.response.data)) {
    console.log('🔒 Token expired detected in HelpmeDecide slice')
    handleTokenExpiration()
    return 'Token expired - please login again'
  }

  // Check for 401 status
  if (error?.response?.status === 401) {
    console.log('🔒 Unauthorized (401) in HelpmeDecide slice')
    handleTokenExpiration()
    return 'Authentication failed - please login again'
  }

  // Check for specific error messages
  const errorData = error?.response?.data;
  
  // Handle "Some place IDs are invalid" error specifically
  if (errorData?.error === "Some place IDs are invalid." || 
      errorData?.error?.includes("place IDs are invalid") ||
      errorData?.message?.includes("place IDs are invalid")) {
    return "Some of the selected places are no longer available. Please remove them from your preferences and try again.";
  }

  return (
    errorData?.message ||
    errorData?.destination?.[0] ||
    errorData?.detail ||
    errorData?.error ||
    error?.response?.error ||
    error?.message ||
    "An unexpected error occurred."
  );
};

// ✅ Get activities places
export const activitiesPlacesData = createAsyncThunk(
  "helpmedecide/activitiesPlacesData",
  async ({ query = "", token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/ai/discover/`, {
        params: query ? { search: query } : {},
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


// ✅ Get user preferences
export const prefrencePlacesData = createAsyncThunk(
  "helpmedecide/prefrencePlacesData",
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/ai/preferences/`, {
        headers: getHeaders(token),
      });

      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const prefrencePlacesDatapopular = createAsyncThunk(
  "helpmedecide/prefrencePlacesDatapopular",
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/ai/preferences/activity/`, {
        headers: getHeaders(token),
      });

      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const prefrenceeventDatapopular = createAsyncThunk(
  "helpmedecide/prefrenceeventDatapopular",
  async ({ token }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/ai/preferences/event/`, {
        headers: getHeaders(token),
      });

      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
// ✅ Save a place as a preference
export const fetchPlacesData = createAsyncThunk(
  "helpmedecide/fetchPlacesData",
  async ({ token, place_id }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/preferences/`,
        { place_id: place_id },
        {
          headers: getHeaders(token),
        }
      );

      toast.success(response.data.message || "Trip created successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const fetchPlacesDatapoular = createAsyncThunk(
  "helpmedecide/fetchPlacesDataP",
  async ({ token, activity, location }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/preferences/activity/`,
        {
          activity: activity,
          location: location
        },
        {
          headers: getHeaders(token),
        }
      );

      toast.success(response.data.message || "Trip created successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const fetcheventDatapoular = createAsyncThunk(
  "helpmedecide/fetcheventDatapoular",
  async ({ token, activity, location }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/preferences/event/`,
        {
          event: activity,
          location: location
        },
        {
          headers: getHeaders(token),
        }
      );

      toast.success(response.data.message || "Trip created successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

export const createTrip = createAsyncThunk(
  "helpmedecide/createTrip",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/ai/guide/create/trip/`,
        payload,
        {
          headers: getHeaders(token),
        }
      );

      // Check if response has data
      if (response.data) {
        toast.success(response.data.message || "Trip created successfully!");
        return response.data;
      } else {
        // Empty response but successful status
        toast.success("Trip created successfully!");
        return { success: true };
      }
    } catch (error) {
      console.error("Create trip API error:", error);
      
      // Handle JSON parse errors
      if (error.message && error.message.includes("JSON")) {
        const errorMessage = "Invalid response from server. Please try again.";
        toast.error(errorMessage);
        return rejectWithValue(errorMessage);
      }
      
      // Handle network errors
      if (!error.response) {
        const errorMessage = "Network error. Please check your connection and try again.";
        toast.error(errorMessage);
        return rejectWithValue(errorMessage);
      }
      
      // Handle HTTP errors with proper error message extraction
      let errorMessage = "Failed to create trip. Please try again.";
      
      if (error.response?.data) {
        // Try to extract error message from response
        errorMessage = 
          error.response.data.message ||
          error.response.data.error ||
          error.response.data.detail ||
          error.response.data.non_field_errors?.[0] ||
          errorMessage;
      } else if (error.response?.status) {
        // Use status-based messages
        switch (error.response.status) {
          case 400:
            errorMessage = "Invalid request. Please check your preferences and try again.";
            break;
          case 401:
            errorMessage = "Authentication required. Please login again.";
            break;
          case 403:
            errorMessage = "You don't have permission to perform this action.";
            break;
          case 404:
            errorMessage = "Trip creation endpoint not found.";
            break;
          case 500:
            errorMessage = "Server error. Please try again later.";
            break;
          default:
            errorMessage = `Error ${error.response.status}. Please try again.`;
        }
      }
      
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// ✅ Delete a saved place
export const deletePlacesData = createAsyncThunk(
  "helpmedecide/deletePlacesData",
  async ({ token, place_id }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/ai/preferences/delete/`,
        {
          headers: getHeaders(token),
          data: { place_id: place_id },
        }
      );

      toast.success(response.data.message || "Place deleted successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const deletePlacesDatapopular = createAsyncThunk(
  "helpmedecide/deletePlacesDatapopular",
  async ({ token, activity, location  ,place_id}, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/ai/preferences/activity/${place_id}/`,
        {
          headers: getHeaders(token),
          data: {
            activity: activity,
            location: location
          },
        }
      );

      toast.success(response.data.message || "Place deleted successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);
export const deleteeventsDatapopular = createAsyncThunk(
  "helpmedecide/deleteeventsDatapopular",
  async ({ token, activity, location  ,place_id}, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/ai/preferences/event/${place_id}/`,
        {
          headers: getHeaders(token),
          data: {
            event: activity,
            location: location
          },
        }
      );

      toast.success(response.data.message || "Place deleted successfully!");
      return response.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// ✅ Redux Slice
const HelpmeDecide = createSlice({
  name: "Helpme",
  initialState: {
    placeandactivitiesData: [],
    prefrencesDatapopular: [],
    prefrenceeventpopular: [],
    prefrencesData: [],
    loading: false,
    error: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(activitiesPlacesData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(activitiesPlacesData.fulfilled, (state, action) => {
        state.loading = false;
        state.placeandactivitiesData = action.payload;
      })
      .addCase(activitiesPlacesData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(prefrencePlacesData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(prefrencePlacesData.fulfilled, (state, action) => {
        state.loading = false;
        state.prefrencesData = action.payload;
      })
      .addCase(prefrencePlacesData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(prefrencePlacesDatapopular.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(prefrencePlacesDatapopular.fulfilled, (state, action) => {
        state.loading = false;
        state.prefrencesDatapopular = action.payload;
      })
      .addCase(prefrencePlacesDatapopular.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(prefrenceeventDatapopular.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(prefrenceeventDatapopular.fulfilled, (state, action) => {
        state.loading = false;
        state.prefrenceeventpopular = action.payload;
      })
      .addCase(prefrenceeventDatapopular.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(fetchPlacesData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlacesData.fulfilled, (state, action) => {
        state.loading = false;
        state.placePrefrenceData = action.payload;
      })
      .addCase(fetchPlacesData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(deletePlacesData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deletePlacesData.fulfilled, (state, action) => {
        state.loading = false;
        // Optional: remove deleted place from placePrefrenceData if needed
      })
      .addCase(deletePlacesData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default HelpmeDecide.reducer;
