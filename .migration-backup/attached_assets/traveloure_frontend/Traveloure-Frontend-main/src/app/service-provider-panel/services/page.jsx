"use client"

import { useState, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useSession } from "next-auth/react"
import { AppSidebar } from "../../../components/app-sidebar"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Menu, X, Plus, Star, Edit, Trash2, Search } from "lucide-react"
import { Navbar } from "../../../components/help-me-decide/navbar"
import Link from "next/link"
import { getServices, clearServicesData } from "../../redux-features/service-provider/serviceProviderSlice"

export default function AllServicesPage() {
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Redux state
  const { 
    services, 
    servicesLoading, 
    servicesError, 
    servicesCount, 
    servicesTotalPages 
  } = useSelector((state) => state.serviceProvider)

  // Load services from API
  useEffect(() => {
    if (session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken) {
      dispatch(getServices({ token: session.backendData.accessToken, search: searchQuery }))
    }
  }, [dispatch, session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, searchQuery])

  // Clear services data on component unmount
  useEffect(() => {
    return () => {
      dispatch(clearServicesData())
    }
  }, [dispatch])

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
  }

  // Function to render star rating
 
 
  return (
    <div className="min-h-screen bg-gray-50">
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
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-64 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

                     {/* Page Header */}
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-8">
             <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Services</h1>
             <Link href="/service-provider-panel/services/all-services">
               <Button className="bg-[#FF385C] text-white hover:bg-[#e62e50] px-4 sm:px-6 py-2 w-full sm:w-auto">
                 <Plus className="w-4 h-4 mr-2" />
                 Add New Service
               </Button>
             </Link>
           </div>

           {/* Search Bar and Results Count */}
           <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
             <div className="relative max-w-md">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                 <Search className="h-4 w-4 text-gray-400" />
               </div>
               <Input
                 type="text"
                 placeholder="Search services..."
                 value={searchQuery}
                 onChange={handleSearchChange}
                 className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 text-sm"
               />
             </div>
             {!servicesLoading && (
               <div className="text-sm text-gray-600">
                 {servicesCount} service{servicesCount !== 1 ? 's' : ''} found
               </div>
             )}
           </div>

                     {/* Services Layout - Vertical List */}
           {servicesLoading ? (
             <div className="space-y-6">
               {[1, 2].map((item) => (
                 <Card key={item} className="bg-white shadow-md">
                   <CardContent className="p-0">
                     <div className="animate-pulse">
                       <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                       <div className="p-6">
                         <div className="h-6 bg-gray-200 rounded mb-2"></div>
                         <div className="h-4 bg-gray-200 rounded mb-4 w-1/2"></div>
                         <div className="h-4 bg-gray-200 rounded mb-2"></div>
                         <div className="h-4 bg-gray-200 rounded mb-2"></div>
                         <div className="h-4 bg-gray-200 rounded mb-4 w-3/4"></div>
                         <div className="flex justify-between items-center">
                           <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                           <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                         </div>
                       </div>
                     </div>
                   </CardContent>
                 </Card>
               ))}
             </div>
           ) : servicesError ? (
             <div className="text-center py-8">
               <p className="text-red-500 mb-4">{servicesError}</p>
               <Button 
                 onClick={() => dispatch(getServices({ token: session?.backendData?.accessToken || session?.backendData?.backendData?.accessToken, search: searchQuery }))}
                 className="bg-[#FF385C] hover:bg-[#e23350] text-white"
               >
                 Try Again
               </Button>
             </div>
           ) : (
             <div className="space-y-6">
               {services.map((service) => (
                 <Card key={service.id} className="bg-white shadow-md hover:shadow-lg transition-shadow duration-200">
                   <CardContent className="p-3 flex flex-col md:flex-row">
                     {/* Service Image */}
                     <div className="relative w-full md:w-48 h-48 overflow-hidden rounded-lg md:rounded-l-lg md:rounded-r-none flex-shrink-0 mb-4 md:mb-0">
                       <img
                         src={service.service_file || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop"}
                         alt={service.service_name}
                         className="w-full h-full object-cover"
                         onError={(e) => {
                           e.target.src = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop"
                         }}
                       />
                     </div>

                     {/* Service Details */}
                     <div className="p-4 md:p-6 flex-1">
                       {/* Service Name */}
                       <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">{service.service_name}</h3>

                       {/* Service Type */}
                       <p className="text-sm text-gray-600 mb-2">Service Type: {service.service_type}</p>

                       {/* Location */}
                       <p className="text-sm text-gray-600 mb-2">Location: {service.location}</p>

                       {/* Availability */}
                       <p className="text-sm text-gray-600 mb-3">
                         Availability: {service.availability?.join(", ") || "Not specified"}
                       </p>

                       {/* Description */}
                       <p className="text-gray-700 text-sm mb-4 line-clamp-2 md:line-clamp-3">{service.description}</p>

                       {/* Price and Status */}
                       <div className="flex justify-between items-center">
                         <span className="text-base md:text-lg font-bold text-[#FF385C]">
                           ${service.price} ({service.price_based_on})
                         </span>
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                           service.form_status === 'approved' 
                             ? 'bg-green-100 text-green-800' 
                             : service.form_status === 'pending'
                             ? 'bg-yellow-100 text-yellow-800'
                             : 'bg-red-100 text-red-800'
                         }`}>
                           {service.form_status}
                         </span>
                       </div>

                       {/* User Info */}
                       <div className="mt-3 pt-3 border-t border-gray-200">
                         <p className="text-sm text-gray-600">
                           Provider: {service.user?.first_name} {service.user?.last_name}
                         </p>
                         <p className="text-xs text-gray-500">
                           Created: {new Date(service.created_at).toLocaleDateString()}
                         </p>
                       </div>
                     </div>
                   </CardContent>
                 </Card>
               ))}
             </div>
           )}

          {/* Empty State */}
          {!servicesLoading && !servicesError && services.length === 0 && (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Plus className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Services Yet</h3>
              <p className="text-gray-600 mb-6">Start by adding your first service to showcase your offerings.</p>
              <Link href="/service-provider-panel/services/all-services">
                <Button className="bg-[#FF385C] text-white hover:bg-[#e62e50]">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Service
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}