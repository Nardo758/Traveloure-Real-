"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowLeft, Star, AlertCircle } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../../components/ui/dialog"
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { CommonDataTable } from '../../../components/admin/CommonDataTable'
import { getCountriesForFilter, getLanguagesForFilter, applyFilters } from '../../../lib/countryUtils'
import Link from "next/link"
import { getPendingServiceProviders, updateServiceProvider } from '../../../app/redux-features/service-provider/serviceProviderSlice'

// Mock data for service providers requests
const serviceProvidersData = [
  {
    id: 1,
    name: "SkyDrive Rentals",
    email: "info@skydriverentals.com",
    contact: "(603) 555-0123",
    country: "Australia",
    industry: "Car Rentals",
    requestDate: "May 10, 2025 02:00 PM",
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
    avatar: "/placeholder.svg?height=32&width=32",
  },
]

export default function ServiceProvidersRequests() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isAdmin, isLoading: adminLoading, isAuthenticated } = useAdmin()
  const router = useRouter()
  
  // Redux state
  const { pendingProviders, pendingLoading, pendingError } = useSelector((state) => state.serviceProvider)
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [countryFilter, setCountryFilter] = useState("all")
  const [industryFilter, setIndustryFilter] = useState("all")
  const [filteredData, setFilteredData] = useState([])
  const [countries] = useState(getCountriesForFilter())
  const [languages] = useState(getLanguagesForFilter())
  
  // Confirmation modals
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [selectedProviderName, setSelectedProviderName] = useState("")

  // Fetch pending service providers data when component mounts
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      dispatch(getPendingServiceProviders({ 
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
    if (!apiData?.pending || !Array.isArray(apiData.pending)) return []
    
    return apiData.pending.map(provider => ({
      id: provider.id,
      name: provider.business_name || provider.name || 'Unknown',
      email: provider.email || 'N/A',
      contact: provider.mobile || provider.phone_number || 'N/A',
      country: provider.country || 'N/A',
      industry: provider.business_type || 'N/A',
      requestDate: provider.created_at ? new Date(provider.created_at).toLocaleString() : 'N/A',
      avatar: provider.business_logo || provider.image,
      status: provider.status || 'pending',
      createdAt: provider.created_at
    }))
  }

  const handleApprove = (id) => {
    const provider = filteredData.find(p => p.id === id)
    if (provider) {
      setSelectedProviderId(id)
      setSelectedProviderName(provider.name)
      setShowApproveModal(true)
    }
  }

  const handleReject = (id) => {
    const provider = filteredData.find(p => p.id === id)
    if (provider) {
      setSelectedProviderId(id)
      setSelectedProviderName(provider.name)
      setShowRejectModal(true)
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
      
      // Refresh the pending providers list
      dispatch(getPendingServiceProviders({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      }))
    } catch (error) {
      console.error('Error approving provider:', error)
    }
  }

  const confirmReject = async () => {
    try {
      await dispatch(updateServiceProvider({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, 
        id: selectedProviderId, 
        payload: { status: 'rejected' } 
      })).unwrap()
      
      setShowRejectModal(false)
      setSelectedProviderId(null)
      setSelectedProviderName("")
      
      // Refresh the pending providers list
      dispatch(getPendingServiceProviders({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      }))
    } catch (error) {
      console.error('Error rejecting provider:', error)
    }
  }

  // Apply filters when search or filters change
  useEffect(() => {
    if (!pendingProviders) return

    const transformedData = transformApiData(pendingProviders)
    
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
    if (industryFilter !== "all") {
      filtered = filtered.filter(provider => provider.industry === industryFilter)
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
  }, [pendingProviders, searchQuery, countryFilter, industryFilter, sortBy])

  // Table configuration
            const columns = [
            {
              key: 'name',
              label: 'Company Name',
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
            { key: 'requestDate', label: 'Request Date & Time' }
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
                { value: 'Car Rentals', label: 'Car Rentals' },
                { value: 'Adventure Tours', label: 'Adventure Tours' },
                { value: 'Cultural Tours', label: 'Cultural Tours' },
                { value: 'City Transport', label: 'City Transport' },
                { value: 'Food & Culinary', label: 'Food & Culinary' },
                { value: 'Adventure Activity', label: 'Adventure Activity' },
                { value: 'Hotel', label: 'Hotel' }
              ],
              searchable: true,
              maxHeight: '200px'
            }
          ]

  const actions = [
    {
      type: 'button',
      key: 'approve',
      label: 'Approve',
      variant: 'default',
      className: 'bg-[#58AC00] hover:bg-[#4A8F00] text-white text-xs px-3 py-1.5'
    },
    {
      type: 'button',
      key: 'reject',
      label: 'Reject',
      variant: 'outline',
      className: 'text-xs px-3 py-1.5 border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent'
    },
    // {
    //   type: 'dropdown',
    //   key: 'more',
    //   items: [
    //     { key: 'viewDetails', label: 'View Details' },
    //     { key: 'editDetails', label: 'Edit Details' },
    //     { key: 'sendMail', label: 'Send Mail' }
    //   ]
    // }
  ]

  const handleTableAction = (actionKey, itemId) => {
    switch (actionKey) {
      case 'approve':
        handleApprove(itemId)
        break
      case 'reject':
        handleReject(itemId)
        break
      case 'viewDetails':
        console.log("View details for service provider:", itemId)
        break
      case 'editDetails':
        console.log("Edit details for service provider:", itemId)
        break
      case 'sendMail':
        console.log("Send mail to service provider:", itemId)
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
                <Link href="/admin/service-providers" className="flex items-center gap-2 text-[#FF385C] hover:text-red-700">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Previous Page</span>
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  Service Providers Requests ({pendingProviders?.pending?.length || 0})
                </h1>
                <Link href="/admin/rejected-service-providers">
                  <Button
                    variant="outline"
                    className="border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent"
                  >
                    Rejected {pendingProviders?.rejected?.length || 0}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Loading State */}
            {pendingLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading requests data...</span>
              </div>
            )}

            {/* Error State */}
            {pendingError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading data: {pendingError}</span>
                </div>
              </div>
            )}

            {/* Common Data Table */}
            {!pendingLoading && (
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
                  setIndustryFilter(filters.industry || 'all')
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

            {/* Reject Confirmation Modal */}
            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reject Service Provider</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to reject <strong>{selectedProviderName}</strong>? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmReject} className="bg-red-600 hover:bg-red-700">
                    Reject
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </div>
  )
} 