import { useState, useEffect } from 'react'
import { setupTokenExpirationListener, handleTokenExpiration, clearAuthData } from '../lib/authUtils'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const checkAuth = () => {
      try {
        const accessToken = localStorage.getItem('accessToken')
        const userData = localStorage.getItem('userData')

        if (accessToken && userData) {
          const parsedUserData = JSON.parse(userData)
          setUser(parsedUserData)
          setIsAuthenticated(true)
        } else {
          setUser(null)
          setIsAuthenticated(false)
        }
      } catch (error) {
        console.error('Error checking auth:', error)
        setUser(null)
        setIsAuthenticated(false)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()

    // Listen for storage changes (in case tokens are updated in another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'accessToken' || e.key === 'userData') {
        checkAuth()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    
    // Setup token expiration listener for cross-tab synchronization
    const cleanupTokenListener = setupTokenExpirationListener(() => {
      setUser(null)
      setIsAuthenticated(false)
    })

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      if (cleanupTokenListener) cleanupTokenListener()
    }
  }, [])

  const login = (accessToken, refreshToken, userData) => {
    localStorage.setItem('accessToken', accessToken)
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken)
    }
    if (userData) {
      localStorage.setItem('userData', JSON.stringify(userData))
    }
    setUser(userData)
    setIsAuthenticated(true)
  }

  const logout = (redirect = true) => {
    clearAuthData()
    setUser(null)
    setIsAuthenticated(false)
    
    // Optionally redirect after logout
    if (redirect && typeof window !== 'undefined') {
      const currentPath = window.location.pathname
      // Use handleTokenExpiration for consistent redirect logic
      handleTokenExpiration(currentPath, null)
    }
  }

  const getAccessToken = () => {
    return localStorage.getItem('accessToken')
  }

  const getRefreshToken = () => {
    return localStorage.getItem('refreshToken')
  }

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    getAccessToken,
    getRefreshToken,
  }
}

// Export a standalone logout function that can be used outside of React components
export const globalLogout = () => {
  clearAuthData()
  handleTokenExpiration()
} 