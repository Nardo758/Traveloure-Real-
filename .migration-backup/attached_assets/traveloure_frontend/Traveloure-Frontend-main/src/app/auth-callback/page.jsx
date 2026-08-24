"use client"

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useToast } from '../../components/ui/use-toast'
import { clientRedirect } from '../../components/commonfunctions/page'
import { useAuth } from '../../hooks/useAuth'

function AuthCallbackContent() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { login } = useAuth()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get URL parameters from Django redirect
        const accessToken = searchParams.get('access_token')
        const refreshToken = searchParams.get('refresh_token')
        const userData = searchParams.get('user_data')
        const error = searchParams.get('error')


        if (error) {
          console.error('🔴 Auth callback error:', error)
          setError(error)
          toast({
            title: "Login Failed",
            description: error,
            variant: "destructive",
          })
          setTimeout(() => {
            router.push('/login')
          }, 3000)
          return
        }

        if (!accessToken) {
          console.error('🔴 No access token received')
          setError('No access token received')
          toast({
            title: "Login Failed",
            description: "No access token received from server",
            variant: "destructive",
          })
          setTimeout(() => {
            router.push('/login')
          }, 3000)
          return
        }

        // Parse user data if available
        let parsedUserData = null
        if (userData) {
          try {
            parsedUserData = JSON.parse(decodeURIComponent(userData))
          } catch (e) {
            console.warn('⚠️ Could not parse user data:', e)
          }
        }

        // Use the custom auth hook to login
        login(accessToken, refreshToken, parsedUserData)

        // Success message
        toast({
          title: "Login Successful!",
          description: "Welcome back to Traveloure",
        })

        // Check if user is admin first
        if (parsedUserData?.roles?.includes('admin')) {
          clientRedirect("/admin/dashboard")
          return
        }

        // Check if user is local_expert
        if (parsedUserData?.roles?.includes('local_expert')) {
          clientRedirect("/local-expert")
          return
        }

        // Handle redirect based on stored preferences
        const redirect = localStorage.getItem("redirect")
        const helpRedirect = localStorage.getItem("helpRedirect")
      
        if (helpRedirect === "true") {
          localStorage.removeItem("helpRedirect")  
          localStorage.removeItem("savedActivities")
          localStorage.removeItem("savedPlaces")
          clientRedirect("/help-me-decide")
          return
        }
      
        if (redirect === "true") {
          localStorage.removeItem("redirect")
          clientRedirect("/Itinerary")  
          return
        }
      
        // Default redirect
        clientRedirect("/")

      } catch (err) {
        console.error('🔴 Auth callback error:', err)
        setError('An unexpected error occurred')
        toast({
          title: "Login Failed",
          description: "An unexpected error occurred",
          variant: "destructive",
        })
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } finally {
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams, router, toast, login])

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Completing your login...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
            <p className="font-medium">Login Failed</p>
            <p className="text-sm">{error}</p>
          </div>
          <p className="text-gray-600">Redirecting to login page...</p>
        </div>
      </div>
    )
  }

  return null
}

function LoadingFallback() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  )
} 