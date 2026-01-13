"use client"

import { useState, useEffect } from "react"
import { useSession } from 'next-auth/react'
import { useDispatch, useSelector } from 'react-redux'
import { useRouter } from 'next/navigation'
import {  ArrowLeft, Mail, MapPin, Phone, AlertCircle } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar"
import { Card } from "../../../components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "../../../components/ui/dialog"
import { CommonDataTable } from "../../../components/admin/CommonDataTable"
import { AdminSidebar } from '../../../components/admin/AdminSidebar'
import { AdminHeader } from '../../../components/admin/AdminHeader'
import { useAdmin } from '../../../hooks/useAdmin'
import { getCountriesForFilter, getLanguagesForFilter, applyFilters } from '../../../lib/countryUtils'
import { getRejectedLocalExperts, getLocalExpertById, updateLocalExpert } from '../../redux-features/Travelexperts/travelexpertsSlice'
import Link from "next/link"

// Static fallback data
const staticRejectedExpertsData = [
  {
    id: 1,
    name: "Jacob Jones",
    email: "jacobjones@gmail.com",
    contact: "(603) 555-0123",
    country: "Australia",
    languages: "English, Spanish, French",
    requestDate: "May 10, 2025 02:00 PM",
    rejectedDate: "June 16, 2025",
    avatar: "/placeholder.svg?height=32&width=32",
  },
  {
    id: 2,
    name: "Brooklyn Simmons",
    email: "brooklynsimmons@gmail.com",
    contact: "(603) 555-0124",
    country: "Canada",
    languages: "English, French",
    requestDate: "May 9, 2025 03:30 PM",
    rejectedDate: "June 15, 2025",
    avatar: "/placeholder.svg?height=32&width=32",
  }
]

