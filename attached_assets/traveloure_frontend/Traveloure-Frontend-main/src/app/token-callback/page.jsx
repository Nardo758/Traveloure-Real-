"use client"

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { useToast } from '../../components/ui/use-toast'

// Utility to ensure only strings are passed to toast
function safeString(val) {
  if (typeof val === "string") return val;
  if (val instanceof Error) return val.message;
  if (val && typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function TokenCallbackContent() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { data: session, status } = useSession()

  useEffect(() => {
    const handleTokenCallback = async () => {
      // Prevent multiple executions
      if (loading === false) return
      
      try {
        // Try to get tokens from URL fragment first
        let accessToken = null
        let refreshToken = null
        
        const hash = window.location.hash.substring(1) // Remove the # symbol
        if (hash) {
          const params = new URLSearchParams(hash)
          accessToken = params.get('access')
          refreshToken = params.get('refresh')
        }
        
        // If not found in fragment, try query parameters
        if (!accessToken) {
          accessToken = searchParams.get('access')
          refreshToken = searchParams.get('refresh')
        }
        
     

        if (!accessToken) {
          console.error('🔴 No access token in URL fragment or query params')
          setError('No access token received')
          toast(safeString("Authentication Failed"), {
            description: safeString("No access token received from server"),
            variant: "destructive",
          })
          setTimeout(() => {
            router.push('/login')
          }, 3000)
          return
        }

        // Store tokens in localStorage for immediate use
        localStorage.setItem('accessToken', accessToken)
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken)
        }

        // Get user data from backend using the access token
        let userData = null
        try {
          const userResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/auth/user/`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (userResponse.ok) {
            userData = await userResponse.json()
            localStorage.setItem('userData', JSON.stringify(userData))
          } else {
            console.warn('⚠️ Could not fetch user data, proceeding with tokens only')
          }
        } catch (userError) {
          console.warn('⚠️ Failed to fetch user data:', userError)
        }

        // Create basic user data if not available
        if (!userData) {
          userData = {
            id: 'external-user',
            email: 'user@example.com',
            name: 'User'
          }
          localStorage.setItem('userData', JSON.stringify(userData))
        }
        
        // Sign in with NextAuth using the credentials provider
        const result = await signIn('credentials', {
          redirect: false,
          accessToken,
          refreshToken,
          userData: JSON.stringify(userData),
        })

        if (!result || result.error) {
          console.error('🔴 NextAuth signIn error:', result?.error)
          setError('Authentication failed. Please try again.')
          toast(safeString("Authentication Failed"), {
            description: safeString(result?.error || "Could not sign in with provided credentials."),
            variant: "destructive",
          })
          setTimeout(() => {
            router.push('/login')
          }, 3000)
          setLoading(false)
          return
        }


        toast(safeString("Login Successful!"), {
          description: safeString("Welcome back to Traveloure"),
        })

        // Add a small delay to show success message
        setTimeout(() => {
          // Check if user is admin first
          if (userData?.roles?.includes('admin')) {
            router.push("/admin/dashboard")
            return
          }

          // Check if user is local_expert
          if (userData?.roles?.includes('local_expert')) {
            router.push("/local-expert")
            return
          }

          // Handle redirect based on stored preferences
          const redirect = localStorage.getItem("redirect")
          const helpRedirect = localStorage.getItem("helpRedirect")
        
          if (helpRedirect === "true") {
            localStorage.removeItem("helpRedirect")  
            localStorage.removeItem("savedActivities")
            localStorage.removeItem("savedPlaces")
            router.push("/help-me-decide")
            return
          }
        
          if (redirect === "true") {
            localStorage.removeItem("redirect")
            router.push("/Itinerary")  
            return
          }
        
          // Default redirect
          router.push("/")
        }, 2000) // 2 second delay to show success message

      } catch (err) {
        console.error('🔴 Token callback error:', err)
        setError('An unexpected error occurred')
        toast(safeString("Authentication Failed"), {
          description: safeString(err?.message || err || "An unexpected error occurred"),
          variant: "destructive",
        })
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } finally {
        setLoading(false)
      }
    }

    // Only run if we're not already authenticated
    if (status === 'unauthenticated') {
      handleTokenCallback()
    } else if (status === 'authenticated') {
      // Already authenticated, show success and redirect
      setTimeout(() => {
        router.push('/')
      }, 1000)
    }
  }, [router, toast, status, searchParams])

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">Processing authentication tokens...</p>
          <p className="text-sm text-gray-500">Please wait while we set up your session</p>
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
        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-gray-600 mb-2">Authentication successful!</p>
        <p className="text-sm text-gray-500">Redirecting you to the dashboard...</p>
      </div>
    </div>
  )
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

export default function TokenCallback() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TokenCallbackContent />
    </Suspense>
  )
} 