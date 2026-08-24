"use client"

import { Calendar } from "../../../components/help-me-decide/calendar"
import { Navbar } from "../../../components/help-me-decide/navbar"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronUp, MapPin, Star, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useEffect, useState, useMemo } from "react"
import Image from "next/image"
import { ScrollArea } from "../../../components/ui/scroll-area"
import { Button } from "../../../components/ui/button"
import { useHelpMeDecideCleanup } from "../../../hooks/useHelpMeDecideCleanup"
import { useSelector, useDispatch } from "react-redux"
import { Card, CardContent } from "../../../components/ui/card"
import { useSession } from "next-auth/react"
import { fetcheventDatapoular, prefrenceeventDatapopular } from "../../redux-features/help-me-decide/HelpmeDecideSlice"
import { toast } from "sonner"

export default function HelpMeDecideEventsPage() {
  // Use the cleanup hook to handle localStorage cleanup when navigating away
  useHelpMeDecideCleanup()

  const dispatch = useDispatch()
  const { data: session } = useSession()
  const token = session?.backendData?.accessToken

  const [showCalendarMobile, setShowCalendarMobile] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [isAddingToPreference, setIsAddingToPreference] = useState(false)

  // Get events from Redux store with debugging
  const events1 = useSelector((state) => {
    return state?.helpme?.placeandactivitiesData?.live_events
  })

  // State for localStorage events
  const [localStorageEvents, setLocalStorageEvents] = useState(null)


 
  // Get selected date and events from localStorage
  useEffect(() => {
    const storedDate = localStorage.getItem("selectedEventDate")
    const storedEvents = localStorage.getItem("selectedDateEvents")

   
    if (storedDate) {
      setSelectedDate(storedDate)
    }

    // Parse and set localStorage events
    if (storedEvents) {
      try {
        const parsedEvents = JSON.parse(storedEvents)
        setLocalStorageEvents(parsedEvents)
      } catch (error) {
        console.error("Error parsing stored events:", error)
      }
    }
  }, [])

  // Listen for localStorage changes to update selected date
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "selectedEventDate") {
        setSelectedDate(e.newValue)
      }
      if (e.key === "selectedDateEvents") {
        try {
          const parsedEvents = JSON.parse(e.newValue)
          setLocalStorageEvents(parsedEvents)
        } catch (error) {
          console.error("Error parsing updated events:", error)
        }
      }
    }

    // Listen for storage events (when localStorage changes from other tabs/windows)
    window.addEventListener('storage', handleStorageChange)

    // Also listen for custom events (for same-tab updates)
    const handleCustomStorageChange = (e) => {
      if (e.detail.key === "selectedEventDate") {
        setSelectedDate(e.detail.value)
      }
      if (e.detail.key === "selectedDateEvents") {
        try {
          const parsedEvents = JSON.parse(e.detail.value)
          setLocalStorageEvents(parsedEvents)
        } catch (error) {
          console.error("Error parsing updated events:", error)
        }
      }
    }

    window.addEventListener('localStorageChange', handleCustomStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('localStorageChange', handleCustomStorageChange)
    }
  }, [])

  // Clean up events localStorage items on page reload/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem("selectedEventDate")
      localStorage.removeItem("selectedDateEvents")
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Use Redux data if available, otherwise use localStorage data
  const eventsData = events1 && events1.length > 0 ? events1 : localStorageEvents

  // Helper function to check if image URL is valid for Next.js Image component
  const isValidImageUrl = (url) => {
    if (!url) return false

    // Check if it's a placeholder URL
    if (url.includes("/placeholder.svg")) return true

    // Check if it's from allowed domains (matching your next.config.js)
    const allowedDomains = [
      "lh3.googleusercontent.com",
      "lh4.googleusercontent.com",
      "lh5.googleusercontent.com",
      "lh6.googleusercontent.com",
      "streetviewpixels-pa.googleapis.com",
      "upload.wikimedia.org",
      "anotherdomain.com",
      "www.google.com",
      "encrypted-tbn0.gstatic.com",
      "images.unsplash.com",
      "via.placeholder.com",
    ]

    try {
      const urlObj = new URL(url)
      return allowedDomains.includes(urlObj.hostname)
    } catch {
      return false
    }
  }

  // Get safe image URL
  const getSafeImageUrl = (url, width = 300, height = 300) => {
    if (isValidImageUrl(url)) {
      return url
    }
    return `/placeholder.svg?height=${height}&width=${width}`
  }

  // Add debugging to the filter logic
  const filteredEvents = useMemo(() => {
 
    if (!eventsData || eventsData.length === 0) {
      return []
    }

    if (!selectedDate) {
      return []
    }

    const filtered = eventsData.filter((event) => {
      try {
        const dateParts = event.start_date.split(" ")

        const month = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        }[dateParts[0]]

        const day = Number.parseInt(dateParts[1])
        const year = 2025

        const eventDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
     
        return eventDateStr === selectedDate
      } catch (error) {
        console.error("Error parsing event date:", error, event)
        return false
      }
    })

    return filtered
  }, [eventsData, selectedDate])

  // Set the first event as selected by default
  useEffect(() => {
    if (filteredEvents.length > 0 && !selectedEvent) {
      setSelectedEvent(filteredEvents[0])
    }
  }, [filteredEvents, selectedEvent])

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  // Handle adding event to preferences
  const handleAddToPreference = async () => {
    if (!selectedEvent) {
      toast.error("No event selected")
      return
    }

    if (!token) {
      toast.error("Please login to add events to preferences")
      return
    }

    setIsAddingToPreference(true)

    try {
      // Extract location from event address
      const location = selectedEvent.address?.[1]?.split(" - ")?.[0] || "Dubai"
      
      // Use event title as activity name
      const activity = selectedEvent.title


      const result = await dispatch(
        fetcheventDatapoular({
          token,
          activity,
          location
        })
      ).unwrap()

      if (result) {
        // Refresh the events preferences data
        await dispatch(prefrenceeventDatapopular({ token }))
        toast.success("Event added to preferences successfully!")
      }
    } catch (error) {
      console.error("Error adding event to preferences:", error)
      toast.error("Failed to add event to preferences")
    } finally {
      setIsAddingToPreference(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="px-4 py-6 flex flex-col lg:flex-row gap-8">
        {/* Left: Events List and Selected Event Details */}
        <div className="w-full lg:w-1/2">
          <Link
            href="/help-me-decide"
            className="flex items-center text-sm text-[#FF385C] mb-4"
            onClick={() => {
              // Clean up localStorage when going back
              localStorage.removeItem("selectedEventDate")
              localStorage.removeItem("selectedDateEvents")
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Main Page
          </Link>

          <ScrollArea className="h-[calc(100vh-5rem)] pr-4">
            {selectedDate && (
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">Events for {formatDate(selectedDate)}</h1>
                <p className="text-gray-600">
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
                </p>
              </div>
            )}

       
            {filteredEvents.length > 0 ? (
              <div className="space-y-4 mb-6">
                {filteredEvents.map((event, index) => (
                  <Card
                    key={index}
                    className={`cursor-pointer transition-all hover:shadow-md max-w-2xl mx-auto ${selectedEvent?.title === event.title ? "ring-2 ring-[#FF385C]" : ""}`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-20 h-20 flex-shrink-0">
                          <Image
                            src={getSafeImageUrl(event.image_url, 80, 80) || "/placeholder.svg"}
                            alt={event.title}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{event.title}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                            <MapPin className="h-4 w-4" />
                            <span>{event.venue?.name}</span>
                            {event.venue?.rating && (
                              <>
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span>
                                  {event.venue.rating} ({event.venue.reviews} reviews)
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2">{event.address?.join(", ")}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <CalendarDays className="h-16 w-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-semibold text-gray-600 mb-2">No Events Found</h2>
                <p className="text-gray-500 text-center mb-4">
                  {selectedDate
                    ? `No events scheduled for ${formatDate(selectedDate)}`
                    : "Please select a date from the calendar"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Clean up localStorage when going back
                    localStorage.removeItem("selectedEventDate")
                    localStorage.removeItem("selectedDateEvents")
                    window.history.back()
                  }}
                >
                  Go Back
                </Button>
              </div>
            )}

            {/* Selected Event Details */}
            {selectedEvent && (
              <div className="border-t pt-6">
                <div className="relative mb-4">
                  <Image
                    src={getSafeImageUrl(selectedEvent.image_url, 600, 300) || "/placeholder.svg"}
                    alt={selectedEvent.title}
                    width={600}
                    height={300}
                    className="w-full h-[300px] object-cover rounded-xl"
                  />
                </div>

                <h2 className="text-2xl font-bold mb-4">{selectedEvent.title}</h2>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Date & Time</h3>
                  <p className="text-gray-700">{selectedEvent.start_date}, 2025</p>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Venue</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">{selectedEvent.venue?.name}</span>
                    {selectedEvent.venue?.rating && (
                      <div className="flex items-center gap-1 ml-2">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">{selectedEvent.venue.rating}</span>
                        <span className="text-sm text-gray-500">({selectedEvent.venue.reviews} reviews)</span>
                      </div>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm">{selectedEvent.address?.join(", ")}</p>
                </div>

                {selectedEvent.ticket_info && selectedEvent.ticket_info.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Get Tickets</h3>
                    <div className="space-y-2">
                      {selectedEvent.ticket_info.map((ticket, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="w-full justify-between"
                          onClick={() => window.open(ticket.link, "_blank")}
                        >
                          <span>{ticket.source}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 capitalize">{ticket.link_type}</span>
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 justify-end">
                  <Button 
                    variant="outline" 
                    className="border-[#FF385C] text-[#FF385C]"
                    onClick={handleAddToPreference}
                    disabled={isAddingToPreference}
                  >
                    {isAddingToPreference ? "Adding..." : "Add to Preference"}
                  </Button>
                  <Button
                    className="bg-[#FF385C] hover:bg-[#ff1f47] text-white"
                    onClick={() =>
                      selectedEvent.ticket_info?.[0]?.link && window.open(selectedEvent.ticket_info[0].link, "_blank")
                    }
                  >
                    Book Tickets
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Calendar */}
        <div className="w-full lg:w-1/2">
          <div className="hidden lg:block">
            <Calendar />
          </div>

          <div className="block lg:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCalendarMobile(!showCalendarMobile)}
              className="flex items-center gap-2 w-full justify-center mt-4"
            >
              <CalendarDays className="h-4 w-4" />
              {showCalendarMobile ? "Hide Calendar" : "Show Calendar"}
              {showCalendarMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showCalendarMobile && (
              <div className="mt-4">
                <Calendar />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
