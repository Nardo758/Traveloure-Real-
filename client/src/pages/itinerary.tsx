import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  Star,
  Heart,
  Share2,
  Download,
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
  Users,
  CheckCircle2,
  Gauge,
  Timer,
  Loader2,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Headphones,
  CreditCard,
  AlertCircle,
  Eye,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { TwelveGoTransport } from "@/components/TwelveGoTransport";
import { useTrip, useGeneratedItinerary } from "@/hooks/use-trips";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { ItineraryCard, type ItineraryCardData, type ActivityDiff, type TransportDiff } from "@/components/itinerary/ItineraryCard";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import { cn } from "@/lib/utils";

// Booking types: 'inApp' = API-based (book on our site), 'partner' = affiliate links (external)
type BookingType = 'inApp' | 'partner';
type BookingStatus = 'pending' | 'booked' | 'confirmed';

function getBookingType(actType: string): BookingType {
  const partnerTypes = ['transport', 'event', 'concert', 'show', 'entertainment'];
  if (partnerTypes.includes(actType.toLowerCase())) return 'partner';
  return 'inApp';
}

function getPartnerName(actType: string): string | undefined {
  if (actType.toLowerCase() === 'transport') return '12Go';
  if (['event', 'concert', 'show', 'entertainment'].includes(actType.toLowerCase())) return 'Fever';
  return undefined;
}

function getPartnerUrl(partnerName: string | undefined, destination?: string): string {
  if (partnerName === '12Go') {
    const dest = destination?.split(',')[0]?.toLowerCase().replace(/\s+/g, '-') || 'paris';
    return `https://12go.co/en/travel/${dest}?affiliate_id=13805109`;
  }
  if (partnerName === 'Fever') {
    return 'https://feverup.com/';
  }
  return '#';
}

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
          bookingType: "partner" as BookingType, // 12Go affiliate
          bookingStatus: "confirmed" as BookingStatus,
          partnerName: "12Go",
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
          bookingType: "inApp" as BookingType, // Amadeus API
          bookingStatus: "confirmed" as BookingStatus,
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
          bookingType: "inApp" as BookingType, // Viator API
          bookingStatus: "confirmed" as BookingStatus,
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


function synthesizeTransportLegs(activities: any[]): InlineTransportLegData[] {
  if (!activities || activities.length < 2) return [];
  const legs: InlineTransportLegData[] = [];
  for (let i = 0; i < activities.length - 1; i++) {
    const from = activities[i];
    const to = activities[i + 1];
    legs.push({
      id: `synth-leg-${from.id}-${to.id}`,
      legOrder: i + 1,
      fromName: from.location || from.title || from.name || `Stop ${i + 1}`,
      toName: to.location || to.title || to.name || `Stop ${i + 2}`,
      recommendedMode: "walking",
      userSelectedMode: null,
      distanceDisplay: "~1 km",
      estimatedDurationMinutes: 15,
      estimatedCostUsd: null,
      alternativeModes: [
        { mode: "taxi", durationMinutes: 5, costUsd: 8, energyCost: 30, reason: "Fastest option" },
        { mode: "transit", durationMinutes: 10, costUsd: 2, energyCost: 10, reason: "Affordable" },
        { mode: "rideshare", durationMinutes: 7, costUsd: 6, energyCost: 25, reason: "Convenient pickup" },
      ],
      fromLat: from.lat || null,
      fromLng: from.lng || null,
      toLat: to.lat || null,
      toLng: to.lng || null,
    });
  }
  return legs;
}

