import { useDispatch, useSelector } from 'react-redux';
import { useSession } from 'next-auth/react';
import {
  fetchExperts,
  getAllLocalExperts,
  getLocalExpertById,
  updateLocalExpert,
  clearError,
  clearLocalExpertData,
  getMyApplicationStatus,
} from '../app/redux-features/Travelexperts/travelexpertsSlice';

export const useTravelExperts = () => {
  const dispatch = useDispatch();
  const { data: session } = useSession();
  const {
    Travelexperts,
    currentLocalExpert,
    loading,
    error,
    myApplicationStatus,
  } = useSelector((state) => state.travelExperts);

  // Create local expert
  const createExpert = async (payload) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(fetchExperts({ token, payload }));
  };

  // Get all local experts (admin)
  const getAllExperts = async () => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getAllLocalExperts({ token }));
  };

  // Get local expert by ID (admin)
  const getExpertById = async (id) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getLocalExpertById({ token, id }));
  };

  // Update local expert (admin)
  const updateExpert = async (id, payload) => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(updateLocalExpert({ token, id, payload }));
  };

  // Clear error
  const clearErrorAction = () => {
    dispatch(clearError());
  };

  // Clear local expert data
  const clearData = () => {
    dispatch(clearLocalExpertData());
  };

  // Get my application status
  const fetchMyApplicationStatus = async () => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken;
    if (!token) {
      throw new Error('No authentication token available');
    }
    return await dispatch(getMyApplicationStatus({ token }));
  };

  return {
    // State
    Travelexperts,
    currentLocalExpert,
    loading,
    error,
    myApplicationStatus,
    // Actions
    createExpert,
    getAllExperts,
    getExpertById,
    updateExpert,
    clearError: clearErrorAction,
    clearData,
    fetchMyApplicationStatus,
  };
}; 