"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowLeft, Star, MapPin, Phone, X, Mail, Eye, Edit, Check, AlertCircle } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../components/ui/dialog"
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { CommonDataTable } from '../../../components/admin/CommonDataTable'
import { getCountriesForFilter, applyFilters } from '../../../lib/countryUtils'
import Link from "next/link"
import { getRejectedServiceProviders, getServiceProviderById, updateServiceProvider } from '../../../app/redux-features/service-provider/serviceProviderSlice'

// Mock data for rejected service providers
const rejectedServiceProvidersData = [
  {
    id: 1,
    name: "SkyDrive Rentals",
    email: "info@skydriverentals.com",
    contact: "(603) 555-0123",
    country: "Australia",
    industry: "Car Rentals",
    requestDate: "May 10, 2025 02:00 PM",
    rejectedDate: "June 16, 2025 06:00 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 2,
    name: "TrekVibe Adventures",
    email: "info@trekvibe.com",
    contact: "(208) 555-0112",
    country: "Canada",
    industry: "Adventure Tours",
    requestDate: "May 12, 2025 03:10 PM",
    rejectedDate: "July 12, 2025 06:50 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 3,
    name: "Cultura Locales",
    email: "hello@culturalocales.com",
    contact: "(480) 555-0103",
    country: "England",
    industry: "Cultural Tours",
    requestDate: "May 14, 2025 04:06 PM",
    rejectedDate: "May 14, 2025 04:06 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 4,
    name: "UrbanRide Express",
    email: "support@urbanride.com",
    contact: "(308) 555-0121",
    country: "France",
    industry: "City Transport",
    requestDate: "May 16, 2025 02:50 PM",
    rejectedDate: "May 16, 2025 02:50 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 5,
    name: "FlavorTrail Tours",
    email: "devonlane@gmail.com",
    contact: "(303) 555-0105",
    country: "Denmark",
    industry: "Food & Culinary",
    requestDate: "May 20, 2025 12:00 PM",
    rejectedDate: "May 20, 2025 12:00 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 6,
    name: "GlideAir Balloons",
    email: "gaballoons@gmail.com",
    contact: "(208) 555-0112",
    country: "Canada",
    industry: "Adventure Activity",
    requestDate: "May 12, 2025 03:10 PM",
    rejectedDate: "May 12, 2025 03:10 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 7,
    name: "BlueHaven Retreat",
    email: "stay@bluehavenretreat.com",
    contact: "(480) 555-0103",
    country: "England",
    industry: "Hotel",
    requestDate: "May 14, 2025 04:06 PM",
    rejectedDate: "May 14, 2025 04:06 PM",
    avatar: "/placeholder.svg?height=32&width=32",
  },
]

