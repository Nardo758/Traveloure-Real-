import { useSession } from 'next-auth/react'

export const useLocalExpert = () => {
  const { data: session, status } = useSession()

  const isLocalExpert = () => {
    if (!session?.user) return false
    
    // Check for local_expert role in multiple locations based on your session structure
    const userData = session.backendData?.user || session.backendData?.tokens || session.user
    
    // Check for roles array in multiple locations
    const roles = session.backendData?.roles || 
                  session.user?.roles || 
                  userData?.roles || 
                  []
  
    
    // Check for is_local_expert flag in multiple locations
    const isLocalExpertFlag = session.user?.is_local_expert || 
                              session.backendData?.tokens?.is_local_expert ||
                              session.backendData?.user?.is_local_expert ||
                              userData?.is_local_expert ||
                              false
    
    const hasRole = isLocalExpertFlag || 
                    roles.includes('local_expert') || 
                    false
    
    
    return hasRole
  }

  return {
    isLocalExpert: isLocalExpert(),
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    session
  }
} 