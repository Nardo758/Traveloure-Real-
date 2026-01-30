// ✅ SECURE VERSION - Uses NextAuth session instead of localStorage
import { useSession, signOut } from 'next-auth/react'
import { setupTokenExpirationListener, handleTokenExpiration } from '../lib/authUtils'
import { useEffect } from 'react'

export const useAuth = () => {
  const { data: session, status } = useSession()
  
  const loading = status === 'loading'
  const isAuthenticated = status === 'authenticated' && !!session?.backendData?.accessToken
  const user = session?.user || session?.backendData?.user || null

  useEffect(() => {
    // Setup token expiration listener for cross-tab synchronization
    const cleanupTokenListener = setupTokenExpirationListener(() => {
      // Token expired in another tab - sign out this tab too
      signOut({ redirect: false })
    })

    return () => {
      if (cleanupTokenListener) cleanupTokenListener()
    }
  }, [])

  // Login function - not typically needed since NextAuth handles this
  // Kept for backward compatibility but should use NextAuth signIn instead
  const login = (accessToken, refreshToken, userData) => {
    console.warn('⚠️ Direct login() is deprecated. Use NextAuth signIn() instead.')
    // For compatibility, could trigger NextAuth session update here
  }

  // Logout using NextAuth
  const logout = async (redirect = true) => {
    try {
      await signOut({ redirect: false })
      
      if (redirect && typeof window !== 'undefined') {
        const currentPath = window.location.pathname
        handleTokenExpiration(currentPath, signOut)
      }
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  // Get tokens from NextAuth session
  const getAccessToken = () => {
    return session?.backendData?.accessToken || null
  }

  const getRefreshToken = () => {
    return session?.refreshToken || null
  }

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    getAccessToken,
    getRefreshToken,
    session, // Expose full session for advanced use cases
  }
}

// Export a standalone logout function that can be used outside of React components
export const globalLogout = async () => {
  try {
    // Import dynamically to avoid issues in non-React contexts
    const { signOut } = await import('next-auth/react')
    await signOut({ redirect: false })
    handleTokenExpiration()
  } catch (error) {
    console.error('Global logout error:', error)
    // Fallback to just handling token expiration
    handleTokenExpiration()
  }
}