export default function RejectedServiceProviders() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isAdmin, isLoading: adminLoading, isAuthenticated } = useAdmin()
  const router = useRouter()
  
  // Redux state
  const { rejectedProviders, rejectedLoading, rejectedError, currentServiceProvider } = useSelector((state) => state.serviceProvider)
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [countryFilter, setCountryFilter] = useState("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [filteredData, setFilteredData] = useState([])
  const [countries] = useState(getCountriesForFilter())
  
  // Confirmation modals
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedProviderName, setSelectedProviderName] = useState("")

  // Fetch rejected service providers data when component mounts
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      dispatch(getRejectedServiceProviders({ 
        token: session.backendData.accessToken
      }))
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  useEffect(() => {
    if (adminLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isAdmin) {
      router.push('/dashboard')
    }
  }, [isAdmin, adminLoading, isAuthenticated, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  // Transform API data to match table structure
  const transformApiData = (apiData) => {
    if (!apiData?.rejected || !Array.isArray(apiData.rejected)) return []
    
    return apiData.rejected.map(provider => ({
      id: provider.id,
      name: provider.business_name || provider.name || 'Unknown',
      email: provider.email || 'N/A',
      contact: provider.mobile || provider.phone_number || 'N/A',
      country: provider.country || 'N/A',
      industry: provider.business_type || 'N/A',
      requestDate: provider.created_at ? new Date(provider.created_at).toLocaleString() : 'N/A',
      rejectedDate: provider.updated_at ? new Date(provider.updated_at).toLocaleString() : 'N/A',
      avatar: provider.business_logo || provider.image,
      status: provider.status || 'rejected',
      createdAt: provider.created_at
    }))
  }

  const handleRestore = (id) => {
    const provider = filteredData.find(p => p.id === id)
    if (provider) {
      setSelectedProviderId(id)
      setSelectedProviderName(provider.name)
      setShowApproveModal(true)
    }
  }

  const handleDelete = (id) => {
    const provider = filteredData.find(p => p.id === id)
    if (provider) {
      setSelectedProviderId(id)
      setSelectedProviderName(provider.name)
      setShowDeleteModal(true)
    }
  }

  const handleApprove = (id) => {
    const provider = filteredData.find(p => p.id === id)
    if (provider) {
      setSelectedProviderId(id)
      setSelectedProviderName(provider.name)
      setShowApproveModal(true)
    }
  }

  const confirmApprove = async () => {
    try {
      await dispatch(updateServiceProvider({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, 
        id: selectedProviderId, 
        payload: { status: 'approved' } 
      })).unwrap()
      
      setShowApproveModal(false)
      setSelectedProviderId(null)
      setSelectedProviderName("")
      
      // Refresh the rejected providers list
      dispatch(getRejectedServiceProviders({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      }))
    } catch (error) {
      console.error('Error approving provider:', error)
    }
  }

  const confirmDelete = async () => {
    try {
      await dispatch(updateServiceProvider({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, 
        id: selectedProviderId, 
        payload: { status: 'deleted' } 
      })).unwrap()
      
      setShowDeleteModal(false)
      setSelectedProviderId(null)
      setSelectedProviderName("")
      
      // Refresh the rejected providers list
      dispatch(getRejectedServiceProviders({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      }))
    } catch (error) {
      console.error('Error deleting provider:', error)
    }
  }

  const handleViewDetails = (id) => {
    setSelectedProviderId(id)
    setIsModalOpen(true)
    
    // Fetch provider details from API
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      dispatch(getServiceProviderById({ 
        token: session.backendData.accessToken, 
        id: id 
      }))
    }
  }

  const handleEditDetails = (id) => {
    console.log("Edit details for service provider:", id)
    // Add edit details logic here
  }

  const handleSendMail = (id) => {
    console.log("Send mail to service provider:", id)
    // Add send mail logic here
  }

  // Apply filters when search or filters change
  useEffect(() => {
    if (!rejectedProviders) return

    const transformedData = transformApiData(rejectedProviders)
    
    let filtered = transformedData

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(provider =>
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.country.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Country filter
    if (countryFilter !== "all") {
      filtered = filtered.filter(provider => provider.country === countryFilter)
    }

    // Industry filter
    if (serviceFilter !== "all") {
      filtered = filtered.filter(provider => provider.industry === serviceFilter)
    }

    // Sort
    switch (sortBy) {
      case "recent":
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        break
      case "older":
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        break
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        break
    }

    setFilteredData(filtered)
  }, [rejectedProviders, searchQuery, countryFilter, serviceFilter, sortBy])

  const handleRowClick = (provider) => {
    setSelectedProvider(provider)
    setIsModalOpen(true)
  }

  // Table configuration
  const columns = [
    {
      key: 'name',
      label: 'Service Provider Name',
      render: (provider, index) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
          <Avatar className="h-10 w-10">
            <AvatarImage src={provider.avatar || "/placeholder.svg"} alt={provider.name} />
            <AvatarFallback className="bg-[#FF385C] text-white text-sm font-medium">
              {provider.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="font-medium text-gray-900">{provider.name}</span>
          </div>
        </div>
      )
    },
    { key: 'email', label: 'Company Email' },
    { key: 'contact', label: 'Contact Number' },
    { key: 'country', label: 'Country' },
    { key: 'industry', label: 'Industry' },
    { key: 'requestDate', label: 'Request Date & Time' },
    { key: 'rejectedDate', label: 'Rejected on' }
  ]

  const filters = [
    {
      key: 'sortBy',
      label: 'Sort By',
      placeholder: 'Recent',
      options: [
        { value: 'recent', label: 'Recent' },
        { value: 'all', label: 'All' },
        { value: 'older', label: 'Older' }
      ]
    },
    {
      key: 'country',
      label: 'By Country',
      placeholder: 'All Countries',
      options: countries,
      searchable: true,
      maxHeight: '200px'
    },
    {
      key: 'industry',
      label: 'Industry',
      placeholder: 'All Industries',
      options: [
        { value: 'all', label: 'All Industries' },
        { value: 'car rentals', label: 'Car Rentals' },
        { value: 'adventure tours', label: 'Adventure Tours' },
        { value: 'cultural tours', label: 'Cultural Tours' },
        { value: 'city transport', label: 'City Transport' },
        { value: 'food & culinary', label: 'Food & Culinary' },
        { value: 'adventure activity', label: 'Adventure Activity' },
        { value: 'hotel', label: 'Hotel' }
      ]
    }
  ]

  const actions = [
    {
      type: 'button',
      key: 'approve',
      label: 'Approve',
      variant: 'outline',
      className: 'bg-[#58AC00] hover:bg-[#4A8F00] text-white text-xs px-3 py-1.5'
    },
    {
      type: 'button',
      key: 'delete',
      label: 'Delete',
      variant: 'outline',
      className: 'text-xs px-3 py-1.5 border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent'
    },
    {
      type: 'dropdown',
      key: 'more',
      items: [
        { key: 'approve', label: 'Approve', icon: Check },
        { key: 'viewDetails', label: 'View Details', icon: Eye },
        { key: 'editDetails', label: 'Edit Details', icon: Edit, className: 'text-red-600' },
        { key: 'sendMail', label: 'Send Mail', icon: Mail }
      ]
    }
  ]

  const handleTableAction = (actionKey, itemId) => {
    switch (actionKey) {
      case 'approve':
        handleRestore(itemId)
        break
      case 'delete':
        handleDelete(itemId)
        break
      case 'approve':
        handleApprove(itemId)
        break
      case 'viewDetails':
        handleViewDetails(itemId)
        break
      case 'editDetails':
        handleEditDetails(itemId)
        break
      case 'sendMail':
        handleSendMail(itemId)
        break
      default:
        break
    }
  }

  if (adminLoading) {
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
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 bg-gray-50 min-h-screen">
            {/* Header Section */}
            <div className="mb-6">
              <div className="mb-4">
                <Link href="/admin/service-providers-requests" className="flex items-center gap-2 text-[#FF385C] hover:text-red-700">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Previous Page</span>
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  Rejected Service Providers ({rejectedProviders?.rejected?.length || 0})
                </h1>
                <Link href="/admin/service-providers-requests">
                  <Button
                    variant="outline"
                    className="border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent"
                  >
                    Requests {rejectedProviders?.rejected?.length || 0}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Loading State */}
            {rejectedLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading rejected providers data...</span>
              </div>
            )}

            {/* Error State */}
            {rejectedError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading data: {rejectedError}</span>
                </div>
              </div>
            )}

            {/* Common Data Table */}
            {!rejectedLoading && (
              <CommonDataTable
                data={filteredData}
                columns={columns}
                filters={filters}
                actions={actions}
                searchPlaceholder="Search by Service Provider Name"
                onAction={handleTableAction}
                onSearch={(value) => setSearchQuery(value)}
                onFilterChange={(filters) => {
                  setSortBy(filters.sortBy || 'recent')
                  setCountryFilter(filters.country || 'all')
                  setServiceFilter(filters.industry || 'all')
                }}
              />
            )}

            {/* Approve Confirmation Modal */}
            <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Approve Service Provider</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to approve <strong>{selectedProviderName}</strong>? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowApproveModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmApprove} className="bg-green-600 hover:bg-green-700">
                    Approve
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Service Provider</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete <strong>{selectedProviderName}</strong>? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Service Provider Details Modal */}
            <Dialog open={isModalOpen} onOpenChange={(open) => {
              setIsModalOpen(open)
              if (!open) {
                setSelectedProviderId(null)
              }
            }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <DialogTitle className="text-xl font-semibold text-gray-900">Service Provider's Request</DialogTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsModalOpen(false)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {currentServiceProvider ? (
                    <div className="space-y-6">
                      {/* Service Provider Overview */}
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-[#FF385C] rounded-lg flex items-center justify-center text-white font-bold text-lg">
                            {currentServiceProvider.business_name?.split(" ").map(n => n[0]).join("") || 'SP'}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900">{currentServiceProvider.business_name || 'Unknown'}</h3>
                          <p className="text-sm text-gray-600">{currentServiceProvider.country || 'N/A'}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {currentServiceProvider.description || 'No description available'}
                          </p>
                        </div>
                      </div>

                      {/* Contact Information */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="text-gray-400">✉️</span>
                          <span className="text-[#FF385C]">{currentServiceProvider.email || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="text-gray-400">📞</span>
                          <span className="text-[#FF385C]">{currentServiceProvider.mobile || currentServiceProvider.phone_number || 'N/A'}</span>
                        </div>
                        {currentServiceProvider.whatsapp && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="text-gray-400">📱</span>
                            <span className="text-[#FF385C]">{currentServiceProvider.whatsapp}</span>
                          </div>
                        )}
                      </div>

                      {/* Business Information */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-3">Business Information</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Business Name:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.business_name || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Contact Person Name:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.name || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Business Email:</span>
                            <div className="font-medium text-[#FF385C]">{currentServiceProvider.email || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Business Type:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.business_type || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Mobile Number:</span>
                            <div className="font-medium text-[#FF385C]">{currentServiceProvider.mobile || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">WhatsApp:</span>
                            <div className="font-medium text-[#FF385C]">{currentServiceProvider.whatsapp || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Country:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.country || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Address:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.address || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">GST Number:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.gst || 'N/A'}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Instant Booking:</span>
                            <div className="font-medium text-gray-900">{currentServiceProvider.instant_booking ? 'Yes' : 'No'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Services */}
                      {currentServiceProvider.services && Array.isArray(currentServiceProvider.services) && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-3">Services:</h4>
                          <div className="flex flex-wrap gap-2">
                            {currentServiceProvider.services.map((service, index) => (
                              <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="pt-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600 mb-4">
                          Mail will be automatically sent to the user based on any action (Approve or Delete) done by you.
                        </p>
                        <div className="flex gap-3">
                          <Button 
                            onClick={() => {
                              setSelectedProviderId(currentServiceProvider.id)
                              setSelectedProviderName(currentServiceProvider.business_name)
                              setShowApproveModal(true)
                              setIsModalOpen(false)
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Approve
                          </Button>
                          <Button 
                            onClick={() => {
                              setSelectedProviderId(currentServiceProvider.id)
                              setSelectedProviderName(currentServiceProvider.business_name)
                              setShowDeleteModal(true)
                              setIsModalOpen(false)
                            }}
                            variant="destructive" 
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete Account
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF385C]"></div>
                      <span className="ml-3 text-gray-600">Loading provider details...</span>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </div>
  )
} 