
"use client"

import { useState, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useDispatch, useSelector } from "react-redux"
import { useSession } from "next-auth/react"
import { AppSidebar } from "../../../../components/app-sidebar"
import { Button } from "../../../../components/ui/button"
import { Card, CardContent } from "../../../../components/ui/card"
import { Input } from "../../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select"
import { Menu, X, ChevronLeft, Upload } from "lucide-react"
import { Navbar } from "../../../../components/help-me-decide/navbar"
import Link from "next/link"
import { toast } from "sonner"
import { createService, clearCreateServiceData } from "../../../redux-features/service-provider/serviceProviderSlice"

// Form Schema
const formSchema = z.object({
  serviceName: z.string().min(1, "Service name is required"),
  serviceType: z.string().min(1, "Service type is required"),
  price: z.string().min(1, "Price is required"),
  pricingType: z.string().min(1, "Pricing type is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  availability: z.array(z.string()).min(1, "Please select at least one day"),
  photos: z.any().optional(),
})

export default function AddUniversalServicePage() {
  const dispatch = useDispatch()
  const { data: session } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [photos, setPhotos] = useState([])
  const [selectedAvailability, setSelectedAvailability] = useState([])
  const [location, setLocation] = useState("")

  
  // Redux state
  const { 
    createServiceLoading, 
    createServiceError 
  } = useSelector((state) => state.serviceProvider)

  const serviceTypes = [
    "Pet Services", "Home Services", "Beauty & Wellness", "Education & Tutoring", 
    "Event Services", "Transportation", "Technology Services", "Health & Fitness",
    "Entertainment", "Professional Services", "Creative Services", "Other"
  ]

  const pricingTypes = [
    "Per Hour", "Per Visit", "Per Session", "Per Day", "Per Week", "Per Month", 
    "Per Project", "Per Person", "Per Group", "Fixed Price"
  ]

  const daysOfWeek = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ]

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serviceName: "",
      serviceType: "",
      price: "",
      pricingType: "",
      description: "",
      availability: [],
      photos: [],
    },
  })

  // Clear errors on component mount
  useEffect(() => {
    dispatch(clearCreateServiceData())
  }, [dispatch])

  // Photo upload handler
  const handlePhotoChange = (e) => {
    const newPhotos = Array.from(e.target.files).slice(0, 10 - photos.length)
    setPhotos((prev) => [...prev, ...newPhotos])
  }

  const removePhoto = (idx) => {
    const updated = photos.filter((_, i) => i !== idx)
    setPhotos(updated)
  }


  // Availability selection
  const toggleAvailability = (day) => {
    let updated
    if (selectedAvailability.includes(day)) {
      updated = selectedAvailability.filter((d) => d !== day)
    } else {
      updated = [...selectedAvailability, day]
    }
    setSelectedAvailability(updated)
    form.setValue("availability", updated, { shouldValidate: true })
  }

  // Form submission
  const onSubmit = async (data) => {
    // if (session?.backendData?.accessToken) {
    //   toast.error("Authentication required")
    //   return
    // }

    const payload = {
      serviceName: data.serviceName,
      serviceType: data.serviceType,
      price: data.price,
      pricingType: data.pricingType,
      description: data.description,
      location: location,
      availability: selectedAvailability,
      photos: photos,
    }
  
    try {
      const result = await dispatch(createService({ 
        token: session.backendData.accessToken, 
        payload 
      })).unwrap()
      
      if (result) {
        // Reset form
        form.reset()
        setPhotos([])
        setSelectedAvailability([])
        setLocation("")
        
        // Redirect to Services page after successful submission
        setTimeout(() => {
          window.location.href = "/service-provider-panel/services"
        }, 1500)
      }
    } catch (error) {
      console.error("Service creation failed:", error)
      // Error is already handled by the Redux slice with toast
    }
  }

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
      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-64 bg-white border-r border-gray-200 fixed h-full">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:ml-64 flex-1 p-6 max-h-screen overflow-y-auto">
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
          <div className="mb-8">
            <Link href="/service-provider-panel/services" className="text-[#FF385C] hover:underline mb-4 inline-flex items-center">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to All Services
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-2">
              Add Your <span className="text-green-600">Service</span>
            </h1>
            <p className="text-center text-gray-600">Tell us about your Service, pricings & availability</p>
          </div>

          {/* Form Card */}
          <Card className="bg-white rounded-2xl shadow-lg p-4 md:p-6 lg:p-8 w-full max-w-4xl mx-auto">
            <CardContent className="p-0">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                {/* Add Photos or Videos */}
                <div>
                  <label className="block text-sm font-semibold mb-3">Add Photos or Videos of your Service:</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#FF385C] transition-colors cursor-pointer block"
                  >
                    <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 mb-2">
                      <span className="text-[#FF385C] font-medium">Click to Upload</span> or Drag and Drop
                    </p>
                    <p className="text-sm text-gray-500">(You can add image of JPG, PNG Format).</p>
                  </label>
                  
                  {/* Display uploaded photos */}
                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {photos.map((photo, index) => (
                        <div key={index} className="relative">
                          <img
                            src={URL.createObjectURL(photo)}
                            alt={`Service photo ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Service Details */}
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Service Details</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Service Name */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Service Name:<span className="text-[#FF385C]">*</span></label>
                      <Controller
                        name="serviceName"
                        control={form.control}
                        render={({ field }) => <Input {...field} placeholder="e.g., PawPath Dog Walkers" />}
                      />
                      {form.formState.errors.serviceName && <p className="text-red-500 text-xs mt-1">{form.formState.errors.serviceName.message}</p>}
                    </div>

                    {/* Service Type */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Service Type:<span className="text-[#FF385C]">*</span></label>
                      <Controller
                        name="serviceType"
                        control={form.control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger className="w-full h-12 rounded-lg border-gray-300">
                              <SelectValue placeholder="Select Service Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {serviceTypes.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.formState.errors.serviceType && <p className="text-red-500 text-xs mt-1">{form.formState.errors.serviceType.message}</p>}
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Location:<span className="text-[#FF385C]">*</span></label>
                      <Input
                        type="text"
                        placeholder="e.g., New York, USA"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full h-12 rounded-lg border-gray-300"
                      />
                    </div>

                    {/* Price */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Price (in USD):<span className="text-[#FF385C]">*</span></label>
                      <div className="relative">
                        <Controller
                          name="price"
                          control={form.control}
                          render={({ field }) => (
                            <Input 
                              {...field} 
                              placeholder="18.50" 
                              className="pl-8"
                            />
                          )}
                        />
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                      </div>
                      {form.formState.errors.price && <p className="text-red-500 text-xs mt-1">{form.formState.errors.price.message}</p>}
                    </div>

                    {/* Pricing Type */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Pricing Based on:<span className="text-[#FF385C]">*</span></label>
                      <Controller
                        name="pricingType"
                        control={form.control}
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger className="w-full h-12 rounded-lg border-gray-300">
                              <SelectValue placeholder="Select Pricing Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingTypes.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.formState.errors.pricingType && <p className="text-red-500 text-xs mt-1">{form.formState.errors.pricingType.message}</p>}
                    </div>
          </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Brief Description:<span className="text-[#FF385C]">*</span></label>
                    <Controller
                      name="description"
                      control={form.control}
                      render={({ field }) => (
                        <textarea
                          {...field}
                          rows={4}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FF385C]"
                          placeholder="Describe your service in detail..."
                        />
                      )}
                    />
                    {form.formState.errors.description && <p className="text-red-500 text-xs mt-1">{form.formState.errors.description.message}</p>}
                      </div>
                    </div>

                {/* Availability */}
                <div>
                  <label className="block text-sm font-semibold mb-4">Availability:<span className="text-[#FF385C]">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {daysOfWeek.map((day) => (
                      <label key={day} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAvailability.includes(day)}
                          onChange={() => toggleAvailability(day)}
                          className="w-4 h-4 text-[#FF385C] border-gray-300 rounded focus:ring-[#FF385C]"
                        />
                        <span className="text-sm font-medium text-gray-700">{day}</span>
                      </label>
                    ))}
                  </div>
                  {form.formState.errors.availability && <p className="text-red-500 text-xs mt-1">{form.formState.errors.availability.message}</p>}
                </div>

                {/* Verification Process Warning */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-yellow-800 text-xs font-bold">!</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-yellow-800 mb-1">Verification Process</h4>
                      <p className="text-yellow-700 text-sm">After submission, our team will review your service within 5-7 business days.</p>
                    </div>
                  </div>
          </div>

                {/* Error Display */}
                {createServiceError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700 text-sm">{createServiceError}</p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={createServiceLoading}
                    className="bg-[#FF385C] text-white rounded-lg px-8 py-3 hover:bg-[#e62e50] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createServiceLoading ? "Creating Service..." : "Submit"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
