"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowLeft, Star, ChevronDown, Search, MoreVertical, AlertCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "../../../../components/ui/avatar"
import { AdminSidebar } from '../../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../../components/admin/AdminHeader'
import { useAdmin } from '../../../../hooks/useAdmin'
import { CommonDataTable } from '../../../../components/admin/CommonDataTable'
import { applyFilters, getCountryCodeFromName } from '../../../../lib/countryUtils'
import { City, State } from 'country-state-city'
import Link from "next/link"
import { getServiceProvidersByCountry } from '../../../../app/redux-features/service-provider/serviceProviderSlice'

// Mock data for accommodations matching the image
const accommodationsData = [
  {
    id: 1,
    name: "SkyNest Villas",
    email: "info@skynestvillas.com",
    contact: "(603) 555-0123",
    country: "Australia",
    category: "Hotels",
    rating: 4.9,
    totalEarning: 5056,
    monthlyEarning: 556,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 2,
    name: "CozyCorner B&B",
    email: "info@cozycorner.com",
    contact: "(208) 555-0112",
    country: "Canada",
    category: "Hotels",
    rating: 4.8,
    totalEarning: 5606,
    monthlyEarning: 606,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 3,
    name: "UrbanStay Suites",
    email: "hello@urbanstay.com",
    contact: "(480) 555-0103",
    country: "England",
    category: "Rentals",
    rating: 4.8,
    totalEarning: 6008,
    monthlyEarning: 608,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 4,
    name: "Hilltop Retreats",
    email: "info@hilltop.com",
    contact: "(308) 555-0121",
    country: "France",
    category: "B&Bs",
    rating: 4.7,
    totalEarning: 5654,
    monthlyEarning: 554,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 5,
    name: "BlueBay Resort",
    email: "info@bluebay.com",
    contact: "(303) 555-0105",
    country: "Denmark",
    category: "Hotels",
    rating: 4.7,
    totalEarning: 7066,
    monthlyEarning: 766,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 6,
    name: "Serenity Stay",
    email: "info@serenitystay.com",
    contact: "(208) 555-0112",
    country: "Canada",
    category: "Rentals",
    rating: 4.6,
    totalEarning: 4050,
    monthlyEarning: 450,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 7,
    name: "MountainSide",
    email: "info@mountslide.com",
    contact: "(480) 555-0103",
    country: "England",
    category: "Hotel",
    rating: 4.5,
    totalEarning: 6096,
    monthlyEarning: 696,
    avatar: "/placeholder.svg?height=32&width=32",
  },
]