export default function RejectedLocalExperts() {
  const { data: session } = useSession()
  const dispatch = useDispatch()
  const { isAdmin, isAuthenticated, isLoading: adminLoading } = useAdmin()
  const router = useRouter()
  
  // Redux state
  const { rejectedExperts, rejectedLoading, rejectedError, currentLocalExpert, loading } = useSelector((state) => state.travelExperts)
  
  // Use rejectedLoading for the main loading state
  const isLoading = rejectedLoading
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("recent")
  const [countryFilter, setCountryFilter] = useState("all")
  const [industryFilter, setIndustryFilter] = useState("all")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedExpertId, setSelectedExpertId] = useState(null)
  const [filteredData, setFilteredData] = useState([])
  const [isStaticData, setIsStaticData] = useState(false)

  // Get unique countries and languages for filters
  const countries = [...new Set(rejectedExperts?.map(expert => expert.user?.country).filter(Boolean) || [])]
  const languages = [...new Set(rejectedExperts?.flatMap(expert => Array.isArray(expert.languages) ? expert.languages : []).filter(Boolean) || [])]

  // Fetch rejected experts data
  useEffect(() => {
    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (accessToken) {
      dispatch(getRejectedLocalExperts({ token: accessToken }))
    }
  }, [dispatch, session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken])

  // Fetch individual expert data when modal opens
  useEffect(() => {
    const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
    if (selectedExpertId && accessToken) {
      dispatch(getLocalExpertById({ token: accessToken, id: selectedExpertId }))
    }
  }, [dispatch, selectedExpertId, session?.backendData?.accessToken, session?.backendData?.backendData?.accessToken])

  // Transform API data to match component structure
  const transformApiData = (apiData) => {
    if (!apiData || !Array.isArray(apiData)) return []
    
    return apiData.map(expert => {
      // Ensure languages and services are arrays
      const languages = Array.isArray(expert.languages) ? expert.languages : []
      const services = Array.isArray(expert.services) ? expert.services : []
      
      // Generate company name from services or use a default
      const companyName = services.length > 0 
        ? `${services[0].charAt(0).toUpperCase() + services[0].slice(1).replace('_', ' ')} Services`
        : `${expert.user?.first_name || 'Company'} ${expert.user?.last_name || 'Services'}`
      
      // Generate industry based on services
      const getIndustry = (services) => {
        if (services.includes('transport')) return 'City Transport'
        if (services.includes('tours')) return 'Adventure Tours'
        if (services.includes('cultural')) return 'Cultural Tours'
        if (services.includes('food')) return 'Food & Culinary'
        if (services.includes('hotel')) return 'Hotel'
        if (services.includes('car_rental')) return 'Car Rentals'
        if (services.includes('adventure')) return 'Adventure Activity'
        return 'Travel Services'
      }
      
      return {
        id: expert.id,
        name: companyName,
        email: expert.user?.email || 'N/A',
        country: expert.user?.country || 'N/A',
        city: expert.user?.city || 'N/A',
        contact: expert.user?.phone_number || 'N/A',
        industry: getIndustry(services),
        languages: languages,
        yearsInCity: expert.years_in_city || 0,
        services: services,
        serviceAvailability: expert.service_availability || 0,
        priceExpectation: expert.price_expectation || 0,
        aboutMe: expert.user?.about_me || 'No description available',
        avatar: expert.user?.image,
        status: expert.status || 'rejected',
        createdAt: expert.created_at,
        govId: expert.gov_id,
        travelLicence: expert.travel_licence,
        offerService: expert.offer_service,
        instagramLink: expert.instagram_link,
        facebookLink: expert.facebook_link,
        linkedinLink: expert.linkedin_link,
        confirmAge: expert.confirm_age,
        tAndC: expert.t_and_c,
        partnership: expert.partnership
      }
    })
  }

  // Filter and sort data
  useEffect(() => {
    if (!rejectedExperts || !Array.isArray(rejectedExperts)) return

    let filtered = transformApiData(rejectedExperts)

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(expert =>
        expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expert.industry.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Country filter
    if (countryFilter !== "all") {
      filtered = filtered.filter(expert => expert.country === countryFilter)
    }

    // Industry filter
    if (industryFilter !== "all") {
      filtered = filtered.filter(expert => expert.industry === industryFilter)
    }

    // Sort
    switch (sortBy) {
      case "recent":
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        break
      case "oldest":
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        break
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "country":
        filtered.sort((a, b) => a.country.localeCompare(b.country))
        break
      case "industry":
        filtered.sort((a, b) => a.industry.localeCompare(b.industry))
        break
      default:
        break
    }

    setFilteredData(filtered)
  }, [rejectedExperts, searchQuery, sortBy, countryFilter, industryFilter])

  // Transform current expert data for modal display
  const transformCurrentExpertData = (apiData) => {
    if (!apiData?.data) return null
    
    const expert = apiData.data
    return {
      id: expert.id,
      name: `${expert.user?.first_name || ''} ${expert.user?.last_name || ''}`.trim() || 'Unknown',
      email: expert.user?.email || 'N/A',
      country: expert.user?.country || 'N/A',
      city: expert.user?.city || 'N/A',
      languages: expert.languages || [],
      yearsInCity: expert.years_in_city || 0,
      services: expert.services || [],
      serviceAvailability: expert.service_availability || 0,
      priceExpectation: expert.price_expectation || 0,
      aboutMe: expert.user?.about_me || 'No description available',
      contact: expert.user?.phone_number || 'N/A',
      avatar: expert.user?.image,
      status: expert.status || 'rejected',
      createdAt: expert.created_at,
      govId: expert.gov_id,
      travelLicence: expert.travel_licence,
      offerService: expert.offer_service,
      instagramLink: expert.instagram_link,
      facebookLink: expert.facebook_link,
      linkedinLink: expert.linkedin_link,
      confirmAge: expert.confirm_age,
      tAndC: expert.t_and_c,
      partnership: expert.partnership
    }
  }

  const selectedExpert = transformCurrentExpertData(currentLocalExpert)

  useEffect(() => {
    if (adminLoading) return

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!isAdmin) {
      router.push('/dashboard')
    }
  }, [isAdmin, isAuthenticated, adminLoading, router])

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  
  const handleDelete = async (id) => {
    try {
      const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      if (accessToken) {
        await dispatch(updateLocalExpert({ 
          token: accessToken, 
          id: id, 
          payload: { status: 'deleted' } 
        })).unwrap()
        
        // Refresh the rejected experts list after deletion
        dispatch(getRejectedLocalExperts({ token: session.backendData.accessToken }))
        setIsModalOpen(false)
      }
    } catch (error) {
      console.error("Error deleting expert:", error)
    }
  }

  const handleApprove = async (id) => {
    try {
      const accessToken = session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken
      if (accessToken) {
        await dispatch(updateLocalExpert({ 
          token: accessToken, 
          id: id, 
          payload: { status: 'approved' } 
        })).unwrap()
        
        // Refresh the rejected experts list after approval
        dispatch(getRejectedLocalExperts({ token: session.backendData.accessToken }))
        setIsModalOpen(false)
      }
    } catch (error) {
      console.error("Error approving expert:", error)
    }
  }

  const handleViewDetails = (id) => {
    setSelectedExpertId(id)
    setIsModalOpen(true)
  }

  
  const handleEditDetails = (id) => {
    console.log("Edit details for expert:", id)
    // Add edit details logic here
  }

  const handleSendMail = (id) => {
    console.log("Send mail to expert:", id)
    // Add send mail logic here
  }

  // Apply filters when search or filters change
  useEffect(() => {
    const dataToFilter = rejectedExperts && rejectedExperts.length > 0 
      ? transformApiData(rejectedExperts) 
      : staticRejectedExpertsData

    const filters = {
      search: searchQuery,
      country: countryFilter,
      industry: industryFilter,
      sortBy: sortBy
    }
    const filtered = applyFilters(dataToFilter, filters)
    setFilteredData(filtered)
  }, [searchQuery, countryFilter, industryFilter, sortBy, rejectedExperts])

  // Table configuration
  const columns = [
    {
      key: 'name',
      label: 'Company Name',
      render: (expert, index) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
          <Avatar className="h-10 w-10">
            <AvatarImage src={expert.avatar || "/placeholder.svg"} alt={expert.name} />
            <AvatarFallback className="bg-green-100 text-green-700 border border-green-300 text-sm font-medium">
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
    { key: 'email', label: 'Company Email' },
    { key: 'contact', label: 'Contact Number' },
    { key: 'country', label: 'Country' },
    { key: 'industry', label: 'Industry' },
    { 
      key: 'requestDate', 
      label: 'Request Date & Time',
      render: (expert) => (
        <div className="text-sm text-gray-600">
          {new Date(expert.createdAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })}
        </div>
      )
    },
    { 
      key: 'rejectedDate', 
      label: 'Rejected on',
      render: (expert) => (
        <div className="text-sm text-gray-600">
          {new Date(expert.createdAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })}
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
        { value: 'oldest', label: 'Oldest' },
        { value: 'name', label: 'Company Name' },
        { value: 'country', label: 'Country' },
        { value: 'industry', label: 'Industry' }
      ]
    },
    {
      key: 'country',
      label: 'By Country',
      placeholder: 'All Countries',
      options: countries.map(country => ({ value: country, label: country })),
      searchable: true,
      maxHeight: '200px'
    },
    {
      key: 'industry',
      label: 'By Industry',
      placeholder: 'All Industries',
      options: [
        { value: 'City Transport', label: 'City Transport' },
        { value: 'Adventure Tours', label: 'Adventure Tours' },
        { value: 'Cultural Tours', label: 'Cultural Tours' },
        { value: 'Food & Culinary', label: 'Food & Culinary' },
        { value: 'Hotel', label: 'Hotel' },
        { value: 'Car Rentals', label: 'Car Rentals' },
        { value: 'Adventure Activity', label: 'Adventure Activity' },
        { value: 'Travel Services', label: 'Travel Services' }
      ],
      searchable: true,
      maxHeight: '200px'
    }
  ]

  const actions = [
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
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 bg-gray-50 min-h-screen">
            {/* Static Data Label */}
            {isStaticData && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">Showing static data - API unavailable</span>
              </div>
            )}

            {/* Header Section */}
            <div className="mb-6">
              <div className="mb-4">
                <Link href="/admin/local-experts-requests" className="flex items-center gap-2 text-[#FF385C] hover:text-red-700">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Previous Page</span>
                </Link>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Rejected Service Providers ({filteredData.length})</h1>
              </div>
            </div>

            {/* Loading State */}
            {rejectedLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-3 text-gray-600">Loading rejected requests...</span>
              </div>
            )}

            {/* Error State */}
            {rejectedError && !isStaticData && (
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
                searchPlaceholder="Search by Company Name"
                onAction={handleTableAction}
                onSearch={(value) => setSearchQuery(value)}
                onFilterChange={(filters) => {
                  setSortBy(filters.sortBy || 'recent')
                  setCountryFilter(filters.country || 'all')
                  setIndustryFilter(filters.industry || 'all')
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Expert Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open)
        if (!open) {
          setSelectedExpertId(null)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <DialogTitle className="text-xl font-semibold text-gray-900">Service Provider Request</DialogTitle>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF385C]"></div>
                <span className="ml-2 text-gray-600">Loading expert details...</span>
              </div>
            ) : selectedExpert ? (
              <div className="space-y-6">
                {/* Expert Profile Section */}
                <div className="flex items-start gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={selectedExpert.avatar || "/placeholder.svg"} alt={selectedExpert.name} />
                    <AvatarFallback className="bg-[#FF385C] text-white text-lg font-medium">
                      {selectedExpert.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{selectedExpert.name}</h3>
                    <p className="text-gray-600 text-sm mb-3">
                      {selectedExpert.aboutMe}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{selectedExpert.city}, {selectedExpert.country}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{selectedExpert.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{selectedExpert.contact}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Languages Section */}
                {selectedExpert.languages && selectedExpert.languages.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Languages</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedExpert.languages.map((language, index) => (
                        <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {language}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expertise & Experience Section */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Expertise & Experience</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Years Living in This City</span>
                      <span className="font-medium text-gray-900">{selectedExpert.yearsInCity} Years</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Currently offer tours or planning services?</span>
                      <span className="font-medium text-gray-900">{selectedExpert.offerService ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>

                {/* Services Section */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Services</h4>
                  <div className="space-y-3">
                    {selectedExpert.services && selectedExpert.services.length > 0 && (
                      <div className="py-2 border-b border-gray-100">
                        <div className="text-gray-600 mb-1">Services I am Willing to Offer:</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedExpert.services.map((service, index) => (
                            <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                              {service.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Service Availability:</span>
                      <span className="font-medium text-gray-900">{selectedExpert.serviceAvailability} Hours/Week</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-600">Minimum Pricing Expectations:</span>
                      <span className="font-medium text-gray-900">${selectedExpert.priceExpectation} Per Hour</span>
                    </div>
                  </div>
                </div>

                {/* Social Links Section */}
                {(selectedExpert.instagramLink || selectedExpert.facebookLink || selectedExpert.linkedinLink) && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Social Media Links</h4>
                    <div className="space-y-2">
                      {selectedExpert.instagramLink && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">Instagram:</span>
                          <a href={selectedExpert.instagramLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {selectedExpert.instagramLink}
                          </a>
                        </div>
                      )}
                      {selectedExpert.facebookLink && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">Facebook:</span>
                          <a href={selectedExpert.facebookLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {selectedExpert.facebookLink}
                          </a>
                        </div>
                      )}
                      {selectedExpert.linkedinLink && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">LinkedIn:</span>
                          <a href={selectedExpert.linkedinLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {selectedExpert.linkedinLink}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Documents Section */}
                {(selectedExpert.govId || selectedExpert.travelLicence) && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Documents</h4>
                    <div className="space-y-2">
                      {selectedExpert.govId && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">Government ID:</span>
                          <a href={selectedExpert.govId} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View Document
                          </a>
                        </div>
                      )}
                      {selectedExpert.travelLicence && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">Travel License:</span>
                          <a href={selectedExpert.travelLicence} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View Document
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Section */}
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Mail will be automatically sent to the User based on any action (Approve or Delete) done by you.
                  </p>
                  <div className="flex gap-3">
                    <Button 
                      className="bg-[#58AC00] hover:bg-[#4A8F00] text-white"
                      onClick={() => {
                        handleApprove(selectedExpert.id)
                        setIsModalOpen(false)
                      }}
                    >
                      Approve
                    </Button>
                    <Button 
                      variant="outline"
                      className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
                      onClick={() => {
                        handleDelete(selectedExpert.id)
                        setIsModalOpen(false)
                      }}
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <AlertCircle className="h-8 w-8 text-red-500 mr-2" />
                <span className="text-gray-600">Failed to load expert details</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 