"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLocalExpert } from '../../hooks/useLocalExpert'
import { Navbar } from '../../components/help-me-decide/navbar'
import { Loader2 } from 'lucide-react'

export default function LocalExpertPanel() {
  const { data: session, status } = useSession()
  const { isLocalExpert } = useLocalExpert()
  const router = useRouter()
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
   

    if (status === 'loading') {
      setDebugInfo('Loading session...')
      return
    }

    if (status === 'unauthenticated') {
      setDebugInfo('Not authenticated, redirecting to login')
      router.push('/login')
      return
    }

    if (!session) {
      setDebugInfo('No session found')
      return
    }

    // Check for local_expert role using comprehensive logic
    const backendData = session.backendData
    const roles = backendData?.roles || session.user?.roles || []
    const isLocalExpertFlag = session.user?.is_local_expert || 
                              session.backendData?.tokens?.is_local_expert ||
                              session.backendData?.user?.is_local_expert ||
                              false
    const isLocalExpertUser = isLocalExpertFlag || roles.includes('local_expert')
    
    
    setDebugInfo(`Roles: ${JSON.stringify(roles)}, Is Local Expert: ${isLocalExpertUser}`)

    if (isLocalExpertUser) {
      router.push('/local-expert/dashboard')
    } else {
      router.push('/dashboard')
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="flex flex-col h-screen bg-[#fcfbfa]">
        <Navbar />
        <div className="flex justify-center items-center flex-1">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading local expert check...</p>
            <p className="text-sm text-gray-500 mt-2">{debugInfo}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col justify-center items-center h-screen bg-[#fcfbfa]">
     
      {/* loader */}
      <Loader2 className="animate-spin" />
      <p className="text-gray-600">Checking local expert permissions...</p>
    </div>
  )
} 