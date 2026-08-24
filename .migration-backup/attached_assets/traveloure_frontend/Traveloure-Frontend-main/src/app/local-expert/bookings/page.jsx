"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LocalExpertSidebar } from '../../../components/local-expert/LocalExpertSidebar'
import { useLocalExpert } from '../../../hooks/useLocalExpert'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Navbar } from '../../../components/help-me-decide/navbar'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  Star,
  Menu
} from 'lucide-react'

export default function LocalExpertBookingsPage() {
  const { isLocalExpert, isLoading, isAuthenticated } = useLocalExpert()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('all')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isLocalExpert) {
      router.push('/dashboard')
    }
  }, [isLocalExpert, isLoading, isAuthenticated, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  // Mock bookings data
  const bookings = [
    {
      id: 1,
      travelerName: "Sarah Johnson",
      travelerAvatar: "https://randomuser.me/api/portraits/women/1.jpg",
      destination: "Tokyo, Japan",
      service: "City Tour & Food Guide",
      date: "2024-02-15",
      time: "09:00 AM",
      duration: "4 hours",
      guests: 2,
      price: 120,
      status: "confirmed",
      rating: 4.8,
      specialRequests: "Vegetarian food preferences"
    },
    {
      id: 2,
      travelerName: "Michael Chen",
      travelerAvatar: "https://randomuser.me/api/portraits/men/2.jpg",
      destination: "Tokyo, Japan",
      service: "Cultural Experience",
      date: "2024-02-18",
      time: "02:00 PM",
      duration: "6 hours",
      guests: 4,
      price: 180,
      status: "pending",
      rating: null,
      specialRequests: "Interested in traditional tea ceremony"
    },
    {
      id: 3,
      travelerName: "Emma Wilson",
      travelerAvatar: "https://randomuser.me/api/portraits/women/3.jpg",
      destination: "Tokyo, Japan",
      service: "Shopping & Fashion Tour",
      date: "2024-02-12",
      time: "10:00 AM",
      duration: "3 hours",
      guests: 1,
      price: 90,
      status: "completed",
      rating: 5.0,
      specialRequests: "Looking for unique fashion boutiques"
    },
    {
      id: 4,
      travelerName: "David Rodriguez",
      travelerAvatar: "https://randomuser.me/api/portraits/men/4.jpg",
      destination: "Tokyo, Japan",
      service: "Nightlife & Bar Hopping",
      date: "2024-02-20",
      time: "08:00 PM",
      duration: "5 hours",
      guests: 3,
      price: 150,
      status: "cancelled",
      rating: null,
      specialRequests: "Prefer craft beer bars"
    }
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4" />
      case 'pending':
        return <AlertCircle className="h-4 w-4" />
      case 'completed':
        return <CheckCircle className="h-4 w-4" />
      case 'cancelled':
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const filteredBookings = selectedStatus === 'all' 
    ? bookings 
    : bookings.filter(booking => booking.status === selectedStatus)

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-[#fcfbfa]">
        <Navbar />
        <div className="flex justify-center items-center flex-1">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
        </div>
      </div>
    )
  }

  if (!isLocalExpert) {
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Navbar */}
      <Navbar />
      
      {/* Main Content with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local Expert Sidebar */}
        <LocalExpertSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          {/* Mobile Menu Toggle Button - Only visible on mobile */}
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
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Bookings</h1>
              <p className="text-gray-600">Manage your upcoming and past bookings with travelers.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Bookings</p>
                      <p className="text-2xl font-bold text-gray-900">{bookings.length}</p>
                    </div>
                    <div className="p-3 rounded-full bg-blue-50">
                      <Calendar className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Confirmed</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {bookings.filter(b => b.status === 'confirmed').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-green-50">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pending</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {bookings.filter(b => b.status === 'pending').length}
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-yellow-50">
                      <AlertCircle className="h-6 w-6 text-yellow-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Earnings</p>
                      <p className="text-2xl font-bold text-gray-900">
                        ${bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + b.price, 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-full bg-purple-50">
                      <DollarSign className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filter Tabs */}
            <div className="mb-6">
              <div className="flex space-x-2">
                {['all', 'confirmed', 'pending', 'completed', 'cancelled'].map((status) => (
                  <Button
                    key={status}
                    variant={selectedStatus === status ? "default" : "outline"}
                    onClick={() => setSelectedStatus(status)}
                    className="capitalize"
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Bookings List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredBookings.map((booking) => (
                <Card key={booking.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={booking.travelerAvatar}
                          alt={booking.travelerName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                          <h3 className="font-semibold text-gray-900">{booking.travelerName}</h3>
                          <p className="text-sm text-gray-500">{booking.service}</p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(booking.status)}>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(booking.status)}
                          {booking.status}
                        </div>
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-500" />
                          <span className="text-sm text-gray-600">{booking.destination}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span className="text-sm text-gray-600">{booking.date}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span className="text-sm text-gray-600">{booking.time} ({booking.duration})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          <span className="text-sm text-gray-600">{booking.guests} guests</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-900">${booking.price}</span>
                        </div>
                        {booking.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-yellow-500 fill-current" />
                            <span className="text-sm text-gray-600">{booking.rating}</span>
                          </div>
                        )}
                      </div>

                      {booking.specialRequests && (
                        <div className="pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            <strong>Special Requests:</strong> {booking.specialRequests}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        {booking.status === 'pending' && (
                          <>
                            <Button size="sm" className="flex-1">Accept</Button>
                            <Button size="sm" variant="outline" className="flex-1">Decline</Button>
                          </>
                        )}
                        {booking.status === 'confirmed' && (
                          <Button size="sm" variant="outline" className="w-full">View Details</Button>
                        )}
                        {booking.status === 'completed' && (
                          <Button size="sm" variant="outline" className="w-full">View Review</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredBookings.length === 0 && (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No bookings found for this status.</p>
              </div>
            )}
          </div>
        </main>
        </div>
      </div>
    </div>
  )
}