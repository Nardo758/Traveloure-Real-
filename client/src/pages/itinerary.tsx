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
  Clock,
  Footprints,
  TrainFront,
  Bus,
  Ship,
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
import { format, addDays, differenceInDays } from "date-fns";
import type { ActivityDiff, TransportDiff } from "@/components/itinerary/ItineraryCard";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import { cn } from "@/lib/utils";
import { getDestinationPhotoUrl } from "@/components/plancard/plancard-types";

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

const CATEGORY_PILLS: Record<string, { bg: string; fg: string }> = {
  dining: { bg: "bg-amber-100 dark:bg-amber-900/30", fg: "text-amber-800 dark:text-amber-300" },
  attraction: { bg: "bg-blue-100 dark:bg-blue-900/30", fg: "text-blue-800 dark:text-blue-300" },
  transport: { bg: "bg-green-100 dark:bg-green-900/30", fg: "text-green-800 dark:text-green-300" },
  activity: { bg: "bg-purple-100 dark:bg-purple-900/30", fg: "text-purple-800 dark:text-purple-300" },
  shopping: { bg: "bg-pink-100 dark:bg-pink-900/30", fg: "text-pink-800 dark:text-pink-300" },
  accommodation: { bg: "bg-indigo-100 dark:bg-indigo-900/30", fg: "text-indigo-800 dark:text-indigo-300" },
  entertainment: { bg: "bg-rose-100 dark:bg-rose-900/30", fg: "text-rose-800 dark:text-rose-300" },
};

const STATUS_DOT: Record<string, string> = {
  confirmed: "bg-green-500",
  booked: "bg-green-500",
  pending: "bg-yellow-500",
};

const MODE_ICON_MAP: Record<string, typeof Footprints> = {
  walking: Footprints,
  walk: Footprints,
  transit: TrainFront,
  train: TrainFront,
  taxi: Car,
  car: Car,
  rideshare: Car,
  bus: Bus,
  shuttle: Bus,
  ferry: Ship,
};

