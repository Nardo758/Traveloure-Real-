"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Users, Building2, CalendarDays, Star, Search, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { getCountriesForFilter } from '../../../lib/countryUtils'
import Link from 'next/link'
import { getServiceProviderDashboard, getServiceProvidersByCountry } from '../../redux-features/service-provider/serviceProviderSlice'

// Static fallback data
const staticSummaryData = [
  {
    title: "Total Service Providers",
    value: "246",
    trend: "+13",
    trendDirection: "up",
    period: "vs Last Month"
  },
  {
    title: "New Providers",
    value: "46",
    trend: "+08",
    trendDirection: "up",
    period: "THIS MONTH"
  },
  {
    title: "Pending Approval",
    value: "67",
    trend: "-11",
    trendDirection: "down",
    period: "vs Last Month"
  },
  {
    title: "Total Active Providers",
    value: "106",
    trend: "-14",
    trendDirection: "down",
    period: "vs Last Month"
  }
]

const staticCountryData = [
  {
    country: "United States",
    totalProviders: 156,
    cities: [
      { name: "New York", providers: 28 },
      { name: "Los Angeles", providers: 25 },
      { name: "San Francisco", providers: 22 }
    ],
    totalCities: 8
  },
  {
    country: "Canada",
    totalProviders: 89,
    cities: [
      { name: "Toronto", providers: 32 },
      { name: "Vancouver", providers: 28 },
      { name: "Montreal", providers: 29 }
    ],
    totalCities: 5
  },
  {
    country: "United Kingdom",
    totalProviders: 78,
    cities: [
      { name: "London", providers: 35 },
      { name: "Manchester", providers: 22 },
      { name: "Birmingham", providers: 21 }
    ],
    totalCities: 4
  },
  {
    country: "Germany",
    totalProviders: 67,
    cities: [
      { name: "Berlin", providers: 25 },
      { name: "Munich", providers: 22 },
      { name: "Hamburg", providers: 20 }
    ],
    totalCities: 4
  },
  {
    country: "Australia",
    totalProviders: 45,
    cities: [
      { name: "Sydney", providers: 18 },
      { name: "Melbourne", providers: 15 },
      { name: "Brisbane", providers: 12 }
    ],
    totalCities: 3
  },
  {
    country: "Netherlands",
    totalProviders: 34,
    cities: [
      { name: "Amsterdam", providers: 20 },
      { name: "Rotterdam", providers: 8 },
      { name: "The Hague", providers: 6 }
    ],
    totalCities: 3
  }
]

