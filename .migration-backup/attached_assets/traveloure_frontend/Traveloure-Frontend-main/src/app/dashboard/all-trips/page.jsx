"use client"

import { useState, useEffect } from "react"
import { useIsMobile } from "../../../hooks/use-mobile"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { Switch } from "../../../components/ui/switch"
import { Menu, X, Calendar } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { useDispatch, useSelector } from "react-redux"
import { getMyItineraries } from "../../redux-features/userprofile/UserprofileSlice"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

// Add CSS for line-clamp utility
const lineClampStyles = `
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`

export default function TripsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState("all")
  const [tripNotifications, setTripNotifications] = useState({})

  const dispatch = useDispatch()
  const { data: session } = useSession()
  const token = session?.backendData?.accessToken
  const router = useRouter();
  
  // Get trips data from Redux store
  const { alltrip, loading, error } = useSelector((state) => state.userprofile)

  // Debug logging
  useEffect(() => {
   
  }, [alltrip, loading, error])

  // Fetch trips data on component mount
  useEffect(() => {
    if (token) {
      dispatch(getMyItineraries({ token }))
    }
  }, [token])

  // Helper function to get trip status based on dates
  const getTripStatus = (startDate, endDate) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Reset time to start of day
    
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    if (start <= today && end >= today) {
      return { status: "Current", statusColor: "text-blue-500" }
    } else if (start > today) {
      return { status: "Upcoming", statusColor: "text-orange-500" }
    } else {
      return { status: "Finished", statusColor: "text-green-500" }
    }
  }

  // Helper function to format date
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  // Helper function to get action text based on status
  const getActionText = (status) => {
    switch (status) {
      case "Finished":
        return "Revisit"
      default:
        return "View Itinerary"
    }
  }

  // Process trips data with status and formatting
  const processedTrips = alltrip?.map((trip, index) => {
    try {
      // Access the nested itinerary_data structure
      const itineraryData = trip.itinerary_data || trip
      if (!itineraryData.start_date || !itineraryData.end_date) {
        console.warn('Trip missing required date fields:', trip)
        return null
      }
      
      const { status, statusColor } = getTripStatus(itineraryData.start_date, itineraryData.end_date)
      return {
        id: trip.id || index,
        title: itineraryData.title || itineraryData.name || `Trip ${index + 1}`,
        image: itineraryData.image || itineraryData.cover_image || "/articleimage.png",
        status,
        statusColor,
        startDate: formatDate(itineraryData.start_date),
        endDate: formatDate(itineraryData.end_date),
        notificationsEnabled: tripNotifications[trip.id] !== undefined ? tripNotifications[trip.id] : true,
        action: getActionText(status),
        originalTrip: trip,
        // Add additional fields from the API response
        city: itineraryData.city,
        country: itineraryData.country,
        price: itineraryData.price,
        highlights: itineraryData.highlights
      }
    } catch (error) {
      console.error('Error processing trip:', error, trip)
      return null
    }
  }).filter(Boolean) || [] // Filter out null values

  // Filter trips based on active tab
  const filteredTrips = processedTrips.filter((trip) => {
    if (activeTab === "all") return true
    if (activeTab === "current") return trip.status === "Current"
    if (activeTab === "upcoming") return trip.status === "Upcoming"
    if (activeTab === "history") return trip.status === "Finished"
    if (activeTab === "drafts") return false // No drafts for now
    return true
  })

  // Count trips by status
  const tripCounts = {
    all: processedTrips.length,
    current: processedTrips.filter((trip) => trip.status === "Current").length,
    upcoming: processedTrips.filter((trip) => trip.status === "Upcoming").length,
    history: processedTrips.filter((trip) => trip.status === "Finished").length,
    drafts: 0, // No drafts for now
  }

  const tabs = [
    { id: "all", label: `All Trips (${tripCounts.all})`, active: true },
    { id: "current", label: `Current (${tripCounts.current})`, active: false },
    { id: "upcoming", label: `Upcoming (${tripCounts.upcoming})`, active: false },
    { id: "history", label: `History (${tripCounts.history})`, active: false },
    { id: "drafts", label: `Drafts (${tripCounts.drafts})`, active: false },
  ]

  // Handle notification toggle
  const handleNotificationToggle = (tripId, enabled) => {
    setTripNotifications(prev => ({
      ...prev,
      [tripId]: enabled
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style dangerouslySetInnerHTML={{ __html: lineClampStyles }} />
      <Navbar/>
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
      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-10 p-4 lg:p-6 bg-white">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="max-w-6xl mx-auto">
            {/* Page Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">All Trips</h1>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C] mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading trips...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-8">
                <p className="text-red-500">Error loading trips: {error}</p>
              </div>
            )}

            {/* Content when not loading */}
            {!loading && !error && (
              <>
                {/* Tabs */}
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                      <div key={tab.id}>
                        <button
                          style={{ borderRadius: "10px" }}
                          onClick={() => setActiveTab(tab.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-[#FF385C]  text-white" : "bg-[#fff1f3]  text-[#FF385C] hover:bg-[#fff1f6]"
                            }`}
                        >
                          {tab.label}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trip Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                  {filteredTrips.map((trip) => (
                    <Card key={trip.id} className="overflow-hidden bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-shadow">
                      <div className="aspect-[4/3] relative">
                        <img
                          src={trip.image || "/articleimage.png"}
                          alt={trip.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = "/articleimage.png"
                          }}
                        />
                        {/* Status badge overlay */}
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full bg-white/90 ${trip.statusColor}`}>
                            {trip.status}
                          </span>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <div className="mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 mb-1">{trip.title}</h3>
                        </div>
                        
                        {/* Location and Price */}
                        <div className="mb-2">
                          <p className="text-sm text-gray-600">
                            {trip.city && trip.country ? `${trip.city}, ${trip.country}` : 'Location not specified'}
                          </p>
                          {trip.price && (
                            <p className="text-sm font-medium text-[#FF385C]">{trip.price}</p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                          <Calendar className="h-4 w-4 flex-shrink-0" />
                          <span className="line-clamp-1">
                            {trip.startDate} - {trip.endDate}
                          </span>
                        </div>
                        
                        {/* Highlights */}
                        {trip.highlights && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 line-clamp-2">{trip.highlights}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 mb-4">
                          <Switch
                            checked={trip.notificationsEnabled}
                            onCheckedChange={(val) => handleNotificationToggle(trip.id, val)}
                            className="data-[state=checked]:bg-[#58AC00]"
                          />
                          <span className="text-sm text-[#58AC00]">
                            Notifications {trip.notificationsEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <Button
                          className={`w-full ${trip.action === "Revisit"
                              ? "bg-[#FF385C] hover:bg-pink-600 text-white"
                              : "bg-[#FF385C] hover:bg-pink-600 text-white"
                            }`}
                          onClick={() => {
                            if (trip.originalTrip) {
                              localStorage.setItem("selectedTrip", JSON.stringify(trip.originalTrip));
                              // Navigate to AI optimization with trip ID in the URL
                              const tripId = trip.originalTrip.id || trip.originalTrip.trip;
                              router.push(`/ai-optimization/${tripId}`);
                            } else {
                              router.push('/ai-optimization');
                            }
                          }}
                        >
                          {trip.action}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Empty State */}
                {filteredTrips.length === 0 && (
                  <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No trips found</h3>
                    <p className="text-gray-500 mb-4">You don't have any trips in this category yet.</p>
                    {/* <Button className="bg-[#FF385C] hover:bg-pink-600" onClick={() => router.push('/Itinerary')}>Plan a New Trip</Button> */}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
