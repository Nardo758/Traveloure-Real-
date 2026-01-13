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

// ✅ Create service provider
export const createServiceProvider = createAsyncThunk(
  "service-provider/create",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      // Build FormData for multipart/form-data from plain object
      const formData = new FormData();
      if (payload.logo) formData.append("business_logo", payload.logo);
      if (payload.license) formData.append("business_license", payload.license);
      if (payload.gstFile) formData.append("business_gst_tax", payload.gstFile);
      formData.append("business_name", payload.businessName || "");
      formData.append("name", payload.contactName || "");
      formData.append("email", payload.businessEmail || "");
      formData.append("gst", payload.gst || "");
      formData.append("mobile", payload.mobile || "");
      formData.append("whatsapp", payload.whatsapp || "");
      formData.append("country", payload.country || "");
      formData.append("address", payload.address || "");
      formData.append("business_type", payload.businessType || "");
      formData.append("description", payload.description || "");
      formData.append("instant_booking", payload.instantBooking || "");
      formData.append("services", JSON.stringify(payload.services || []));
      (payload.servicePhotos || []).forEach(file => formData.append("service_photos", file));
      formData.append("confirm_info", payload.confirmInfo);
      formData.append("agree_terms", payload.agreeTerms);
      formData.append("consent_contact", payload.consentContact || false);

      // Debug: Log all FormData entries
      for (let pair of formData.entries()) {
        console.log("FormData to backend:", pair[0], pair[1]);
      }

      // Do NOT set Content-Type header, let browser set it
      const response = await axios.post(
        `${BASE_URL}/auth/service-provider/create/`,
        formData,
        {
          headers: {
            ...getReduxAuthHeaders(token),
          },
        }
      );
      
      toast.success("Registration successful! You'll receive your password by email after approval.");
      return response?.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get service provider status (for checking before showing form)
export const getServiceProviderStatus = createAsyncThunk(
  "service-provider/status",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/service-provider/status/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      // If 404, it means user hasn't applied yet - this is not an error
      if (error?.response?.status === 404) {
        return rejectWithValue({ notFound: true, message: "No application found" });
      }
      // Automatically handles token expiration and redirects
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get all service providers (admin)
export const getAllServiceProviders = createAsyncThunk(
  "service-provider/get-all",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-serviceprovider/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get specific service provider by ID (admin)
export const getServiceProviderById = createAsyncThunk(
  "service-provider/get-by-id",
  async ({ token, id }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-serviceprovider/${id}/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Update service provider (admin)
export const updateServiceProvider = createAsyncThunk(
  "service-provider/update",
  async ({ token, id, payload }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.patch(
        `${BASE_URL}/auth/manage-serviceprovider/${id}/`,
        payload,
        { headers }
      );
      
      toast.success("Service provider updated successfully!");
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get service provider dashboard data (admin)
export const getServiceProviderDashboard = createAsyncThunk(
  "service-provider/get-dashboard",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/service-provider/dashboard/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get service provider dashboard data (service provider)
export const getServiceProviderDashboardData = createAsyncThunk(
  "service-provider/get-dashboard-data",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/service/dashboard/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get service providers by country (admin)
export const getServiceProvidersByCountry = createAsyncThunk(
  "service-provider/get-by-country",
  async ({ token, countryName }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/service-provider/view/${countryName}`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get pending service providers (admin)
export const getPendingServiceProviders = createAsyncThunk(
  "service-provider/get-pending",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-serviceprovider/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get rejected service providers (admin)
export const getRejectedServiceProviders = createAsyncThunk(
  "service-provider/get-rejected",
  async ({ token }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.get(
        `${BASE_URL}/auth/manage-serviceprovider/`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Get services with search functionality
export const getServices = createAsyncThunk(
  "service-provider/get-services",
  async ({ token, search = "" }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const searchParam = search ? `?search=${encodeURIComponent(search)}` : "";
      const response = await axios.get(
        `${BASE_URL}/service/services/${searchParam}`,
        { headers }
      );
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Create service
export const createService = createAsyncThunk(
  "service-provider/create-service",
  async ({ token, payload }, { rejectWithValue }) => {
    try {
      // Build FormData for multipart/form-data
      const formData = new FormData();
      
      // Add service details
      formData.append("service_name", payload.serviceName || "");
      formData.append("service_type", payload.serviceType || "");
      formData.append("price", payload.price || "");
      formData.append("price_based_on", payload.pricingType || "");
      formData.append("description", payload.description || "");
      formData.append("location", payload.location || "");
      formData.append("availability", JSON.stringify(payload.availability || []));
      
      
      // Add photos if provided
      if (payload.photos && payload.photos.length > 0) {
        payload.photos.forEach((photo, index) => {
          formData.append("service_file", photo);
        });
      }

      // Debug: Log all FormData entries
      for (let pair of formData.entries()) {
        console.log("FormData to backend:", pair[0], pair[1]);
      }

      const response = await axios.post(
        `${BASE_URL}/service/services/`,
        formData,
        {
          headers: {
            ...getReduxAuthHeaders(token),
          },
        }
      );
      
      toast.success("Service created successfully!");
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Update service status (admin)
export const updateServiceStatus = createAsyncThunk(
  "service-provider/update-service-status",
  async ({ token, id, formStatus }, { rejectWithValue }) => {
    try {
      const headers = getReduxAuthHeaders(token);
      const response = await axios.post(
        `${BASE_URL}/service/services/update-status/`,
        {
          id,
          form_status: formStatus
        },
        { headers }
      );
      
      toast.success(`Service ${formStatus} successfully!`);
      return response?.data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return handleReduxApiError(error, rejectWithValue);
    }
  }
);

// ✅ Redux Slice
const serviceProviderSlice = createSlice({
  name: "serviceProvider",
  initialState: {
    serviceProviders: [],
    currentServiceProvider: null,
    serviceProviderStatus: null,
    loading: false,
    error: null,
    dashboardData: null,
    dashboardLoading: false,
    dashboardError: null,
    dashboardDataProvider: null,
    dashboardDataLoading: false,
    dashboardDataError: null,
    countryProviders: null,
    countryProvidersLoading: false,
    countryProvidersError: null,
    pendingProviders: null,
    pendingLoading: false,
    pendingError: null,
    rejectedProviders: null,
    rejectedLoading: false,
    rejectedError: null,
    services: [],
    servicesLoading: false,
    servicesError: null,
    servicesCount: 0,
    servicesTotalPages: 0,
    createServiceLoading: false,
    createServiceError: null,
    updateServiceStatusLoading: false,
    updateServiceStatusError: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearServiceProviderData: (state) => {
      state.serviceProviders = [];
      state.currentServiceProvider = null;
      state.serviceProviderStatus = null;
    },
    clearDashboardData: (state) => {
      state.dashboardData = null;
      state.dashboardError = null;
    },
    clearDashboardDataProvider: (state) => {
      state.dashboardDataProvider = null;
      state.dashboardDataError = null;
    },
    clearCountryProvidersData: (state) => {
      state.countryProviders = null;
      state.countryProvidersError = null;
    },
    clearPendingData: (state) => {
      state.pendingProviders = null;
      state.pendingError = null;
    },
    clearRejectedData: (state) => {
      state.rejectedProviders = null;
      state.rejectedError = null;
    },
    clearProviderStatus: (state) => {
      state.serviceProviderStatus = null;
      state.error = null;
    },
    clearServicesData: (state) => {
      state.services = [];
      state.servicesError = null;
      state.servicesCount = 0;
      state.servicesTotalPages = 0;
    },
    clearCreateServiceData: (state) => {
      state.createServiceError = null;
    },
    clearUpdateServiceStatusData: (state) => {
      state.updateServiceStatusError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create service provider
      .addCase(createServiceProvider.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createServiceProvider.fulfilled, (state, action) => {
        state.loading = false;
        // Optionally add to the list if needed
        if (action.payload) {
          state.serviceProviders.push(action.payload);
        }
      })
      .addCase(createServiceProvider.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Get service provider status
      .addCase(getServiceProviderStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getServiceProviderStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.serviceProviderStatus = action.payload;
      })
      .addCase(getServiceProviderStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Get all service providers
      .addCase(getAllServiceProviders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllServiceProviders.fulfilled, (state, action) => {
        state.loading = false;
        state.serviceProviders = action.payload;
      })
      .addCase(getAllServiceProviders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Get service provider by ID
      .addCase(getServiceProviderById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getServiceProviderById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentServiceProvider = action.payload;
      })
      .addCase(getServiceProviderById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Update service provider
      .addCase(updateServiceProvider.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateServiceProvider.fulfilled, (state, action) => {
        state.loading = false;
        // Update the specific service provider in the list
        const index = state.serviceProviders.findIndex(
          (provider) => provider.id === action.payload.id
        );
        if (index !== -1) {
          state.serviceProviders[index] = action.payload;
        }
        // Update current service provider if it's the same one
        if (state.currentServiceProvider && state.currentServiceProvider.id === action.payload.id) {
          state.currentServiceProvider = action.payload;
        }
      })
      .addCase(updateServiceProvider.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Get service provider dashboard
      .addCase(getServiceProviderDashboard.pending, (state) => {
        state.dashboardLoading = true;
        state.dashboardError = null;
      })
      .addCase(getServiceProviderDashboard.fulfilled, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardData = action.payload;
      })
      .addCase(getServiceProviderDashboard.rejected, (state, action) => {
        state.dashboardLoading = false;
        state.dashboardError = action.payload;
      })

      // Get service provider dashboard data
      .addCase(getServiceProviderDashboardData.pending, (state) => {
        state.dashboardDataLoading = true;
        state.dashboardDataError = null;
      })
      .addCase(getServiceProviderDashboardData.fulfilled, (state, action) => {
        state.dashboardDataLoading = false;
        state.dashboardDataProvider = action.payload;
      })
      .addCase(getServiceProviderDashboardData.rejected, (state, action) => {
        state.dashboardDataLoading = false;
        state.dashboardDataError = action.payload;
      })

      // Get service providers by country
      .addCase(getServiceProvidersByCountry.pending, (state) => {
        state.countryProvidersLoading = true;
        state.countryProvidersError = null;
      })
      .addCase(getServiceProvidersByCountry.fulfilled, (state, action) => {
        state.countryProvidersLoading = false;
        state.countryProviders = action.payload;
      })
      .addCase(getServiceProvidersByCountry.rejected, (state, action) => {
        state.countryProvidersLoading = false;
        state.countryProvidersError = action.payload;
      })

      // Get pending service providers
      .addCase(getPendingServiceProviders.pending, (state) => {
        state.pendingLoading = true;
        state.pendingError = null;
      })
      .addCase(getPendingServiceProviders.fulfilled, (state, action) => {
        state.pendingLoading = false;
        state.pendingProviders = action.payload;
      })
      .addCase(getPendingServiceProviders.rejected, (state, action) => {
        state.pendingLoading = false;
        state.pendingError = action.payload;
      })

      // Get rejected service providers
      .addCase(getRejectedServiceProviders.pending, (state) => {
        state.rejectedLoading = true;
        state.rejectedError = null;
      })
      .addCase(getRejectedServiceProviders.fulfilled, (state, action) => {
        state.rejectedLoading = false;
        state.rejectedProviders = action.payload;
      })
      .addCase(getRejectedServiceProviders.rejected, (state, action) => {
        state.rejectedLoading = false;
        state.rejectedError = action.payload;
      })

      // Get services
      .addCase(getServices.pending, (state) => {
        state.servicesLoading = true;
        state.servicesError = null;
      })
      .addCase(getServices.fulfilled, (state, action) => {
        state.servicesLoading = false;
        state.services = action.payload?.data || [];
        state.servicesCount = action.payload?.count || 0;
        state.servicesTotalPages = action.payload?.total_pages || 0;
      })
      .addCase(getServices.rejected, (state, action) => {
        state.servicesLoading = false;
        state.servicesError = action.payload;
      })

      // Create service
      .addCase(createService.pending, (state) => {
        state.createServiceLoading = true;
        state.createServiceError = null;
      })
      .addCase(createService.fulfilled, (state, action) => {
        state.createServiceLoading = false;
        // Optionally add the new service to the services list
        if (action.payload) {
          state.services.unshift(action.payload);
          state.servicesCount += 1;
        }
      })
      .addCase(createService.rejected, (state, action) => {
        state.createServiceLoading = false;
        state.createServiceError = action.payload;
      })

      // Update service status
      .addCase(updateServiceStatus.pending, (state) => {
        state.updateServiceStatusLoading = true;
        state.updateServiceStatusError = null;
      })
      .addCase(updateServiceStatus.fulfilled, (state, action) => {
        state.updateServiceStatusLoading = false;
        // Update the specific service in the services list
        const index = state.services.findIndex(
          (service) => service.id === action.payload.id
        );
        if (index !== -1) {
          state.services[index] = { ...state.services[index], ...action.payload };
        }
      })
      .addCase(updateServiceStatus.rejected, (state, action) => {
        state.updateServiceStatusLoading = false;
        state.updateServiceStatusError = action.payload;
      });
  },
});

export const { clearError, clearServiceProviderData, clearDashboardData, clearDashboardDataProvider, clearCountryProvidersData, clearPendingData, clearRejectedData, clearProviderStatus, clearServicesData, clearCreateServiceData, clearUpdateServiceStatusData } = serviceProviderSlice.actions;
export default serviceProviderSlice.reducer; 