function buildItineraryCardData(itinerary: any, tripData: any, realLegsMap?: Record<number, InlineTransportLegData[]>): ItineraryCardData {
  return {
    id: itinerary.id || "local",
    name: itinerary.title || "My Trip",
    destination: itinerary.destination,
    dateRange: {
      start: itinerary.startDate ? itinerary.startDate.toISOString() : null,
      end: itinerary.endDate ? itinerary.endDate.toISOString() : null,
    },
    totalCost: itinerary.days
      .flatMap((d: any) => d.activities)
      .reduce((sum: number, a: any) => sum + (a.price || 0), 0),
    days: itinerary.days.map((day: any) => {
      const activities = (day.activities || []).map((act: any) => ({
        id: act.id,
        name: act.title || act.name || "Activity",
        startTime: act.time ? `1970-01-01T${act.time}:00` : act.startTime || null,
        endTime: act.endTime || null,
        lat: act.lat || null,
        lng: act.lng || null,
        category: act.type || act.category || null,
        cost: act.price || act.cost || 0,
        description: act.notes || act.description || null,
        location: act.location || null,
        duration: act.durationMinutes || null,
        booked: act.booked || false,
        bookingStatus: act.bookingStatus || (act.booked ? "confirmed" : undefined),
        bookingType: act.bookingType || getBookingType(act.type),
        partnerName: act.partnerName || getPartnerName(act.type),
      }));
      const dayNum = day.day || day.dayNumber || 1;
      const realLegs = realLegsMap?.[dayNum];
      const existingLegs = (day.transportLegs || []) as InlineTransportLegData[];
      const transportLegs = realLegs?.length
        ? realLegs
        : existingLegs.length > 0
          ? existingLegs
          : synthesizeTransportLegs(day.activities || []);
      return {
        dayNumber: dayNum,
        date: day.date ? (day.date instanceof Date ? day.date.toISOString() : day.date) : undefined,
        title: day.title || `Day ${day.day || 1}`,
        activities,
        transportLegs,
      };
    }),
  };
}

