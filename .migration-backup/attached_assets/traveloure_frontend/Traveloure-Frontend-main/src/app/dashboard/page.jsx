"use client"

import { useEffect, useState } from "react"
import { useIsMobile } from "../../hooks/use-mobile"
import { AppSidebar } from "../../components/app-sidebar"
import { StatsCard } from "../../components/stats-card"
import { TripCard } from "../../components/trip-card"
import { ServiceItem } from "../../components/service-item"
import { ReminderItem } from "../../components/reminder-item"
import { WeatherCard } from "../../components/weather-card"
import { ProTipCard } from "../../components/pro-tip-card"
import { SmartActions } from "../../components/smart-actions"
import { PersonalizedRecommendation } from "../../components/personalized-recommendation"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import { Plane, Car, UtensilsCrossed, Train, Bus, Ship, Building, Plus, Menu, X } from "lucide-react"
import { Navbar } from "../../components/help-me-decide/navbar"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import {  Trash2 } from "lucide-react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
import { format } from "date-fns"
import { useSelector } from "react-redux"
import { useRouter } from "next/navigation";


function getInitials(name) {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 1) {
    // Try to use first two letters if only one word
    return parts[0].slice(0, 2).toUpperCase();
  }
  // Use first letter of first and last word
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


export default function Page() {
  const today = new Date()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const userinfo = useSelector((state) => state?.auth?.profile?.data?.[0] || {});
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [addReminderModalOpen, setAddReminderModalOpen] = useState(false);
  const [remindersList, setRemindersList] = useState([
    {
      title: "Confirm Hotel Booking",
      description: "Make sure your stay in Rome is reserved before May 18.",
      time: "3:00 PM",
      details: {
        date: "May 18, 2025",
        notifyBefore: "On Time, 30 Mins, 45 Mins",
      }
    },
    {
      title: "Flight Check-In Opens Soon",
      description: "Check-in for your Paris trip starts in 24 hours.",
      time: "3:01 PM",
      details: {
        date: "January 24, 2025",
        notifyBefore: "On Time, 30 Mins, 45 Mins",
      }
    },
    {
      title: "Submit for Expert Review",
      description: "Make sure your stay in Rome is reserved before May 18.",
      time: "3:03 PM",
      details: {
        date: "May 18, 2025",
        notifyBefore: "On Time, 30 Mins, 45 Mins",
      }
    },
    {
      title: "Unconfirmed Activity",
      description: "Make sure your stay in Rome is reserved before May 18.",
      time: "3:04 PM",
      details: {
        date: "May 18, 2025",
        notifyBefore: "On Time, 30 Mins, 45 Mins",
      }
    },
  ]);

  const router = useRouter();

  // Reminder form logic
  const defaultNotifyOptions = ["On Time", "30 Mins", "45 Mins", "1 Hour", "1 Day"];
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      title: "",
      description: "",
      date: today,
      time: format(today, "HH:mm"),
      notify: ["30 Mins"],
    },
  });
  const { fields: notifyFields, append: appendNotify, remove: removeNotify } = useFieldArray({
    control,
    name: "notify",
  });

  const onAddReminder = (data) => {
    // Compose new reminder object
    const newReminder = {
      title: data.title,
      description: data.description,
      time: data.time,
      details: {
        date: format(data.date, "MMMM d, yyyy"),
        notifyBefore: data.notify.join(", "),
      },
    };
    setRemindersList((prev) => [newReminder, ...prev]);
    setAddReminderModalOpen(false);
    reset();
  };

  // Reminders data
  // remindersList is now the source of truth

  function getGreetingTime() {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
  }

  return (
    <div className="min-h-screen bg-gray-50">
    <Navbar/>
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
      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-screen">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-7 p-4 lg:p-6">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mb-4 border border-gray-300"
            onClick={() => {
              setSidebarOpen(true)
            }}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Credits Section */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <Image 
                src="/coins-icon.png" 
                alt="Credits" 
                width={16}
                height={16}
                className="h-4 w-4 flex-shrink-0"
              />
              <span className="bg-gradient-to-r from-[#F30131] to-[#BE35EB] bg-clip-text text-transparent font-medium text-sm">
                {userinfo.credits || 0} Credits
              </span>
            </div>
          </div>

         

          {/* Stats Cards - First Row with 4 cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <StatsCard
              title="Total Trips Planned"
              value={userinfo.trip_planned || 0}
              subtitle={`Upcoming Trips: ${userinfo.upcoming_trip_count || 0}`}
              trend="TILL NOW"
            />
            <StatsCard
              title="Total Time Saved"
              value="48 Hours"
              subtitle="Avg Time per Trip Saved: 2.5h"
              trend="TILL NOW"
            />
            <StatsCard
              title="Total Money Saved"
              value="$1,450"
              subtitle="Per Trip Avg Savings: ~$80"
              trend="TILL NOW"
            />
            <StatsCard
              title="Total Countries Visited"
              value="12"
              subtitle="Next Destination: New York, USA"
              trend="TILL NOW"
            />
          </div>



          {/* Current & Upcoming Trips */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Current & Upcoming Trips</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {userinfo.current_trips?.map((trip, idx) => (
                <div key={trip.id}>
                  <TripCard
                    title={trip.itinerary_data?.title || "Trip"}
                    image={trip.itinerary_data?.hotels?.[0]?.image_url || "/articleimage.png"}
                    status="Current"
                    startDate={trip.itinerary_data?.start_date}
                    endDate={trip.itinerary_data?.end_date}
                    notificationsEnabled={false}
                    tripData={trip}
                  />
                  {/* <button
                    className="bg-[#FF385C] text-white px-4 py-2 rounded mt-2 w-full"
                    onClick={() => router.push('/ai-optimization')}
                  >
                    View Itinerary
                  </button> */}
                </div>
              ))}
              {userinfo.upcoming_trips?.map((trip) => (
                <TripCard
                  key={trip.id}
                  title={trip.itinerary_data?.title || "Trip"}
                  image={trip.itinerary_data?.hotels?.[0]?.image_url || "/articleimage.png"}
                  status="Upcoming"
                  startDate={trip.itinerary_data?.start_date}
                  endDate={trip.itinerary_data?.end_date}
                  notificationsEnabled={true}
                  tripData={trip}
                />
              ))}
           <Card
  className="flex items-center justify-center text-white bg-cover bg-center"
  style={{ backgroundImage: "url('/articleimage.png')" }}
>
  <CardContent className="p-4 lg:p-6 text-center space-y-4  rounded-xl">
    <h3 className="font-semibold">Plan Your New Trip</h3>
    <p className="text-sm opacity-90">Memorable With Traveloure AI</p>
    <Button variant="secondary" onClick={() => router.push('/Itinerary')} size="sm">
      Create a New Trip
    </Button>
  </CardContent>
</Card>
            </div>
          </div>

          {/* Personalized Recommendation and Reminders */}
          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <PersonalizedRecommendation />
            
            <Card className="bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-gray-900">Reminders</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#FF385C] font-semibold"
                  onClick={() => setAddReminderModalOpen(true)}
                >
                  Add Reminder
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {remindersList.map((reminder, idx) => (
                    <ReminderItem
                      key={idx}
                      title={reminder.title}
                      description={reminder.description}
                      time={reminder.time}
                      onClick={() => {
                        setSelectedReminder(reminder);
                        setReminderModalOpen(true);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reminder Details Modal */}
          {reminderModalOpen && selectedReminder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-2xl shadow-2xl p-0 w-full max-w-xl relative">
                <button
                  className="absolute top-4 right-5 text-gray-400 hover:text-gray-700 text-2xl"
                  onClick={() => setReminderModalOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
                <h2 className="text-2xl font-bold px-8 pt-8 pb-2">Reminder Details</h2>
                <div className="bg-[#fafbfc] border border-[#e5e7eb] rounded-xl mx-8 mb-8 p-6 relative">
                  <button
                    className="absolute top-6 right-6 text-pink-500 text-sm font-semibold hover:underline"
                    // onClick={...} // Add your edit handler here
                  >
                    Edit Changes
                  </button>
                  <h3 className="font-bold text-lg mb-2">{selectedReminder.title}</h3>
                  <p className="text-gray-600 mb-4">
                    {/* You can add a real description here, or use a placeholder */}
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">Date:</span>
                      <span className="ml-2 text-gray-900">{selectedReminder.details?.date || "-"}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Time:</span>
                      <span className="ml-2 text-gray-900">{selectedReminder.time}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-semibold text-gray-700">Notify Before:</span>
                      <span className="ml-2 text-gray-900">{selectedReminder.details?.notifyBefore || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

                    {/* Mobile Services Section */}
          <div className="mt-6 lg:hidden space-y-4">
            {/* Smart Actions for Mobile */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-gray-900">Smart Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-gray-700 border-gray-200" onClick={() => router.push('/Itinerary')}>
                  Plan a New Trip With AI
                </Button>
                <Button variant="outline" className="w-full justify-start text-gray-700 border-gray-200" onClick={() => router.push('/help-me-decide')}>
                  Help Me Decide
                </Button>
                <Button variant="outline" className="w-full justify-start text-gray-700 border-gray-200" onClick={() => router.push('/experts')}>
                  Build a Trip With Expert
                </Button>
              </CardContent>
            </Card>

            {/* Pro Tip for Mobile */}
            <ProTipCard />
          </div>
        </div>

        {/* Desktop Right Sidebar */}
        <div className="hidden lg:block lg:col-span-3 bg-white border-l border-gray-200 p-6">
          <div className="space-y-6">
            {/* User Profile */}
            <div className="flex items-center gap-3 mb-6">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-pink-500 text-white">
                  {getInitials(userinfo.first_name || userinfo.username || userinfo.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{userinfo.first_name || userinfo.username || "User"}</p>
                <p className="text-xs text-gray-500">{userinfo.email || "No email"}</p>
              </div>
            </div>

            {/* Weather Card */}
            <WeatherCard />

            {/* Smart Actions */}
            <SmartActions />

            {/* Pro Tip */}
            <ProTipCard />

       

         
          </div>
        </div>
      </div>

      {/* Add Reminder Modal */}
      <Dialog open={addReminderModalOpen} onOpenChange={setAddReminderModalOpen}>
        <DialogContent className="w-full max-w-lg rounded-2xl p-0">
          <form onSubmit={handleSubmit(onAddReminder)}>
            <div className="px-8 pt-8 pb-2">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-left">Add Reminder</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <label className="block text-sm font-semibold mb-2">Title:</label>
                <input
                  type="text"
                  placeholder="Add Your Title Here"
                  {...register("title", { required: true })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                />
                {errors.title && <p className="text-red-500 text-xs mb-2">Title is required</p>}
              </div>
              <div className="mb-2">
                <label className="block text-sm font-semibold mb-2">Description:</label>
                <textarea
                  placeholder="Add Description Here"
                  {...register("description", { required: true })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[70px]"
                />
                {errors.description && <p className="text-red-500 text-xs mb-2">Description is required</p>}
              </div>
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-2">Date & Time:</label>
                  <Controller
                    control={control}
                    name="date"
                    render={({ field }) => (
                      <input
                        type="date"
                        {...field}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                      />
                    )}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold mb-2">&nbsp;</label>
                  <Controller
                    control={control}
                    name="time"
                    render={({ field }) => (
                      <input
                        type="time"
                        {...field}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                      />
                    )}
                  />
                </div>
              </div>
              <div className="mb-2">
                <label className="block text-sm font-semibold mb-2">Notify Before:</label>
                {notifyFields.map((field, idx) => (
                  <div key={field.id} className="flex items-center gap-2 mb-2">
                    <select
                      {...register(`notify.${idx}`)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                    >
                      {defaultNotifyOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {notifyFields.length > 1 && (
                      <button type="button" onClick={() => removeNotify(idx)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-[#FF385C] text-sm font-semibold mb-2 hover:underline"
                  onClick={() => appendNotify("30 Mins")}
                >
                  Add Another Time
                </button>
              </div>
              <div className="flex justify-end mt-6 mb-4">
                <Button
                  type="submit"
                  className="bg-[#FF385C] hover:bg-[#E02D50] text-white px-8 py-2 rounded-lg font-semibold"
                  disabled={isSubmitting}
                >
                  Add Reminder
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
