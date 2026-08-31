import { useState, useEffect } from "react";
import { useTrip } from "@/hooks/use-trips";
import { useParams, Link, useSearch, useLocation } from "wouter";
import { Loader2, Calendar, MapPin, Sparkles, User, ArrowRight, ArrowLeft, Clock, Coffee, Camera, Utensils, Bed, Plane, ChevronRight, ShoppingCart, Star, Package, Share2, Copy, Check, UserPlus, XCircle } from "lucide-react";
import { TemporalAnchorManager, ScheduleValidator, EnergyBudgetDisplay, AnchorSuggestionsPanel, WeddingAnchorPresets, TripLogisticsDashboard } from "@/components/logistics";
import { Button } from "@/components/ui/button";
import { format, differenceInDays, isValid } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePlanning } from "@/contexts/PlanningContext";
import { Skeleton } from "@/components/ui/skeleton";
import { getTemplateConfig, type PlanCardData, type PlanCardTrip } from "@/components/plancard/plancard-types";
import { PlanCard } from "@/components/plancard/PlanCard";
import { GuestInviteManager } from "@/components/GuestInviteManager";
import type { UserExperience } from "@shared/schema";
import { calendarDateToIso, parseCalendarDate } from "@/lib/calendar-date";

type Section = "activities" | "transport";

/**
 * Mobile-lens audit #1 fix (found in behavioral verification): the pre-existing
 * `selectedDay` state below is set via a `useEffect` that fires AFTER first render —
 * so when it fed `initialSelectedDay` directly, PlanCard (whose `useState` initializer
 * only reads its prop once, on mount) could mount before the effect ran and get stuck
 * on the stale value. This is a pure, synchronous version of that exact same "day N of
 * the trip is today" math (not new date logic — mirrors the effect below verbatim) that
 * the itinerary render computes directly at render time from `trip`, which is already
 * guaranteed loaded by the point PlanCard mounts (the page bails out above if !trip) —
 * so there is no effect/state round-trip to race against.
 */
function computeLiveDayNumber(startDate: string | undefined, endDate: string | undefined): number | null {
  if (!startDate || !endDate) return null;
  const now = new Date();
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) return null;
  if (now < start || now > end) return null;
  const daysInto = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(Math.max(daysInto, 1), totalDays);
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

// Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the Expert / ExpertAdvisor types moved
// with the expert-assign + suggestion-review UI to the slip family (AssignExpertDialog /
// ExpertSuggestionsPanel own their own local types).

