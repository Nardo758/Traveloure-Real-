import { useState } from "react";
import { useRoute, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  DollarSign,
  Star,
  Heart,
  Share2,
  Download,
  Edit,
  ChevronRight,
  Utensils,
  Camera,
  Hotel,
  Plane,
  Car,
  Coffee,
  Sunset,
  Mountain,
  ShoppingBag,
  Sparkles,
  MessageSquare,
  Users,
  CheckCircle2,
  CircleDot,
  Gauge,
  Timer,
  Loader2,
} from "lucide-react";
import { TwelveGoTransport } from "@/components/TwelveGoTransport";
import { useTrip, useGeneratedItinerary } from "@/hooks/use-trips";
import { format, addDays } from "date-fns";

const itineraryData = {
  id: "1",
  title: "Romantic Paris Getaway",
  destination: "Paris, France",
  startDate: new Date("2026-03-15"),
  endDate: new Date("2026-03-22"),
  travelers: 2,
  budget: 5000,
  status: "confirmed",
  coverImage: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200",
  days: [
    {
      day: 1,
      date: new Date("2026-03-15"),
      title: "Arrival & Eiffel Tower",
      activities: [
        {
          id: "a1",
          time: "14:00",
          title: "Airport Arrival",
          type: "transport",
          icon: Plane,
          location: "Charles de Gaulle Airport",
          duration: "1h",
          notes: "Private transfer to hotel",
          booked: true,
          price: 85,
        },
        {
          id: "a2",
          time: "16:00",
          title: "Hotel Check-in",
          type: "accommodation",
          icon: Hotel,
          location: "Le Marais Boutique Hotel",
          duration: "30min",
          notes: "Suite with Eiffel Tower view",
          booked: true,
          price: 0,
        },
        {
          id: "a3",
          time: "18:00",
          title: "Eiffel Tower Visit",
          type: "attraction",
          icon: Camera,
          location: "Champ de Mars",
          duration: "2h",
          notes: "Skip-the-line tickets included",
          booked: true,
          price: 45,
        },
        {
          id: "a4",
          time: "20:30",
          title: "Dinner at Le Jules Verne",
          type: "dining",
          icon: Utensils,
          location: "Eiffel Tower, 2nd Floor",
          duration: "2h",
          notes: "Michelin-starred restaurant",
          booked: true,
          price: 350,
        },
      ],
    },
    {
      day: 2,
      date: new Date("2026-03-16"),
      title: "Art & Culture",
      activities: [
        {
          id: "b1",
          time: "09:00",
          title: "Breakfast at Cafe de Flore",
          type: "dining",
          icon: Coffee,
          location: "Saint-Germain-des-Pres",
          duration: "1h",
          notes: "Famous literary cafe",
          booked: false,
          price: 40,
        },
        {
          id: "b2",
          time: "10:30",
          title: "Louvre Museum",
          type: "attraction",
          icon: Camera,
          location: "Rue de Rivoli",
          duration: "4h",
          notes: "Guided tour with art historian",
          booked: true,
          price: 120,
        },
        {
          id: "b3",
          time: "15:00",
          title: "Seine River Cruise",
          type: "activity",
          icon: Sunset,
          location: "Pont Neuf",
          duration: "1.5h",
          notes: "Champagne cruise",
          booked: true,
          price: 85,
        },
        {
          id: "b4",
          time: "19:00",
          title: "Dinner in Montmartre",
          type: "dining",
          icon: Utensils,
          location: "Le Consulat",
          duration: "2h",
          notes: "Traditional French cuisine",
          booked: false,
          price: 120,
        },
      ],
    },
    {
      day: 3,
      date: new Date("2026-03-17"),
      title: "Palace & Gardens",
      activities: [
        {
          id: "c1",
          time: "08:30",
          title: "Day Trip to Versailles",
          type: "transport",
          icon: Car,
          location: "Hotel Pickup",
          duration: "45min",
          notes: "Private car service",
          booked: true,
          price: 150,
        },
        {
          id: "c2",
          time: "10:00",
          title: "Palace of Versailles",
          type: "attraction",
          icon: Camera,
          location: "Versailles",
          duration: "4h",
          notes: "Full palace and gardens tour",
          booked: true,
          price: 95,
        },
        {
          id: "c3",
          time: "14:30",
          title: "Lunch at Ore",
          type: "dining",
          icon: Utensils,
          location: "Palace of Versailles",
          duration: "1.5h",
          notes: "Ducasse restaurant in the palace",
          booked: true,
          price: 180,
        },
        {
          id: "c4",
          time: "16:30",
          title: "Gardens Exploration",
          type: "activity",
          icon: Mountain,
          location: "Versailles Gardens",
          duration: "2h",
          notes: "Marie Antoinette's Estate",
          booked: false,
          price: 0,
        },
      ],
    },
    {
      day: 4,
      date: new Date("2026-03-18"),
      title: "Shopping & Nightlife",
      activities: [
        {
          id: "d1",
          time: "10:00",
          title: "Champs-Elysees Shopping",
          type: "shopping",
          icon: ShoppingBag,
          location: "Avenue des Champs-Elysees",
          duration: "3h",
          notes: "Personal shopping assistant available",
          booked: false,
          price: 0,
        },
        {
          id: "d2",
          time: "14:00",
          title: "Lunch at L'Avenue",
          type: "dining",
          icon: Utensils,
          location: "Avenue Montaigne",
          duration: "1.5h",
          notes: "Celebrity hotspot",
          booked: true,
          price: 150,
        },
        {
          id: "d3",
          time: "16:00",
          title: "Galeries Lafayette",
          type: "shopping",
          icon: ShoppingBag,
          location: "Boulevard Haussmann",
          duration: "2h",
          notes: "Free rooftop access",
          booked: false,
          price: 0,
        },
        {
          id: "d4",
          time: "20:00",
          title: "Moulin Rouge Show",
          type: "entertainment",
          icon: Sparkles,
          location: "Place Blanche",
          duration: "3h",
          notes: "Dinner and show package",
          booked: true,
          price: 400,
        },
      ],
    },
  ],
};

