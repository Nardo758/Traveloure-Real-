import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "sonner";
import { handleReduxApiError, getReduxAuthHeaders } from "../../../lib/reduxHelpers";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';


export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/login/`, credentials);
      toast.success(response.data.message || "Login successful!");
      return response.data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.non_field_errors?.[0] || "An error occurred during login.";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// User Profile Async Thunk
export const userProfile = createAsyncThunk(
  "auth/userProfile",
  async ({ token }, { rejectWithValue }) => {
    try {
      if (!token) throw new Error("No token found");
      
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(`${BASE_URL}/auth/profile/`, { headers });

      return response.data;
    } catch (error) {
      console.error("User profile error:", error);
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);
export const userProfileUpdate = createAsyncThunk(
  "auth/userProfileUpdate",
  async ({ id, data , token}, { rejectWithValue }) => {
    try {
      if (!token) throw new Error("No token found");

      const headers = {
        ...getReduxAuthHeaders(token),
        ...(data instanceof FormData ? {} : { "Content-Type": "application/json" }),
      };

      const response = await axios.patch(
        `${BASE_URL}/auth/profile/${id}/`,
        data,
        { headers }
      );

      toast.success(response.data.message || "Profile updated successfully.");
      return response.data;
    } catch (error) {
      // Check for specific error messages before generic handling
      const specificError = error.response?.data?.image?.[0];
      if (specificError) {
        return rejectWithValue(specificError);
      }
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);
export const patchtravelprefrence = createAsyncThunk(
  "auth/patchtravelprefrence",
  async ({ id, data, token }, { rejectWithValue }) => {
    try {
      if (!token) throw new Error("No token found");

      const headers = {
        ...getReduxAuthHeaders(token),
        "Content-Type": "application/json",
      };

      const response = await axios.patch(
        `${BASE_URL}/auth/travel-preference/${id}/`,
        data,
        { headers }
      );

      toast.success(response.data.message || "Travel preferences updated successfully.");
      return response.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update travel preferences.");
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);
export const gettravelprefrence = createAsyncThunk(
  "auth/gettravelprefrence",
  async ({ id, token }, { rejectWithValue }) => {
    try {
      if (!token) throw new Error("No token found");

      const headers = getReduxAuthHeaders(token);

      const response = await axios.get(
        `${BASE_URL}/auth/travel-preference/${id}/`,
        { headers }
      );

      return response.data;
    } catch (error) {
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);


// Forgot Password Thunk
export const forgotPassword = createAsyncThunk(
  "auth/forgotPassword",
  async (emailOrUsername, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/forget-password/`, { email_or_username: emailOrUsername });
      toast.success(response.data.message || "Password reset email sent.");
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data || "Failed to send reset email.";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Reset Password Thunk
export const resetPassword = createAsyncThunk(
  "auth/resetPassword",
  async ({ uid, token, newPassword, confirmPassword }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/auth/forget-reset-password/${uid}/${token}/`,
        { new_password: newPassword, confirm_new_password: confirmPassword }
      );
      toast.success(response.data.message || "Password reset successful.");
      return response.data;
    } catch (error) {
      // Extract a more specific error message
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.non_field_errors?.[0] ||
        error.response?.data?.detail ||
        "Failed to reset password.";

      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

// Change Password Thunk
export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async ({ newPassword, confirmNewPassword, token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      
      const response = await axios.put(
        `${BASE_URL}/auth/change-password/`,
        { new_password: newPassword, confirm_new_password: confirmNewPassword },
        { headers }
      );
      
      toast.success(response.data.message || "Password changed successfully.");
      return response.data;
    } catch (error) {
      // Extract specific error messages
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.non_field_errors?.[0] ||
        error.response?.data?.detail;
      
      if (errorMessage) {
        toast.error(errorMessage);
        return rejectWithValue(errorMessage);
      }
      
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);


// Sign Up Async Thunk

// Sign Up Async Thunk
export const signUpUser = createAsyncThunk(
  "auth/signUpUser",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/auth/register/`, userData);

      // Check if response is a success (usually 200 or 201)
      if (response.status === 200 || response.status === 201) {
        toast.success(response.data.message || "Registration successful.");
        return response.data;
      }

      // If the response is not successful, handle as an error
      const errorData = response.data;
      const messages = typeof errorData === "object" && !Array.isArray(errorData)
        ? Object.values(errorData).flat()
        : [errorData || "Registration failed."];

      messages.forEach(msg => toast.error(msg));
      return rejectWithValue(messages);
    } catch (error) {
      const errorData = error.response?.data || {};

      // Extract and display all error messages
      if (typeof errorData === "object" && !Array.isArray(errorData)) {
        const messages = Object.values(errorData).flat();
        messages.forEach(msg => toast.error(msg));
        return rejectWithValue(messages);
      }

      // Handle single error message
      const singleErrorMessage = errorData || "Failed to register.";
      toast.error(singleErrorMessage);
      return rejectWithValue(singleErrorMessage);
    }
  }
);
// Redux Slice
const authSlice = createSlice({
  name: "auth",
  initialState: { user: null, profile: [], loading: false, error: null ,travelprefrence:[] },
  reducers: {
    logout: (state) => {
          
      state.user = null;
      toast.success("Logged out successfully.");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginUser.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; })
      .addCase(loginUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(userProfile.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(userProfile.fulfilled, (state, action) => { state.loading = false; state.profile = action.payload; })
      .addCase(userProfile.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(gettravelprefrence.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(gettravelprefrence.fulfilled, (state, action) => { state.loading = false; state.travelprefrence = action.payload; })
      .addCase(gettravelprefrence.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(patchtravelprefrence.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(patchtravelprefrence.fulfilled, (state, action) => { state.loading = false; state.travelprefrence = action.payload; })
      .addCase(patchtravelprefrence.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(forgotPassword.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(forgotPassword.fulfilled, (state) => { state.loading = false; })
      .addCase(forgotPassword.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(resetPassword.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(resetPassword.fulfilled, (state) => { state.loading = false; })
      .addCase(resetPassword.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(changePassword.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(changePassword.fulfilled, (state) => { state.loading = false; })
      .addCase(changePassword.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(signUpUser.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(signUpUser.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; })
      .addCase(signUpUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