export default function ItineraryPage() {
  const [, params] = useRoute("/itinerary/:id");
  const tripId = params?.id || "1";
  const { data: tripData, isLoading: tripLoading } = useTrip(tripId);
  const { data: generatedItinerary, isLoading: itineraryLoading } = useGeneratedItinerary(tripId);
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(1);
  const [isSaved, setIsSaved] = useState(false);
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [rejectedDiffIds, setRejectedDiffIds] = useState<Set<string>>(new Set());
  const [expertNotes, setExpertNotes] = useState("");
  const [isRequestingExpert, setIsRequestingExpert] = useState(false);
  const [realLegsMap, setRealLegsMap] = useState<Record<number, InlineTransportLegData[]>>({});
  const { toast } = useToast();

  const activateTransportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/activate-transport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ variantId: string; legs: Array<InlineTransportLegData & { dayNumber: number }> }>;
    },
    onSuccess: (data) => {
      if (!data?.legs?.length) return;
      const byDay: Record<number, InlineTransportLegData[]> = {};
      for (const leg of data.legs) {
        const d = leg.dayNumber;
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(leg);
      }
      setRealLegsMap(byDay);
    },
  });

  useEffect(() => {
    if (tripId === "1") return;
    if (!generatedItinerary?.itineraryData) return;
    const data: any = generatedItinerary.itineraryData;
    const daysData: any[] = data?.days || data?.dailyItinerary || [];
    const hasCoords = daysData.some((d: any) =>
      (d.activities || []).some((a: any) => a.lat && a.lng)
    );
    if (hasCoords) {
      activateTransportMutation.mutate();
    }
  }, [tripId, generatedItinerary?.itineraryData]);

  const { data: shareData } = useQuery<{
    shareToken?: string;
    variantId?: string;
    expertStatus?: string;
    expertNotes?: string | null;
    expertDiff?: { activityDiffs?: Record<string, ActivityDiff>; transportDiffs?: Record<string, TransportDiff>; submittedAt?: string } | null;
  }>({
    queryKey: ["/api/trips", tripId, "share-info"],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/share-info`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!tripId && tripId !== "1",
  });

  const reviewActivityDiffs = shareData?.expertDiff?.activityDiffs ?? {};
  const reviewTransportDiffs = shareData?.expertDiff?.transportDiffs ?? {};

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ action, rejectedIds }: { action: "accept" | "reject"; rejectedIds?: string[] }) => {
      const token = shareData?.shareToken;
      if (!token) throw new Error("No share token");
      const res = await fetch(`/api/expert-review/${token}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectedDiffIds: rejectedIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to acknowledge");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "share-info"] });
      setShowDiffReview(false);
      setRejectedDiffIds(new Set());
      toast({
        title: variables.action === "accept" ? "Edits accepted" : "Edits rejected",
        description: variables.action === "accept"
          ? "The expert's suggestions have been applied."
          : "The expert's suggestions have been dismissed.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = tripLoading || itineraryLoading;

  // Handle expert booking request
  const handleExpertBookingRequest = async () => {
    setIsRequestingExpert(true);
    try {
      const response = await fetch('/api/expert-booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tripId, notes: expertNotes }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit request');
      }
      
      setShowExpertDialog(false);
      setExpertNotes("");
      toast({
        title: "Request Sent",
        description: "An expert will review your itinerary and handle all bookings. You'll be notified when complete.",
      });
    } catch (error) {
      toast({
        title: "Request Failed",
        description: "Unable to submit your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingExpert(false);
    }
  };

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
      transportLegs: day.transportLegs || [],
      activities: (day.activities || []).map((activity: any, actIdx: number) => {
        const actType = activity.type || "activity";
        return {
          id: activity.id || `a${index}-${actIdx}`,
          time: activity.time || activity.startTime || "09:00",
          title: activity.name || activity.title || "Activity",
          type: actType,
          icon: iconMap[actType.toLowerCase()] || Camera,
          location: activity.location || activity.venue || "",
          lat: activity.lat ?? null,
          lng: activity.lng ?? null,
          duration: activity.duration || "1h",
          notes: activity.description || activity.notes || "",
          booked: activity.bookingRequired === false || activity.booked || false,
          bookingType: activity.bookingType || getBookingType(actType),
          bookingStatus: activity.bookingStatus || (activity.booked ? 'confirmed' : 'pending') as BookingStatus,
          partnerName: activity.partnerName || getPartnerName(actType),
          price: activity.estimatedCost || activity.cost || activity.price || 0,
        };
      }),
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
          <div className="lg:w-72 flex-shrink-0">
            <Card className="bg-white dark:bg-gray-800 lg:sticky lg:top-4 z-10">
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
            {shareData?.expertStatus === "review_sent" && (
              <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" data-testid="expert-review-banner">
                <div className="flex items-start gap-3">
                  <Eye className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-blue-800 dark:text-blue-200">Expert has sent edits for review</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                      {shareData.expertDiff?.submittedAt && `Sent ${new Date(shareData.expertDiff.submittedAt).toLocaleDateString()}.`}
                      {(() => {
                        const total = Object.keys(shareData.expertDiff?.activityDiffs || {}).length + Object.keys(shareData.expertDiff?.transportDiffs || {}).length;
                        return total > 0 ? ` ${total} suggestion${total !== 1 ? "s" : ""} awaiting your review.` : "";
                      })()}
                    </p>
                    {shareData.expertNotes && (
                      <p className="text-sm text-blue-800 dark:text-blue-200 mt-2 italic">
                        "{shareData.expertNotes}"
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => setShowDiffReview(true)}
                      className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      data-testid="button-review-expert-edits"
                    >
                      <Eye className="h-4 w-4" />
                      Review Edits
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: [] })}
                      disabled={acknowledgeMutation.isPending}
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-accept-expert-edits"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Accept All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => acknowledgeMutation.mutate({ action: "reject", rejectedIds: [] })}
                      disabled={acknowledgeMutation.isPending}
                      className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                      data-testid="button-reject-expert-edits"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject All
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {shareData?.expertStatus === "acknowledged" && (
              <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="expert-accepted-banner">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-200">Expert edits accepted.</p>
                </div>
              </div>
            )}

            <ItineraryCard
              data={buildItineraryCardData(itinerary, tripData, Object.keys(realLegsMap).length ? realLegsMap : undefined)}
              isOwner={true}
              showShareButton={!!shareData?.shareToken && !!shareData?.variantId}
              shareToken={shareData?.shareToken}
              variantId={shareData?.variantId}
              expertDiff={shareData?.expertDiff ?? null}
              forcedMapDays={[]}
              focusDay={selectedDay}
            />

            {/* Per-activity booking panel */}
            {(() => {
              const currentDay = itinerary.days.find((d: any) => d.day === selectedDay);
              if (!currentDay) return null;
              const unbookedWithPrice = currentDay.activities.filter((a: any) => !a.booked && (a.price || 0) > 0);
              if (unbookedWithPrice.length === 0) return null;
              return (
                <Card className="bg-white dark:bg-gray-800 mt-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-[#6B7280]">
                      Book Activities — Day {selectedDay}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {unbookedWithPrice.map((activity: any) => {
                      const bType = activity.bookingType || getBookingType(activity.type);
                      const partnerName = activity.partnerName || getPartnerName(activity.type);
                      return (
                        <div key={activity.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#111827] dark:text-white truncate">{activity.title}</p>
                            <p className="text-xs text-[#6B7280]">{activity.time} • {activity.location}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-sm text-[#111827] dark:text-white">${activity.price}</span>
                            {bType === 'inApp' ? (
                              <Button size="sm" className="bg-[#FF385C] hover:bg-[#E23350] text-white" data-testid={`button-book-${activity.id}`}>
                                <CreditCard className="w-3 h-3 mr-1" />
                                Book
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                data-testid={`button-book-partner-${activity.id}`}
                                onClick={() => window.open(getPartnerUrl(partnerName, itinerary.destination), '_blank')}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                {partnerName || 'Partner'}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })()}


          </div>

          {/* Right Side Panel — Booking */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="lg:sticky lg:top-4 space-y-4">

              {/* Expert Booking Option */}
              <Card className="bg-gradient-to-b from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/40 flex-shrink-0">
                      <UserCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#111827] dark:text-white text-sm flex items-center gap-1.5 flex-wrap">
                        Let an Expert Book Everything
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-xs">Recommended</Badge>
                      </h4>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        Our travel experts handle all bookings — on-site and partner.
                      </p>
                    </div>
                  </div>
                  <Button 
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white" 
                    onClick={() => setShowExpertDialog(true)}
                    data-testid="button-expert-booking"
                  >
                    <Headphones className="w-4 h-4 mr-2" />
                    Request Expert Booking
                  </Button>
                </CardContent>
              </Card>

              {/* Booking Summary Card */}
              <Card className="bg-white dark:bg-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#FF385C]" />
                    Booking Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {(() => {
                    const allActivities = itinerary.days.flatMap((d: any) => d.activities);
                    const inAppBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'inApp' && !a.booked);
                    const partnerBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'partner' && !a.booked);
                    const inAppTotal = inAppBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                    const partnerTotal = partnerBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                    return (
                      <>
                        <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="text-xs font-medium">Book on Traveloure</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#6B7280]">{inAppBookings.length} items</p>
                            <p className="text-sm font-semibold text-emerald-600">${inAppTotal}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-medium">Book via Partners</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#6B7280]">{partnerBookings.length} items</p>
                            <p className="text-sm font-semibold text-blue-600">${partnerTotal}</p>
                          </div>
                        </div>
                        <div className="border-t pt-2 mt-1 flex items-center justify-between">
                          <span className="text-sm font-semibold text-[#111827] dark:text-white">Total Pending</span>
                          <span className="text-base font-bold text-[#FF385C]">${inAppTotal + partnerTotal}</span>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

            </div>
          </div>

        </div>
      </div>

      {/* Expert Booking Dialog */}
      <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              Request Expert Booking Assistance
            </DialogTitle>
            <DialogDescription>
              Let our travel experts handle all bookings for your itinerary. They'll coordinate both on-site and partner bookings, ensuring everything is confirmed before your trip.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
              <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">What's included:</h4>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  All hotel and accommodation bookings
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Tour and activity reservations
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Ground transportation (trains, buses, ferries)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Event and show tickets
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Restaurant reservations
                </li>
              </ul>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Special requests or notes (optional)</label>
              <Textarea
                placeholder="Any preferences, dietary requirements, accessibility needs, or special occasions..."
                value={expertNotes}
                onChange={(e) => setExpertNotes(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-expert-notes"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-[#6B7280] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#6B7280]">
                An expert will contact you within 24 hours to confirm your itinerary and payment details. You'll only be charged once all bookings are confirmed.
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowExpertDialog(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleExpertBookingRequest}
              disabled={isRequestingExpert}
              data-testid="button-confirm-expert-booking"
            >
              {isRequestingExpert ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Headphones className="w-4 h-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expert Diff Review Dialog — mirrors itinerary-view.tsx pattern */}
      <Dialog open={showDiffReview} onOpenChange={(open) => { setShowDiffReview(open); if (!open) setRejectedDiffIds(new Set()); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expert Suggestions</DialogTitle>
            <DialogDescription>
              Review the changes your expert proposed. Accept all to apply them, or reject to dismiss.
            </DialogDescription>
          </DialogHeader>

          {shareData?.expertNotes && (
            <div className="p-3 rounded-lg bg-muted border mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Expert notes:</p>
              <p className="text-sm italic">"{shareData.expertNotes}"</p>
            </div>
          )}

          {Object.keys(reviewActivityDiffs).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Activity Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewActivityDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-amber-50 dark:bg-amber-950/20"
                    )} data-testid={`diff-activity-${id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {diff.name && diff.name !== diff.originalName && (
                            <div className="text-xs">
                              <span className="font-medium">Name:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalName}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.name}</span>
                            </div>
                          )}
                          {diff.startTime && diff.originalStartTime && diff.startTime !== diff.originalStartTime && (
                            <div className="text-xs">
                              <span className="font-medium">Time:</span>{" "}
                              <span className="line-through text-muted-foreground">{diff.originalStartTime}</span>
                              {" → "}
                              <span className="font-medium text-green-700 dark:text-green-400">{diff.startTime}</span>
                            </div>
                          )}
                          {diff.note && (
                            <div className="text-xs italic text-amber-700 dark:text-amber-300">
                              Note: "{diff.note}"
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-activity-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(reviewTransportDiffs).length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium mb-2">Transport Changes</h4>
              <div className="space-y-2">
                {Object.entries(reviewTransportDiffs).map(([id, diff]) => {
                  const isRejected = rejectedDiffIds.has(id);
                  return (
                    <div key={id} className={cn(
                      "p-3 rounded-lg border transition-opacity",
                      isRejected
                        ? "opacity-50 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                        : "bg-blue-50 dark:bg-blue-950/20"
                    )} data-testid={`diff-transport-${id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium">Leg {diff.legOrder}:</span>{" "}
                          <span className="line-through text-muted-foreground">{diff.originalMode}</span>
                          {" → "}
                          <span className="font-medium text-green-700 dark:text-green-400">{diff.newMode}</span>
                        </div>
                        <button
                          onClick={() => setRejectedDiffIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          className={cn(
                            "shrink-0 text-xs px-2 py-0.5 rounded border transition-colors",
                            isRejected
                              ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                              : "border-muted text-muted-foreground hover:border-red-300 hover:text-red-600"
                          )}
                          data-testid={`button-toggle-reject-transport-${id}`}
                        >
                          {isRejected ? "Undo reject" : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(reviewActivityDiffs).length === 0 && Object.keys(reviewTransportDiffs).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No detailed diff available.</p>
          )}

          {rejectedDiffIds.size > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {rejectedDiffIds.size} change{rejectedDiffIds.size !== 1 ? "s" : ""} will be rejected. The rest will be accepted.
            </p>
          )}

          <DialogFooter className="mt-4 flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => acknowledgeMutation.mutate({ action: "reject", rejectedIds: [] })}
              disabled={acknowledgeMutation.isPending}
              className="border-red-300 text-red-700 hover:bg-red-50"
              data-testid="button-dialog-reject-edits"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject All
            </Button>
            <Button
              onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: Array.from(rejectedDiffIds) })}
              disabled={acknowledgeMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-dialog-accept-edits"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {rejectedDiffIds.size > 0 ? `Accept ${Object.keys(reviewActivityDiffs).length + Object.keys(reviewTransportDiffs).length - rejectedDiffIds.size} Changes` : "Accept All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
