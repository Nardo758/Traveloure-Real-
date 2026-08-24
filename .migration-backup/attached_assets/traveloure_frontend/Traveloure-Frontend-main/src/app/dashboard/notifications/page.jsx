"use client";

import {
  Bell,
  CheckCircle,
  CircleAlert,
  CloudRain,
  Download,
  FileWarning,
  Plane,
  Timer,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Navbar } from "../../../components/help-me-decide/navbar";
import { AppSidebar } from "../../../components/app-sidebar";
import { useState } from "react";

const notifications = [
  {
    icon: <Plane className="h-5 w-5 text-red-500" />, initials: "RT", title: "Flight Time Changed for Your Rome Trip", description: "Your departure has been moved 30 minutes earlier. Please check your updated flight details.", time: "Just Now", unread: true, button: "View Flight Info",
  },
  {
    icon: <CheckCircle className="h-5 w-5 text-green-500" />, initials: "AI", title: "Itinerary Successfully Updated with New AI Suggestions", description: "We’ve made 3 updates to your Tokyo itinerary to improve travel flow and activity timing.", time: "10 Mins Ago", unread: true,
  },
  {
    icon: <Timer className="h-5 w-5 text-yellow-500" />, initials: "HO", title: "Hotel Offer in Florence Expires Soon", description: "This limited-time deal on your selected hotel ends in 6 hours. Lock it in now.", time: "30 Mins Ago", unread: true,
  },
  {
    icon: <CloudRain className="h-5 w-5 text-blue-500" />, initials: "WA", title: "Weather Alert: Rain Expected in Amsterdam", description: "It might rain during your trip next week. Consider adjusting or adding indoor activities.", time: "Jan 30, 2025", unread: true,
  },
  {
    icon: <Download className="h-5 w-5 text-sky-500" />, initials: "DP", title: "Download Your Itinerary PDF Before Travel", description: "Your final itinerary for Lisbon is ready and can be downloaded anytime.", time: "Jan 24, 2025", unread: false,
  },
  {
    icon: <CheckCircle className="h-5 w-5 text-green-500" />, initials: "AI", title: "AI Optimization Ready for Paris Trip", description: "We’ve found smarter route suggestions and time-saving tweaks for your itinerary.", time: "Jan 16, 2025", unread: false,
  },
  {
    icon: <CheckCircle className="h-5 w-5 text-green-600" />, initials: "ID", title: "Improvements Detected for Paris Plan", description: "We found a few ways to enhance your Paris itinerary. It’s now 85% optimized.", time: "Jan 30, 2025", unread: false,
  },
  {
    icon: <FileWarning className="h-5 w-5 text-orange-500" />, initials: "CR", title: "Suggested Booking: Car Rental for Spain Trip", description: "Based on your preferences, we’ve found a rental option that fits your travel schedule.", time: "Jan 24, 2025", unread: false,
  },
  {
    icon: <CircleAlert className="h-5 w-5 text-rose-500" />, initials: "AI", title: "Berlin Itinerary Not Yet Reviewed by Expert", description: "Maximize your trip by submitting your itinerary for expert review and insights.", time: "Jan 24, 2025", unread: false,
  },
];

export default function NotificationPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Menu</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <AppSidebar onItemClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:gap-0 min-h-[calc(100vh-64px)]">
        <div className="hidden lg:block lg:col-span-2 bg-white border-r border-gray-200">
          <AppSidebar />
        </div>
        <div className="lg:col-span-10 px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">All Notifications</h2>
            <Button className="bg-rose-500 hover:bg-rose-600">
              Mark all as Read
            </Button>
          </div>

          <div className="space-y-2">
            {notifications.map((item, index) => (
              <div
                key={index}
                className={`flex items-start gap-4 p-4 rounded-xl border ${item.unread ? "bg-rose-50" : "bg-white"}`}
              >
                <div className="shrink-0 w-10 h-10 rounded-full bg-white border flex items-center justify-center font-bold text-sm text-rose-500">
                  {item.initials}
                </div>
                <div className="flex-1">
                  <p className="font-semibold leading-snug text-[15px]">
                    {item.title}
                  </p>
                  <p className="text-sm text-gray-500 leading-snug mt-0.5">
                    {item.description}
                  </p>
                  {item.button && (
                    <Button
                      className="mt-3 bg-white text-rose-500 border border-rose-300 hover:bg-rose-100"
                      size="sm"
                    >
                      {item.button}
                    </Button>
                  )}
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap mt-1">
                  {item.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
