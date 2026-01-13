import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export const useAdmin = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLocalExpert, setIsLocalExpert] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    if (status === 'loading') {
      setIsLoading(true)
      return
    }

    if (status === 'unauthenticated') {
      setIsAuthenticated(false)
      setIsAdmin(false)
      setIsLocalExpert(false)
      setIsLoading(false)
      return
    }

    if (session) {
      setIsAuthenticated(true)
      
      // Check for roles in multiple possible locations
      const userRoles = session?.user?.roles || []
      const backendRoles = session?.backendData?.roles || []
      const directRoles = session?.roles || []
      
      const allRoles = [...userRoles, ...backendRoles, ...directRoles]
      const hasAdminRole = allRoles.includes('admin')
      const hasLocalExpertRole = allRoles.includes('local_expert')
      
      setIsAdmin(hasAdminRole)
      setIsLocalExpert(hasLocalExpertRole)
      setIsLoading(false)
      
    
    } else {
      setIsAuthenticated(false)
      setIsAdmin(false)
      setIsLocalExpert(false)
      setIsLoading(false)
    }
  }, [session, status])

  const redirectToAdmin = () => {
    if (isAdmin) {
      router.push('/admin/dashboard')
    }
  }

  const redirectToLocalExpert = () => {
    if (isLocalExpert) {
      router.push('/local-expert')
    }
  }

  const redirectToDashboard = () => {
    if (isAuthenticated && !isAdmin && !isLocalExpert) {
      router.push('/dashboard')
    }
  }

  const redirectToLogin = () => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }

  return {
    isAdmin,
    isLocalExpert,
    isAuthenticated,
    isLoading,
    session,
    redirectToAdmin,
    redirectToLocalExpert,
    redirectToDashboard,
    redirectToLogin
  }
} 