const typeColors: Record<string, string> = {
  transport: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  accommodation: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  attraction: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  dining: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  activity: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  shopping: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  entertainment: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export default function ItineraryPage() {
  const [, params] = useRoute("/itinerary/:id");
  const tripId = params?.id || "1";
  const { data: tripData, isLoading: tripLoading } = useTrip(tripId);
  const { data: generatedItinerary, isLoading: itineraryLoading } = useGeneratedItinerary(tripId);
  const [selectedDay, setSelectedDay] = useState(1);
  const [isSaved, setIsSaved] = useState(false);

  const isLoading = tripLoading || itineraryLoading;

  // Transform generated itinerary data to match the expected format
  const transformGeneratedDays = (itineraryData: any) => {
    // Check for both 'days' and 'dailyItinerary' shapes from AI generation
    const daysData = itineraryData?.days || itineraryData?.dailyItinerary;
    if (!daysData) return null;
    
    const iconMap: Record<string, any> = {
      transport: Plane,
      accommodation: Hotel,
      attraction: Camera,
      dining: Utensils,
      activity: Mountain,
      shopping: ShoppingBag,
      entertainment: Sparkles,
      breakfast: Coffee,
      lunch: Utensils,
      dinner: Utensils,
    };
    
    return daysData.map((day: any, index: number) => ({
      day: day.day || day.dayNumber || index + 1,
      date: tripData ? addDays(new Date(tripData.startDate), index) : addDays(new Date(), index),
      title: day.title || day.theme || `Day ${index + 1}`,
      activities: (day.activities || []).map((activity: any, actIdx: number) => ({
        id: `a${index}-${actIdx}`,
        time: activity.time || activity.startTime || "09:00",
        title: activity.name || activity.title || "Activity",
        type: activity.type || "activity",
        icon: iconMap[activity.type?.toLowerCase()] || Camera,
        location: activity.location || activity.venue || "",
        duration: activity.duration || "1h",
        notes: activity.description || activity.notes || "",
        booked: activity.bookingRequired === false || activity.booked || false,
        price: activity.estimatedCost || activity.cost || activity.price || 0,
      })),
    }));
  };

  // Use generated itinerary data if available, otherwise fall back to mock data
  const generatedDays = generatedItinerary?.itineraryData 
    ? transformGeneratedDays(generatedItinerary.itineraryData)
    : null;

  const itinerary = tripData ? {
    ...itineraryData,
    id: tripData.id,
    title: tripData.title || itineraryData.title,
    destination: tripData.destination,
    startDate: new Date(tripData.startDate),
    endDate: new Date(tripData.endDate),
    travelers: tripData.numberOfTravelers || 1,
    budget: Number(tripData.budget) || itineraryData.budget,
    status: tripData.status || "draft",
    days: generatedDays || itineraryData.days,
  } : itineraryData;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF385C]" />
      </div>
    );
  }
  const currentDayData = itinerary.days.find(d => d.day === selectedDay);
  const totalBooked = itinerary.days.flatMap(d => d.activities).filter(a => a.booked).length;
  const totalActivities = itinerary.days.flatMap(d => d.activities).length;
  const totalCost = itinerary.days.flatMap(d => d.activities).reduce((sum, a) => sum + a.price, 0);

  // Calculate total travel time from activity durations
  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+(?:\.\d+)?)\s*(h|hour|min|m)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'h' || unit === 'hour') return value * 60;
    return value;
  };
  
  const totalTravelMinutes = itinerary.days
    .flatMap(d => d.activities)
    .filter(a => a.type === 'transport')
    .reduce((sum, a) => sum + parseDuration(a.duration), 0);
  
  const totalActivityMinutes = itinerary.days
    .flatMap(d => d.activities)
    .reduce((sum, a) => sum + parseDuration(a.duration), 0);
  
  const formatTravelTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  // Calculate efficiency score (0-100)
  // Based on: booking rate, activities per day, cost efficiency, transport optimization
  const bookingRate = totalActivities > 0 ? totalBooked / totalActivities : 0;
  const activitiesPerDay = itinerary.days.length > 0 ? totalActivities / itinerary.days.length : 0;
  const transportRatio = totalActivityMinutes > 0 ? totalTravelMinutes / totalActivityMinutes : 0;
  const costPerActivity = totalActivities > 0 ? totalCost / totalActivities : 0;
  
  // Efficiency factors (weighted average)
  const efficiencyScore = totalActivities > 0 ? Math.round(
    (bookingRate * 40) + // 40% weight on booking completion
    (Math.min(activitiesPerDay / 5, 1) * 30) + // 30% on activities density (optimal ~5/day)
    ((1 - Math.min(transportRatio, 0.3) / 0.3) * 20) + // 20% on minimizing transport time
    (Math.min(200 / Math.max(costPerActivity, 1), 1) * 10) // 10% on value for money
  ) : 0;

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-gray-900">
      <div
        className="relative h-64 md:h-80 bg-cover bg-center"
        style={{ backgroundImage: `url(${itinerary.coverImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        <div className="absolute inset-0 flex flex-col justify-between p-4 md:p-6">
          <div className="flex items-center justify-between">
            <Link href="/my-trips">
              <Button variant="ghost" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Trips
              </Button>
            </Link>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsSaved(!isSaved)}
                data-testid="button-save"
              >
                <Heart className={`w-5 h-5 ${isSaved ? "fill-[#FF385C] text-[#FF385C]" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-share">
                <Share2 className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-download">
                <Download className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div>
            <Badge className="bg-green-500 text-white mb-3" data-testid="badge-status">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {itinerary.status}
            </Badge>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-2" data-testid="text-title">
              {itinerary.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {itinerary.destination}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(itinerary.startDate, "MMM d")} - {format(itinerary.endDate, "MMM d, yyyy")}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {itinerary.travelers} travelers
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: "Total Days", value: itinerary.days.length, icon: Calendar },
            { label: "Activities", value: totalActivities, icon: Star },
            { label: "Booked", value: `${totalBooked}/${totalActivities}`, icon: CheckCircle2 },
            { label: "Total Cost", value: `$${totalCost.toLocaleString()}`, icon: DollarSign },
            { label: "Travel Time", value: formatTravelTime(totalTravelMinutes), icon: Timer },
            { label: "Efficiency", value: `${efficiencyScore}%`, icon: Gauge, highlight: efficiencyScore >= 70 },
          ].map((stat, index) => (
            <Card key={index} className="bg-white dark:bg-gray-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  stat.highlight 
                    ? "bg-green-100 dark:bg-green-900/30" 
                    : "bg-[#FFE3E8] dark:bg-[#FF385C]/20"
                }`}>
                  <stat.icon className={`w-5 h-5 ${
                    stat.highlight 
                      ? "text-green-600 dark:text-green-400" 
                      : "text-[#FF385C]"
                  }`} />
                </div>
                <div>
                  <p className="text-xs text-[#6B7280]">{stat.label}</p>
                  <p className={`text-lg font-bold ${
                    stat.highlight 
                      ? "text-green-600 dark:text-green-400" 
                      : "text-[#111827] dark:text-white"
                  }`} data-testid={`text-stat-${stat.label.toLowerCase().replace(' ', '-')}`}>
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6 pb-12">
          <div className="lg:w-64 flex-shrink-0">
            <Card className="bg-white dark:bg-gray-800 sticky top-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[#6B7280]">Trip Days</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ScrollArea className="h-auto lg:h-[400px]">
                  <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
                    {itinerary.days.map((day) => (
                      <button
                        key={day.day}
                        onClick={() => setSelectedDay(day.day)}
                        className={`flex-shrink-0 w-full text-left p-3 rounded-lg transition-all ${
                          selectedDay === day.day
                            ? "bg-[#FF385C] text-white"
                            : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                        }`}
                        data-testid={`button-day-${day.day}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-xs ${selectedDay === day.day ? "text-white/80" : "text-[#6B7280]"}`}>
                              Day {day.day}
                            </p>
                            <p className={`font-medium text-sm ${selectedDay === day.day ? "text-white" : "text-[#111827] dark:text-white"}`}>
                              {format(day.date, "EEE, MMM d")}
                            </p>
                          </div>
                          <Badge variant="secondary" className={`text-xs ${selectedDay === day.day ? "bg-white/20 text-white" : ""}`}>
                            {day.activities.length}
                          </Badge>
                        </div>
                        <p className={`text-xs mt-1 truncate ${selectedDay === day.day ? "text-white/90" : "text-[#6B7280]"}`}>
                          {day.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            
            <TwelveGoTransport
              destination={itinerary.destination.split(',')[0]}
              departureDate={itinerary.startDate.toISOString()}
              passengers={itinerary.travelers}
              variant="full"
              className="mt-4"
            />
          </div>

          <div className="flex-1">
            <AnimatePresence mode="wait">
              {currentDayData && (
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-white dark:bg-gray-800 mb-4">
                    <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                      <div>
                        <CardTitle className="text-xl text-[#111827] dark:text-white">
                          Day {currentDayData.day}: {currentDayData.title}
                        </CardTitle>
                        <p className="text-sm text-[#6B7280]">
                          {format(currentDayData.date, "EEEE, MMMM d, yyyy")}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-edit-day">
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Day
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="relative">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
                        <div className="space-y-4">
                          {currentDayData.activities.map((activity, idx) => (
                            <motion.div
                              key={activity.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="relative pl-10"
                            >
                              <div className={`absolute left-2 top-4 w-5 h-5 rounded-full flex items-center justify-center ${
                                activity.booked ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                              }`}>
                                {activity.booked ? (
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                ) : (
                                  <CircleDot className="w-3 h-3 text-gray-500" />
                                )}
                              </div>
                              <Card className="border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1">
                                      <div className={`p-2 rounded-lg ${typeColors[activity.type]}`}>
                                        <activity.icon className="w-5 h-5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium text-[#6B7280]">
                                            {activity.time}
                                          </span>
                                          <Badge variant="outline" className="text-xs">
                                            {activity.duration}
                                          </Badge>
                                          {activity.booked && (
                                            <Badge className="bg-green-100 text-green-700 text-xs">
                                              Booked
                                            </Badge>
                                          )}
                                        </div>
                                        <h4 className="font-semibold text-[#111827] dark:text-white mt-1" data-testid={`text-activity-${activity.id}`}>
                                          {activity.title}
                                        </h4>
                                        <p className="text-sm text-[#6B7280] flex items-center gap-1 mt-1">
                                          <MapPin className="w-3 h-3" />
                                          {activity.location}
                                        </p>
                                        {activity.notes && (
                                          <p className="text-sm text-[#6B7280] mt-1 italic">
                                            {activity.notes}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      {activity.price > 0 && (
                                        <p className="font-semibold text-[#111827] dark:text-white">
                                          ${activity.price}
                                        </p>
                                      )}
                                      {!activity.booked && activity.price > 0 && (
                                        <Button size="sm" className="mt-2 bg-[#FF385C] hover:bg-[#E23350]" data-testid={`button-book-${activity.id}`}>
                                          Book Now
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <Card className="bg-white dark:bg-gray-800">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-[#FFE3E8] dark:bg-[#FF385C]/20">
                      <MessageSquare className="w-6 h-6 text-[#FF385C]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#111827] dark:text-white">Need help with your trip?</h4>
                      <p className="text-sm text-[#6B7280]">Chat with our AI assistant or connect with an expert</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" data-testid="button-ai-help">
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI Assistant
                    </Button>
                    <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-expert-help">
                      Talk to Expert
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
