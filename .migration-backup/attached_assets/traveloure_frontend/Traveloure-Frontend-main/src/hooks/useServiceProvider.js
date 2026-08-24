import { useDispatch, useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';
import {
  createServiceProvider,
  getServiceProviderStatus,
  getAllServiceProviders,
  getServiceProviderById,
  updateServiceProvider,
  clearError,
  clearServiceProviderData
} from '../app/redux-features/service-provider/serviceProviderSlice';

export const useServiceProvider = () => {
  const dispatch = useDispatch();
  const { data: session } = useSession();
  const {
    serviceProviders,
    currentServiceProvider,
    serviceProviderStatus,
    loading,
    error
  } = useSelector((state) => state.serviceProvider);

  // Create service provider
  const createProvider = async (payload) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(createServiceProvider({ token, payload }));
  };

  // Get service provider status
  const getStatus = async () => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getServiceProviderStatus({ token }));
  };

  // Get all service providers (admin)
  const getAllProviders = async () => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getAllServiceProviders({ token }));
  };

  // Get service provider by ID (admin)
  const getProviderById = async (id) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getServiceProviderById({ token, id }));
  };

  // Update service provider (admin)
  const updateProvider = async (id, payload) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(updateServiceProvider({ token, id, payload }));
  };

  // Clear error
  const clearErrorAction = () => {
    dispatch(clearError());
  };

  // Clear service provider data
  const clearData = () => {
    dispatch(clearServiceProviderData());
  };

  return {
    // State
    serviceProviders,
    currentServiceProvider,
    serviceProviderStatus,
    loading,
    error,
    
    // Actions
    createProvider,
    getStatus,
    getAllProviders,
    getProviderById,
    updateProvider,
    clearError: clearErrorAction,
    clearData,
  };
}; 