export default function ServiceProvidersCountry() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isAdmin, isLoading: adminLoading, isAuthenticated } = useAdmin()
  const router = useRouter()
  const params = useParams()
  const country = params.country
  
  // Redux state
  const { countryProviders, countryProvidersLoading, countryProvidersError } = useSelector((state) => state.serviceProvider)
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [cityFilter, setCityFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [filteredData, setFilteredData] = useState([])
  const [cities, setCities] = useState([{ value: 'all', label: 'All Cities' }])
  const [categories, setCategories] = useState([{ value: 'all', label: 'All Categories' }])
  const [statuses, setStatuses] = useState([{ value: 'all', label: 'All Statuses' }])
  const [isLoadingCities, setIsLoadingCities] = useState(true)

  // Fetch country providers data when component mounts
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken && country) {
      dispatch(getServiceProvidersByCountry({ 
        token: session.backendData.accessToken, 
        countryName: country 
      }))
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, country])

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

  const handleViewMore = (id) => {
    console.log("View more for accommodation:", id)
    // Add view more logic here
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Transform API data to match table structure
  const transformApiData = (apiData) => {
    if (!apiData?.data || !Array.isArray(apiData.data)) return []
    
    return apiData.data.map(provider => ({
      id: provider.id,
      name: provider.business_name || provider.name || 'Unknown',
      email: provider.email || 'N/A',
      contact: provider.mobile || provider.phone_number || 'N/A',
      city: provider.city || 'N/A',
      country: provider.country || 'N/A',
      category: provider.business_type || 'N/A',
      rating: 4.5, // Default rating since API doesn't provide rating
      totalEarning: 0, // Default since API doesn't provide earnings
      monthlyEarning: 0, // Default since API doesn't provide earnings
      avatar: provider.business_logo || provider.image,
      status: provider.status || 'unknown',
      createdAt: provider.created_at,
      isEmailVerified: provider.is_email_verified
    }))
  }

  // Apply filters when search or filters change
  useEffect(() => {
    if (!countryProviders) return

    const transformedData = transformApiData(countryProviders)
    
    let filtered = transformedData

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(provider =>
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.city.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // City filter
    if (cityFilter !== "all") {
      filtered = filtered.filter(provider => provider.city === cityFilter)
    }

    // Category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter(provider => provider.category === categoryFilter)
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(provider => provider.status === statusFilter)
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
      case "highest rating":
        filtered.sort((a, b) => b.rating - a.rating)
        break
      case "lowest rating":
        filtered.sort((a, b) => a.rating - b.rating)
        break
      default:
        break
    }

    setFilteredData(filtered)
  }, [countryProviders, searchQuery, cityFilter, categoryFilter, statusFilter, sortBy])

  // Load cities, categories, and statuses from API data
  useEffect(() => {
    if (countryProviders?.data) {
      const apiCities = [...new Set(countryProviders.data.map(provider => provider.city).filter(Boolean))]
      const cityOptions = [
        { value: 'all', label: 'All Cities' },
        ...apiCities.map(city => ({ value: city, label: city }))
      ]
      setCities(cityOptions)
      
      const apiCategories = [...new Set(countryProviders.data.map(provider => provider.business_type).filter(Boolean))]
      const categoryOptions = [
        { value: 'all', label: 'All Categories' },
        ...apiCategories.map(category => ({ value: category, label: category }))
      ]
      setCategories(categoryOptions)
      
      const apiStatuses = [...new Set(countryProviders.data.map(provider => provider.status).filter(Boolean))]
      const statusOptions = [
        { value: 'all', label: 'All Statuses' },
        ...apiStatuses.map(status => ({ 
          value: status, 
          label: status.charAt(0).toUpperCase() + status.slice(1) 
        }))
      ]
      setStatuses(statusOptions)
      setIsLoadingCities(false)
    }
  }, [countryProviders])

  // Table configuration matching the image
  const columns = [
    {
      key: 'name',
      label: 'Company Name',
      render: (accommodation, index) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-700">
            {accommodation.name.charAt(0)}
          </div>
          <div>
            <span className="font-medium text-gray-900">{accommodation.name}</span>
          </div>
        </div>
      )
    },
    { key: 'email', label: 'Company Email' },
    { key: 'contact', label: 'Contact Number' },
    { key: 'city', label: 'City' },
    {
      key: 'status',
      label: 'Status',
      render: (provider) => {
        const statusColors = {
          approved: 'bg-green-100 text-green-800 border-green-200',
          pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          rejected: 'bg-red-100 text-red-800 border-red-200',
          unknown: 'bg-gray-100 text-gray-800 border-gray-200'
        }
        const statusColor = statusColors[provider.status] || statusColors.unknown
        return (
          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColor}`}>
            {provider.status.charAt(0).toUpperCase() + provider.status.slice(1)}
          </span>
        )
      }
    },
    { key: 'category', label: 'Categories' },
    {
      key: 'rating',
      label: 'Avg. Rating',
      render: (accommodation) => (
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-400 fill-current" />
          <span className="text-gray-700">{accommodation.rating}/5.0</span>
        </div>
      )
    },
    {
      key: 'totalEarning',
      label: 'Total Earning',
      render: (accommodation) => (
        <div className="flex items-center gap-1">
          <span className="text-gray-700">{formatCurrency(accommodation.totalEarning)}</span>
          <ChevronDown className="h-3 w-3 text-gray-400 rotate-180" />
        </div>
      )
    },
    {
      key: 'monthlyEarning',
      label: 'Earning (This Month)',
      render: (accommodation) => (
        <div className="flex items-center gap-1">
          <span className="text-gray-700">{formatCurrency(accommodation.monthlyEarning)}</span>
          <ChevronDown className="h-3 w-3 text-gray-400 rotate-180" />
        </div>
      )
    }
  ]

  const filters = [
    {
      key: 'sortBy',
      label: 'Sort By',
      placeholder: 'Recent',
      options: [
        { value: 'recent', label: 'Recent' },
        { value: 'older', label: 'Older' },
        { value: 'name', label: 'Name' },
        { value: 'highest rating', label: 'Highest Rating' },
        { value: 'lowest rating', label: 'Lowest Rating' }
      ]
    },
    {
      key: 'city',
      label: 'By City',
      placeholder: isLoadingCities ? 'Loading cities...' : 'All Cities',
      options: isLoadingCities ? [{ value: 'all', label: 'Loading cities...' }] : cities,
      searchable: true,
      maxHeight: '200px'
    },
    {
      key: 'category',
      label: 'Categories',
      placeholder: 'All Categories',
      options: categories,
      searchable: true,
      maxHeight: '200px'
    },
    {
      key: 'status',
      label: 'Status',
      placeholder: 'All Statuses',
      options: statuses,
      searchable: false
    }
  ]

  const actions = [
    {
      type: 'button',
      key: 'viewMore',
      label: 'View More',
      variant: 'outline',
      className: 'text-xs px-3 py-1.5 border-green-500 text-green-600 hover:bg-green-50 bg-transparent'
    },
    {
      type: 'dropdown',
      key: 'more',
      items: [
        { key: 'viewDetails', label: 'View Details' },
        { key: 'editDetails', label: 'Edit Details' },
        { key: 'sendMail', label: 'Send Mail' }
      ]
    }
  ]

  const handleTableAction = (actionKey, itemId) => {
    switch (actionKey) {
      case 'viewMore':
        handleViewMore(itemId)
        break
      case 'viewDetails':
        console.log("View details for accommodation:", itemId)
        break
      case 'editDetails':
        console.log("Edit details for accommodation:", itemId)
        break
      case 'sendMail':
        console.log("Send mail to accommodation:", itemId)
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
                  {country.charAt(0).toUpperCase() + country.slice(1)} ({countryProviders?.count || 0} Service Providers)
                </h1>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Providers Status:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-900">Active</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {countryProvidersLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading providers data...</span>
              </div>
            )}

            {/* Error State */}
            {countryProvidersError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading data: {countryProvidersError}</span>
                </div>
              </div>
            )}

            {/* Common Data Table */}
            {!countryProvidersLoading && (
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
                  setCityFilter(filters.city || 'all')
                  setCategoryFilter(filters.category || 'all')
                  setStatusFilter(filters.status || 'all')
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
} 