export default function TripDetails() {
  const { id } = useParams();
  const searchStr = useSearch();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(searchStr);
  const initialTab = searchParams.get("tab") || "itinerary";
  const deepSection = searchParams.get("section");
  const justOptimized = searchParams.get("optimized") === "1";
  const { data: trip, isLoading, isError: tripError, refetch: refetchTrip } = useTrip(id || "");
  // The Generate/Regenerate buttons previously called useOptimizeTrip → the
  // nonexistent POST /api/trips/:id/optimize (Vite catch-all → error). Repointed at
  // the live generate-itinerary endpoint so a trip with no plan can actually self-generate.
  const {
    data: plancardData,
    isLoading: itineraryLoading,
    isError: itineraryError,
    refetch: refetchItinerary,
  } = useQuery<PlanCardData>({
    queryKey: [`/api/trips/${id}/plancard`],
    enabled: !!id,
  });
  // T1-1: gates the regenerate confirmation dialog — true only once there's a plan with actual
  // activities to lose. First generation (no itinerary yet) skips the dialog entirely.
  // `as any`: itineraryData is a free-shape jsonb column typed `{}` at the ORM layer (see the
  // pre-existing identical casts a few hundred lines below, e.g. `itinerary.days.map(...)`) —
  // matching the file's existing convention rather than introducing a new typing approach.
  const hasExistingItineraryItems = !!plancardData?.days?.some(
    (day) => (day.activities?.length ?? 0) > 0,
  );
  const { toast } = useToast();
  const { user } = useAuth();
  const { open: openPlanning } = usePlanning();
  const [activeTab, setActiveTab] = useState(initialTab);
  const initialSection = deepSection === 'transport' ? 'transport' : 'activities';
  const [section, setSection] = useState<Section>(initialSection);
  const [showFullItinerary, setShowFullItinerary] = useState(false);
  const [showAnchorCapture, setShowAnchorCapture] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the expert-picker + reject-suggestion
  // state moved to the slip family (AssignExpertDialog / ExpertSuggestionsPanel). Rows 8/9/10/11.
  // G7: "Plan ready" banner
  const [showOptimizedBanner, setShowOptimizedBanner] = useState(justOptimized);

  // Mobile-lens audit #1: this effect used to compute "today's day" into a page-level
  // `selectedDay` state that nothing read (the original audit finding) — then, once wired
  // to PlanCard, turned out to race PlanCard's mount (effects run after first paint, but
  // PlanCard's day-index `useState` initializer only reads its prop once, on mount).
  // Replaced by the synchronous `computeLiveDayNumber` helper above, called directly where
  // `initialSelectedDay` is computed for `<PlanCard>` below — same math, no effect/state
  // round-trip to race.

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

  // G7: Reuse the canonical plan-card query above for optimization metadata.
  const optimizationDelta = plancardData?.optimizationDelta ?? null;

  const { data: servicesResult, isLoading: servicesLoading } = useQuery<ProviderService[]>({
    queryKey: [`/api/services?location=${encodeURIComponent(trip?.destination || "")}`],
    enabled: !!trip?.destination,
  });

  // Guest-invite surface (A1): a trip born from an event experience template (wedding/
  // proposal/birthday…) has a user_experiences row linked via tripId — that link is the
  // Event-class signal. When present, the Guests tab surfaces the organizer's invite
  // manager. Rides the live session-scoped GET /api/user-experiences (owner-only data).
  const { data: allUserExperiences } = useQuery<UserExperience[]>({
    queryKey: ["/api/user-experiences"],
    enabled: !!user && !!id,
    staleTime: 30_000,
  });
  const linkedExperience = allUserExperiences?.find((e) => e.tripId === id) ?? null;

  const EVENT_TRIP_TYPES = new Set(["wedding", "honeymoon", "proposal", "anniversary", "birthday", "corporate"]);
  const isEventTrip = !!linkedExperience || EVENT_TRIP_TYPES.has((trip?.eventType || "").toLowerCase());

  const createGuestListMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/user-experiences", {
      tripId: id,
      title: trip?.title || trip?.destination || "My Event",
      location: trip?.destination || "",
      eventDate: trip?.startDate || new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] }),
    onError: () => toast({ title: "Could not set up guest list", variant: "destructive" }),
  });

  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the expert-assign picker and the
  // expert-suggestion review data layer (trip-experts / offering-types / suggestions queries,
  // reviewSuggestionMutation, assignExpertMutation) relocated to the slip family —
  // AssignExpertDialog + ExpertSuggestionsPanel own them now (rows 10/11). The advisor query,
  // the advisor card and the duplicate EscalationCTA (rows 8/9) are dropped here; the assigned
  // expert is surfaced by the family's advisor strip on the summary card (A10/A12) and the
  // full-stage EscalationCTA (B10) — both must-not-regress, both already rendering.

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

  // Mobile-lens audit #6: useTrip resolves a real 404 as `data: null` (no error) — only a
  // genuine fetch/network/server failure sets isError. So this branch is reached ONLY on a
  // failed request, and stays inside this page (never the app's auth-gate fall-through to
  // the marketing homepage + "Sign in to continue" modal the audit reproduced). "Trip not
  // found" below is unchanged for the real 404 case.
  if (tripError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" data-testid="trip-network-error">
        <h2 className="text-2xl font-bold">Can't reach Traveloure</h2>
        <p className="text-muted-foreground max-w-sm">
          We couldn't load this trip. Check your connection and try again.
        </p>
        <Button onClick={() => refetchTrip()} data-testid="button-retry-trip-fetch">
          Retry
        </Button>
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

  // Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the Trip Card does not exist before Make
  // final. A trip with NO final renders an honest notice + one action to the slip, and NOTHING else —
  // planning lives on /plans/:tripId, never on /trip/:id. This is the sentence that closes the
  // flow-audit's "/trip/:id is a second planning surface" finding. `plancardData.trip.finalVersion`
  // is the source of truth: null ⇒ no final has ever been cut (finalizedAt alone can't tell "never
  // finalized" from "reopened"). We wait for the plancard query to resolve so the notice never
  // flashes ahead of data; an errored/absent payload falls through to the normal render.
  if (!itineraryLoading && plancardData != null && plancardData.trip?.finalVersion == null) {
    return (
      <div
        className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center"
        data-testid="trip-not-final-notice"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Not final yet</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          Your plan for {trip.destination} is on the slip. Finish it there and make it final — your
          Trip Card appears here once you do.
        </p>
        <Link href={`/plans/${trip.id}`}>
          <Button data-testid="button-go-to-slip">Go to your plan</Button>
        </Link>
      </div>
    );
  }

  const startDate = parseCalendarDate(trip.startDate);
  const endDate = parseCalendarDate(trip.endDate);
  const duration = startDate && endDate ? differenceInDays(endDate, startDate) + 1 : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Header */}
      <div className="relative h-[45vh] min-h-[350px]">
        <img 
          src={`https://picsum.photos/seed/${encodeURIComponent(trip.destination)}/1600/900`}
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
              {/* Phase 3b (drift-audit §C row 3): the dead `trip.status` badge is removed — trips.status
                  is a §13 dead field (never advances past its born value); a trip's phase derives from
                  dates, never this column. */}
              {/* Mobile-lens audit #9: read-only badge for the additive `expertWorkspaceStatus`
                  field a sibling change adds to GET /api/trips/:id (nullable — coded
                  defensively in case this lands before that field does). Honest: renders
                  nothing when there's no assigned expert / no workspace activity yet. */}
              {(() => {
                const status = (trip as any).expertWorkspaceStatus as string | null | undefined;
                if (status === "draft" || status === "in_review") {
                  return (
                    <Badge className="bg-amber-500/80 backdrop-blur-md text-white border-0" data-testid="badge-expert-workspace-status">
                      Expert draft in progress
                    </Badge>
                  );
                }
                if (status === "delivered") {
                  return (
                    <Badge className="bg-emerald-600/80 backdrop-blur-md text-white border-0" data-testid="badge-expert-workspace-status">
                      Delivered by your expert
                    </Badge>
                  );
                }
                return null;
              })()}
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">{trip.title}</h1>
            <div className="flex flex-wrap gap-6 text-white/90">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {startDate && endDate
                  ? `${format(startDate, "MMMM d")} – ${format(endDate, "MMMM d, yyyy")}`
                  : "Dates not set"}
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

      {/* G7: "Plan ready" banner — shown after optimization redirect */}
      {showOptimizedBanner && (
        <div className="container mx-auto px-4 mt-3 relative z-20">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg,#1a7f5a,#2aab7c)", color: "#fff" }}
            data-testid="banner-plan-ready"
          >
            <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Your optimized plan is ready</p>
              <p className="text-xs opacity-90 mt-0.5">
                AI Optimizer · just now
                {optimizationDelta?.savings != null && optimizationDelta.savings > 0 && (
                  <> · saved <strong>${Math.round(optimizationDelta.savings)}</strong></>
                )}
                {optimizationDelta?.savingsPercent != null && optimizationDelta.savingsPercent > 0 && (
                  <> · <strong>{Math.round(optimizationDelta.savingsPercent)}%</strong> tighter schedule</>
                )}
                {optimizationDelta?.starRatingDelta != null && optimizationDelta.starRatingDelta > 0 && (
                  <> · ⭐ +{optimizationDelta.starRatingDelta.toFixed(1)} rating</>
                )}
              </p>
            </div>
            <button
              onClick={() => {
                setShowOptimizedBanner(false);
                // Remove ?optimized=1 from URL without a full reload
                const params = new URLSearchParams(searchStr);
                params.delete("optimized");
                const newQ = params.toString();
                setLocation(`/trip/${id}${newQ ? `?${newQ}` : ""}`);
              }}
              className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
              data-testid="button-dismiss-optimized-banner"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      )}

      {/* Content */}
      <div className="container mx-auto px-4 -mt-6 relative z-10">
        <Card className="shadow-xl border-0">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b border-border px-6 pt-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  {/* Mobile-lens audit #7: min-h-11 keeps each trigger's touch target at the
                      ~44px guideline via padding growth only — labels/icons unchanged. */}
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="itinerary" data-testid="tab-itinerary" className="min-h-11">Itinerary</TabsTrigger>
                    <TabsTrigger value="bookings" data-testid="tab-bookings" className="min-h-11">Bookings</TabsTrigger>
                    <TabsTrigger value="expert" data-testid="tab-expert" className="min-h-11">Ask an Expert</TabsTrigger>
                    <TabsTrigger value="logistics" data-testid="tab-logistics" className="gap-1 min-h-11">
                      <Package className="w-3.5 h-3.5" />
                      Logistics
                    </TabsTrigger>
                    {isEventTrip && (
                      <TabsTrigger value="guests" data-testid="tab-guests" className="gap-1 min-h-11">
                        <UserPlus className="w-3.5 h-3.5" />
                        Guests
                      </TabsTrigger>
                    )}
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
                    {/* Phase 3b (drift-audit §C row 5): the destructive "Regenerate Plan" is removed
                        from the Trip Card entirely — no Regenerate on the card ever again. Rebuilding
                        the AI plan is a planning action and lives on the slip; the card renders the
                        finalized snapshot only. */}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <TabsContent value="itinerary" className="mt-0 space-y-6">
                  {/* Flight & hotel time capture — surfaced in the primary trip view
                      (was only reachable in the buried Logistics tab). Reuses the
                      canonical TemporalAnchorManager filtered to the 4 flight/hotel
                      anchor types. Optional; never blocks. */}
                  {id && (
                    <Collapsible open={showAnchorCapture} onOpenChange={setShowAnchorCapture}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          data-testid="button-toggle-anchor-capture"
                        >
                          <span className="flex items-center gap-2">
                            <Plane className="w-4 h-4 text-blue-600" />
                            Add flight &amp; hotel times (optional)
                          </span>
                          <ChevronRight className={`w-4 h-4 transition-transform ${showAnchorCapture ? "rotate-90" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <TemporalAnchorManager
                          tripId={id}
                          allowedTypes={["flight_arrival", "flight_departure", "hotel_checkin", "hotel_checkout"]}
                          title="Flight & hotel times"
                          description="Add arrival, departure, and check-in/out times so we can build a realistic plan around them."
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Itinerary Timeline */}
                  {itineraryLoading ? (
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
                  ) : itineraryError ? (
                    /* Mobile-lens audit #6: a failed itinerary fetch previously fell into the
                       "No Itinerary Yet" branch below, wrongly inviting the traveler to
                       generate a fresh (destructive) plan during a network blip. Distinct
                       honest error + retry instead. */
                    <div className="text-center py-16" data-testid="itinerary-network-error">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Can't reach Traveloure</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        We couldn't load your itinerary. Check your connection and try again.
                      </p>
                      <Button onClick={() => refetchItinerary()} data-testid="button-retry-itinerary-fetch">
                        Retry
                      </Button>
                    </div>
                  ) : !hasExistingItineraryItems ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Itinerary Yet</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        Generate a personalized day-by-day plan for {trip.destination} using AI.
                      </p>
                      {/* Phase 3b (drift-audit §C row 5): the on-card "Generate My Itinerary"
                          (destructive generate) is removed — planning/generation lives on the slip,
                          never the card. The planning entry stays as a single link. */}
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          onClick={() => openPlanning({ branch: "ai", destination: trip?.destination, tripId: trip?.id })}
                          data-testid="button-plan-with-preferences"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          Plan with Preferences
                        </Button>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const planCardTrip: PlanCardTrip = {
                        id: trip.id,
                        destination: trip.destination ?? "",
                        title: trip.title ?? undefined,
                        startDate: (() => {
                          return calendarDateToIso(trip.startDate);
                        })(),
                        endDate: (() => {
                          return calendarDateToIso(trip.endDate);
                        })(),
                        numberOfTravelers: trip.numberOfTravelers ?? 1,
                        budget: trip.budget ?? undefined,
                        eventType: trip.eventType ?? undefined,
                      };
                      const liveDayNumber = computeLiveDayNumber(trip.startDate, trip.endDate);
                      const initialDayIndex = liveDayNumber == null
                        ? -1
                        : (plancardData?.days ?? []).findIndex((day) => day.dayNum === liveDayNumber);

                      return (
                        <PlanCard
                          role="owner"
                          stage="full"
                          trip={planCardTrip}
                          initialSelectedDay={initialDayIndex >= 0 ? initialDayIndex : 0}
                        />
                      );
                    })()
                  )}
                </TabsContent>

                <TabsContent value="bookings" className="mt-0">
                  <div className="space-y-6">
                    {/* Phase 2 (ledger 2026-08-31-two-surfaces-one-handoff, drift-audit §C row 6):
                        the stale "Booking Summary / Total Pending" card that summed a
                        `generatedItinerary` jsonb blob is REMOVED. The Trip Card renders live
                        booking status from the finalized snapshot joined to real service_bookings
                        rows — a stale blob must never be the money source of truth. */}
                    <div className="text-center py-16">
                      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                        <Plane className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Bookings Yet</h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        Add flights, hotels, and activities to your trip to keep everything organized in one place.
                      </p>
                      {/* Phase 3b (drift-audit §C row 7): the inert "Add a Booking" button (no handler)
                          is removed — adding a booking happens on the slip / marketplace, not here. */}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="expert" className="mt-0">
                  <div className="space-y-8 py-4">
                    {/* Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the advisor card
                        (row 9), the duplicate EscalationCTA (row 8) and the expert-suggestion
                        accept/decline panel (row 11) were removed here. The assigned expert and its
                        message affordance are carried by the family's advisor strip (A10/A12,
                        summary card) + full-stage EscalationCTA (B10); suggestion review moved to
                        the slip family (ExpertSuggestionsPanel); assigning an expert (row 10) moved
                        to the slip (AssignExpertDialog). */}

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
                                    data-testid={`button-add-to-cart-${service.id}`}
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

                {isEventTrip && (
                  <TabsContent value="guests" className="mt-0">
                    {linkedExperience ? (
                      <GuestInviteManager
                        experienceId={linkedExperience.id}
                        eventName={linkedExperience.title || trip?.title || trip?.destination || "Your event"}
                        eventDestination={linkedExperience.location || trip?.destination || ""}
                        eventDate={(linkedExperience.eventDate as string | null) || (trip?.startDate as unknown as string) || new Date().toISOString()}
                      />
                    ) : (
                      <div className="py-14 flex flex-col items-center gap-4 text-center">
                        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserPlus className="w-7 h-7 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground mb-1">Set up your guest list</p>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            Track RSVPs, send invites, and manage attendees for{" "}
                            {trip?.title || trip?.destination || "this event"}.
                          </p>
                        </div>
                        <Button
                          onClick={() => createGuestListMutation.mutate()}
                          disabled={createGuestListMutation.isPending}
                          data-testid="button-setup-guest-list"
                        >
                          {createGuestListMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up…</>
                          ) : (
                            <><UserPlus className="w-4 h-4 mr-2" />Set up guest list</>
                          )}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

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

      {/* Stage 3.1 re-plan now rides the global planning entry (ruling
          2026-08-28-single-planning-entry): the button above deep-opens the AI
          branch with this trip's destination — same modal, one mount, in
          PlanningProvider. */}

      {/* Phase 3b (drift-audit §C row 5): the Regenerate confirmation dialog is removed along with
          every on-card Regenerate/Generate affordance. */}
    </div>
  );
}
