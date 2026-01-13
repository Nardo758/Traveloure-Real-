"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { Search, ArrowLeft, ChevronDown, MoreVertical, ChevronLeft, ChevronRight, Star, DollarSign, AlertCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "../../../../components/ui/avatar"
import { AdminSidebar } from '../../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../../components/admin/AdminHeader'
import { useAdmin } from '../../../../hooks/useAdmin'
import { CommonDataTable } from '../../../../components/admin/CommonDataTable'
import { applyFilters, getCountrySpecificLanguages, getCountryCodeFromName } from '../../../../lib/countryUtils'
import { City, State } from 'country-state-city'
import Link from "next/link"
import { getLocalExpertsByCountry } from '../../../../app/redux-features/Travelexperts/travelexpertsSlice'

// Mock data for country-specific local experts
const countryExpertsData = [
  {
    id: 1,
    name: "Jacob Jones",
    email: "jacobjones@gmail.com",
    contact: "(603) 555-0123",
    city: "Mumbai",
    country: "India",
    languages: "English, Hindi, Marathi",
    rating: 4.9,
    totalEarning: 5056,
    monthlyEarning: 556,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 2,
    name: "Brooklyn Simmons",
    email: "brooklynsimm@gmail.com",
    contact: "(208) 555-0112",
    city: "Delhi",
    country: "India",
    languages: "English, Hindi, Punjabi",
    rating: 4.8,
    totalEarning: 4230,
    monthlyEarning: 445,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 3,
    name: "Robert Fox",
    email: "robertfox@gmail.com",
    contact: "(480) 555-0103",
    city: "Bangalore",
    country: "India",
    languages: "English, Kannada, Tamil",
    rating: 4.7,
    totalEarning: 3890,
    monthlyEarning: 398,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 4,
    name: "Courtney Henry",
    email: "courtneyhenry@gmail.com",
    contact: "(308) 555-0121",
    city: "Hyderabad",
    country: "India",
    languages: "English, Telugu, Urdu",
    rating: 4.9,
    totalEarning: 5670,
    monthlyEarning: 612,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 5,
    name: "Devon Lane",
    email: "devonlane@gmail.com",
    contact: "(303) 555-0105",
    city: "Chennai",
    country: "India",
    languages: "English, Tamil, Telugu",
    rating: 4.6,
    totalEarning: 3450,
    monthlyEarning: 378,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 6,
    name: "Sarah Wilson",
    email: "sarahwilson@gmail.com",
    contact: "(208) 555-0112",
    city: "Kolkata",
    country: "India",
    languages: "English, Bengali, Hindi",
    rating: 4.8,
    totalEarning: 4120,
    monthlyEarning: 445,
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 7,
    name: "Michael Brown",
    email: "michaelbrown@gmail.com",
    contact: "(480) 555-0103",
    city: "Pune",
    country: "India",
    languages: "English, Marathi, Hindi",
    rating: 4.7,
    totalEarning: 3780,
    monthlyEarning: 398,
    avatar: "/placeholder.svg?height=32&width=32",
  },
]

