"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useDispatch, useSelector } from "react-redux"

import { useLocalExpert } from "../../../hooks/useLocalExpert"
import { LocalExpertSidebar } from "../../../components/local-expert/LocalExpertSidebar"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { Card, CardContent } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Badge } from "../../../components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "../../../components/ui/avatar"

import {
  User,
  MapPin,
  Globe2,
  Languages,
  Briefcase,
  Link2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CalendarDays,
  CreditCard,
  Menu,
} from "lucide-react"
import { fetchLocalExpertBusinessProfile } from "../../../app/redux-features/local-expert/localExpertSlice"

export default function LocalExpertBusinessProfilePage() {
  const { isLocalExpert, isLoading, isAuthenticated, session } = useLocalExpert()
  const { data: sessionData } = useSession()
  const router = useRouter()
  const dispatch = useDispatch()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const hasFetchedRef = useRef(false)

  const { businessProfile, businessProfileLoading, businessProfileError } = useSelector(
    (state) => state.localExpert
  )

  const getAccessToken = () => {
    return (
      session?.backendData?.accessToken ||
      session?.backendData?.backendData?.accessToken ||
      sessionData?.backendData?.accessToken ||
      sessionData?.backendData?.backendData?.accessToken ||
      (typeof window !== "undefined" ? localStorage.getItem("accessToken") : null)
    )
  }

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push("/login")
      return
    }

    if (!isLocalExpert) {
      router.push("/dashboard")
    }
  }, [isLocalExpert, isLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated && isLocalExpert && !hasFetchedRef.current) {
      const token = getAccessToken()
      if (token) {
        hasFetchedRef.current = true
        dispatch(fetchLocalExpertBusinessProfile({ token }))
      }
    }
  }, [isAuthenticated, isLocalExpert, dispatch])

  const handleSidebarClose = () => setSidebarOpen(false)

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#fcfbfa]">
        <Navbar />
        <div className="flex justify-center items-center flex-1">
          <Loader2 className="w-10 h-10 animate-spin text-[#ff2e44]" />
        </div>
      </div>
    )
  }

  if (!isLocalExpert) {
    return null
  }

  const user = businessProfile?.user

  const fullName =
    user && (user.first_name || user.last_name)
      ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
      : user?.username || "Local Expert"

  const initials =
    user && (user.first_name || user.last_name)
      ? `${(user.first_name || "")[0] || ""}${(user.last_name || "")[0] || ""}`.toUpperCase()
      : (user?.username || "LE").slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col h-screen bg-[#fcfbfa]">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <LocalExpertSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile Menu Toggle Button (hamburger icon to match other pages) */}
          <div className="lg:hidden absolute top-4 right-4 z-30">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-white shadow-md"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          <main className="flex-1 overflow-y-auto bg-[#fcfbfa] p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Business Profile</h1>
                  <p className="text-gray-600 mt-2">Manage how travelers see you as a Local Expert.</p>
                </div>
                {businessProfile && (
                  <Badge
                    className={`px-4 py-2 text-sm font-semibold rounded-full flex items-center gap-2 ${
                      businessProfile.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : businessProfile.status === "pending"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {businessProfile.status === "approved" && <ShieldCheck className="w-4 h-4" />}
                    {businessProfile.status !== "approved" && <AlertCircle className="w-4 h-4" />}
                    <span className="capitalize">{businessProfile.status}</span>
                  </Badge>
                )}
              </div>

              {businessProfileError && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">{businessProfileError}</p>
                </div>
              )}

              {businessProfileLoading && (
                <Card className="border border-gray-200 shadow-sm">
                  <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#ff2e44]" />
                    <p className="text-gray-600 font-medium">Loading your business profile...</p>
                  </CardContent>
                </Card>
              )}

              {!businessProfileLoading && businessProfile && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="border border-gray-200 shadow-sm bg-white">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-16 h-16">
                            {user?.image && <AvatarImage src={user.image} alt={fullName} />}
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <h2 className="text-xl font-semibold text-gray-900">{fullName}</h2>
                            <p className="text-sm text-gray-600 flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {user?.city || "Unknown city"},{" "}
                              {user?.country || "Unknown country"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Globe2 className="w-3 h-3" />
                            {businessProfile.years_in_city || 0} years in city
                          </Badge>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {businessProfile.services?.length || 0} services
                          </Badge>
                          {user?.credits != null && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />
                              {user.credits} credits
                            </Badge>
                          )}
                        </div>

                        {businessProfile.short_bio && (
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {businessProfile.short_bio}
                          </p>
                        )}

                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          Joined {new Date(businessProfile.created_at).toLocaleDateString()}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border border-gray-200 shadow-sm bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-50">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-semibold">Payout & Verification</h3>
                          </div>
                          {user?.stripe_onboarding_complete ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Completed</Badge>
                          ) : (
                            <Badge className="bg-amber-400 hover:bg-amber-500 text-slate-900">Action needed</Badge>
                          )}
                        </div>

                        <p className="text-xs text-slate-200/80">
                          {user?.stripe_onboarding_complete
                            ? "Your Stripe account is ready to receive payouts."
                            : "Finish your Stripe onboarding to start receiving payouts from travelers."}
                        </p>

                        {!user?.stripe_onboarding_complete && user?.onboarding_url && (
                          <Button
                            size="sm"
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={() => window.open(user.onboarding_url, "_blank")}
                          >
                            Complete Stripe Setup
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="lg:col-span-2 space-y-4">
                    <Card className="border border-gray-200 shadow-sm bg-white">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Languages className="w-5 h-5 text-[#ff2e44]" />
                          <h3 className="text-lg font-semibold text-gray-900">Languages & Services</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Languages</p>
                            <div className="flex flex-wrap gap-2">
                              {(businessProfile.languages || ["English"]).map((lang) => (
                                <Badge key={lang} variant="outline" className="bg-gray-50 border-gray-200">
                                  {lang}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Services you offer</p>
                            <div className="flex flex-wrap gap-2">
                              {(businessProfile.services || []).map((service) => (
                                <Badge
                                  key={service}
                                  className="bg-[#ff2e44]/10 text-[#ff2e44] border-[#ff2e44]/20"
                                >
                                  {service}
                                </Badge>
                              ))}
                              {(!businessProfile.services || businessProfile.services.length === 0) && (
                                <p className="text-sm text-gray-500">No services configured yet.</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100 mt-4">
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Availability</p>
                            <p className="text-sm font-medium text-gray-900">
                              {businessProfile.service_availability || 0} days / month
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Typical price</p>
                            <p className="text-sm font-medium text-gray-900">
                              from ${businessProfile.price_expectation || 0} / day
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Experience</p>
                            <p className="text-sm font-medium text-gray-900">
                              {businessProfile.years_in_city || 0}+ years in the city
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border border-gray-200 shadow-sm bg-white">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 className="w-5 h-5 text-[#ff2e44]" />
                          <h3 className="text-lg font-semibold text-gray-900">Social Links & Verification</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Social profiles</p>
                            <div className="space-y-2">
                              {businessProfile.instagram_link && (
                                <button
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#ff2e44]"
                                  onClick={() => window.open(businessProfile.instagram_link, "_blank")}
                                >
                                  <CheckCircle2 className="w-4 h-4 text-pink-500" />
                                  Instagram
                                </button>
                              )}
                              {businessProfile.facebook_link && (
                                <button
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#ff2e44]"
                                  onClick={() => window.open(businessProfile.facebook_link, "_blank")}
                                >
                                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                  Facebook
                                </button>
                              )}
                              {businessProfile.linkedin_link && (
                                <button
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#ff2e44]"
                                  onClick={() => window.open(businessProfile.linkedin_link, "_blank")}
                                >
                                  <CheckCircle2 className="w-4 h-4 text-sky-600" />
                                  LinkedIn
                                </button>
                              )}
                              {!businessProfile.instagram_link &&
                                !businessProfile.facebook_link &&
                                !businessProfile.linkedin_link && (
                                  <p className="text-sm text-gray-500">No social links added yet.</p>
                                )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">Verification documents</p>
                            <div className="space-y-2">
                              {businessProfile.gov_id && (
                                <button
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#ff2e44]"
                                  onClick={() => window.open(businessProfile.gov_id, "_blank")}
                                >
                                  <FileText className="w-4 h-4" />
                                  Government ID
                                </button>
                              )}
                              {businessProfile.travel_licence && (
                                <button
                                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#ff2e44]"
                                  onClick={() => window.open(businessProfile.travel_licence, "_blank")}
                                >
                                  <FileText className="w-4 h-4" />
                                  Travel licence
                                </button>
                              )}
                              {!businessProfile.gov_id && !businessProfile.travel_licence && (
                                <p className="text-sm text-gray-500">No verification documents uploaded yet.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

