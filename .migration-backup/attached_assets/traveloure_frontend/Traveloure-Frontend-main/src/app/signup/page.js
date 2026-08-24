"use client"

import { motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Eye, EyeOff, Mail, Lock, User, Phone, UserCircle } from "lucide-react"
import { useDispatch } from "react-redux"
import { signUpUser } from "../../app/redux-features/auth/auth" // Adjust the path accordingly
import Link from "next/link"
import { useRouter } from 'next/navigation';
import { signIn } from "next-auth/react";
import Image from "next/image";
import { toast } from "sonner";

// Custom schema with validation for email, password, and confirm password
const schema = z.object({
  username: z
    .string()
    .min(1, { message: "Username is required" })
    .refine((val) => /[A-Z]/.test(val), {
      message: "Username must contain at least one uppercase letter"
    })
    .refine((val) => /[a-z]/.test(val), {
      message: "Username must contain at least one lowercase letter"
    })
    .refine((val) => /[._@$]|\d/.test(val), {
      message: "Username must contain at least one of the following characters: '.', '_', '@', or '$', or a number"
    }),
  email: z.string().min(1, { message: "Email is required" }).email({ message: "Please enter a valid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .refine((val) => /[a-z]/.test(val), {
      message: "Password must contain at least one lowercase letter"
    }),
  confirm_password: z
    .string()
    .min(8, { message: "Confirm Password must be at least 8 characters" })
    .refine((val) => /[a-z]/.test(val), {
      message: "Confirm Password must contain at least one lowercase letter"
    }),
  first_name: z.string().min(1, { message: "First name is required" }),
  last_name: z.string().min(1, { message: "Last name is required" }),
  phone_number: z
    .string()
    .min(1, { message: "Phone number is required" })
    .regex(/^\+?\d{1,4}[\d\s\-$$$$]{3,20}$/, { message: "Invalid phone number" }),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
})