export default function AdminServiceProviders() {
  const { isAdmin, isLoading, isAuthenticated } = useAdmin()
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const router = useRouter()
  
  // Redux state
  const { dashboardData, dashboardLoading, dashboardError } = useSelector((state) => state.serviceProvider)
  
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState("")
  const [providerStatus, setProviderStatus] = useState("all")
  const [filterBy, setFilterBy] = useState("most-experts")
  const [countries] = useState(getCountriesForFilter())
  const [summaryData, setSummaryData] = useState(staticSummaryData)
  const [countryData, setCountryData] = useState(staticCountryData)
  const [isStaticData, setIsStaticData] = useState(false)
  const [visibleCount, setVisibleCount] = useState(6) // Show first 6 cards initially

  // Transform API data to component format
  const transformApiData = (data) => {
    if (!data) return { summaryData: staticSummaryData, countryData: staticCountryData }

    const transformedSummaryData = [
      {
        title: "Total Service Providers",
        value: data.count?.toString() || "0",
        trend: "+0",
        trendDirection: "up",
        period: "vs Last Month"
      },
      {
        title: "New Providers",
        value: data.total_new_last_30_days?.toString() || "0",
        trend: "+0",
        trendDirection: "up",
        period: "THIS MONTH"
      },
      {
        title: "Pending Approval",
        value: data.total_pending?.toString() || "0",
        trend: "-0",
        trendDirection: "down",
        period: "vs Last Month"
      },
      {
        title: "Total Active Providers",
        value: data.total_active?.toString() || "0",
        trend: "-0",
        trendDirection: "down",
        period: "vs Last Month"
      }
    ]

    const transformedCountryData = data.summary?.map((item, index) => ({
      country: item.country || `Country ${index + 1}`,
      totalProviders: item.total_providers || 0,
      cities: item.cities?.map((city, cityIndex) => ({
        name: city.city || `City ${cityIndex + 1}`,
        providers: city.providers || 0
      })) || [],
      totalCities: item.cities?.length || 0
    })) || []

    return { summaryData: transformedSummaryData, countryData: transformedCountryData }
  }

  // Fetch data using Redux
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      dispatch(getServiceProviderDashboard({ token: session.backendData.accessToken }))
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken])

  // Update component state when Redux data changes
  useEffect(() => {
    if (dashboardData) {
      const { summaryData: newSummaryData, countryData: newCountryData } = transformApiData(dashboardData)
      setSummaryData(newSummaryData)
      setCountryData(newCountryData)
      setIsStaticData(false)
    } else if (dashboardError) {
      // Fallback to static data on error
      setSummaryData(staticSummaryData)
      setCountryData(staticCountryData)
      setIsStaticData(true)
    }
  }, [dashboardData, dashboardError])

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

  // Filter and search functionality
  const filteredCountryData = countryData
    .filter(country => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        country.country.toLowerCase().includes(query) ||
        country.cities.some(city => city.name.toLowerCase().includes(query))
      )
    })
    .sort((a, b) => {
      switch (filterBy) {
        case "most-experts":
          return b.totalProviders - a.totalProviders
        case "least-experts":
          return a.totalProviders - b.totalProviders
        case "alphabetical":
          return a.country.localeCompare(b.country)
        default:
          return 0
      }
    })

  // Get visible countries for pagination
  const visibleCountries = filteredCountryData.slice(0, visibleCount)
  const hasMoreCountries = visibleCount < filteredCountryData.length

  // Handle "Read More" click
  const handleReadMore = () => {
    setVisibleCount(prev => prev + 6)
  }

  // Handle "Show Less" click
  const handleShowLess = () => {
    setVisibleCount(6)
  }

  // Handle "View All" click for country
  const handleViewAllByCountry = async (country) => {
    try {
      const result = await dispatch(getServiceProvidersByCountry({ 
        token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, 
        countryName: country.country 
      })).unwrap()
      
      if (result) {
        router.push(`/admin/service-providers-country/${country.country.toLowerCase()}`)
      }
    } catch (error) {
      console.error('Error fetching country data:', error)
    }
  }

  // Reset visible count when search or filter changes
  useEffect(() => {
    setVisibleCount(6)
  }, [searchQuery, filterBy])

  // Check if we should show the "Show Less" button
  const shouldShowLess = visibleCount > 6

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
            {/* Static Data Label */}
            {isStaticData && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">Showing static data - API unavailable</span>
              </div>
            )}

            {/* Header Section with Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Service Providers Management</h1>
              <div className="flex items-center gap-3">
                <Link href="/admin/service-providers-requests">
                  <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Requests ({summaryData[2]?.value || 0})
                  </Button>
                </Link>
                <Link href="/admin/all-services">
                  <Button variant="outline" className="border-[#FF385C] text-[#FF385C] hover:text-white hover:bg-[#e83555]">
                    All Services
                  </Button>
                </Link>
                {/* <Button className="bg-[#FF385C] hover:bg-[#e83555] text-white">
                  <span className="mr-2">+</span>
                  Add New
                </Button> */}
              </div>
            </div>

            {/* Loading State */}
            {dashboardLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading data...</span>
              </div>
            )}

            {/* Error State */}
            {dashboardError && !isStaticData && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">Error loading data: {dashboardError}</span>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            {!dashboardLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {summaryData.map((item, index) => (
                  <Card key={index}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                      {item.period === "THIS MONTH" && (
                        <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{item.period}</div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{item.value}</div>
                      <div className={`flex items-center text-xs ${item.trendDirection === "up" ? "text-green-600" : "text-red-600"}`}>
                        {item.trendDirection === "up" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {item.trend} vs Last Month
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Search and Filter Section */}
            <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              <div className='flex items-end gap-2'>
                <label className="block text-sm font-bold text-gray-700 mb-2">Search:</label>
                <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search by Country or City"
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                     
                    </div> <Button className="bg-red-600 hover:bg-red-700">
                        Search
                      </Button>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Filter by:</label>
                    <Select value={filterBy} onValueChange={setFilterBy}>
                    <SelectTrigger className="w-full border border-gray-200 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="most-experts">Most Providers</SelectItem>
                        <SelectItem value="least-experts">Least Providers</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>

            {/* Service Providers By Countries Section */}
            {!dashboardLoading && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Service Providers By Countries</h2>
                {visibleCountries.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No countries found matching your search criteria.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {visibleCountries.map((country, index) => (
                        <Card key={index}>
                          <CardHeader>
                            <CardTitle className="text-lg">{country.country}</CardTitle>
                            <p className="text-sm text-gray-600">{country.totalProviders} Service Providers</p>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {country.cities.map((city, cityIndex) => (
                                <div key={cityIndex} className="flex justify-between">
                                  <span>{city.name}</span>
                                  <span className="font-medium">{city.providers}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 pt-3 border-t">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Total Cities: {country.totalCities}</span>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleViewAllByCountry(country)}
                                >
                                  View All
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Read More / Show Less Buttons */}
                    {(hasMoreCountries || shouldShowLess) && (
                      <div className="flex justify-center mt-8 gap-4">
                        {hasMoreCountries && (
                          <Button 
                            onClick={handleReadMore}
                            className="bg-[#FF385C] hover:bg-red-700 text-white px-8 py-3 rounded-lg"
                          >
                            Read More
                          </Button>
                        )}
                        {shouldShowLess && (
                          <Button 
                            onClick={handleShowLess}
                            variant="outline"
                            className="border-[#FF385C] text-[#FF385C] hover:bg-[#FF385C]/10 px-8 py-3 rounded-lg"
                          >
                            Show Less
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
} 