export default function LocalExpertsCountry() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isAdmin, isLoading: adminLoading, isAuthenticated } = useAdmin()
  const router = useRouter()
  const params = useParams()
  const country = params.country
  
  // Redux state
  const { countryExperts, countryExpertsLoading, countryExpertsError } = useSelector((state) => state.travelExperts)
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [cityFilter, setCityFilter] = useState("all")
  const [languageFilter, setLanguageFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [filteredData, setFilteredData] = useState([])
  const [cities, setCities] = useState([{ value: 'all', label: 'All Cities' }])
  const [languages, setLanguages] = useState([{ value: 'all', label: 'All Languages' }])
  const [statuses, setStatuses] = useState([{ value: 'all', label: 'All Statuses' }])
  const [isLoadingCities, setIsLoadingCities] = useState(true)
 
  // Fetch country experts data when component mounts
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken && country) {
      dispatch(getLocalExpertsByCountry({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, 
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

  // Load cities and statuses from API data
  useEffect(() => {
    if (countryExperts?.data) {
      const apiCities = [...new Set(countryExperts.data.map(expert => expert.city).filter(Boolean))]
      const cityOptions = [
        { value: 'all', label: 'All Cities' },
        ...apiCities.map(city => ({ value: city, label: city }))
      ]
      setCities(cityOptions)
      
      const apiStatuses = [...new Set(countryExperts.data.map(expert => expert.status).filter(Boolean))]
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
  }, [countryExperts])

  // Load country-specific languages
  useEffect(() => {
    const countryLanguages = getCountrySpecificLanguages(country)
    setLanguages(countryLanguages)
  }, [country])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  const handleViewMore = (id) => {
    console.log("View more for expert:", id)
    // Add view more logic here
  }

  const handleViewDetails = (id) => {
    console.log("View details for expert:", id)
    // Add view details logic here
  }

  const handleEditDetails = (id) => {
    console.log("Edit details for expert:", id)
    // Add edit details logic here
  }

  const handleSendMail = (id) => {
    console.log("Send mail to expert:", id)
    // Add send mail logic here
  }

  // Transform API data to match table structure
  const transformApiData = (apiData) => {
    if (!apiData?.data || !Array.isArray(apiData.data)) return []
    
    return apiData.data.map(expert => ({
      id: expert.id,
      name: `${expert.first_name || ''} ${expert.last_name || ''}`.trim() || 'Unknown',
      email: expert.email || 'N/A',
      contact: expert.phone_number || 'N/A',
      city: expert.city || 'N/A',
      country: expert.country || 'N/A',
      languages: 'English', // Default since API doesn't provide languages
      rating: 4.5, // Default rating since API doesn't provide rating
      totalEarning: 0, // Default since API doesn't provide earnings
      monthlyEarning: 0, // Default since API doesn't provide earnings
      avatar: expert.image || expert.cover_image,
      status: expert.status || 'unknown',
      createdAt: expert.created_at,
      isEmailVerified: expert.is_email_verified
    }))
  }



  // Apply filters when search or filters change
  useEffect(() => {
    if (!countryExperts) return

    const transformedData = transformApiData(countryExperts)
    
    let filtered = transformedData

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(expert =>
        expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.city.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // City filter
    if (cityFilter !== "all") {
      filtered = filtered.filter(expert => expert.city === cityFilter)
    }

    // Language filter
    if (languageFilter !== "all") {
      filtered = filtered.filter(expert => 
        expert.languages.toLowerCase().includes(languageFilter.toLowerCase())
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(expert => expert.status === statusFilter)
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
  }, [countryExperts, searchQuery, cityFilter, languageFilter, statusFilter, sortBy])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Table configuration
  const columns = [
    {
      key: 'name',
      label: 'Local Expert Name',
      render: (expert, index) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
          <Avatar className="h-10 w-10">
            <AvatarImage src={expert.avatar || "/placeholder.svg"} alt={expert.name} />
            <AvatarFallback className="bg-[#FF385C] text-white text-sm font-medium">
              {expert.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-gray-900">{expert.name}</span>
        </div>
      )
    },
    { key: 'email', label: 'Email' },
    { key: 'contact', label: 'Contact Number' },
    { key: 'city', label: 'City' },
    {
      key: 'status',
      label: 'Status',
      render: (expert) => {
        const statusColors = {
          approved: 'bg-green-100 text-green-800 border-green-200',
          pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          rejected: 'bg-red-100 text-red-800 border-red-200',
          unknown: 'bg-gray-100 text-gray-800 border-gray-200'
        }
        const statusColor = statusColors[expert.status] || statusColors.unknown
        return (
          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColor}`}>
            {expert.status.charAt(0).toUpperCase() + expert.status.slice(1)}
          </span>
        )
      }
    },
    { key: 'languages', label: 'Languages Spoken' },
    {
      key: 'rating',
      label: 'Rating',
      render: (expert) => (
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 text-yellow-400 fill-current" />
          <span className="text-gray-700">{expert.rating}/5.0</span>
        </div>
      )
    },
    {
      key: 'totalEarning',
      label: 'Total Earning',
      render: (expert) => formatCurrency(expert.totalEarning)
    },
    {
      key: 'monthlyEarning',
      label: 'Earning (This Month)',
      render: (expert) => formatCurrency(expert.monthlyEarning)
    }
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
      key: 'city',
      label: 'By City',
      placeholder: isLoadingCities ? 'Loading cities...' : 'All Cities',
      options: isLoadingCities ? [{ value: 'all', label: 'Loading cities...' }] : cities,
      searchable: true,
      maxHeight: '200px'
    },
    {
      key: 'languages',
      label: 'Languages Spoken',
      placeholder: 'All Languages',
      options: languages,
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
      className: 'text-xs px-3 py-1.5 border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C] hover:text-white bg-transparent'
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
                <Link href="/admin/local-experts" className="flex items-center gap-2 text-[#FF385C] hover:text-red-700">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Previous Page</span>
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  {country.charAt(0).toUpperCase() + country.slice(1)} ({countryExperts?.count || 0} Experts)
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
            {countryExpertsLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading experts data...</span>
              </div>
            )}

            {/* Error State */}
            {countryExpertsError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading data: {countryExpertsError}</span>
                </div>
              </div>
            )}

            {/* Common Data Table */}
            {!countryExpertsLoading && (
              <CommonDataTable
                data={filteredData}
                columns={columns}
                filters={filters}
                actions={actions}
                searchPlaceholder="Search by Local Expert Name"
                onAction={handleTableAction}
                onSearch={(value) => setSearchQuery(value)}
                              onFilterChange={(filters) => {
                setSortBy(filters.sortBy || 'recent')
                setCityFilter(filters.city || 'all')
                setLanguageFilter(filters.languages || 'all')
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