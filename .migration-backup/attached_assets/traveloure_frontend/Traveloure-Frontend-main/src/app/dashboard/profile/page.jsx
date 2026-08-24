"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Camera, Menu, X, Home } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { useSelector, useDispatch } from "react-redux"
import { gettravelprefrence, userProfile, userProfileUpdate } from "../../redux-features/auth/auth"
import { clientRedirect } from "../../../components/commonfunctions/page"
import { useSession } from "next-auth/react"
import { changePassword, patchtravelprefrence } from "../../redux-features/auth/auth"
import { toast } from "sonner"
import ReactSelect from "react-select"
import isoCountries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'

isoCountries.registerLocale(enLocale)

const getCountriesList = () => {
  const alpha2Codes = isoCountries.getAlpha2Codes()
  return Object.keys(alpha2Codes)
    .map((code) => ({
      value: code,
      label: isoCountries.getName(code, "en"),
    }))
    .filter((country) => !!country.label)
    .sort((a, b) => a.label.localeCompare(b.label))
}

const countriesList = getCountriesList()

const normalizeCountryValue = (countryValue) => {
  if (!countryValue) return ""
  const trimmedValue = countryValue.trim()
  const lowerCaseValue = trimmedValue.toLowerCase()
  const manualMappings = {
    usa: "US",
    "u.s.a": "US",
    uk: "GB",
    "u.k": "GB",
    uae: "AE",
    "u.a.e": "AE",
  }

  if (manualMappings[lowerCaseValue]) {
    return manualMappings[lowerCaseValue]
  }

  const alpha2FromName = isoCountries.getAlpha2Code(trimmedValue, "en")
  if (alpha2FromName) {
    return alpha2FromName
  }

  const normalizedCode = trimmedValue.toUpperCase()

  if (countriesList.some((option) => option.value === normalizedCode)) {
    return normalizedCode
  }

  return normalizedCode
}
export default function ProfilePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [changePasswordModal, setChangePasswordModal] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    new_password: "",
    confirm_new_password: "",
  })

  const [passwordLoading, setPasswordLoading] = useState(false)

  // Travel preferences state
  const [travelPreferences, setTravelPreferences] = useState({
    travel_style: [],
    preferred_months: [],
    meal_preference: "both",
  })

  const [travelPreferencesLoading, setTravelPreferencesLoading] = useState(false)

  const userinfo = useSelector((state) => {
    const profile = state?.auth?.profile
    // Handle different possible structures
    if (Array.isArray(profile) && profile.length > 0) {
      return profile[0]
    } else if (profile && typeof profile === 'object' && profile.data && Array.isArray(profile.data) && profile.data.length > 0) {
      return profile.data[0]
    } else if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
      return profile
    }
    return {}
  })
  
  const loading = useSelector((state) => state?.auth?.loading || false)
  const travelPrefData = useSelector((state) => {
    const travelPref = state?.auth?.travelprefrence
    // Handle different possible structures
    if (travelPref && typeof travelPref === 'object' && travelPref.data) {
      return travelPref.data
    } else if (travelPref && typeof travelPref === 'object' && !Array.isArray(travelPref)) {
      return travelPref
    }
    return {}
  })

  const dispatch = useDispatch()
  const { data: session } = useSession()
  const token = session?.backendData?.accessToken
  const router = useRouter()

  useEffect(() => {
    if (token) {
      dispatch(userProfile({ token }))
    }
  }, [token, dispatch])

  // Separate useEffect for gettravelprefrence that waits for userinfo.id
  useEffect(() => {
    if (userinfo?.id && token) {
      dispatch(gettravelprefrence({ id: userinfo.id, token }))
    }
  }, [userinfo?.id, token, dispatch])



  // Sync travel preferences with Redux state
  useEffect(() => {
    if (
      travelPrefData &&
      (travelPrefData.travel_style || travelPrefData.preferred_months || travelPrefData.meal_preference)
    ) {
      const newPreferences = {
        travel_style: Array.isArray(travelPrefData.travel_style) ? travelPrefData.travel_style : [],
        preferred_months: Array.isArray(travelPrefData.preferred_months) ? travelPrefData.preferred_months : [],
        meal_preference: travelPrefData.meal_preference || "both",
      }
      setTravelPreferences(newPreferences)
    }
  }, [travelPrefData])

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    dob: "",
    country: "", // isoCode
    image: null,
    imagePreview: "", // for local preview
  })

  // Sync form with Redux state
  useEffect(() => {
    setForm((prevForm) => ({
      ...prevForm,
      first_name: userinfo.first_name || "",
      last_name: userinfo.last_name || "",
      email: userinfo.email || "",
      phone_number: userinfo.phone_number || "",
      dob: userinfo.dob || "",
      country: normalizeCountryValue(userinfo.country) || "",
      // Keep the image preview if it exists, otherwise use userinfo.image
      imagePreview: prevForm.imagePreview || userinfo.image || "",
    }))
  }, [
    userinfo.first_name,
    userinfo.last_name,
    userinfo.email,
    userinfo.phone_number,
    userinfo.dob,
    userinfo.country,
    userinfo.image,
  ])

  const radius = 36
  const stroke = 8
  const normalizedRadius = radius
  const circumference = 2 * Math.PI * normalizedRadius

  // Calculate profile completion percentage
  const calculateProfileCompletion = () => {
    const fields = [
      form.first_name,
      form.last_name,
      form.email,
      form.phone_number,
      form.dob,
      form.country,
      form.image || userinfo.image,
    ]

    const filledFields = fields.filter((field) => field && field.toString().trim() !== "").length
    const totalFields = fields.length
    const percentage = Math.round((filledFields / totalFields) * 100)

    return {
      percentage,
      filledFields,
      totalFields,
    }
  }

  const profileCompletion = calculateProfileCompletion()
  const progress = profileCompletion.percentage / 100 // Convert to decimal for circle calculation

  const strokeDashoffset = circumference * (1 - progress)

  const normalizedCountryValue = normalizeCountryValue(form.country)
  const countrySelectValue = normalizedCountryValue
    ? countriesList.find((option) => option.value === normalizedCountryValue) || null
    : null

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Handle password form changes
  const handlePasswordChange = (e) => {
    const { name, value } = e.target
    setPasswordForm((prev) => ({ ...prev, [name]: value }))
  }

  // Handle select changes
  const handleSelect = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Handle phone number changes
  const handlePhoneChange = (phone) => {
    setForm((prev) => ({ ...prev, phone_number: phone }))
  }

  // Cancel resets to Redux state
  const handleCancel = () => {
    clientRedirect("/dashboard")
  }

  const fileInputRef = useRef(null)

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setForm((prev) => ({
          ...prev,
          image: file,
          imagePreview: reader.result,
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  // Save changes (dispatch update)
  const handleSave = async () => {
    if (userinfo?.id) {
      const formData = new FormData()
      formData.append("first_name", form.first_name)
      formData.append("last_name", form.last_name)
      formData.append("email", form.email)
      formData.append("phone_number", form.phone_number)
      formData.append("dob", form.dob)
      formData.append("country", form.country)
      if (form.image) {
        formData.append("image", form.image)
      }

      try {
        const res = await dispatch(userProfileUpdate({ id: userinfo.id, data: formData, token: token }))
        if (res.payload?.status) {
          // Refresh user profile data after successful update
          await dispatch(userProfile({ token }))
          toast.success("Profile updated successfully!")
        } else {
          toast.error("Failed to update profile")
        }
      } catch (error) {
        console.error("Profile update error:", error)
        toast.error("Failed to update profile")
      }
    }
  }

  // Handle change password
  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_new_password) {
      toast.error("Passwords do not match!")
      return
    }

    if (passwordForm.new_password.length < 6) {
      toast.error("Password must be at least 6 characters long!")
      return
    }

    setPasswordLoading(true)

    try {
      const result = await dispatch(
        changePassword({
          newPassword: passwordForm.new_password,
          confirmNewPassword: passwordForm.confirm_new_password,
          token: token,
        }),
      )

      if (result.payload?.status) {
        setChangePasswordModal(false)
        setPasswordForm({ new_password: "", confirm_new_password: "" })
        toast.success("Password changed successfully!")
      } else {
        toast.error("Failed to change password. Please try again.")
      }
    } catch (error) {
      console.error("Password change error:", error)
      toast.error("Failed to change password")
    } finally {
      setPasswordLoading(false)
    }
  }

  // Travel style options
  const travelStyleOptions = [
    "Adventure",
    "Relaxation",
    "Budget-friendly",
    "Luxury",
    "Cultural",
    "Nightlife",
    "Family-friendly",
    "Solo Travel",
    "Group Travel",
    "Business",
  ]

  // Month options
  const monthOptions = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  // Meal preference options
  const mealPreferenceOptions = [
    { value: "both", label: "Both Veg & Non Veg" },
    { value: "vegetarian", label: "Vegetarian" },
    { value: "non-vegetarian", label: "Non-Vegetarian" },
    { value: "vegan", label: "Vegan" },
    { value: "no-preference", label: "No Preference" },
  ]

  // Handle travel style toggle
  const handleTravelStyleToggle = (style) => {
    setTravelPreferences((prev) => ({
      ...prev,
      travel_style: prev.travel_style.includes(style)
        ? prev.travel_style.filter((s) => s !== style)
        : [...prev.travel_style, style],
    }))
  }

  // Handle month toggle
  const handleMonthToggle = (month) => {
    setTravelPreferences((prev) => {
      const newPreferences = {
        ...prev,
        preferred_months: prev.preferred_months.includes(month)
          ? prev.preferred_months.filter((m) => m !== month)
          : [...prev.preferred_months, month],
      }
      return newPreferences
    })
  }

  // Handle meal preference change
  const handleMealPreferenceChange = (value) => {
    setTravelPreferences((prev) => ({
      ...prev,
      meal_preference: value,
    }))
  }

  // Handle travel preferences save
  const handleSaveTravelPreferences = async () => {
    if (!userinfo?.id || !token) {
      toast.error("User information not available")
      return
    }

    setTravelPreferencesLoading(true)
    try {
      const result = await dispatch(
        patchtravelprefrence({
          id: userinfo.id,
          data: travelPreferences,
          token,
        }),
      ).unwrap()

      toast.success("Travel preferences saved successfully!")

      // Refresh travel preferences data after successful save
      await dispatch(gettravelprefrence({ id: userinfo.id, token }))
    } catch (error) {
      console.error("Failed to save travel preferences:", error)
      toast.error("Failed to save travel preferences")
    } finally {
      setTravelPreferencesLoading(false)
    }
  }

  // Show loading state while data is being fetched
  if (loading && !userinfo?.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF385C] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <style jsx global>{`
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  /* Phone Input Styles */
  .PhoneInput {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    min-height: 40px !important;
  }
  
  .PhoneInputCountry {
    border: 1px solid #e5e7eb !important;
    border-right: none !important;
    border-radius: 0.5rem 0 0 0.5rem !important;
    background: #f9fafb !important;
    padding: 0.5rem !important;
    display: flex !important;
    align-items: center !important;
    gap: 0.5rem !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    min-width: 120px !important;
    flex-shrink: 0 !important;
  }
  
  .PhoneInputCountry:hover {
    background: #f3f4f6 !important;
  }
  
  .PhoneInputCountryIcon {
    width: 1.5rem !important;
    height: 1.5rem !important;
    border-radius: 2px !important;
  }
  
  .PhoneInputInput {
    flex: 1 !important;
    border: 1px solid #e5e7eb !important;
    border-left: none !important;
    border-radius: 0 0.5rem 0.5rem 0 !important;
    padding: 0.5rem 0.75rem !important;
    font-size: 0.875rem !important;
    background: white !important;
    color: #374151 !important;
    outline: none !important;
    transition: all 0.2s ease !important;
    min-height: 40px !important;
    width: 100% !important;
  }
  
  .PhoneInputInput:focus {
    border-color: #FF385C !important;
    box-shadow: 0 0 0 3px rgba(255, 56, 92, 0.1) !important;
  }
  
  .PhoneInputInput::placeholder {
    color: #9ca3af !important;
  }
`}</style>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AppSidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <Dialog open={changePasswordModal} onOpenChange={setChangePasswordModal}>
        <DialogContent className="sm:max-w-[425px] mx-2 sm:mx-0 px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your new password and confirm it to update your account security.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <Input
                id="new_password"
                name="new_password"
                type="password"
                value={passwordForm.new_password}
                onChange={handlePasswordChange}
                placeholder="Enter new password"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_new_password">Confirm New Password</Label>
              <Input
                id="confirm_new_password"
                name="confirm_new_password"
                type="password"
                value={passwordForm.confirm_new_password}
                onChange={handlePasswordChange}
                placeholder="Confirm new password"
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChangePasswordModal(false)
                setPasswordForm({ new_password: "", confirm_new_password: "" })
              }}
              disabled={passwordLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={passwordLoading || !passwordForm.new_password || !passwordForm.confirm_new_password}
              className="bg-[#FF385C] hover:bg-[#FF385C]"
            >
              {passwordLoading ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Layout */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-[calc(100vh-64px)]">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-10 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto relative">
            {/* Home Icon with Tooltip - Hidden on Mobile */}
            <div className="absolute top-0 right-0 z-10 lg:hidden">
              <div
                className="relative"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <Home 
                  onClick={() => router.push("/")} 
                  className="h-9 w-9 text-gray-600 hover:text-gray-900 bg-white border shadow-sm border-gray-200 pr-[8px] p-[4px] pl-[8px] cursor-pointer transition-colors rounded-full"
                />
                
                {/* Tooltip */}
                {showTooltip && (
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 z-50">
                    <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Home
                      {/* Tooltip arrow */}
                      <div className="absolute bottom-full mb-2 w-0 h-0 border-l-0 border-r-4 border-t-2 border-b-2 border-transparent border-r-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mb-4 border border-gray-300"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {/* Page Header */}
            <div className="mb-6">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your account settings and preferences</p>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-6">
              <Card className="flex-1 bg-white flex flex-row items-center p-4 md:p-6">
                <Avatar className="h-16 w-16 md:h-20 md:w-20 mr-4">
                  <AvatarImage src={userinfo.image || "/placeholder.svg?height=64&width=64"} />
                  <AvatarFallback className="bg-[#FF385C] text-white text-xl md:text-2xl">
                    {userinfo.first_name?.[0] || "U"}
                    {userinfo.last_name?.[0] || "N"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                    {userinfo.first_name} {userinfo.last_name}
                  </h2>
                  <p className="text-sm md:text-base text-gray-600">Email: {userinfo.email}</p>
                  <p className="text-xs md:text-sm text-gray-500">
                    Contact Number: {userinfo.phone_number ? `+1${userinfo.phone_number}` : "no information"}
                  </p>
                </div>
                <div className="hidden md:flex flex-col items-end flex-1">
                  <div className="flex flex-col items-center">
                    <div className="flex flex-col items-center space-y-1">
                      <h3 className="text-sm font-medium text-gray-900">Complete Your Profile</h3>
                      <div className="w-28 h-28 relative flex items-center justify-center">
                        <svg width="80" height="80" viewBox="0 0 80 80">
                          {/* Background circle */}
                          <circle cx="40" cy="40" r={radius} stroke="#E5E7EB" strokeWidth={stroke} fill="none" />
                          {/* Progress circle */}
                          <circle
                            cx="40"
                            cy="40"
                            r={radius}
                            stroke="#22C55E"
                            strokeWidth={stroke}
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            transform="rotate(-90 40 40)" // Start from top center
                          />
                        </svg>
                        <span className="absolute text-xl font-bold text-gray-900">
                          {profileCompletion.percentage}%
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">Completed</span>
                    </div>
                  </div>
                </div>
              </Card>
              <div className="md:hidden flex justify-center">
                <div className="flex flex-col items-center">
                  <div className="w-28 h-28 flex items-center justify-center">
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="36" stroke="#E5E7EB" strokeWidth="8" fill="none" />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="#22C55E"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={2 * Math.PI * 36}
                        strokeDashoffset={2 * Math.PI * 36 * (1 - progress)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-xl font-bold text-gray-900">{profileCompletion.percentage}%</span>
                  </div>
                  <span className="text-xs text-gray-500 mt-1">Completed</span>
                </div>
              </div>
            </div>

            {/* Profile Tabs */}
            <Tabs defaultValue="personal" className="w-full ">
              <TabsList className="flex w-full bg-[#f9fafb] mb-0 rounded-[8px] overflow-x-auto scrollbar-hide min-w-0">
                <div className="flex space-x-1 pl-3">
                  <TabsTrigger
                    value="personal"
                  className="ml-[100px] md:ml-0 text-xs md:text-sm data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-[8px] whitespace-nowrap flex-shrink-0 px-3 py-2"
                  >
                    Personal Information
                  </TabsTrigger>
                  <TabsTrigger
                    value="travel"
                    className="text-xs md:text-sm data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-[8px] whitespace-nowrap flex-shrink-0 px-3 py-2"
                  >
                    Travel Preferences
                  </TabsTrigger>
                  <TabsTrigger
                    value="insights"
                    className="text-xs md:text-sm data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-[8px] whitespace-nowrap flex-shrink-0 px-3 py-2"
                  >
                    Profile Insights
                  </TabsTrigger>
                  <TabsTrigger
                    value="security"
                    className="text-xs md:text-sm data-[state=active]:bg-[#FF385C] data-[state=active]:text-white rounded-[8px] whitespace-nowrap flex-shrink-0 px-3 py-2"
                  >
                    Security
                  </TabsTrigger>
                </div>
              </TabsList>

              <Card className="bg-white">
                <CardContent className="p-0">
                  <TabsContent value="personal" className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold mb-4">Personal Information</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="firstName" className="text-sm font-medium mb-1 block">
                              First Name:
                            </Label>
                            <Input
                              id="firstName"
                              name="first_name"
                              value={form.first_name}
                              onChange={handleChange}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="lastName" className="text-sm font-medium mb-1 block">
                              Last Name:
                            </Label>
                            <Input
                              id="lastName"
                              name="last_name"
                              value={form.last_name}
                              onChange={handleChange}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="email" className="text-sm font-medium mb-1 block">
                              Email Address:
                            </Label>
                            <Input
                              id="email"
                              name="email"
                              type="email"
                              value={form.email}
                              onChange={handleChange}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="mobile" className="text-sm font-medium mb-1 block">
                              Mobile Number:
                            </Label>
                            <PhoneInput
                              key={normalizedCountryValue?.toLowerCase() || 'us'}
                              value={form.phone_number || ""}
                              onChange={handlePhoneChange}
                              defaultCountry={normalizedCountryValue?.toLowerCase() || 'us'}
                              placeholder="Enter your mobile number"
                              className="w-full"
                              showCountryCode={true}
                              showCountryFlag={true}
                              searchPlaceholder="Search country..."
                              searchNotFound="No country found"
                              preferredCountries={['us', 'gb', 'in', 'ca', 'au']}
                              enableSearch={true}
                              disableSearchIcon={false}
                              searchStyle={{
                                width: '100%',
                                padding: '8px 12px', 
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '14px',
                                outline: 'none'
                              }}
                              countryListStyle={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                              }}
                              countryButtonStyle={{
                                border: '1px solid #e5e7eb',
                                borderRight: 'none',
                                borderRadius: '6px 0 0 6px',
                                backgroundColor: '#f9fafb',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minWidth: '120px',
                                flexShrink: '0',
                                cursor: 'pointer'
                              }}
                              inputStyle={{
                                border: '1px solid #e5e7eb',
                                borderLeft: 'none',
                                borderRadius: '0 6px 6px 0',
                                padding: '8px 12px',
                                fontSize: '14px',
                                backgroundColor: 'white',
                                color: '#374151',
                                outline: 'none',
                                flex: '1',
                                width: '100%',
                                minHeight: '40px',
                                cursor: 'text'
                              }}
                            />
                          </div>
                          <div>
                            <Label htmlFor="dob" className="text-sm font-medium mb-1 block">
                              Date of Birth:
                            </Label>
                            <Input
                              id="dob"
                              name="dob"
                              type="date"
                              value={form.dob}
                              onChange={handleChange}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="country" className="text-sm font-medium mb-1 block">
                              Country of Residence:
                            </Label>
                            <ReactSelect
                              inputId="country"
                              options={countriesList}
                              value={countrySelectValue}
                              onChange={(option) => handleSelect("country", option ? option.value : "")}
                              isClearable
                              placeholder="Select or type country"
                              classNamePrefix="react-select"
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-3 mt-6 justify-end">
                          <Button
                            variant="outline"
                            className="text-[#FF385C] border-[#FF385C] hover:bg-pink-50 font-semibold px-6"
                            onClick={handleCancel}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="bg-[#FF385C] hover:bg-[#FF385C] text-white font-semibold px-6"
                            onClick={handleSave}
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center min-w-[180px]">
                        <div
                          className="relative rounded-2xl overflow-hidden border border-gray-200 w-40 h-40 flex items-center justify-center bg-white cursor-pointer"
                          onClick={() => document.getElementById("profile-photo-input").click()}
                        >
                          <Avatar className="h-40 w-40">
                            <AvatarImage src={form.imagePreview || userinfo.image || "/placeholder.svg"} />
                            <AvatarFallback className="bg-[#FF385C] text-white text-3xl">
                              {form.first_name?.[0] || "U"}
                              {form.last_name?.[0] || "N"}
                            </AvatarFallback>
                          </Avatar>
                          <Button
                            size="icon"
                            className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white border border-gray-200 shadow hover:bg-pink-100"
                          >
                            <Camera className="h-4 w-4 text-[#FF385C]" />
                          </Button>
                          <input
                            id="profile-photo-input"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageChange}
                          />
                        </div>
                        <div className="text-center mt-2">
                          <p className="text-sm font-medium text-gray-900">Profile Photo</p>
                          <p className="text-xs text-gray-500">Click to upload new photo</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="travel" className="p-6">
                    <div className="space-y-4 md:space-y-6">
                      {/* Travel Style */}
                      <div className="space-y-2 md:space-y-3">
                        <h3 className="text-base md:text-lg font-semibold text-gray-900">Travel Style</h3>
                        <div className="flex flex-wrap gap-2 md:gap-3">
                          {travelStyleOptions.map((style) => (
                            <Button
                              key={style}
                              variant="outline"
                              size="sm"
                              className={`text-xs md:text-sm transition-all ${
                                travelPreferences.travel_style.includes(style)
                                  ? "bg-green-50 border-green-500 text-green-700 hover:bg-green-100"
                                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
                              }`}
                              onClick={() => handleTravelStyleToggle(style)}
                            >
                              {travelPreferences.travel_style.includes(style) && "✓ "}
                              {style}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Preferred Travel Months */}
                      <div className="space-y-2 md:space-y-3">
                        <h3 className="text-base md:text-lg font-semibold text-gray-900">Preferred Travel Months</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                          {monthOptions.map((month) => (
                            <Button
                              key={month}
                              variant="outline"
                              size="sm"
                              className={`text-xs md:text-sm transition-all ${
                                travelPreferences.preferred_months.includes(month)
                                  ? "bg-green-50 border-green-500 text-green-700 hover:bg-green-100"
                                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
                              }`}
                              onClick={() => handleMonthToggle(month)}
                            >
                              {travelPreferences.preferred_months.includes(month) && "✓ "}
                              {month}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Meal Preference */}
                      <div className="space-y-2 md:space-y-3">
                        <h3 className="text-base md:text-lg font-semibold text-gray-900">Meal Preference</h3>
                        <Select value={travelPreferences.meal_preference} onValueChange={handleMealPreferenceChange}>
                          <SelectTrigger className="w-full max-w-xs text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {mealPreferenceOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button
                          variant="outline"
                          className="text-sm bg-[#FF385C] hover:bg-[#FF385C] text-white border-[#FF385C]"
                          onClick={handleSaveTravelPreferences}
                          disabled={travelPreferencesLoading}
                        >
                          {travelPreferencesLoading ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="insights" className="p-6">
                    <div className="space-y-4 md:space-y-6">
                      <h3 className="text-base md:text-lg font-semibold text-gray-900">Profile Insights</h3>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {/* Profile Completeness */}
                        <div className="space-y-1 md:space-y-2 p-3 md:p-4 border border-gray-100 rounded-lg">
                          <p className="text-xs md:text-sm text-gray-600">Profile Completeness</p>
                          <p className="text-xl md:text-2xl font-bold text-green-600">
                            {profileCompletion.percentage}%
                          </p>
                        </div>

                        {/* Total Trips Planned */}
                        <div className="space-y-1 md:space-y-2 p-3 md:p-4 border border-gray-100 rounded-lg">
                          <p className="text-xs md:text-sm text-gray-600">Total Trips Planned</p>
                          <p className="text-xl md:text-2xl font-bold text-gray-900">12</p>
                        </div>

                        {/* Countries Covered */}
                        <div className="space-y-1 md:space-y-2 p-3 md:p-4 border border-gray-100 rounded-lg">
                          <p className="text-xs md:text-sm text-gray-600">Countries Covered</p>
                          <p className="text-xl md:text-2xl font-bold text-gray-900">9</p>
                        </div>

                        {/* Total Time Saved */}
                        <div className="space-y-1 md:space-y-2 p-3 md:p-4 border border-gray-100 rounded-lg">
                          <p className="text-xs md:text-sm text-gray-600">Total Time Saved</p>
                          <p className="text-xl md:text-2xl font-bold text-gray-900">48 Hours</p>
                        </div>

                        {/* Total Money Saved */}
                        <div className="space-y-1 md:space-y-2 p-3 md:p-4 border border-gray-100 rounded-lg">
                          <p className="text-xs md:text-sm text-gray-600">Total Money Saved</p>
                          <p className="text-xl md:text-2xl font-bold text-gray-900">$512.60</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="security" className="p-6">
                    <div className="space-y-4 md:space-y-6">
                      <h3 className="text-base md:text-lg font-semibold text-gray-900">Security</h3>

                      {/* Security Settings */}
                      <div className="space-y-4 md:space-y-6">
                        {/* Change Password */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 md:py-4 border-b border-gray-100 gap-3">
                          <div>
                            <h4 className="text-sm md:text-base font-medium text-gray-900">Change Password</h4>
                          </div>
                          <Button
                            size="sm"
                            className="bg-[#FF385C] hover:bg-[#FF385C] text-white text-xs md:text-sm"
                            onClick={() => {
                              setChangePasswordModal(true)
                            }}
                          >
                            Change Password
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </CardContent>
              </Card>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
