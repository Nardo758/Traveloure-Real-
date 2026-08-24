/**
 * Secure Token Manager
 * 
 * Uses NextAuth session for secure token access.
 * Tokens are stored in httpOnly cookies by NextAuth - NOT in localStorage.
 * This prevents XSS attacks from accessing authentication tokens.
 */

import { getSession } from 'next-auth/react';

/**
 * Get access token from NextAuth session (client-side)
 * @returns {Promise<string|null>} Access token or null
 */
export const getAccessToken = async () => {
  try {
    const session = await getSession();
    return session?.backendData?.accessToken || null;
  } catch (error) {
    console.error('Error getting access token from session:', error);
    return null;
  }
};

/**
 * Get refresh token from NextAuth session (client-side)
 * @returns {Promise<string|null>} Refresh token or null
 */
export const getRefreshToken = async () => {
  try {
    const session = await getSession();
    return session?.refreshToken || null;
  } catch (error) {
    console.error('Error getting refresh token from session:', error);
    return null;
  }
};

/**
 * Get user data from NextAuth session
 * @returns {Promise<object|null>} User data or null
 */
export const getUserData = async () => {
  try {
    const session = await getSession();
    return session?.user || session?.backendData?.user || null;
  } catch (error) {
    console.error('Error getting user data from session:', error);
    return null;
  }
};

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if authenticated
 */
export const isAuthenticated = async () => {
  const token = await getAccessToken();
  return !!token;
};

/**
 * Manual token storage is NOT needed and NOT secure
 * NextAuth manages tokens automatically in httpOnly cookies
 * 
 * @deprecated Do not use - kept for backward compatibility only
 */
export const setTokens = () => {
  console.warn('⚠️ Manual token storage is disabled for security. NextAuth handles token management automatically.');
};

/**
 * Tokens should NOT be cleared manually
 * Use NextAuth signOut() instead
 * 
 * @deprecated Do not use - kept for backward compatibility only
 */
export const clearTokens = () => {
  console.warn('⚠️ Use NextAuth signOut() to clear tokens securely.');
};

export default {
  getAccessToken,
  getRefreshToken,
  getUserData,
  isAuthenticated,
  setTokens,
  clearTokens,
};
