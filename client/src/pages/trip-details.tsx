import { useState, useEffect, useRef } from "react";
import { useTrip, useGenerateItinerary, useGeneratedItinerary } from "@/hooks/use-trips";
import { useParams, Link, useSearch } from "wouter";
import { Loader2, Calendar, MapPin, Sparkles, User, ArrowRight, ArrowLeft, Clock, Coffee, Camera, Utensils, Bed, Plane, ChevronRight, ShoppingCart, Star, Package, Share2, Copy, Check, UserPlus, MessageCircle, Lightbulb, CheckCircle, XCircle } from "lucide-react";
import { TemporalAnchorManager, ScheduleValidator, EnergyBudgetDisplay, AnchorSuggestionsPanel, WeddingAnchorPresets, TripLogisticsDashboard } from "@/components/logistics";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, ShieldCheck, ExternalLink } from "lucide-react";
import { getTemplateConfig, type PlanCardDay, type PlanCardActivity, type PlanCardTransport, type PlanCardTrip } from "@/components/plancard/plancard-types";
import { StatsRow, BookedIcon, CostIcon, EfficiencyIcon, type ExtraStat } from "@/components/plancard/StatsRow";
import { DaySelector } from "@/components/plancard/DaySelector";
import { SectionTabs } from "@/components/plancard/SectionTabs";
import { ActivitiesSection } from "@/components/plancard/ActivitiesSection";
import { ChangeLogPanel } from "@/components/plancard/ChangeLogPanel";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";
import { HeroSection } from "@/components/plancard/HeroSection";
import { DayTransportPanel } from "@/components/itinerary/DayTransportPanel";
import { InlineTransportSelector, type InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";

type Section = "activities" | "transport";

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
      recommendedMode: "walk",
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

type BookingType = "inApp" | "partner";

function getBookingType(actType: string): BookingType {
  const partnerTypes = ['transport', 'event', 'concert', 'show', 'entertainment'];
  if (partnerTypes.includes(actType.toLowerCase())) return 'partner';
  return 'inApp';
}

function getActivityIcon(type: string) {
  switch (type?.toLowerCase()) {
    case "food": return Utensils;
    case "travel": return Plane;
    case "rest": return Bed;
    case "adventure": return Camera;
    case "shopping": return ShoppingCart;
    case "culture":
    case "sightseeing": return Camera;
    default: return Coffee;
  }
}

interface ProviderService {
  id: string;
  providerId: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: string;
  pricingType: string;
  duration: string | null;
  location: string | null;
  rating: string | null;
  reviewCount: number;
  isActive: boolean;
  bookingCount: number;
}

interface Expert {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  specialties: string[];
  destinations: string[];
  hourly_rate: string | null;
  years_of_experience: string | null;
  availability: string | null;
  response_time: string | null;
  profile_image_url: string | null;
  avg_rating: string;
  review_count: number;
}

interface ExpertAdvisor {
  advisor_id: string;
  status: "pending" | "accepted" | "rejected";
  message: string | null;
  assigned_at: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  specialties: string[];
  destinations: string[];
  hourly_rate: string | null;
  profile_image_url: string | null;
  avg_rating: string;
  review_count: number;
  expertFirstMessage: string | null;
}

export default function TripDetails() {
  const { id } = useParams();
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const initialTab = searchParams.get("tab") || "itinerary";
  const deepSection = searchParams.get("section");
  const { data: trip, isLoading } = useTrip(id || "");
  const generateItinerary = useGenerateItinerary();
  const { data: generatedItinerary, isLoading: itineraryLoading } = useGeneratedItinerary(id || "");
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const initialSection = deepSection === 'transport' ? 'transport' : 'activities';
  const [section, setSection] = useState<Section>(initialSection);
  const [selectedDay, setSelectedDay] = useState(1);
  const [showFullItinerary, setShowFullItinerary] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expertPickerOpen, setExpertPickerOpen] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState<Expert | null>(null);
  const [expertMessage, setExpertMessage] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialTab === "expert" && deepSection === "suggestions") {
      setActiveTab("expert");
      const timer = setTimeout(() => {
        suggestionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [initialTab, deepSection]);

  // Auto‑select today's day when trip is live (same logic as itinerary.tsx)
  useEffect(() => {
    if (!trip) return;
    const now = new Date();
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    if (now >= start && now <= end) {
      const daysInto = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setSelectedDay(Math.min(Math.max(daysInto, 1), Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1));
    }
  }, [trip]);

  const shareMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/share`);
      return res.json() as Promise<{ success: boolean; shareToken: string }>;
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/trips/shared/${data.shareToken}`;
      setShareLink(link);
      setShareOpen(true);
    },
    onError: () => {
      toast({ title: "Could not create share link", variant: "destructive" });
    },
  });

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with friends." });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const { data: servicesResult, isLoading: servicesLoading } = useQuery<ProviderService[]>({
    queryKey: [`/api/services?location=${encodeURIComponent(trip?.destination || "")}`],
    enabled: !!trip?.destination,
  });

  const { data: advisorData, isLoading: advisorLoading } = useQuery<{ advisor: ExpertAdvisor | null }>({
    queryKey: [`/api/trips/${id}/expert-advisor`],
    enabled: !!id,
  });

  const { data: expertsData, isLoading: expertsLoading } = useQuery<Expert[]>({
    queryKey: [`/api/trip-experts?destination=${encodeURIComponent(trip?.destination || "")}`],
    enabled: expertPickerOpen && !!trip?.destination,
  });

  interface TripSuggestion {
    id: string;
    trip_id: string;
    expert_id: string;
    type: string;
    day_number: number | null;
    title: string;
    description: string | null;
    estimated_cost: string | null;
    status: "pending" | "approved" | "rejected";
    rejection_note: string | null;
    created_at: string;
    reviewed_at: string | null;
    expert_first_name: string;
    expert_last_name: string;
    expert_profile_image_url: string | null;
  }

  const advisor = advisorData?.advisor ?? null;

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ suggestions: TripSuggestion[] }>({
    queryKey: [`/api/trips/${id}/suggestions`],
    enabled: !!id && !!advisor,
    staleTime: 30000,
  });

  const reviewSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, status, rejectionNote }: { suggestionId: string; status: "approved" | "rejected"; rejectionNote?: string }) => {
      const res = await apiRequest("PATCH", `/api/trips/${id}/suggestions/${suggestionId}`, { status, rejectionNote });
      return res.json() as Promise<{ suggestion: { status: string } }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}/suggestions`] });
      if (data?.suggestion?.status === "approved") {
        queryClient.invalidateQueries({ queryKey: ["/api/generated-itineraries", id] });
      }
      toast({ title: "Suggestion reviewed", description: "Your response has been saved." });
    },
    onError: () => {
      toast({ title: "Could not review suggestion", variant: "destructive" });
    },
  });

  const assignExpertMutation = useMutation({
    mutationFn: async ({ expertUserId, message }: { expertUserId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/trips/${id}/expert-advisor`, { expertUserId, message });
      return res.json() as Promise<{ success: boolean; advisorId: string; status: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}/expert-advisor`] });
      setExpertPickerOpen(false);
      setSelectedExpert(null);
      setExpertMessage("");
      toast({ title: "Expert request sent!", description: "They will review and respond soon." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to assign expert", description: err.message, variant: "destructive" });
    },
  });

  // Open destination in maps
  const openInMaps = () => {
    if (!trip?.destination) return;
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const query = encodeURIComponent(trip.destination);
    
    if (isIOS) {
      window.open(`maps://maps.apple.com/?q=${query}`, "_blank");
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
    }
    
    toast({ title: "Opening Maps", description: `Showing ${trip.destination}` });
  };

  const handleAddToCart = (serviceId: string) => {
    if (!user) {
      toast({ 
        variant: "destructive", 
        title: "Sign in required", 
        description: "Please sign in to add items to your cart" 
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
      return;
    }
    addToCartMutation.mutate(serviceId);
  };

  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart!", description: "Service has been added to your cart." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to add to cart", description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Trip not found</h2>
        <Link href="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const duration = differenceInDays(endDate, startDate) + 1;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Header */}
      <div className="relative h-[45vh] min-h-[350px]">
        <img 
          src={`https://source.unsplash.com/1600x900/?${encodeURIComponent(trip.destination)},travel,landmark`}
          alt={trip.destination}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        
        {/* Back Button */}
        <div className="absolute top-4 left-4">
          <Link href="/dashboard">
            <Button variant="outline" className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>

        {/* Open in Maps Button (top right) */}
        <div className="absolute top-4 right-4">
          <Button 
            variant="outline" 
            className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
            onClick={openInMaps}
            data-testid="button-open-maps-mobile"
          >
            <MapPin className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Open in Maps</span>
          </Button>
        </div>

        {/* Trip Info */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-8">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-white/20 backdrop-blur-md text-white border-0">
                <MapPin className="w-3 h-3 mr-1" />
                {trip.destination}
              </Badge>
              <Badge className="bg-accent/80 backdrop-blur-md text-white border-0">
                {trip.status}
              </Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">{trip.title}</h1>
            <div className="flex flex-wrap gap-6 text-white/90">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {format(startDate, "MMMM d")} - {format(endDate, "MMMM d, yyyy")}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {duration} {duration === 1 ? 'day' : 'days'}
              </div>
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {trip.numberOfTravelers} Traveler{trip.numberOfTravelers !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 -mt-6 relative z-10">
        <Card className="shadow-xl border-0">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b border-border px-6 pt-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="itinerary" data-testid="tab-itinerary">Itinerary</TabsTrigger>
                    <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings</TabsTrigger>
                    <TabsTrigger value="expert" data-testid="tab-expert">Ask an Expert</TabsTrigger>
                    <TabsTrigger value="logistics" data-testid="tab-logistics" className="gap-1">
                      <Package className="w-3.5 h-3.5" />
                      Logistics
                    </TabsTrigger>
                  </TabsList>

                  <div className="hidden md:flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={openInMaps}
                      data-testid="button-open-maps"
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Open in Maps
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => shareMutation.mutate(trip.id)}
                      disabled={shareMutation.isPending}
                      data-testid="button-share-trip"
                    >
                      {shareMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Share2 className="w-4 h-4 mr-2" />
                      )}
                      Share with friends
                    </Button>
                    <Button 
                      onClick={() => generateItinerary.mutate(trip.id)}
                      disabled={generateItinerary.isPending}
                      data-testid="button-regenerate"
                    >
                      {generateItinerary.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Regenerate Plan
                    </Button>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <TabsContent value="itinerary" className="mt-0 space-y-6">
                  {/* Itinerary Timeline */}
                  {(itineraryLoading || generateItinerary.isPending) ? (
                    <div className="space-y-6">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-3">
                          <div className="flex items-center gap-4">
                            <Skeleton className="w-12 h-12 rounded-full" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-3 w-36" />
                            </div>
                          </div>
                          <div className="ml-6 pl-6 border-l-2 border-border space-y-3">
                            {[1, 2, 3].map((j) => (
                              <Skeleton key={j} className="h-16 rounded-xl" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !generatedItinerary ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Itinerary Yet</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        Generate a personalized day-by-day plan for {trip.destination} using AI.
                      </p>
                      <Button
                        onClick={() => generateItinerary.mutate(trip.id)}
                        disabled={generateItinerary.isPending}
                        data-testid="button-generate-itinerary"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate My Itinerary
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* PlanCard components merged from itinerary.tsx */}
                      {(() => {
                        const itinerary = generatedItinerary.itineraryData;
                        if (!itinerary) return null;

                        // Real transport legs map (if available)
                        const realLegsMap: Record<number, any[]> = {};
                        // TODO: fetch real legs data if needed

                        const templateConfig = getTemplateConfig(trip?.eventType);

                        const planCardTrip: PlanCardTrip = {
                          id: String(itinerary.id),
                          destination: itinerary.destination,
                          title: itinerary.title,
                          startDate: format(new Date(itinerary.startDate), "yyyy-MM-dd"),
                          endDate: format(new Date(itinerary.endDate), "yyyy-MM-dd"),
                          numberOfTravelers: itinerary.travelers,
                          budget: itinerary.budget,
                        };

                        const planCardDays: PlanCardDay[] = itinerary.days.map((d: any) => ({
                          dayNum: d.day,
                          date: format(d.date instanceof Date ? d.date : new Date(d.date), "yyyy-MM-dd"),
                          label: (() => {
                            const parsed = d.date instanceof Date ? d.date : new Date(d.date);
                            return !isNaN(parsed.getTime()) ? format(parsed, "EEE, MMM d") : (d.title || `Day ${d.day}`);
                          })(),
                          activities: (d.activities || []).map((a: any): PlanCardActivity => ({
                            id: a.id,
                            name: a.title || a.name || "Activity",
                            time: a.time || "09:00",
                            type: a.type || "activity",
                            location: a.location || "",
                            lat: a.lat ?? undefined,
                            lng: a.lng ?? undefined,
                            status: a.booked ? "confirmed" : "pending",
                            cost: a.price || 0,
                            comments: 0,
                            expertNote: a.notes || a.description || undefined,
                          })),
                          transports: (() => {
                            const dayNum = d.day;
                            const real = realLegsMap[dayNum];
                            const legs = real?.length ? real : d.transportLegs || synthesizeTransportLegs(d.activities || []);
                            return legs.map((l: any): PlanCardTransport => ({
                              id: l.id,
                              from: l.fromName || l.from || "",
                              to: l.toName || l.to || "",
                              mode: l.userSelectedMode || l.recommendedMode || l.mode || "walk",
                              duration: l.estimatedDurationMinutes || l.duration || 0,
                              cost: l.estimatedCostUsd || l.cost || 0,
                              status: "active",
                            }));
                          })(),
                        }));

                        const currentPlanCardDay = planCardDays[selectedDay - 1];
                        const currentItineraryDay = itinerary.days[selectedDay - 1];
                        const currentDayLegs: InlineTransportLegData[] = (() => {
                          if (!currentItineraryDay) return [];
                          const dayNum = currentItineraryDay.day;
                          const real = realLegsMap[dayNum];
                          return real?.length ? real : currentItineraryDay.transportLegs || synthesizeTransportLegs(currentItineraryDay.activities || []);
                        })();

                        // Compute extra stats
                        const totalDays = itinerary.days.length;
                        const totalActivities = planCardDays.reduce((sum, d) => sum + (d.activities?.length || 0), 0);
                        const totalLegs = planCardDays.reduce((sum, d) => sum + (d.transports?.length || 0), 0);
                        const totalTransitMinutes = planCardDays.reduce((sum, d) => sum + (d.transports?.reduce((t, tr) => t + (tr.duration || 0), 0) || 0), 0);
                        const totalBooked = planCardDays.reduce((sum, d) => sum + (d.activities?.filter((a: any) => a.status === "confirmed").length || 0), 0);
                        const totalCost = planCardDays.reduce((sum, d) => sum + (d.activities?.reduce((c: number, a: any) => c + (a.cost || 0), 0) || 0), 0);
                        const efficiencyScore = totalBooked > 0 ? Math.round((totalBooked / totalActivities) * 100) : 0;

                        const extraStats: ExtraStat[] = [
                          { label: "Days", value: String(totalDays), icon: null },
                          { label: "Activities", value: String(totalActivities), icon: null },
                          { label: "Transit legs", value: String(totalLegs), icon: null },
                          { label: "Transit time", value: `${Math.floor(totalTransitMinutes / 60)}h ${totalTransitMinutes % 60}m`, icon: null },
                          { label: "Booked", value: `${totalBooked}/${totalActivities}`, icon: BookedIcon },
                          { label: "Total Cost", value: `$${totalCost.toLocaleString()}`, icon: CostIcon },
                          { label: "Efficiency", value: `${efficiencyScore}%`, icon: EfficiencyIcon },
                        ];

                        // Category counts (simplified)
                        const categoryCounts = {
                          Sightseeing: planCardDays.reduce((sum, d) => sum + (d.activities?.filter((a: any) => a.type === "sightseeing").length || 0), 0),
                          Food: planCardDays.reduce((sum, d) => sum + (d.activities?.filter((a: any) => a.type === "food").length || 0), 0),
                          Culture: planCardDays.reduce((sum, d) => sum + (d.activities?.filter((a: any) => a.type === "culture").length || 0), 0),
                        };

                        return (
                          <div className="space-y-6">
                            {/* Stats row */}
                            <StatsRow stats={extraStats} />

                            {/* Category pills */}
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {Object.entries(categoryCounts).map(([cat, count]) => (
                                <button
                                  key={cat}
                                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-muted text-muted-foreground whitespace-nowrap"
                                >
                                  {cat} ({count})
                                </button>
                              ))}
                            </div>

                            {/* Day selector */}
                            <DaySelector
                              days={planCardDays}
                              selectedDay={selectedDay}
                              onSelectDay={setSelectedDay}
                              templateConfig={templateConfig}
                            />

                            {/* Section tabs */}
                            <SectionTabs
                              section={section}
                              onSelectSection={setSection}
                              activitiesCount={currentPlanCardDay?.activities?.length || 0}
                              transportCount={currentPlanCardDay?.transports?.length || 0}
                              confirmedActivitiesCount={currentPlanCardDay?.activities?.filter((a: any) => a.status === "confirmed").length || 0}
                            />

                            {/* Activities section (when section === "activities") */}
                            {section === "activities" && (
                              <ActivitiesSection
                                day={currentPlanCardDay}
                                legs={currentDayLegs}
                                expertLayerEnabled={false}
                                onExpertLayerToggle={() => {}}
                                onActivityClick={(activityId) => {
                                  // navigate to activity detail
                                }}
                                onTransportClick={(legId) => {
                                  setSection("transport");
                                }}
                              />
                            )}

                            {/* Transport section (when section === "transport") */}
                            {section === "transport" && (
                              <DayTransportPanel
                                day={currentItineraryDay}
                                legs={currentDayLegs}
                                onLegUpdate={() => {}}
                              />
                            )}

                            {/* Show Map toggle */}
                            <div className="pt-4 border-t">
                              <MapControlCenter days={planCardDays} selectedDay={selectedDay} />
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="bookings" className="mt-0">
                  <div className="space-y-6">
                    {/* Booking Summary card from itinerary.tsx */}
                    {generatedItinerary?.itineraryData && (
                      <Card className="bg-card border-border" data-testid="booking-summary-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary" />
                            Booking Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-2">
                          {(() => {
                            const itinerary = generatedItinerary.itineraryData;
                            const allActivities = itinerary.days.flatMap((d: any) => d.activities);
                            const inAppBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'inApp' && !a.booked);
                            const partnerBookings = allActivities.filter((a: any) => (a.bookingType || getBookingType(a.type)) === 'partner' && !a.booked);
                            const inAppTotal = inAppBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                            const partnerTotal = partnerBookings.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
                            return (
                              <>
                                <div className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg">
                                  <div className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                    <span className="text-xs font-medium">Book on Traveloure</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground" data-testid="text-inapp-count">{inAppBookings.length} items</p>
                                    <p className="text-sm font-semibold text-primary" data-testid="text-inapp-total">${inAppTotal}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                                  <div className="flex items-center gap-1.5">
                                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    <span className="text-xs font-medium">Book via Partners</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground" data-testid="text-partner-count">{partnerBookings.length} items</p>
                                    <p className="text-sm font-semibold text-foreground" data-testid="text-partner-total">${partnerTotal}</p>
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
                    )}

                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                        <Plane className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Bookings Yet</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        Add flights, hotels, and activities to your trip to keep everything organized in one place.
                      </p>
                      <Button variant="outline" data-testid="button-add-booking">
                        Add a Booking
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="expert" className="mt-0">
                  <div className="space-y-8 py-4">
                    {/* Assigned Expert Display */}
                    {advisorLoading ? (
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-border">
                        <Skeleton className="w-14 h-14 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-40" />
                          <Skeleton className="h-4 w-64" />
                        </div>
                      </div>
                    ) : advisor ? (
                      <div
                        className="flex items-start gap-4 p-4 rounded-xl border border-border bg-muted/20"
                        data-testid="expert-advisor-card"
                      >
                        <Avatar className="w-14 h-14 flex-shrink-0">
                          <AvatarImage src={advisor.profile_image_url ?? undefined} />
                          <AvatarFallback className="text-lg font-medium">
                            {advisor.first_name?.[0]}{advisor.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-semibold text-foreground" data-testid="advisor-name">
                              {advisor.first_name} {advisor.last_name}
                            </span>
                            <Badge
                              variant={advisor.status === "accepted" ? "default" : "secondary"}
                              className="text-[11px]"
                              data-testid="advisor-status"
                            >
                              {advisor.status === "accepted" ? "Expert assigned" : "Request pending"}
                            </Badge>
                          </div>
                          {advisor.bio && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{advisor.bio}</p>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {parseFloat(advisor.avg_rating) > 0 && (
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 fill-current text-amber-500" />
                                {parseFloat(advisor.avg_rating).toFixed(1)} ({advisor.review_count} reviews)
                              </span>
                            )}
                            {advisor.hourly_rate && (
                              <span>${advisor.hourly_rate}/hr</span>
                            )}
                          </div>
                          {advisor.status === "accepted" && advisor.expertFirstMessage && (
                            <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border text-sm text-muted-foreground italic" data-testid="advisor-first-message">
                              <span className="not-italic font-medium text-foreground">{advisor.first_name}: </span>
                              {advisor.expertFirstMessage}
                            </div>
                          )}
                          {advisor.status === "accepted" && !advisor.expertFirstMessage && (
                            <p className="mt-2 text-xs text-muted-foreground" data-testid="advisor-awaiting-message">
                              Your expert will reach out with their first message soon.
                            </p>
                          )}
                          {advisor.status === "accepted" && (
                            <Link href="/chat">
                              <Button size="sm" className="mt-3 gap-1.5" data-testid="button-message-expert">
                                <MessageCircle className="w-3.5 h-3.5" />
                                Message expert
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div>
                          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                            Connect with a Local Expert
                          </h3>
                          <p className="text-muted-foreground mb-6">
                            Get personalized advice, hidden gems, and real-time support from someone who knows {trip.destination} well.
                          </p>
                          <Button
                            className="gap-2"
                            onClick={() => setExpertPickerOpen(true)}
                            data-testid="button-add-expert"
                          >
                            <UserPlus className="w-4 h-4" />
                            Add an expert
                          </Button>
                        </div>
                        <div className="relative">
                          <img
                            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=600&auto=format&fit=crop"
                            alt="Local Expert"
                            className="rounded-2xl shadow-xl"
                          />
                        </div>
                      </div>
                    )}

                    {/* Expert Suggestions Panel */}
                    {advisor && (
                      <div ref={suggestionsRef} className="border-t border-border pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="w-5 h-5 text-amber-500" />
                            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                              Expert Suggestions
                            </h4>
                            {suggestionsData?.suggestions?.filter(s => s.status === "pending").length ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                {suggestionsData.suggestions.filter(s => s.status === "pending").length} pending
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {suggestionsLoading ? (
                          <div className="space-y-3">
                            {[1, 2].map(i => (
                              <div key={i} className="rounded-xl border border-border p-4">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                                </div>
                                <div className="h-3 w-full bg-muted rounded animate-pulse mb-1.5" />
                                <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                              </div>
                            ))}
                          </div>
                        ) : suggestionsData?.suggestions && suggestionsData.suggestions.length > 0 ? (
                          <div className="space-y-3" data-testid="suggestions-list">
                            {suggestionsData.suggestions.map((suggestion) => (
                              <div
                                key={suggestion.id}
                                className={`rounded-xl border p-4 transition-colors ${
                                  suggestion.status === "approved"
                                    ? "border-green-200 bg-green-50/50 dark:bg-green-950/20"
                                    : suggestion.status === "rejected"
                                    ? "border-red-200 bg-red-50/50 dark:bg-red-950/20"
                                    : "border-border bg-muted/20"
                                }`}
                                data-testid={`suggestion-card-${suggestion.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-medium tracking-wide">
                                        {suggestion.type}
                                      </span>
                                      {suggestion.day_number && (
                                        <span className="text-[10px] text-muted-foreground">Day {suggestion.day_number}</span>
                                      )}
                                      {suggestion.status === "approved" && (
                                        <span className="flex items-center gap-1 text-[10px] text-green-700 font-medium">
                                          <CheckCircle className="w-3 h-3" /> Approved
                                        </span>
                                      )}
                                      {suggestion.status === "rejected" && (
                                        <span className="flex items-center gap-1 text-[10px] text-red-700 font-medium">
                                          <XCircle className="w-3 h-3" /> Declined
                                        </span>
                                      )}
                                    </div>
                                    <p className="font-medium text-foreground mb-1">{suggestion.title}</p>
                                    {suggestion.description && (
                                      <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                                    )}
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span>
                                        {suggestion.expert_first_name} {suggestion.expert_last_name}
                                      </span>
                                      {suggestion.estimated_cost && (
                                        <span className="text-primary font-medium">~${parseFloat(suggestion.estimated_cost).toFixed(0)}</span>
                                      )}
                                      <span>{new Date(suggestion.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                                    </div>
                                    {suggestion.rejection_note && (
                                      <p className="text-xs text-red-600 mt-1 italic">Note: {suggestion.rejection_note}</p>
                                    )}
                                  </div>
                                </div>
                                {suggestion.status === "pending" && (
                                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                                      onClick={() => reviewSuggestionMutation.mutate({ suggestionId: suggestion.id, status: "approved" })}
                                      disabled={reviewSuggestionMutation.isPending}
                                      data-testid={`button-approve-suggestion-${suggestion.id}`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Approve &amp; add to itinerary
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                                      onClick={() => {
                                        setRejectTargetId(suggestion.id);
                                        setRejectionNote("");
                                        setRejectDialogOpen(true);
                                      }}
                                      disabled={reviewSuggestionMutation.isPending}
                                      data-testid={`button-reject-suggestion-${suggestion.id}`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      Decline
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground" data-testid="suggestions-empty">
                            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No suggestions yet.</p>
                            <p className="text-xs mt-1">Your expert will send curated ideas once they review your trip.</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-border pt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                          Available Services for Your Trip
                        </h4>
                        <Link href="/discover">
                          <Button variant="outline" size="sm" data-testid="button-browse-all">
                            Browse All <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                      
                      {servicesLoading ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {[1, 2, 3].map((i) => (
                            <Card key={i}>
                              <CardContent className="p-4">
                                <Skeleton className="h-5 w-3/4 mb-2" />
                                <Skeleton className="h-4 w-full mb-3" />
                                <div className="flex justify-between">
                                  <Skeleton className="h-6 w-20" />
                                  <Skeleton className="h-8 w-24" />
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : servicesResult && servicesResult.length > 0 ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {servicesResult.slice(0, 6).map((service) => (
                            <Card key={service.id} data-testid={`card-service-${service.id}`}>
                              <CardContent className="p-4">
                                <h5 className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">
                                  {service.name}
                                </h5>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                  {service.description}
                                </p>
                                <div className="flex items-center gap-2 mb-3">
                                  {service.rating && (
                                    <Badge variant="secondary" className="gap-1">
                                      <Star className="w-3 h-3 fill-current" />
                                      {parseFloat(service.rating).toFixed(1)}
                                    </Badge>
                                  )}
                                  {service.location && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {service.location}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-lg">${parseFloat(service.basePrice).toFixed(0)}</span>
                                  <Button 
                                    size="sm"
                                    onClick={() => handleAddToCart(service.id)}
                                    disabled={addToCartMutation.isPending}
                                    data-testid={`button-add-cart-${service.id}`}
                                  >
                                    {addToCartMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <ShoppingCart className="w-4 h-4 mr-1" />
                                        Add
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p>No services found for {trip.destination}.</p>
                          <p className="text-sm mt-1">Check out our full marketplace for other options.</p>
                          <Link href="/discover">
                            <Button variant="outline" className="mt-4" data-testid="button-discover">
                              Browse Marketplace
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="logistics" className="mt-0 space-y-6">
                  {id && (
                    <>
                      <TripLogisticsDashboard
                        tripId={id}
                        tripName={trip?.title || trip?.destination || "Trip"}
                        budget={typeof trip?.budget === 'number' ? trip.budget : 0}
                        destination={trip?.destination || "destination"}
                      />
                      <div className="grid md:grid-cols-2 gap-4">
                        <TemporalAnchorManager tripId={id} />
                        <ScheduleValidator tripId={id} />
                      </div>
                      <EnergyBudgetDisplay tripId={id} />
                      <AnchorSuggestionsPanel tripId={id} />
                      {trip?.eventType === "wedding" && (
                        <WeddingAnchorPresets
                          tripId={id}
                          templateSlug="wedding"
                          eventDate={trip.startDate ? new Date(trip.startDate).toISOString().slice(0, 10) : ""}
                        />
                      )}
                    </>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Expert Picker Dialog */}
      <Dialog open={expertPickerOpen} onOpenChange={(open) => {
        setExpertPickerOpen(open);
        if (!open) { setSelectedExpert(null); setExpertMessage(""); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-expert-picker">
          <DialogHeader>
            <DialogTitle>Choose an expert for {trip?.destination}</DialogTitle>
            <DialogDescription>
              Select an expert to help curate your trip. They'll review your plan and reach out.
            </DialogDescription>
          </DialogHeader>

          {selectedExpert ? (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedExpert.profile_image_url ?? undefined} />
                  <AvatarFallback>{selectedExpert.first_name?.[0]}{selectedExpert.last_name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedExpert.first_name} {selectedExpert.last_name}</div>
                  {parseFloat(selectedExpert.avg_rating) > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current text-amber-500" />
                      {parseFloat(selectedExpert.avg_rating).toFixed(1)}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedExpert(null)}
                  data-testid="button-change-expert">
                  Change
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message (optional)</label>
                <Textarea
                  placeholder="Tell the expert about your preferences, goals, or any specific requests..."
                  value={expertMessage}
                  onChange={(e) => setExpertMessage(e.target.value)}
                  rows={3}
                  data-testid="input-expert-message"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => assignExpertMutation.mutate({ expertUserId: selectedExpert.user_id, message: expertMessage })}
                disabled={assignExpertMutation.isPending}
                data-testid="button-confirm-expert"
              >
                {assignExpertMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                Send request to {selectedExpert.first_name}
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {expertsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : expertsData && expertsData.length > 0 ? (
                expertsData.map((expert) => (
                  <button
                    key={expert.id}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => setSelectedExpert(expert)}
                    data-testid={`button-select-expert-${expert.id}`}
                  >
                    <Avatar className="w-10 h-10 flex-shrink-0">
                      <AvatarImage src={expert.profile_image_url ?? undefined} />
                      <AvatarFallback>{expert.first_name?.[0]}{expert.last_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">
                        {expert.first_name} {expert.last_name}
                      </div>
                      {expert.bio && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{expert.bio}</p>
                      )}
                      {Array.isArray(expert.specialties) && expert.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(expert.specialties as string[]).slice(0, 3).map((s, si) => (
                            <span key={si} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                        {parseFloat(expert.avg_rating) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-current text-amber-500" />
                            {parseFloat(expert.avg_rating).toFixed(1)}
                          </span>
                        )}
                        {expert.hourly_rate && <span>${expert.hourly_rate}/hr</span>}
                        {expert.response_time && <span>Responds {expert.response_time}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </button>
                ))
              ) : (
                <div className="text-center py-8">
                  <User className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No experts found for {trip?.destination}.</p>
                  <p className="text-sm mt-1 text-muted-foreground">Check back soon or browse all experts.</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Suggestion Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={(open) => { setRejectDialogOpen(open); if (!open) setRejectTargetId(null); }}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-reject-suggestion">
          <DialogHeader>
            <DialogTitle>Decline suggestion</DialogTitle>
            <DialogDescription>
              Let the expert know why you're passing on this idea (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Textarea
              placeholder="e.g. Budget doesn't fit, already have plans for this day…"
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              rows={3}
              data-testid="input-rejection-note"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setRejectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  if (rejectTargetId) {
                    reviewSuggestionMutation.mutate({ suggestionId: rejectTargetId, status: "rejected", rejectionNote: rejectionNote || undefined });
                  }
                  setRejectDialogOpen(false);
                  setRejectTargetId(null);
                }}
                disabled={reviewSuggestionMutation.isPending}
                data-testid="button-confirm-reject"
              >
                {reviewSuggestionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Decline suggestion
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-share-trip">
          <DialogHeader>
            <DialogTitle>Share your trip plan</DialogTitle>
            <DialogDescription>
              Anyone with this link can view your itinerary for {trip?.destination}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <Input
              readOnly
              value={shareLink ?? ""}
              className="text-sm"
              data-testid="input-share-link"
              onFocus={(e) => e.target.select()}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLink}
              data-testid="button-copy-link"
              className="shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Friends can view the itinerary without signing in. Only you can make changes.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
