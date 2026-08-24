"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog'
import { Search, Check, X, AlertCircle, Eye, Calendar, MapPin, DollarSign, User, Building2, ArrowLeft, FileText } from 'lucide-react'
import { updateServiceStatus } from '../../redux-features/service-provider/serviceProviderSlice'

export default function AdminAllServices() {
  const { isAdmin, isLoading, isAuthenticated } = useAdmin()
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const router = useRouter()
  
  // Redux state
  const { 
    updateServiceStatusLoading,
    updateServiceStatusError 
  } = useSelector((state) => state.serviceProvider)
  
  // Local state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [allServices, setAllServices] = useState([])
  const [filteredServices, setFilteredServices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedService, setSelectedService] = useState(null)

  // Fetch services data when component mounts
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      fetchServices()
    }
  }, [session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  // Function to fetch services from /service/ endpoint
  const fetchServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/service/services/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const responseData = await response.json()
        
        // Handle the new API response structure
        let allServicesData = []
        
        if (responseData.data && Array.isArray(responseData.data)) {
          // New API format - services are directly in data array
          allServicesData = responseData.data
        } else if (responseData.service) {
          // Old API format - services are nested under service object
          allServicesData = [
            ...(responseData.service?.pending_services || []),
            ...(responseData.service?.approved_services || []),
            ...(responseData.service?.rejected_services || [])
          ]
        }
        
        // Update local state with the services data
        setAllServices(allServicesData)
        setFilteredServices(allServicesData)
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to fetch services')
        console.error('Failed to fetch services:', response.statusText)
      }
    } catch (error) {
      setError('Error fetching services: ' + error.message)
      console.error('Error fetching services:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter services based on search and status
  useEffect(() => {
    let filtered = allServices || []
    
    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(service => 
        service.service_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.user?.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.user?.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.user?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.user?.about_me?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.service_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.price?.toString().includes(searchQuery) ||
        service.price_based_on?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter(service => service.form_status === statusFilter)
    }
    
    setFilteredServices(filtered)
  }, [allServices, searchQuery, statusFilter])

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isAdmin) {
      router.push('/dashboard')
    }
  }, [isAdmin, isLoading, isAuthenticated, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  const handleApproveService = (service) => {
    setSelectedService(service)
    setShowApproveModal(true)
  }

  const handleRejectService = (service) => {
    setSelectedService(service)
    setShowRejectModal(true)
  }

  const handleViewDetails = (service) => {
    setSelectedService(service)
    setShowDetailsModal(true)
  }

  const confirmApprove = async () => {
    if (!selectedService) return
    
    try {
      await dispatch(updateServiceStatus({
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
        id: selectedService.id,
        formStatus: "approved"
      })).unwrap()
      
      // Refresh services data
      await fetchServices()
      
      setShowApproveModal(false)
      setSelectedService(null)
    } catch (error) {
      console.error('Error approving service:', error)
    }
  }

  const confirmReject = async () => {
    if (!selectedService) return
    
    try {
      await dispatch(updateServiceStatus({
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken,
        id: selectedService.id,
        formStatus: "rejected"
      })).unwrap()
      
      // Refresh services data
      await fetchServices()
      
      setShowRejectModal(false)
      setSelectedService(null)
    } catch (error) {
      console.error('Error rejecting service:', error)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">{status || 'Unknown'}</Badge>
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#fcfbfa]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <AdminSidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Admin Header */}
        <AdminHeader onMenuToggle={handleMenuToggle} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white p-6">
          <div className="space-y-6">
            {/* Header Section */}
            <div className="space-y-4">
              {/* Back Button */}
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/admin/service-providers')}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back to Service Providers</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </div>
              
              {/* Title and Stats */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">All Services Management</h1>
                  <p className="text-gray-600 mt-1">Manage and review all services submitted by service providers</p>
                </div>
                <div className="text-sm text-gray-500">
                  Total Services: {allServices.length}
                </div>
              </div>
            </div>

            {/* Search and Filter Section */}
            <Card className="border border-gray-200 shadow-sm">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search services, providers, descriptions, prices..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Error State */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading services: {error}</span>
                </div>
              </div>
            )}

            {/* Services Table */}
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Services ({filteredServices.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                    <span className="ml-3 text-gray-600">Loading services...</span>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No services found matching your criteria.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Service Provider
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Service Details
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Location & Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredServices.map((service) => (
                          <tr key={service.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={service.user?.image} />
                                  <AvatarFallback>
                                    {service.user?.first_name?.[0]}{service.user?.last_name?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {service.user?.first_name} {service.user?.last_name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    @{service.user?.username}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">
                                {service.service_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {service.service_type}
                              </div>
                              <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                                {service.description}
                              </div>
                              {service.user?.about_me && (
                                <div className="text-xs text-blue-600 mt-1">
                                  About: {service.user.about_me}
                                </div>
                              )}
                              {service.service_file && (
                                <div className="text-xs text-green-600 mt-1">
                                  📎 Has service file
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center text-sm text-gray-500 mb-1">
                                <MapPin className="h-4 w-4 mr-1" />
                                {service.location}
                              </div>
                              <div className="flex items-center text-sm font-medium text-green-600">
                                <DollarSign className="h-4 w-4 mr-1" />
                                {service.price} / {service.price_based_on}
                              </div>
                              {service.availability && service.availability.length > 0 && (
                                <div className="text-xs text-gray-400 mt-1">
                                  Available: {service.availability.join(', ')}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getStatusBadge(service.form_status)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(service.created_at)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewDetails(service)}
                                  className="flex items-center gap-1"
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </Button>
                                {service.form_status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveService(service)}
                                      className="bg-green-600 hover:bg-green-700 text-white"
                                      disabled={updateServiceStatusLoading}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleRejectService(service)}
                                      disabled={updateServiceStatusLoading}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Service Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Service Details
            </DialogTitle>
            <DialogDescription>
              Complete information about the selected service
            </DialogDescription>
          </DialogHeader>
          {selectedService && (
            <div className="space-y-6">
              {/* Service Provider Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Service Provider Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Name</label>
                    <p className="text-sm text-gray-900">{selectedService.user?.first_name} {selectedService.user?.last_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Username</label>
                    <p className="text-sm text-gray-900">@{selectedService.user?.username}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-600">About Me</label>
                    <p className="text-sm text-gray-900">{selectedService.user?.about_me || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Service Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Service Name</label>
                    <p className="text-sm text-gray-900 font-medium">{selectedService.service_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Service Type</label>
                    <p className="text-sm text-gray-900">{selectedService.service_type}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <p className="text-sm text-gray-900">{selectedService.description}</p>
                  </div>
                </div>
              </div>

              {/* Location & Pricing */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location & Pricing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Location</label>
                    <p className="text-sm text-gray-900">{selectedService.location}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Price</label>
                    <p className="text-sm text-gray-900 font-medium text-green-600">
                      ${selectedService.price} / {selectedService.price_based_on}
                    </p>
                  </div>
                </div>
              </div>

              {/* Availability */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Availability
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedService.availability && selectedService.availability.length > 0 ? (
                    selectedService.availability.map((day, index) => (
                      <Badge key={index} className="bg-yellow-100 text-yellow-800">
                        {day}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No availability specified</p>
                  )}
                </div>
              </div>

              {/* Service File */}
              {selectedService.service_file && (
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Service File
                  </h3>
                  <div className="flex items-center gap-2">
                    <img 
                      src={selectedService.service_file} 
                      alt="Service file" 
                      className="max-w-xs max-h-48 rounded-lg border"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'block'
                      }}
                    />
                    <div style={{display: 'none'}} className="text-sm text-gray-500">
                      <a 
                        href={selectedService.service_file} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View Service File
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Status & Dates */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Status & Dates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Status</label>
                    <div className="mt-1">
                      {getStatusBadge(selectedService.form_status)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Created Date</label>
                    <p className="text-sm text-gray-900">{formatDate(selectedService.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
            {selectedService?.form_status === 'pending' && (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowDetailsModal(false)
                    handleApproveService(selectedService)
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={updateServiceStatusLoading}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDetailsModal(false)
                    handleRejectService(selectedService)
                  }}
                  disabled={updateServiceStatusLoading}
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Modal */}
      <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this service? This action will make the service available to travelers.
            </DialogDescription>
          </DialogHeader>
          {selectedService && (
            <div className="py-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">{selectedService.service_name}</h4>
                <p className="text-sm text-gray-600 mt-1">by {selectedService.user?.first_name} {selectedService.user?.last_name}</p>
                <p className="text-sm text-gray-500 mt-2">{selectedService.description}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmApprove}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={updateServiceStatusLoading}
            >
              {updateServiceStatusLoading ? 'Approving...' : 'Approve Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this service? This action will prevent the service from being available to travelers.
            </DialogDescription>
          </DialogHeader>
          {selectedService && (
            <div className="py-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">{selectedService.service_name}</h4>
                <p className="text-sm text-gray-600 mt-1">by {selectedService.user?.first_name} {selectedService.user?.last_name}</p>
                <p className="text-sm text-gray-500 mt-2">{selectedService.description}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmReject}
              disabled={updateServiceStatusLoading}
            >
              {updateServiceStatusLoading ? 'Rejecting...' : 'Reject Service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
