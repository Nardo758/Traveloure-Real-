"use client"

import { useParams } from "next/navigation"
import { VenueListing } from "../../../../components/venue-listing"
import { Calendar } from "../../../../components/help-me-decide/calendar"
import { Navbar } from "../../../../components/help-me-decide/navbar"
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { useState } from "react"
import { useHelpMeDecideCleanup } from "../../../../hooks/useHelpMeDecideCleanup"

const sampleVenues = [
  {
    id: "1",
    name: "Venue One",
    description: "Description of Venue One",
    address: "123 Paris Street",
    image_url: "/placeholder.svg",
    price_range: "$60-80",
    rating: 4.5,
    reviews_count: 120,
  },
  {
    id: "2",
    name: "Venue Two",
    description: "Description of Venue Two",
    address: "456 Paris Avenue",
    image_url: "/placeholder.svg",
    price_range: "$40-70",
    rating: 4.2,
    reviews_count: 85,
  },
  {
    id: "3",
    name: "Venue Two",
    description: "Description of Venue Two",
    address: "456 Paris Avenue",
    image_url: "/placeholder.svg",
    price_range: "$40-70",
    rating: 4.2,
    reviews_count: 85,
  },
  {
    id: "4",
    name: "Venue Two",
    description: "Description of Venue Two",
    address: "456 Paris Avenue",
    image_url: "/placeholder.svg",
    price_range: "$40-70",
    rating: 4.2,
    reviews_count: 85,
  },
]

export default function HelpMeDecideActivityPage() {
  // Use the cleanup hook to handle localStorage cleanup when navigating away
  useHelpMeDecideCleanup();
  
  const { activitySlug, activityId } = useParams()

  const [showCalendarMobile, setShowCalendarMobile] = useState(false)
  const activityName = activitySlug
    ? activitySlug.charAt(0).toUpperCase() + activitySlug.slice(1).replace(/-/g, " ")
    : "Activity"

  return (
    <>
      <Navbar />
      <div className="mx-auto px-4 py-6 ">
        {/* Small and md screens stacked (1 col), lg screens 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left content - VenueListing */}
          <div>
            <VenueListing
              title={`${activityName} (${sampleVenues.length})`}
              subtitle={`Here is your list of top ${activityName} places in Paris, France`}
              venues={sampleVenues}
            />
          </div>

          {/* Right content - Calendar */}
          <div className="w-full">
            {/* Desktop calendar shown only on lg and up */}
            <div className="hidden lg:block">
              <Calendar />
            </div>

            {/* Mobile toggle for calendar */}
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
      </div>
    </>
  )
}
