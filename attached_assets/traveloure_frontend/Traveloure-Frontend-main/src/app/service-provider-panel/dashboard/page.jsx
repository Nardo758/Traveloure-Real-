"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import { Input } from "../../../components/ui/input"
import { Menu, X, Search, MoreHorizontal, Star, MessageCircle, DollarSign, Gift } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { useSelector, useDispatch } from "react-redux"
import { useSession } from "next-auth/react"
import { getServiceProviderDashboardData } from "../../redux-features/service-provider/serviceProviderSlice"
import ServiceDetailModal from "../../../components/ServiceDetailModal"

function getInitials(name) {
  if (!name) return ""
  const parts = name.trim().split(" ")
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ServiceProviderDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const userinfo = useSelector((state) => state?.auth?.profile?.data?.[0] || {})
  
  // Get dashboard data from Redux store
  const { 
    dashboardDataProvider, 
    dashboardDataLoading, 
    dashboardDataError 
  } = useSelector((state) => state.serviceProvider)

  // Fetch dashboard data on component mount
  useEffect(() => {
    const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (session && token) {
      dispatch(getServiceProviderDashboardData({ token }))
    }
  }, [session, dispatch])

  // Extract data from API response
  const dashboardData = dashboardDataProvider || {}
  const activeServices = dashboardData.services_list || []
  const upcomingBookings = dashboardData.bookings_list || []
  const feedbackList = dashboardData.feedback_list || []

  // Handle service detail modal
  const handleViewServiceDetails = (service) => {
    setSelectedService(service)
    setShowServiceModal(true)
  }

  const handleCloseServiceModal = () => {
    setShowServiceModal(false)
    setSelectedService(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar />

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

      {/* Main Layout */}
      <div className="flex min-h-screen w-full max-w-full">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-64 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex min-w-0">
          {/* Center Content */}
          <div className="flex-1 p-3 sm:p-4 lg:p-6 min-w-0">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mb-4 border border-gray-300"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Welcome Section */}
            <div className="mb-6 lg:mb-8">
              <p className="text-sm text-gray-500 mb-1">Tuesday February 12</p>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Good Morning, Swizon Tours!</h1>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6 lg:mb-8">
              <Card className="bg-white border border-gray-200">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-medium text-gray-600">Active Services</h3>
                    <span className="text-xs text-gray-400 font-medium hidden sm:block">CURRENT</span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                    {dashboardDataLoading ? "..." : dashboardData.active_services_count || 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-gray-200">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-medium text-gray-600">Total Earnings</h3>
                    <span className="text-xs text-gray-400 font-medium hidden sm:block">CURRENT</span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                    ${dashboardDataLoading ? "..." : Number(dashboardData.total_earnings || 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-gray-200">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-medium text-gray-600">Services Booked</h3>
                    <span className="text-xs text-gray-400 font-medium hidden sm:block">CURRENT</span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                    {dashboardDataLoading ? "..." : dashboardData.services_booked_count || 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-gray-200">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-medium text-gray-600">Average Rating</h3>
                    <span className="text-xs text-gray-400 font-medium hidden sm:block">CURRENT</span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600">
                    {dashboardDataLoading ? "..." : `${Number(dashboardData.average_rating || 0).toFixed(1)}/5.0`}
                  </p>
                </CardContent>
              </Card>
            </div>

              {/* Main Content Layout with Sidebar */}
              <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 lg:gap-6">
                {/* Left Content - Tables */}
                <div className="flex-1 min-w-0 w-full">
                  {/* Active Services */}
                  <div className="mb-6 lg:mb-8">
                    <div className="flex flex-col gap-4 mb-4 lg:mb-6">
                      <h2 className="text-lg sm:text-xl font-semibold text-gray-900">My Services</h2>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                          <Input
                            placeholder="Enter Service Name"
                            className="pl-10 w-full h-10 border-gray-300 focus:border-[#FF385C] focus:ring-[#FF385C]"
                          />
                        </div>
                        <Button className="bg-[#FF385C] hover:bg-[#E02D50] text-white px-4 sm:px-6 h-10 whitespace-nowrap">Search</Button>
                      </div>
                    </div>

                    <Card className="bg-white border border-gray-200">
                      <CardContent className="p-0">
                        <div className="overflow-x-auto -mx-3 sm:mx-0">
                          <table className="w-full  min-w-[500px] sm:min-w-[700px] ">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-32 sm:w-auto">Service Name</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm hidden sm:table-cell w-24">Type</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-20">Price</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell w-24">Location</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-16">Status</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-20">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboardDataLoading ? (
                                <tr>
                                  <td colSpan="6" className="p-6 sm:p-8 text-center text-gray-500">
                                    Loading services...
                                  </td>
                                </tr>
                              ) : activeServices.length === 0 ? (
                                <tr>
                                  <td colSpan="6" className="p-6 sm:p-8 text-center text-gray-500">
                                    No services found. Create your first service to get started.
                                  </td>
                                </tr>
                              ) : (
                                activeServices.map((service) => (
                                  <tr key={service.id} className="border-b hover:bg-gray-50">
                                    <td className="p-2 sm:p-3 w-32 sm:w-auto">
                                      <div className="flex items-center gap-1 sm:gap-2">
                                        <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                          <span className="text-xs font-medium text-gray-600">
                                            {service.service_name?.charAt(0)?.toUpperCase() || "S"}
                                          </span>
                                        </div>
                                        <div className="min-w-0">
                                          <span className="font-medium text-gray-900 text-xs sm:text-sm block truncate">{service.service_name}</span>
                                          <span className="text-xs text-gray-500 sm:hidden">{service.service_type}</span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm hidden sm:table-cell w-24">{service.service_type}</td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm w-20">
                                      <div>
                                        <div className="font-medium text-xs">${service.price}</div>
                                        <div className="text-xs text-gray-500 hidden sm:block">{service.price_based_on}</div>
                                      </div>
                                    </td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm hidden lg:table-cell w-24 truncate">{service.location}</td>
                                    <td className="p-2 sm:p-3 w-16">
                                      <span className={`flex items-center gap-1 text-xs font-medium ${
                                        service.form_status === "approved" 
                                          ? "text-green-600" 
                                          : service.form_status === "pending"
                                          ? "text-orange-600"
                                          : "text-red-600"
                                      }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${
                                          service.form_status === "approved" 
                                            ? "bg-green-500" 
                                            : service.form_status === "pending"
                                            ? "bg-orange-500"
                                            : "bg-red-500"
                                        }`}></div>
                                        <span className="hidden sm:inline text-xs">{service.form_status?.charAt(0)?.toUpperCase() + service.form_status?.slice(1) || "Unknown"}</span>
                                        <span className="sm:hidden text-xs">{service.form_status?.charAt(0)?.toUpperCase() || "U"}</span>
                                      </span>
                                    </td>
                                    <td className="p-2 sm:p-3 w-20">
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-[#FF385C] border-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent text-xs px-1 sm:px-2 h-6 sm:h-8"
                                          onClick={() => handleViewServiceDetails(service)}
                                        >
                                          <span className="hidden sm:inline">View</span>
                                          <span className="sm:hidden">V</span>
                                        </Button>
                                        <Button variant="ghost" size="sm" className="p-1 h-6 sm:h-8">
                                          <MoreHorizontal className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Upcoming Bookings */}
                  <div className="mb-6 lg:mb-8">
                    <div className="flex flex-col gap-4 mb-4 lg:mb-6">
                      <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Bookings</h2>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="flex flex-col sm:flex-row gap-3 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium text-sm whitespace-nowrap">Sort By:</span>
                            <select className="border border-gray-300 rounded-md px-3 py-2 text-sm h-10 min-w-[120px]">
                              <option>Recent</option>
                              <option>Oldest</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium text-sm whitespace-nowrap">Status:</span>
                            <select className="border border-gray-300 rounded-md px-3 py-2 text-sm h-10 min-w-[140px]">
                              <option>All Bookings</option>
                              <option>Pending</option>
                              <option>Confirmed</option>
                              <option>Cancelled</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <Input
                              placeholder="Enter Service Name"
                              className="pl-10 w-full h-10 border-gray-300 focus:border-[#FF385C] focus:ring-[#FF385C]"
                            />
                          </div>
                          <Button className="bg-[#FF385C] hover:bg-[#E02D50] text-white px-4 sm:px-6 h-10 whitespace-nowrap">Search</Button>
                        </div>
                      </div>
                    </div>

                    <Card className="bg-white border border-gray-200">
                      <CardContent className="p-0">
                        <div className="overflow-x-auto -mx-3 sm:mx-0">
                          <table className="w-full min-w-[500px] sm:min-w-[700px]">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-32 sm:w-auto">Traveller Name</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-24">Service</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm hidden lg:table-cell w-28">Booking Date</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm hidden xl:table-cell w-28">Service Date</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-16">Status</th>
                                <th className="text-left p-2 sm:p-3 font-medium text-gray-700 text-xs sm:text-sm w-20">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dashboardDataLoading ? (
                                <tr>
                                  <td colSpan="6" className="p-6 sm:p-8 text-center text-gray-500">
                                    Loading bookings...
                                  </td>
                                </tr>
                              ) : upcomingBookings.length === 0 ? (
                                <tr>
                                  <td colSpan="6" className="p-6 sm:p-8 text-center text-gray-500">
                                    No bookings found. Your bookings will appear here when customers book your services.
                                  </td>
                                </tr>
                              ) : (
                                upcomingBookings.map((booking) => (
                                  <tr key={booking.id} className="border-b hover:bg-gray-50">
                                    <td className="p-2 sm:p-3 w-32 sm:w-auto">
                                      <div className="flex items-center gap-1 sm:gap-2">
                                        <Avatar className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0">
                                          <AvatarImage src={booking.travelerAvatar || "/placeholder.svg"} />
                                          <AvatarFallback className="text-xs">{getInitials(booking.travelerName)}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">{booking.travelerName}</span>
                                      </div>
                                    </td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm w-24">
                                      <div>
                                        <div className="font-medium text-xs truncate">{booking.service}</div>
                                        <div className="text-xs text-gray-500 lg:hidden">{booking.bookingDateTime}</div>
                                      </div>
                                    </td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm hidden lg:table-cell w-28 truncate">{booking.bookingDateTime}</td>
                                    <td className="p-2 sm:p-3 text-gray-700 text-xs sm:text-sm hidden xl:table-cell w-28 truncate">{booking.serviceDateTime}</td>
                                    <td className="p-2 sm:p-3 w-16">
                                      <span
                                        className={`flex items-center gap-1 text-xs font-medium ${
                                          booking.status === "Pending"
                                            ? "text-orange-600"
                                            : booking.status === "Confirmed"
                                              ? "text-green-600"
                                              : booking.status === "Cancelled"
                                                ? "text-red-600"
                                                : "text-gray-600"
                                        }`}
                                      >
                                        <div
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            booking.status === "Pending"
                                              ? "bg-orange-500"
                                              : booking.status === "Confirmed"
                                                ? "bg-green-500"
                                                : booking.status === "Cancelled"
                                                  ? "bg-red-500"
                                                  : "bg-gray-500"
                                          }`}
                                        ></div>
                                        <span className="hidden sm:inline text-xs">{booking.status}</span>
                                        <span className="sm:hidden text-xs">{booking.status?.charAt(0)}</span>
                                      </span>
                                    </td>
                                    <td className="p-2 sm:p-3 w-20">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-[#FF385C] border-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent text-xs px-1 sm:px-2 h-6 sm:h-8"
                                      >
                                        <span className="hidden sm:inline">View</span>
                                        <span className="sm:hidden">V</span>
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Right Sidebar */}
                <div className="w-full xl:w-80 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-3 sm:p-4 lg:p-6">
                  <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                    {/* Recent Feedback */}
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Recent Feedback</h2>
                      <div className="flex items-center gap-1 mb-2">
                        <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        <Star className="h-4 w-4 sm:h-5 sm:w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-xs sm:text-sm font-semibold ml-2">
                          {dashboardDataLoading ? "..." : `${Number(dashboardData.average_rating || 0).toFixed(1)}/5.0`}
                        </span>
                      </div>

                      {dashboardDataLoading ? (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-500">Loading feedback...</p>
                        </div>
                      ) : feedbackList.length === 0 ? (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-500">
                            No feedback yet. Customer reviews will appear here once you start receiving bookings.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {feedbackList.slice(0, 1).map((feedback, index) => (
                            <div key={index}>
                              <p className="text-sm text-gray-700 leading-relaxed">
                                "{feedback.review || feedback.message || 'Great service!'}"
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={feedback.customer_avatar || "/placeholder.svg"} />
                                  <AvatarFallback>
                                    {getInitials(feedback.customer_name || feedback.reviewer_name || "Customer")}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm text-gray-900 font-medium">
                                  {feedback.customer_name || feedback.reviewer_name || "Customer"}
                                </span>
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            className="w-full text-[#FF385C] border-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent"
                          >
                            Reply
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-4 sm:space-y-6">
                      <div className="flex items-center gap-3 text-sm sm:text-base font-semibold text-gray-900 cursor-pointer hover:text-[#FF385C] transition-colors">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                        </div>
                        <span className="truncate">Respond to Customer Reviews</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm sm:text-base font-semibold text-gray-900 cursor-pointer hover:text-[#FF385C] transition-colors">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                        </div>
                        <span className="truncate">Check Earnings and payouts</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm sm:text-base font-semibold text-gray-900 cursor-pointer hover:text-[#FF385C] transition-colors">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                        </div>
                        <span className="truncate">Run Special Offers or Deals</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

   
        </div>
      </div>

      {/* Service Detail Modal */}
      <ServiceDetailModal
        isOpen={showServiceModal}
        onClose={handleCloseServiceModal}
        service={selectedService}
      />
    </div>
  )
}