const MODE_COLORS: Record<string, string> = {
  walking: "#22c55e",
  walk: "#22c55e",
  transit: "#3b82f6",
  train: "#3b82f6",
  taxi: "#f59e0b",
  car: "#f59e0b",
  rideshare: "#f59e0b",
  bus: "#8b5cf6",
  shuttle: "#8b5cf6",
  ferry: "#06b6d4",
};

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
        { id: "a1", time: "14:00", title: "Airport Arrival", type: "transport", icon: Plane, location: "Charles de Gaulle Airport", duration: "1h", notes: "Private transfer to hotel", booked: true, bookingType: "partner" as BookingType, bookingStatus: "confirmed" as BookingStatus, partnerName: "12Go", price: 85 },
        { id: "a2", time: "16:00", title: "Hotel Check-in", type: "accommodation", icon: Hotel, location: "Le Marais Boutique Hotel", duration: "30min", notes: "Suite with Eiffel Tower view", booked: true, bookingType: "inApp" as BookingType, bookingStatus: "confirmed" as BookingStatus, price: 0 },
        { id: "a3", time: "18:00", title: "Eiffel Tower Visit", type: "attraction", icon: Camera, location: "Champ de Mars", duration: "2h", notes: "Skip-the-line tickets included", booked: true, bookingType: "inApp" as BookingType, bookingStatus: "confirmed" as BookingStatus, price: 45 },
        { id: "a4", time: "20:30", title: "Dinner at Le Jules Verne", type: "dining", icon: Utensils, location: "Eiffel Tower, 2nd Floor", duration: "2h", notes: "Michelin-starred restaurant", booked: true, price: 350 },
      ],
    },
    {
      day: 2,
      date: new Date("2026-03-16"),
      title: "Art & Culture",
      activities: [
        { id: "b1", time: "09:00", title: "Breakfast at Cafe de Flore", type: "dining", icon: Coffee, location: "Saint-Germain-des-Pres", duration: "1h", notes: "Famous literary cafe", booked: false, price: 40 },
        { id: "b2", time: "10:30", title: "Louvre Museum", type: "attraction", icon: Camera, location: "Rue de Rivoli", duration: "4h", notes: "Guided tour with art historian", booked: true, price: 120 },
        { id: "b3", time: "15:00", title: "Seine River Cruise", type: "activity", icon: Sunset, location: "Pont Neuf", duration: "1.5h", notes: "Champagne cruise", booked: true, price: 85 },
        { id: "b4", time: "19:00", title: "Dinner in Montmartre", type: "dining", icon: Utensils, location: "Le Consulat", duration: "2h", notes: "Traditional French cuisine", booked: false, price: 120 },
      ],
    },
    {
      day: 3,
      date: new Date("2026-03-17"),
      title: "Palace & Gardens",
      activities: [
        { id: "c1", time: "08:30", title: "Day Trip to Versailles", type: "transport", icon: Car, location: "Hotel Pickup", duration: "45min", notes: "Private car service", booked: true, price: 150 },
        { id: "c2", time: "10:00", title: "Palace of Versailles", type: "attraction", icon: Camera, location: "Versailles", duration: "4h", notes: "Full palace and gardens tour", booked: true, price: 95 },
        { id: "c3", time: "14:30", title: "Lunch at Ore", type: "dining", icon: Utensils, location: "Palace of Versailles", duration: "1.5h", notes: "Ducasse restaurant in the palace", booked: true, price: 180 },
        { id: "c4", time: "16:30", title: "Gardens Exploration", type: "activity", icon: Mountain, location: "Versailles Gardens", duration: "2h", notes: "Marie Antoinette's Estate", booked: false, price: 0 },
      ],
    },
    {
      day: 4,
      date: new Date("2026-03-18"),
      title: "Shopping & Nightlife",
      activities: [
        { id: "d1", time: "10:00", title: "Champs-Elysees Shopping", type: "shopping", icon: ShoppingBag, location: "Avenue des Champs-Elysees", duration: "3h", notes: "Personal shopping assistant available", booked: false, price: 0 },
        { id: "d2", time: "14:00", title: "Lunch at L'Avenue", type: "dining", icon: Utensils, location: "Avenue Montaigne", duration: "1.5h", notes: "Celebrity hotspot", booked: true, price: 150 },
        { id: "d3", time: "16:00", title: "Galeries Lafayette", type: "shopping", icon: ShoppingBag, location: "Boulevard Haussmann", duration: "2h", notes: "Free rooftop access", booked: false, price: 0 },
        { id: "d4", time: "20:00", title: "Moulin Rouge Show", type: "entertainment", icon: Sparkles, location: "Place Blanche", duration: "3h", notes: "Dinner and show package", booked: true, price: 400 },
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


export default function ItineraryPage() {
  const [, params] = useRoute("/itinerary/:id");
  const tripId = params?.id || "1";
  const { data: tripData, isLoading: tripLoading } = useTrip(tripId);
  const { data: generatedItinerary, isLoading: itineraryLoading } = useGeneratedItinerary(tripId);
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(1);
  const [section, setSection] = useState<"activities" | "transport">("activities");
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

  const handleExpertBookingRequest = async () => {
    setIsRequestingExpert(true);
    try {
      const response = await fetch('/api/expert-booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tripId, notes: expertNotes }),
      });
      if (!response.ok) throw new Error('Failed to submit request');
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

  const transformGeneratedDays = (itineraryDataRaw: any) => {
    const daysData = itineraryDataRaw?.days || itineraryDataRaw?.dailyItinerary;
    if (!daysData) return null;
    const iconMap: Record<string, any> = {
      transport: Plane, accommodation: Hotel, attraction: Camera, dining: Utensils,
      activity: Mountain, shopping: ShoppingBag, entertainment: Sparkles, breakfast: Coffee,
      lunch: Utensils, dinner: Utensils,
    };
    return daysData.map((day: any, index: number) => ({
      day: day.day || day.dayNumber || index + 1,
      date: tripData ? addDays(new Date(tripData.startDate), index) : addDays(new Date(), index),
      title: day.title || day.theme || `Day ${index + 1}`,
      transportLegs: day.transportLegs || [],
      activities: (day.activities || []).map((act: any, actIdx: number) => {
        const actType = act.type || "activity";
        return {
          id: act.id || `a${index}-${actIdx}`,
          time: act.time || act.startTime || "09:00",
          title: act.name || act.title || "Activity",
          type: actType,
          icon: iconMap[actType.toLowerCase()] || Camera,
          location: act.location || act.venue || "",
          lat: act.lat ?? null,
          lng: act.lng ?? null,
          duration: act.duration || "1h",
          notes: act.description || act.notes || "",
          booked: act.bookingRequired === false || act.booked || false,
          bookingType: act.bookingType || getBookingType(actType),
          bookingStatus: act.bookingStatus || (act.booked ? 'confirmed' : 'pending') as BookingStatus,
          partnerName: act.partnerName || getPartnerName(actType),
          price: act.estimatedCost || act.cost || act.price || 0,
        };
      }),
    }));
  };

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
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="loading-spinner">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const totalBooked = itinerary.days.flatMap((d: any) => d.activities).filter((a: any) => a.booked).length;
  const totalActivities = itinerary.days.flatMap((d: any) => d.activities).length;
  const totalCost = itinerary.days.flatMap((d: any) => d.activities).reduce((sum: number, a: any) => sum + a.price, 0);

  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+(?:\.\d+)?)\s*(h|hour|min|m)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'h' || unit === 'hour') return value * 60;
    return value;
  };

  const totalTravelMinutes = itinerary.days
    .flatMap((d: any) => d.activities)
    .filter((a: any) => a.type === 'transport')
    .reduce((sum: number, a: any) => sum + parseDuration(a.duration), 0);

  const totalActivityMinutes = itinerary.days
    .flatMap((d: any) => d.activities)
    .reduce((sum: number, a: any) => sum + parseDuration(a.duration), 0);

  const formatTravelTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const bookingRate = totalActivities > 0 ? totalBooked / totalActivities : 0;
  const activitiesPerDay = itinerary.days.length > 0 ? totalActivities / itinerary.days.length : 0;
  const transportRatio = totalActivityMinutes > 0 ? totalTravelMinutes / totalActivityMinutes : 0;
  const costPerActivity = totalActivities > 0 ? totalCost / totalActivities : 0;
  const efficiencyScore = totalActivities > 0 ? Math.round(
    (bookingRate * 40) +
    (Math.min(activitiesPerDay / 5, 1) * 30) +
    ((1 - Math.min(transportRatio, 0.3) / 0.3) * 20) +
    (Math.min(200 / Math.max(costPerActivity, 1), 1) * 10)
  ) : 0;

  const currentDay = itinerary.days.find((d: any) => d.day === selectedDay);
  const currentDayActivities = currentDay?.activities || [];
  const currentDayTransportLegs = (() => {
    const dayNum = selectedDay;
    const realLegs = realLegsMap[dayNum];
    if (realLegs?.length) return realLegs;
    const existing = (currentDay as any)?.transportLegs || [];
    if (existing.length > 0) return existing;
    return synthesizeTransportLegs(currentDayActivities);
  })();

  const allTransportLegs = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    if (real?.length) return total + real.length;
    const existing = d.transportLegs || [];
    if (existing.length > 0) return total + existing.length;
    return total + Math.max(0, (d.activities?.length || 0) - 1);
  }, 0);

  const allTransportMinutes = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
    return total + legs.reduce((s: number, l: any) => s + (l.estimatedDurationMinutes || l.duration || 0), 0);
  }, 0);

  const allTransportCost = itinerary.days.reduce((total: number, d: any) => {
    const dayNum = d.day;
    const real = realLegsMap[dayNum];
    const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
    return total + legs.reduce((s: number, l: any) => s + (l.estimatedCostUsd || l.cost || 0), 0);
  }, 0);

  const transportModeSummary = (() => {
    const modes: Record<string, number> = {};
    itinerary.days.forEach((d: any) => {
      const dayNum = d.day;
      const real = realLegsMap[dayNum];
      const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
      legs.forEach((l: any) => {
        const mode = l.userSelectedMode || l.recommendedMode || l.mode || "walking";
        modes[mode] = (modes[mode] || 0) + (l.estimatedDurationMinutes || l.duration || 0);
      });
    });
    return modes;
  })();

  const categoryTypes = [...new Set(itinerary.days.flatMap((d: any) => d.activities.map((a: any) => a.type)))];

  const photoUrl = getDestinationPhotoUrl(itinerary.destination);
  const destinationParts = itinerary.destination?.split(",") || [itinerary.destination];
  const city = destinationParts[0]?.trim() || itinerary.destination;
  const country = destinationParts.slice(1).join(",").trim() || "";
  const daysUntil = differenceInDays(itinerary.startDate, new Date());

  return (
    <div className="min-h-screen bg-muted/30" data-testid="itinerary-page">
      <div className="bg-background border-b border-border sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-2 flex items-center justify-between">
          <Link href="/my-trips">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
              Back to Trips
            </Button>
          </Link>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsSaved(!isSaved)}
              data-testid="button-save"
            >
              <Heart className={cn("w-4 h-4", isSaved && "fill-primary text-primary")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-download">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="stats-bar">
          {[
            { label: "Total Days", value: itinerary.days.length, icon: Calendar, color: "text-primary", bgColor: "bg-primary/10" },
            { label: "Activities", value: totalActivities, icon: Star, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-100 dark:bg-amber-900/30" },
            { label: "Booked", value: `${totalBooked}/${totalActivities}`, icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-900/30" },
            { label: "Total Cost", value: `$${totalCost.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
            { label: "Travel Time", value: formatTravelTime(totalTravelMinutes), icon: Timer, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
            { label: "Efficiency", value: `${efficiencyScore}%`, icon: Gauge, color: efficiencyScore >= 70 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400", bgColor: efficiencyScore >= 70 ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-card border-border" data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn("p-2 rounded-xl", stat.bgColor)}>
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  <p className={cn("text-lg font-bold", stat.color)} data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-5 pb-12">
          <div className="lg:w-64 flex-shrink-0">
            <div className="lg:sticky lg:top-16 space-y-4 max-h-[calc(100vh-5rem)] overflow-y-auto pb-4">
              <Card className="bg-card border-border" data-testid="trip-days-sidebar">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Trip Days</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="h-auto lg:h-[360px]">
                    <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
                      {itinerary.days.map((day: any) => (
                        <button
                          key={day.day}
                          onClick={() => setSelectedDay(day.day)}
                          className={cn(
                            "flex-shrink-0 w-full text-left p-3 rounded-xl transition-all border-0 cursor-pointer",
                            selectedDay === day.day
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "bg-muted/50 hover:bg-muted"
                          )}
                          data-testid={`button-day-${day.day}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={cn("text-xs font-bold", selectedDay === day.day ? "text-primary-foreground/80" : "text-primary")}>
                                Day {day.day}
                              </p>
                              <p className={cn("font-medium text-sm", selectedDay === day.day ? "text-primary-foreground" : "text-foreground")}>
                                {format(day.date, "EEE, MMM d")}
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                selectedDay === day.day ? "bg-primary-foreground/20 text-primary-foreground" : ""
                              )}
                            >
                              {day.activities.length}
                            </Badge>
                          </div>
                          <p className={cn("text-xs mt-1 truncate", selectedDay === day.day ? "text-primary-foreground/90" : "text-muted-foreground")}>
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
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {shareData?.expertStatus === "review_sent" && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800" data-testid="expert-review-banner">
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
                      <p className="text-sm text-blue-800 dark:text-blue-200 mt-2 italic">"{shareData.expertNotes}"</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" onClick={() => setShowDiffReview(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-review-expert-edits">
                      <Eye className="h-4 w-4" /> Review Edits
                    </Button>
                    <Button size="sm" onClick={() => acknowledgeMutation.mutate({ action: "accept", rejectedIds: [] })} disabled={acknowledgeMutation.isPending} className="gap-2 bg-green-600 hover:bg-green-700 text-white" data-testid="button-accept-expert-edits">
                      <CheckCircle2 className="h-4 w-4" /> Accept All
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => acknowledgeMutation.mutate({ action: "reject", rejectedIds: [] })} disabled={acknowledgeMutation.isPending} className="gap-2 border-red-300 text-red-700 hover:bg-red-50" data-testid="button-reject-expert-edits">
                      <XCircle className="h-4 w-4" /> Reject All
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {shareData?.expertStatus === "acknowledged" && (
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid="expert-accepted-banner">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-200">Expert edits accepted.</p>
                </div>
              </div>
            )}

            <Card className="overflow-hidden border-border bg-card" data-testid="itinerary-hero-card">
              <div className="relative h-52 overflow-hidden bg-gradient-to-br from-primary/30 via-orange-500/20 to-purple-500/30">
                <img
                  src={photoUrl}
                  alt={itinerary.destination}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  data-testid="img-hero"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute top-3 left-3 flex gap-2 items-center">
                  <Badge className="bg-primary text-primary-foreground border-0 text-[11px] font-bold gap-1 px-2.5 py-1 uppercase tracking-wide" data-testid="badge-status">
                    {daysUntil > 0 ? (daysUntil <= 30 ? `${daysUntil}d away` : "Upcoming") : "Planning"}
                  </Badge>
                  {itinerary.travelers > 1 && (
                    <Badge className="bg-background/50 text-foreground border-0 text-[11px] backdrop-blur-sm gap-1 px-2.5 py-1" data-testid="badge-travelers">
                      <Users className="w-3 h-3" /> {itinerary.travelers}
                    </Badge>
                  )}
                </div>
                <div className="absolute bottom-4 left-5 right-5">
                  <h1 className="font-['DM_Serif_Display',serif] text-[26px] text-white leading-tight drop-shadow-sm" data-testid="text-title">
                    {itinerary.title}
                  </h1>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <span className="text-[13px] text-white/85 flex items-center gap-1" data-testid="text-destination">
                      <MapPin className="w-3.5 h-3.5" /> {city}{country && `, ${country}`}
                    </span>
                    <span className="text-[13px] text-white/85 flex items-center gap-1" data-testid="text-dates">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(itinerary.startDate, "MMM d")} — {format(itinerary.endDate, "MMM d, yyyy")}
                    </span>
                    <span className="text-[13px] text-emerald-300 font-semibold" data-testid="text-budget">
                      ${totalCost.toLocaleString()} total
                      {itinerary.travelers > 1 && (
                        <span className="text-white/60 font-normal ml-1">
                          · ${Math.round(totalCost / itinerary.travelers).toLocaleString()}/person
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] text-white/70 flex items-center gap-1" data-testid="text-days-count">
                      {itinerary.days.length} days
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <div className="flex flex-wrap gap-2" data-testid="category-pills">
              {categoryTypes.map((type: string) => {
                const pill = CATEGORY_PILLS[type] || CATEGORY_PILLS.activity;
                return (
                  <span
                    key={type}
                    className={cn("px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize border", pill.bg, pill.fg, "border-transparent")}
                    data-testid={`pill-${type}`}
                  >
                    {type}
                  </span>
                );
              })}
            </div>

            <Card className="bg-card border-border" data-testid="transport-summary-card">
              <CardContent className="p-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3" data-testid="text-trip-transport-title">
                  <TrainFront className="w-4 h-4 text-muted-foreground" />
                  Trip Transport
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-transport-legs">{allTransportLegs}</p>
                    <p className="text-xs text-muted-foreground">Legs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-transport-time">{formatTravelTime(allTransportMinutes)}</p>
                    <p className="text-xs text-muted-foreground">Transit time</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-transport-cost">${allTransportCost}</p>
                    <p className="text-xs text-muted-foreground">Est. cost</p>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-2" data-testid="transport-mode-bar">
                  <div className="h-full flex">
                    {Object.entries(transportModeSummary).map(([mode, mins]) => (
                      <div
                        key={mode}
                        className="h-full"
                        style={{
                          width: `${allTransportMinutes > 0 ? (mins / allTransportMinutes) * 100 : 0}%`,
                          backgroundColor: MODE_COLORS[mode] || "#94a3b8",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(transportModeSummary).map(([mode, mins]) => {
                    const MIcon = MODE_ICON_MAP[mode] || Footprints;
                    const mColor = MODE_COLORS[mode] || "#94a3b8";
                    return (
                      <span key={mode} className="flex items-center gap-1.5 text-xs" data-testid={`transport-mode-${mode}`}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mColor }} />
                        <MIcon className="w-3.5 h-3.5" style={{ color: mColor }} />
                        <span className="text-muted-foreground capitalize">{mode} ({mins}m)</span>
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border overflow-hidden" data-testid="day-content-card">
              <div className="px-5 pt-4 pb-2 border-b border-border">
                <h2 className="text-base font-bold text-foreground" data-testid="text-current-day-heading">
                  Day {selectedDay} — {currentDay && format(currentDay.date, "EEEE, MMMM d")}
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-current-day-title">{currentDay?.title}</p>
              </div>

              <div className="flex border-b border-border px-4" data-testid="section-tabs">
                <button
                  onClick={() => setSection("activities")}
                  className={cn(
                    "py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2",
                    section === "activities"
                      ? "border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-activities"
                >
                  Activities
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-bold",
                    section === "activities" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )} data-testid="badge-activity-count">
                    {currentDayActivities.length}
                  </span>
                </button>
                <button
                  onClick={() => setSection("transport")}
                  className={cn(
                    "py-3 px-5 border-b-2 cursor-pointer transition-all text-sm font-medium flex items-center gap-2",
                    section === "transport"
                      ? "border-primary text-primary font-bold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-transport"
                >
                  Transport
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-bold",
                    section === "transport" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )} data-testid="badge-transport-count">
                    {currentDayTransportLegs.length}
                  </span>
                </button>
              </div>

              {section === "activities" && (
                <div className="p-5" data-testid="activities-list">
                  {currentDayActivities.map((activity: any, i: number) => {
                    const pill = CATEGORY_PILLS[activity.type] || CATEGORY_PILLS.activity;
                    const statusDot = STATUS_DOT[activity.bookingStatus] || STATUS_DOT.pending;
                    const isLast = i === currentDayActivities.length - 1;
                    const transportLeg = !isLast ? currentDayTransportLegs[i] : null;

                    return (
                      <div key={activity.id} data-testid={`activity-block-${activity.id}`}>
                        <div className={cn("flex gap-3.5 py-3.5", !isLast && !transportLeg ? "border-b border-border/30" : "")}>
                          <div className="flex flex-col items-center w-12 flex-shrink-0">
                            <div className="text-[13px] font-bold text-foreground" data-testid={`text-activity-time-${activity.id}`}>
                              {activity.time}
                            </div>
                            <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-card", statusDot)} />
                            {!isLast && (
                              <div className="w-0.5 flex-1 mt-1 bg-border/50" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[15px] font-semibold text-foreground" data-testid={`text-activity-name-${activity.id}`}>
                                {activity.title}
                              </span>
                              {activity.booked && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" data-testid={`badge-booked-${activity.id}`}>
                                  Confirmed
                                </span>
                              )}
                              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide", pill.bg, pill.fg)} data-testid={`badge-type-${activity.id}`}>
                                {activity.type}
                              </span>
                              {activity.price > 0 && (
                                <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold" data-testid={`text-price-${activity.id}`}>
                                  ${activity.price}
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span data-testid={`text-location-${activity.id}`}>{activity.location}</span>
                            </div>
                            {activity.notes && (
                              <p className="text-[12px] text-muted-foreground/70 mt-1 italic" data-testid={`text-notes-${activity.id}`}>
                                {activity.notes}
                              </p>
                            )}
                            {!activity.booked && activity.price > 0 && (
                              <div className="mt-2 flex gap-2">
                                {(activity.bookingType || getBookingType(activity.type)) === 'inApp' ? (
                                  <Button size="sm" className="text-[11px] h-7 px-3" data-testid={`button-book-${activity.id}`}>
                                    <CreditCard className="w-3 h-3 mr-1" /> Book · ${activity.price}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-[11px] h-7 px-3 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    onClick={() => window.open(getPartnerUrl(activity.partnerName || getPartnerName(activity.type), itinerary.destination), '_blank')}
                                    data-testid={`button-book-partner-${activity.id}`}
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" /> {activity.partnerName || getPartnerName(activity.type) || 'Partner'} · ${activity.price}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {transportLeg && (
                          <div className="flex gap-3.5 py-2 pl-3 border-b border-border/20" data-testid={`transport-inline-${transportLeg.id}`}>
                            <div className="flex flex-col items-center w-12 flex-shrink-0">
                              <div className="w-0.5 h-2 bg-border/30" />
                              {(() => {
                                const mode = transportLeg.userSelectedMode || transportLeg.recommendedMode || "walking";
                                const MIcon = MODE_ICON_MAP[mode] || Footprints;
                                const mColor = MODE_COLORS[mode] || "#94a3b8";
                                return (
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${mColor}15`, color: mColor }}>
                                    <MIcon className="w-3.5 h-3.5" />
                                  </div>
                                );
                              })()}
                              <div className="w-0.5 flex-1 bg-border/30" />
                            </div>
                            <div className="flex items-center gap-3 flex-1 min-w-0 text-xs text-muted-foreground">
                              {(() => {
                                const mode = transportLeg.userSelectedMode || transportLeg.recommendedMode || "walking";
                                const mColor = MODE_COLORS[mode] || "#94a3b8";
                                return (
                                  <>
                                    <span className="capitalize font-medium" style={{ color: mColor }} data-testid={`text-inline-mode-${transportLeg.id}`}>
                                      {mode}
                                    </span>
                                    <span className="flex items-center gap-1" data-testid={`text-inline-duration-${transportLeg.id}`}>
                                      <Clock className="w-3 h-3" /> {transportLeg.estimatedDurationMinutes} min
                                    </span>
                                    {transportLeg.estimatedCostUsd != null && transportLeg.estimatedCostUsd > 0 && (
                                      <span className="text-green-600 dark:text-green-400 font-medium" data-testid={`text-inline-cost-${transportLeg.id}`}>
                                        ${transportLeg.estimatedCostUsd}
                                      </span>
                                    )}
                                    {transportLeg.estimatedCostUsd == null && (
                                      <span className="text-green-600 dark:text-green-400 font-medium">Free</span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {currentDayActivities.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground" data-testid="text-no-activities">
                      <Star className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No activities planned for this day</p>
                    </div>
                  )}
                </div>
              )}

              {section === "transport" && (
                <div className="p-5" data-testid="transport-list">
                  {currentDayTransportLegs.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-xl p-3.5 flex flex-wrap justify-between items-center mb-5 gap-3" data-testid="day-transport-summary">
                      <div className="flex gap-6">
                        {[
                          { l: "Legs", v: currentDayTransportLegs.length },
                          { l: "Total Time", v: `${currentDayTransportLegs.reduce((s: number, t: any) => s + (t.estimatedDurationMinutes || t.duration || 0), 0)}m` },
                          { l: "Est. Cost", v: `$${currentDayTransportLegs.reduce((s: number, t: any) => s + (t.estimatedCostUsd || t.cost || 0), 0)}` },
                        ].map((s, si) => (
                          <div key={si}>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
                            <div className={cn("text-lg font-bold", si === 2 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400")} data-testid={`text-day-transport-${s.l.toLowerCase().replace(/\s+/g, '-')}`}>
                              {s.v}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentDayTransportLegs.map((leg: any, i: number) => {
                    const mode = leg.userSelectedMode || leg.recommendedMode || leg.mode || "walking";
                    const MIcon = MODE_ICON_MAP[mode] || Footprints;
                    const mColor = MODE_COLORS[mode] || "#94a3b8";
                    return (
                      <div key={leg.id} className={cn("flex gap-3.5 py-4", i < currentDayTransportLegs.length - 1 ? "border-b border-border/30" : "")} data-testid={`transport-leg-${leg.id}`}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${mColor}15`, color: mColor }}>
                          <MIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-[13px]">
                            <span className="text-muted-foreground truncate" data-testid={`text-leg-from-${leg.id}`}>{leg.fromName || leg.from}</span>
                            <span className="text-muted-foreground/50">→</span>
                            <span className="text-foreground font-semibold truncate" data-testid={`text-leg-to-${leg.id}`}>{leg.toName || leg.to}</span>
                          </div>
                          <div className="flex flex-wrap gap-2.5 mt-1.5 items-center">
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold capitalize" style={{ backgroundColor: `${mColor}20`, color: mColor }} data-testid={`badge-leg-mode-${leg.id}`}>
                              {mode}
                            </span>
                            <span className="text-[12px] text-muted-foreground flex items-center gap-1" data-testid={`text-leg-duration-${leg.id}`}>
                              <Clock className="w-3 h-3" /> {leg.estimatedDurationMinutes || leg.duration} min
                            </span>
                            {(leg.estimatedCostUsd || leg.cost) > 0 && (
                              <span className="text-[12px] text-green-600 dark:text-green-400 font-semibold" data-testid={`text-leg-cost-${leg.id}`}>
                                ${leg.estimatedCostUsd || leg.cost}
                              </span>
                            )}
                            {leg.distanceDisplay && (
                              <span className="text-[11px] text-muted-foreground italic" data-testid={`text-leg-distance-${leg.id}`}>
                                {leg.distanceDisplay}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {currentDayTransportLegs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground" data-testid="text-no-transport">
                      <TrainFront className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No transport legs for this day</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          <div className="lg:w-72 flex-shrink-0">
            <div className="lg:sticky lg:top-16 space-y-4">
              <Card className="bg-gradient-to-b from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800" data-testid="expert-booking-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/40 flex-shrink-0">
                      <UserCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                        Let an Expert Book Everything
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-xs" data-testid="badge-recommended">Recommended</Badge>
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Our travel experts handle all bookings — on-site and partner.
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => setShowExpertDialog(true)}
                    data-testid="button-expert-booking"
                  >
                    <Headphones className="w-4 h-4 mr-2" />
                    Request Expert Booking
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card border-border" data-testid="booking-summary-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
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
                            <p className="text-xs text-muted-foreground" data-testid="text-inapp-count">{inAppBookings.length} items</p>
                            <p className="text-sm font-semibold text-emerald-600" data-testid="text-inapp-total">${inAppTotal}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-medium">Book via Partners</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground" data-testid="text-partner-count">{partnerBookings.length} items</p>
                            <p className="text-sm font-semibold text-blue-600" data-testid="text-partner-total">${partnerTotal}</p>
                          </div>
                        </div>
                        <div className="border-t pt-2 mt-1 flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">Total Pending</span>
                          <span className="text-base font-bold text-primary" data-testid="text-total-pending">${inAppTotal + partnerTotal}</span>
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
                {["All hotel and accommodation bookings", "Tour and activity reservations", "Ground transportation (trains, buses, ferries)", "Event and show tickets", "Restaurant reservations"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {item}
                  </li>
                ))}
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
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                An expert will contact you within 24 hours to confirm your itinerary and payment details. You'll only be charged once all bookings are confirmed.
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowExpertDialog(false)} data-testid="button-cancel-expert-dialog">Cancel</Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleExpertBookingRequest}
              disabled={isRequestingExpert}
              data-testid="button-confirm-expert-booking"
            >
              {isRequestingExpert ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
              ) : (
                <><Headphones className="w-4 h-4 mr-2" /> Submit Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                            <div className="text-xs italic text-amber-700 dark:text-amber-300">Note: "{diff.note}"</div>
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
              <XCircle className="w-4 h-4 mr-2" /> Reject All
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
