"use client"

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useToast } from '../../components/ui/use-toast'
import axios from 'axios'

export default function FacebookCallback() {
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const handleFacebookCallback = async () => {
      if (status === 'loading') return

      if (status === 'unauthenticated') {
        setError('Authentication failed')
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      if (session?.provider === 'facebook' && session?.backendData?.accessToken) {
        try {
          const response = await axios.post(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/auth/facebook/`, {
            access_token: session.backendData.accessToken,
          })

          
          toast({
            title: "Facebook Login Successful!",
            description: "Successfully authenticated with Facebook",
          })

          if (response.data) {
            localStorage.setItem('facebookBackendData', JSON.stringify(response.data))
          }

          setTimeout(() => router.push('/dashboard'), 1000)
          
        } catch (err) {
          console.error('🔴 Failed to send token to backend:', err)
          setError('Failed to authenticate with backend')
          toast({
            title: "Backend Authentication Failed",
            description: err.response?.data?.detail || "Failed to authenticate with backend",
            variant: "destructive",
          })
          setTimeout(() => router.push('/login'), 3000)
        }
      } else {
        router.push('/login')
      }
      
      setLoading(false)
    }

    handleFacebookCallback()
  }, [session, status, router, toast])

  if (loading || status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Completing Facebook authentication...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
            <p className="font-medium">Authentication Failed</p>
            <p className="text-sm">{error}</p>
          </div>
          <p className="text-gray-600">Redirecting to login page...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Authentication successful! Redirecting...</p>
      </div>
    </div>
  )
} 