// Update SocialLoginButton to accept and use the disabled prop
const SocialLoginButton = ({ onClick, iconSrc, alt, children, disabled, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full py-3 bg-[#F3F4F6] rounded-[30px] text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-200 transition text-base border border-gray-200 mb-2 ${className || ''}`}
  >
    <Image src={iconSrc} alt={alt} width={22} height={22} />
    {children}
  </button>
);

export default function SignUp() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm({
    resolver: zodResolver(schema),
  })

  const dispatch = useDispatch()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState({ google: false, facebook: false });
  const [backendErrors, setBackendErrors] = useState({});
  const router = useRouter();
  const onSubmit = async (data) => {
    try {
      setLoading(true);
      setBackendErrors({}); // Clear previous backend errors
      
      // Extracting user data from form
      const userData = {
        username: data.username,
        email: data.email,
        password: data.password,
        confirm_password: data.confirm_password,
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone_number,
      }

      // Dispatch sign-up action and handle success/failure
      await dispatch(signUpUser(userData)).then((res) => {
        if (res.payload.status) {
          toast.success("Account created successfully! Please check your email to verify your account.");
          router.push('/login');
        } else {
          // Handle backend validation errors
          if (res.payload.errors) {
            setBackendErrors(res.payload.errors);
            
            // Set form errors for specific fields
            Object.keys(res.payload.errors).forEach(field => {
              if (res.payload.errors[field] && res.payload.errors[field].length > 0) {
                setError(field, {
                  type: 'backend',
                  message: res.payload.errors[field][0] // Take first error message
                });
              }
            });
          } else {
            toast.error(res.payload );
          }
        }
      })
    } catch (err) {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      setSocialLoading(prev => ({ ...prev, google: true }));
      await signIn("google", { 
        callbackUrl: "/",
        prompt: "consent",
        access_type: "offline"
      });
    } catch (error) {
      console.error('Google sign-in error:', error);
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setSocialLoading(prev => ({ ...prev, google: false }));
    }
  }

  const handleFacebookSignIn = () => {
    try {
      setSocialLoading(prev => ({ ...prev, facebook: true }));
      // Redirect directly to Django backend Facebook login URL
      // This will handle the OAuth flow through Django-allauth
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const facebookLoginUrl = `${backendUrl}/auth/login/facebook/`;
      
      toast.success("Redirecting to Facebook login... You'll be redirected back after authentication.");
      
      // Store current page in localStorage for potential return
      localStorage.setItem('signupPage', 'true');
      
      window.location.href = facebookLoginUrl;
    } catch (error) {
      console.error('Facebook sign-in error:', error);
      toast.error("Facebook sign-in failed. Please try again.");
      setSocialLoading(prev => ({ ...prev, facebook: false }));
    }
  }

  // Function to clear backend errors when user starts typing
  const clearFieldError = (fieldName) => {
    if (backendErrors[fieldName]) {
      setBackendErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
      clearErrors(fieldName);
    }
  }

  return (

    <div className="container mx-auto flex justify-center  px-4 bg-white overflow-hidden rounded-xl ]">
      <div className="">     <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="p-8"
      >

        <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">Sign Up to Your Account</h2>
        <p className="text-center text-gray-500 mb-6">Enter your details to create your Traveloure account</p>
        
        {/* Backend Error Indicator */}
        {Object.keys(backendErrors).length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm font-medium">Please fix the following errors:</p>
            <ul className="text-red-600 text-sm mt-1">
              {Object.keys(backendErrors).map(field => (
                <li key={field} className="ml-2">
                  <span className="font-medium capitalize">{field.replace('_', ' ')}:</span> {backendErrors[field][0]}
                </li>
              ))}
            </ul>
          </div>
        )}
        
      

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Username */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <UserCircle className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type="text"
                placeholder="Username"
                {...register("username")}
                onChange={(e) => {
                  register("username").onChange(e);
                  clearFieldError("username");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C] bg-gray-50 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
            </div>
            <div className="min-h-[20px]">
              {backendErrors.username && backendErrors.username.length > 0 ? (
                <p className="text-red-500 text-sm mt-1 font-medium">{backendErrors.username[0]}</p>
              ) : errors.username ? (
                <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>
              ) : null}
            </div>
          </div>

          {/* Email */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Mail className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                {...register("email")}
                onChange={(e) => {
                  register("email").onChange(e);
                  clearFieldError("email");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C] bg-gray-50 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
            </div>
            <div className="min-h-[20px]">
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
              {backendErrors.email && backendErrors.email.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{backendErrors.email[0]}</p>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Lock className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                {...register("password")}
                onChange={(e) => {
                  register("password").onChange(e);
                  clearFieldError("password");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-gray-50 pr-12 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="min-h-[20px]">
              {backendErrors.password && backendErrors.password.length > 0 ? (
                <p className="text-red-500 text-sm mt-1 font-medium">{backendErrors.password[0]}</p>
              ) : errors.password ? (
                <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
              ) : null}
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Lock className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm Password"
                {...register("confirm_password")}
                onChange={(e) => {
                  register("confirm_password").onChange(e);
                  clearFieldError("confirm_password");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-gray-50 pr-12 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="min-h-[20px]">
              {backendErrors.confirm_password && backendErrors.confirm_password.length > 0 ? (
                <p className="text-red-500 text-sm mt-1 font-medium">{backendErrors.confirm_password[0]}</p>
              ) : errors.confirm_password ? (
                <p className="text-red-500 text-sm mt-1">{errors.confirm_password.message}</p>
              ) : null}
            </div>
          </div>

          {/* First Name */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <User className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type="text"
                placeholder="First Name"
                {...register("first_name")}
                onChange={(e) => {
                  register("first_name").onChange(e);
                  clearFieldError("first_name");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C] bg-gray-50 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
            </div>
            <div className="min-h-[20px]">
              {errors.first_name && <p className="text-red-500 text-sm mt-1">{errors.first_name.message}</p>}
              {backendErrors.first_name && backendErrors.first_name.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{backendErrors.first_name[0]}</p>
              )}
            </div>
          </div>

          {/* Last Name */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <User className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type="text"
                placeholder="Last Name"
                {...register("last_name")}
                onChange={(e) => {
                  register("last_name").onChange(e);
                  clearFieldError("last_name");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C] bg-gray-50 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
            </div>
            <div className="min-h-[20px]">
              {errors.last_name && <p className="text-red-500 text-sm mt-1">{errors.last_name.message}</p>}
              {backendErrors.last_name && backendErrors.last_name.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{backendErrors.last_name[0]}</p>
              )}
            </div>
          </div>

          {/* Phone Number */}
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Phone className="h-5 w-5 text-[#FF385C]" />
              </div>
              <input
                type="text"
                placeholder="Phone Number"
                {...register("phone_number")}
                onChange={(e) => {
                  register("phone_number").onChange(e);
                  clearFieldError("phone_number");
                }}
                className="w-full pl-12 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF385C] bg-gray-50 placeholder:text-gray-500 placeholder:opacity-100 placeholder:text-base"
                style={{
                  fontSize: '16px', // Prevent zoom on iOS
                  WebkitAppearance: 'none',
                  MozAppearance: 'textfield'
                }}
              />
            </div>
            <div className="min-h-[20px]">
              {errors.phone_number && <p className="text-red-500 text-sm mt-1">{errors.phone_number.message}</p>}
              {backendErrors.phone_number && backendErrors.phone_number.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{backendErrors.phone_number[0]}</p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Social Login Section */}
          <div className="flex flex-col gap-2">
            <SocialLoginButton
              iconSrc="/google-icon.png"
              alt="Google"
              disabled={socialLoading.google}
              className={socialLoading.google ? "opacity-50 cursor-not-allowed" : ""}
              onClick={handleGoogleSignIn}
            >
              {socialLoading.google ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                "Sign up with Google"
              )}
            </SocialLoginButton>
            <SocialLoginButton
              iconSrc="/facebook-icon.svg"
              alt="Facebook"
              disabled={socialLoading.facebook}
              className={socialLoading.facebook ? "opacity-50 cursor-not-allowed" : ""}
              onClick={handleFacebookSignIn}
            >
              {socialLoading.facebook ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                "Sign up with Facebook"
              )}
            </SocialLoginButton>
          </div>

          {/* Submit Button */}
          <button type="submit" className="w-full py-3 bg-[#FF385C] hover:bg-[#E0012A] text-white rounded-lg transition-colors flex items-center justify-center" disabled={loading}>
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                Signing Up...
              </>
            ) : (
              "Sign Up"
            )}
          </button>

          <div className="text-center text-gray-500 my-2">OR</div>
        </form>


        <div className="mt-6 text-center text-gray-500">
          Already have an Account?{" "}
          <Link href="/login" className="text-[#FF385C] hover:underline">
            Login
          </Link>
        </div>
      </motion.div></div>
    </div>

  )
}
