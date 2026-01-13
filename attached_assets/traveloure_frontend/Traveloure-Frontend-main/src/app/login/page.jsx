"use client"

import { useState, useEffect, Suspense, lazy } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn, useSession } from "next-auth/react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { MdEmail } from "react-icons/md"
import { IoIosLock } from "react-icons/io"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/use-toast"
import { clientRedirect } from "../../components/commonfunctions/page"

const SocialLoginButton = lazy(() => import("./SocialLoginButton"))

const loginSchema = z.object({
  email_or_username: z.string().min(1, "Email or Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})


function LoginContent() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const { toast } = useToast()
  const { data: session, status } = useSession()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  })

  // Handle existing session
  useEffect(() => {
    if (status === "loading") return

    if (session?.backendData?.accessToken) {
      toast.success("You're logged in.", {
        description: "Redirecting you now...",
      })
      handlePostLoginRedirect()
    } else {
      setIsReady(true)
    }
  }, [session, status, toast])
  const handlePostLoginRedirect = () => {
    // Handle specific redirects for regular users (before role-based redirect)
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
  
    // Role-based redirect
    const roles =
      session?.user?.roles ||
      session?.backendData?.roles ||
      session?.backendData?.user?.roles ||
      []

    if (Array.isArray(roles)) {

      if (roles.includes('service_provider')) {
        clientRedirect('/service-provider-panel/dashboard')
        return
      }
      if (roles.includes('local_expert')) {
        clientRedirect('/local-expert/dashboard')
        return
      }
    }

    // Default
    clientRedirect("/")
  }
  const onSubmit = async (data) => {
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: data.email_or_username,
        password: data.password,
      })

      if (result?.error) {
        toast.error("Login failed", {
          description: result.error,
        })
        return
      }

      if (result?.ok) {
        toast.success("Login successful!", {
          description: "Welcome back to Traveloure",
        })

        // Longer delay to ensure session is fully updated
        setTimeout(() => {
          handlePostLoginRedirect()
        }, 500)
      }
    } catch (err) {
      console.error("Login failed:", err)
      // Extract meaningful error message
      let errorMessage = "Unexpected error during login"
      if (err?.message) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }
      
      // Check for common error patterns
      if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
        errorMessage = "Backend server is unavailable. Please try again in a few moments."
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        errorMessage = "Request timed out. Please check your connection and try again."
      } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        errorMessage = "Network error. Please check your connection."
      }
      
      toast.error("Login failed", {
        description: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = () => {
    signIn("google", {
      callbackUrl: "/", // This will be handled by the callback page
    })
  }

  const handleFacebookSignIn = () => {
    // Redirect directly to Django backend Facebook login URL
    // This will handle the OAuth flow through Django-allauth
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    const facebookLoginUrl = `${backendUrl}/auth/login/facebook/`;
    
    window.location.href = facebookLoginUrl;
  }

  if (status === "loading" || !isReady) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa] px-4">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-full max-w-md">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold mb-2">Login to Your Account</h2>
          <p className="text-gray-500">Enter your email address and password to log in to Traveloure</p>
        </div>

        {error === "AccessDenied" && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4">
            <p className="font-medium">Login Failed</p>
            <p className="text-sm">Please try again or use email login.</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email Input */}
          <div className="space-y-1.5">
            <div className="relative">
              <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-500 text-lg" />
              <Input
                type="text"
                placeholder="Email Address"
                {...register("email_or_username")}
                className="pl-12 pr-4 py-3 border border-gray-200 rounded-full bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-pink-500"
                disabled={loading}
              />
            </div>
            {errors.email_or_username && (
              <p className="text-sm text-red-500 ml-4">{errors.email_or_username.message}</p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="relative">
              <IoIosLock className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-500 text-lg" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                {...register("password")}
                className="pl-12 pr-12 py-3 border border-gray-200 rounded-full bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-pink-500"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-gray-300 text-gray-600 rounded-full p-2 transition-colors"
                tabIndex={-1}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-red-500 ml-4">{errors.password.message}</p>}
          </div>

          {/* Forgot Password Link */}
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm text-pink-500 font-medium hover:underline transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#FF385C] text-white rounded-full hover:bg-[#e23350] transition-colors text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Logging in...
              </span>
            ) : (
              "Login"
            )}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <hr className="flex-grow border-gray-200" />
            <span className="text-gray-400 text-sm font-medium">OR</span>
            <hr className="flex-grow border-gray-200" />
          </div>

          {/* Google Login */}
          <Suspense fallback={<div className="h-12 bg-gray-100 rounded-full animate-pulse"></div>}>
            <SocialLoginButton iconSrc="/google-icon.png" alt="Google" onClick={handleGoogleSignIn} disabled={loading}>
              Log in with Google
            </SocialLoginButton>
          </Suspense>

          {/* Facebook Login */}
          <Suspense fallback={<div className="h-12 bg-gray-100 rounded-full animate-pulse"></div>}>
            <SocialLoginButton iconSrc="/facebook-icon.svg" alt="Facebook" onClick={handleFacebookSignIn} disabled={loading}>
              Log in with Facebook
            </SocialLoginButton>
          </Suspense>
        </form>

        {/* Signup Link */}
        <p className="text-center text-sm mt-6">
          {"Don't have an account? "}
          <Link href="/signup" className="text-pink-500 font-semibold hover:underline transition-colors">
            Signup
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
