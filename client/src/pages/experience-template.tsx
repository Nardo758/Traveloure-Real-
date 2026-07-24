import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation, Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { SEOHead } from "@/components/seo-head";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Search,
  Plus,
  X,
  Star,
  Clock,
  Calendar,
  MapPin,
  Check,
  Sparkles,
  ChevronDown,
  Wand2,
  SlidersHorizontal,
  Heart,
  Gem,
  Cake,
  Users,
  MessageCircle,
  ArrowLeft,
  Coins,
  Loader2,
  ShoppingCart,
  GitCompare,
  Plane,
  Hotel,
  Utensils,
  Camera,
  Music,
  Flower2,
  Car,
  Wine,
  Dumbbell,
  ShoppingBag,
  PartyPopper,
  GraduationCap,
  Baby,
  Home,
  Briefcase,
  Award,
  TreePine,
  Palmtree,
  Moon,
  Gift,
  Landmark,
  Package,
  Building2,
  Wrench,
  Ticket,
  Sun,
  Activity,
  Zap,
  ChefHat,
  UtensilsCrossed,
  Bus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trackSearchEvent } from "@/lib/analytics";
import { useAuth } from "@/hooks/use-auth";
import { ExperienceMap } from "@/components/experience-map";
import { ItineraryPreviewPanel } from "@/components/experience/itinerary-preview-panel";
import { ExpertChatWidget, CheckoutExpertBanner } from "@/components/expert-chat-widget";
import { AIMatchedExpertsSection } from "@/components/ai-matched-experts-section";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { ExperienceType, ExperienceTemplateTab, ProviderService, CustomVenue, UserExperience } from "@shared/schema";
import { filterServices, sortServices } from "@shared/service-filter";
import { SELECTION_CONTROL_SEED } from "@shared/selection-control-seed";
import { resolveSelectionsToFilterQuery, type SelectionControl, type SelectionOption } from "@shared/selection-controls";
import { CompactFilterBar } from "@/components/compact-filter-bar";
import { AddCustomVenueModal } from "@/components/add-custom-venue-modal";
import { FlightSearch } from "@/components/flight-search";
import { HotelSearch } from "@/components/hotel-search";
import { ServiceBrowser } from "@/components/service-browser";
import { ActivitySearch } from "@/components/activity-search";
import { AIItineraryBuilder } from "@/components/ai-itinerary-builder";
import { PlanCard } from "@/components/plancard/PlanCard";
import { TripTransportPlanner } from "@/components/trip-transport-planner";
import { AmadeusPOIs } from "@/components/amadeus-pois";
import { AmadeusSafety } from "@/components/amadeus-safety";
import { AmadeusTransfers } from "@/components/amadeus-transfers";
import { FeverEventsSection } from "@/components/fever-events-section";
import { VenueSearchPanel, TAB_FALLBACK_CONFIG } from "@/components/venue-search-panel";
import { ActivityCard } from "@/components/travelpayouts/ActivityCard";
import { ESimCard } from "@/components/travelpayouts/ESimCard";
import { HotelCard } from "@/components/travelpayouts/HotelCard";
import type { CatalogItem } from "@/types/catalog";
import { CuratedContentSection } from "@/components/curated-content-section";
import { updateTripContext, useTripContext } from "@/lib/trip-context";
import { EditTripPanel } from "@/components/trip/edit-trip-panel";

interface VenueResult {
  id: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photos?: string[];
  phone?: string;
  website?: string;
  openingHours?: string;
  types?: string[];
}

const PRICE_SYMBOLS: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

function RestaurantCatalogSection({ destination }: { destination: string }) {
  const { data, isLoading } = useQuery<{ results: VenueResult[]; count: number }>({
    queryKey: ["/api/venues/search", { location: destination, type: "restaurant" }],
    enabled: !!destination,
  });

  const items = data?.results || [];

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Utensils className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Restaurants in {destination}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Utensils className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Restaurants in {destination}</h3>
        <span className="text-xs text-muted-foreground">({items.length} found via Google)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <div
            key={item.id}
            className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
            data-testid={`card-restaurant-${item.id}`}
          >
            {item.photos?.[0] && (
              <img src={item.photos[0]} alt={item.name} className="w-full h-32 object-cover" />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-semibold text-sm line-clamp-1" data-testid={`text-restaurant-name-${item.id}`}>
                  {item.name}
                </h4>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.rating && (
                    <span className="text-xs text-amber-600 font-medium">★ {item.rating.toFixed(1)}</span>
                  )}
                  {item.priceLevel && (
                    <span className="text-xs text-muted-foreground">{PRICE_SYMBOLS[item.priceLevel] ?? ""}</span>
                  )}
                </div>
              </div>
              {item.address && (
                <p className="text-xs text-muted-foreground line-clamp-1">{item.address}</p>
              )}
              {item.reviewCount && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.reviewCount.toLocaleString()} reviews</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {item.website ? (
                  <a
                    href={item.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs bg-primary text-white rounded-md h-7 px-2 hover:bg-primary/90 transition-colors"
                    data-testid={`link-restaurant-website-${item.id}`}
                  >
                    Reserve / View →
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(item.name + " " + destination + " restaurant reservation")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs bg-primary text-white rounded-md h-7 px-2 hover:bg-primary/90 transition-colors"
                    data-testid={`link-restaurant-search-${item.id}`}
                  >
                    Find & Reserve →
                  </a>
                )}
                <a
                  href={`/experts?destination=${encodeURIComponent(destination)}&topic=dining`}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs border border-primary/30 text-primary rounded-md h-7 px-2 hover:bg-primary/5 transition-colors"
                  data-testid={`link-expert-restaurant-${item.id}`}
                >
                  Ask an Expert
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingComCatalogSection({ destination }: { destination: string }) {
  const { data, isLoading } = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/booking", destination],
    enabled: !!destination,
    queryFn: async () => {
      const params = new URLSearchParams({ destination, limit: "5" });
      const res = await fetch(`/api/catalog/booking?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Booking.com results");
      return res.json();
    },
  });

  const items = data?.items || [];

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Hotels via Booking.com</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Hotels via Booking.com</h3>
        <Badge className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100 ml-1">via Travelpayouts ⚡</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <HotelCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function isLikelyInternational(destination: string, origin: string): boolean {
  if (!destination) return false;
  const parts = destination.split(",");
  if (parts.length < 2) return true;
  const destCountry = parts[parts.length - 1].trim().toLowerCase();
  return !origin.toLowerCase().includes(destCountry);
}

function extractDestCountry(destination: string): string {
  const parts = destination.split(",");
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return destination.trim();
}

function ESimSidebarWidget({ destination, origin }: { destination: string; origin: string }) {
  const international = isLikelyInternational(destination, origin);
  const destCountry = extractDestCountry(destination);

  const { data, isLoading } = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/esim", { country: destCountry }],
    enabled: !!destCountry && international,
  });

  const items = data?.items?.slice(0, 3) ?? [];

  if (!international || isLoading || items.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border-violet-100 dark:border-violet-800 p-4 space-y-2" data-testid="esim-sidebar-widget">
      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
        📶 Stay connected abroad — eSIM plans via Airalo
      </p>
      <p className="text-xs text-muted-foreground -mt-1">
        Instant data when you land. No physical SIM needed.
      </p>
      <div className="space-y-2 pt-1">
        {items.map(item => (
          <ESimCard key={item.id} item={item} compact />
        ))}
      </div>
    </div>
  );
}

function TravelpayoutsActivities({ destination }: { destination: string }) {
  const tiqetsQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/tiqets", destination],
    enabled: !!destination,
  });
  const wegoQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/wegotrip", destination],
    enabled: !!destination,
  });
  const viatorFeedQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/viator-feed", destination],
    enabled: !!destination,
  });
  const gygQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/activities-gyg", destination],
    enabled: !!destination,
  });
  const klookQuery = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/klook", destination],
    enabled: !!destination,
  });

  const allItems = [
    ...(gygQuery.data?.items || []),
    ...(tiqetsQuery.data?.items || []),
    ...(wegoQuery.data?.items || []),
    ...(viatorFeedQuery.data?.items || []),
    ...(klookQuery.data?.items || []),
  ];

  const isLoading = tiqetsQuery.isLoading || wegoQuery.isLoading || viatorFeedQuery.isLoading || gygQuery.isLoading || klookQuery.isLoading;

  if (isLoading) return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );

  if (allItems.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-primary" />
        More Activities via Partners
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {allItems.map(item => (
          <ActivityCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}


interface CartItem {
  id: string;
  cartItemId?: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  date?: string;
  details?: string;
  provider?: string;
  isExternal?: boolean;
  metadata?: {
    cabin?: string;
    baggage?: string;
    stops?: number;
    duration?: string;
    airline?: string;
    flightNumber?: string;
    departureTime?: string;
    arrivalTime?: string;
    seatsLeft?: number;
    lastTicketingDate?: string;
    refundable?: boolean;
    cancellationDeadline?: string;
    boardType?: string;
    bedInfo?: string;
    roomCategory?: string;
    taxTotal?: number;
    nights?: number;
    pricePerNight?: number;
    checkInDate?: string;
    checkOutDate?: string;
    travelers?: number;
    meetingPoint?: string;
    meetingPointCoordinates?: { lat: number; lng: number };
    affiliateUrl?: string;
    rawData?: any;
  };
}

interface TabControlConfig {
  priceRange?: { min: number; max: number; step: number; default: number; label?: string };
  stops?: Array<{ value: string; label: string }>;
  starRatings?: number[];
  sortOptions?: Array<{ value: string; label: string }>;
  // P462 reconcile: lean per-tab selection controls (replace the inert facet wall)
  selectionControls?: SelectionControl[];
}

interface TabConfig {
  id: string;
  label: string;
  icon: any;
  category: string | null;
  tabType?: string;
  controlConfig?: TabControlConfig;
}

interface ContextField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  placeholder?: string;
  options?: string[];
}

const WEDDING_VENDOR_TYPES = [
  { value: 'photographer', label: 'Photographers' },
  { value: 'florist', label: 'Florists' },
  { value: 'caterer', label: 'Caterers' },
  { value: 'dj', label: 'DJs & Musicians' },
  { value: 'planner', label: 'Wedding Planners' },
  { value: 'videographer', label: 'Videographers' },
  { value: 'makeup', label: 'Makeup Artists' },
  { value: 'baker', label: 'Cake Bakers' }
];


// P5: DB-driven tab icon registry — maps DB icon string → Lucide component
const DB_TAB_ICON_MAP: Record<string, any> = {
  MapPin, Home, Sun, Moon, UtensilsCrossed, Users, Activity, Star, Plane,
  Building: Building2, Building2, Car, Music, Calendar, Sparkles, Gift,
  Camera, ChefHat, Zap, Heart, Hotel, Utensils, Bus, Dumbbell, Wrench,
  Landmark, Award, Package, Wine, Palmtree, PartyPopper, TreePine,
  Baby, GraduationCap, Flower2, Ticket,
};

// Derive tabType from slug when the DB field is null/default
function deriveTabType(slug: string): string {
  if (slug === "flights") return "flights";
  if (slug === "hotels" || slug === "accommodations" || slug.includes("accommodation")) return "hotels";
  if (slug === "transportation" || slug === "transfers") return "transport";
  if (slug === "activities" || slug.includes("activities")) return "activities";
  if (slug === "events") return "events";
  if (slug === "services") return "services";
  if (slug === "dining" || slug.includes("dining")) return "dining";
  if (slug === "nightlife" || slug.includes("nightlife")) return "nightlife";
  if (slug === "vendors") return "vendors";
  return "venue-search";
}

function dbTabsToConfig(tabs: ExperienceTemplateTab[], templateSlug: string): TabConfig[] {
  return tabs.map((tab) => {
    const controlConfig = (tab as any).controlConfig as TabControlConfig | undefined;
    const seededSelectionControls = SELECTION_CONTROL_SEED[templateSlug]?.[tab.slug];

    return {
      id: tab.slug,
      label: tab.name,
      icon: DB_TAB_ICON_MAP[tab.icon || ""] || MapPin,
      category: tab.slug,
      tabType: (tab as any).tabType ?? deriveTabType(tab.slug),
      controlConfig: seededSelectionControls && !(controlConfig?.selectionControls?.length)
        ? { ...controlConfig, selectionControls: seededSelectionControls }
        : controlConfig,
    };
  });
}

const slugAliases: Record<string, string> = {
  "romance": "date-night",
  "corporate": "corporate-events",
};

function resolveSlug(slug: string): string {
  return slugAliases[slug] || slug;
}

interface OptimizationPreview {
  estimatedSavingsPct: number;
  estimatedCostDelta: number;
  estimatedScheduleTighteningPct: number;
  currentScore: number;
  complexityTier: "simple" | "standard" | "complex";
  feeCents: number;
  currency: string;
  freeRerun: boolean;
  metrics: {
    balanceScore: number;
    wellnessScore: number;
    paceScore: number;
    diversityScore: number;
  };
}

function AIOptimizationTab({
  experienceType,
  destination,
  date,
  cart
}: {
  experienceType: ExperienceType;
  destination: string;
  date?: Date;
  cart: CartItem[];
}) {
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOptimization = async () => {
    setOptimizing(true);
    setError(null);

    // CON-A.P1: free preview path. Full LLM optimization lives behind the paid
    // /api/optimization-payments gate, surfaced via the Concierge UI (Phase 6).
    const items = cart.map((item, i) => ({
      serviceType: item.type || "activity",
      price: item.price,
      duration: 90,
      dayNumber: Math.floor(i / 3) + 1,
    }));

    try {
      const response = await fetch("/api/optimization-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items,
          eventType: experienceType.name,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to optimize");
      }

      const data: OptimizationPreview = await response.json();
      setResult(data);
    } catch (err) {
      setError("Unable to run optimization. Please try again.");
    } finally {
      setOptimizing(false);
    }
  };

  if (result) {
    const savingsDollars = Math.abs(result.estimatedCostDelta);
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white",
                result.currentScore >= 80 ? "bg-green-500" :
                result.currentScore >= 60 ? "bg-amber-500" : "bg-red-500"
              )}>
                {result.currentScore}
              </div>
              <div>
                <h3 className="text-xl font-semibold">Optimization Preview</h3>
                <p className="text-sm text-muted-foreground">
                  Heuristic estimate of how much we could improve your plan.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setResult(null)} data-testid="button-reoptimize">
              Run Again
            </Button>
          </div>

          {savingsDollars > 0 && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-4 mb-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold">
                  Potential savings: ${savingsDollars} ({result.estimatedSavingsPct}%)
                </span>
              </div>
            </div>
          )}
          {result.estimatedScheduleTighteningPct > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">
                  Schedule could be {result.estimatedScheduleTighteningPct}% tighter
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Score breakdown
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Balance", value: result.metrics.balanceScore },
              { label: "Wellness", value: result.metrics.wellnessScore },
              { label: "Pace", value: result.metrics.paceScore },
              { label: "Diversity", value: result.metrics.diversityScore },
            ].map(m => (
              <div key={m.label} className="p-3 rounded-md bg-muted/50">
                <div className="text-xs text-muted-foreground">{m.label}</div>
                <div className="text-lg font-semibold">{m.value}/100</div>
              </div>
            ))}
          </div>
        </Card>

        {/* CON-A.P6 / step 4: paid-upgrade CTA on the legacy preview surface.
            Routes to the Concierge entry, where the AI tier card converts to the
            gated paid path (/api/optimization-payments → /confirm). */}
        <Card className="p-5 border-primary/40 bg-primary/5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div>
                <p className="font-semibold text-sm">Want the full AI-optimized plan?</p>
                <p className="text-xs text-muted-foreground">
                  Heuristic preview shown above. The full AI Concierge plan rearranges your
                  itinerary, adds recommendations, and is delivered through the Concierge surface.
                </p>
              </div>
              <Link
                href={`/concierge?tier=ai&eventType=${encodeURIComponent(experienceType.name)}&intent=${encodeURIComponent('Optimize my ' + experienceType.name.toLowerCase() + ' in ' + destination)}`}
              >
                <Button size="sm" className="w-full sm:w-auto" data-testid="button-concierge-upgrade-from-preview">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Get the full plan via Concierge
                </Button>
              </Link>
              {/* Upfront fee transparency — the AI optimize / coordination fees are
                  config-resolved and shown on /pricing (no literals duplicated here). */}
              <Link href="/pricing">
                <span className="block text-xs text-muted-foreground underline cursor-pointer hover:text-foreground mt-1" data-testid="link-experience-pricing">
                  See planning &amp; coordination fees
                </span>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="p-8 text-center">
      <Wand2 className="w-12 h-12 text-primary mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2">AI Optimization</h3>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">
        Let our AI analyze your selections and optimize your {experienceType.name.toLowerCase()} plan
        for the best experience, timing, and value.
      </p>
      
      {cart.length === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
          Add some items to your cart first for better optimization results.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-500 mb-4">{error}</p>
      )}

      <Button 
        className="bg-primary " 
        onClick={runOptimization}
        disabled={optimizing}
        data-testid="button-optimize"
      >
        {optimizing ? (
          <>
            <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Optimizing...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Optimize My {experienceType.name}
          </>
        )}
      </Button>
    </Card>
  );
}

export default function ExperienceTemplatePage() {
  // Try matching both /experiences/:slug and /experiences/:slug/new
  const [matchBase, paramsBase] = useRoute("/experiences/:slug");
  const [matchNew, paramsNew] = useRoute("/experiences/:slug/new");
  const params = matchNew ? paramsNew : paramsBase;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const rawSlug = params?.slug || "";
  const slug = resolveSlug(rawSlug);
  
  const { data: experienceType, isLoading: typeLoading } = useQuery<ExperienceType>({
    queryKey: ["/api/experience-types", slug],
    enabled: !!slug,
  });

  // P5: DB-driven tabs (prefer over hardcoded config.tabs once loaded)
  const { data: dbTabs } = useQuery<ExperienceTemplateTab[]>({
    queryKey: ["/api/experience-types", experienceType?.id, "tabs"],
    enabled: !!experienceType?.id,
  });

  const { data: services, isLoading: servicesLoading } = useQuery<ProviderService[]>({
    queryKey: ["/api/provider-services"],
  });

  interface ServerCartItem {
    id: string;
    serviceId: string;
    quantity: number;
    service: { id: string; serviceName: string; price: string; location?: string } | null;
  }

  interface ServerCartData {
    items: ServerCartItem[];
    subtotal: string;
    total: string;
    itemCount: number;
  }

  const { data: serverCart, refetch: refetchCart } = useQuery<ServerCartData>({
    queryKey: ["/api/cart", { experience: slug }],
    enabled: !!slug,
  });

  const { data: allUserExperiences } = useQuery<UserExperience[]>({
    queryKey: ["/api/user-experiences"],
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: serviceCategories } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ["/api/service-categories"],
  });

  const linkedExperience = allUserExperiences
    ?.filter((e) => e.experienceTypeId === experienceType?.id && !!e.tripId)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
  const linkedTripId = linkedExperience?.tripId ?? null;

  const [localExternalCart, setLocalExternalCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(`externalCart_${slug}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(`externalCart_${slug}`);
      setLocalExternalCart(stored ? JSON.parse(stored) : []);
    } catch {
      setLocalExternalCart([]);
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localExternalCart.length > 0) {
      sessionStorage.setItem(`externalCart_${slug}`, JSON.stringify(localExternalCart));
    } else {
      sessionStorage.removeItem(`externalCart_${slug}`);
    }
  }, [localExternalCart, slug]);

  const cart: CartItem[] = useMemo(() => {
    const platformItems: CartItem[] = serverCart?.items ? serverCart.items.map((item) => ({
      id: item.serviceId,
      cartItemId: item.id,
      type: "service",
      name: item.service?.serviceName || "Unknown Service",
      price: parseFloat(item.service?.price || "0"),
      quantity: item.quantity || 1,
      provider: "Platform Provider",
    })) : [];
    return [...platformItems, ...localExternalCart];
  }, [serverCart, localExternalCart]);

  // Read query params for pre-filled destination
  const searchString = useSearch();
  const queryParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const destinationFromQuery = queryParams.get("destination");
  const destinationsFromQuery = queryParams.get("destinations"); // For multi-city
  const countryFromQuery = queryParams.get("country");
  const isMultiCity = queryParams.get("multiCity") === "true";
  
  // Read persisted settings ONCE on initial render (SSR-safe, memoized)
  const initialSettings = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`searchSettings_${slug}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []); // Empty deps - only read once on mount
  
  // Helper to get persisted settings (used for slug changes and rehydration)
  const getPersistedSearchSettings = (currentSlug: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`searchSettings_${currentSlug}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };
  
  // Initialize state from query params first, then persisted settings
  // For multi-city, combine all destinations into comma-separated string initially  
  const getInitialDestination = () => {
    if (destinationsFromQuery) {
      return destinationsFromQuery; // Multi-city destinations
    }
    if (destinationFromQuery) {
      return countryFromQuery ? `${destinationFromQuery}, ${countryFromQuery}` : destinationFromQuery;
    }
    return initialSettings?.destination ?? "";
  };
  
  const [destination, setDestination] = useState(getInitialDestination);
  // Destination-prompt modal: the content sections (curated, venues, catalog) all require a
  // destination and render empty without one. When the template is opened without a destination
  // (e.g. from an experience card / landing link that carries no ?destination=), prompt for it up
  // front so the page populates instead of looking broken.
  const [showDestPrompt, setShowDestPrompt] = useState(false);
  const [destPromptInput, setDestPromptInput] = useState("");
  const [originCity, setOriginCity] = useState(initialSettings?.originCity ?? "");
  const [originCode, setOriginCode] = useState(initialSettings?.originCode ?? "");
  const [startDate, setStartDate] = useState<Date | undefined>(initialSettings?.startDate ? new Date(initialSettings.startDate) : undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(initialSettings?.endDate ? new Date(initialSettings.endDate) : undefined);
  const [activeTab, setActiveTab] = useState(initialSettings?.activeTab ?? "venue");
  const [searchQuery, setSearchQuery] = useState(initialSettings?.searchQuery ?? "");
  const [priceRange, setPriceRange] = useState(initialSettings?.priceRange ?? [0, 500]);
  const [minRating, setMinRating] = useState(initialSettings?.minRating ?? 0);
  const [sortBy, setSortBy] = useState(initialSettings?.sortBy ?? "popular");
  const [selectedFilters, setSelectedFilters] = useState<string[]>(initialSettings?.selectedFilters ?? []);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(initialSettings?.selectedInterests ?? []);
  const [vendorType, setVendorType] = useState<string>(initialSettings?.vendorType ?? "photographer");
  
  // Flight-specific filters
  const [flightMaxPrice, setFlightMaxPrice] = useState(initialSettings?.flightMaxPrice ?? 2000);
  const [flightStops, setFlightStops] = useState<"any" | "nonstop" | "1stop">(initialSettings?.flightStops ?? "any");
  const [flightSortBy, setFlightSortBy] = useState<"price" | "duration" | "departure">(initialSettings?.flightSortBy ?? "price");
  
  // Hotel-specific filters
  const [hotelMaxPrice, setHotelMaxPrice] = useState(initialSettings?.hotelMaxPrice ?? 5000);
  const [hotelStarRating, setHotelStarRating] = useState<number>(initialSettings?.hotelStarRating ?? 0);
  const [hotelSortBy, setHotelSortBy] = useState<"price" | "rating">(initialSettings?.hotelSortBy ?? "price");
  const [adults, setAdults] = useState(initialSettings?.adults ?? 2);
  const [kids, setKids] = useState(initialSettings?.kids ?? 0);
  // P3b: the global Trip Strip owns the destination/dates/party quartet — this
  // page no longer renders its own controls for them. State vars stay (many
  // downstream catalog queries + context writes read them); they now sync FROM
  // the site-wide TripContext, and the shared EditTripPanel is the edit surface.
  const [tripCtx] = useTripContext();
  const [editTripOpen, setEditTripOpen] = useState(false);
  // Flips true once the mount-time context→local sync has run, so the persist
  // effect can't write stale local defaults over the strip's values first.
  const [ctxApplied, setCtxApplied] = useState(false);
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState("all");
  const [serviceDistanceFilter, setServiceDistanceFilter] = useState("any");
  // P4: controlled state for DB contextFields inputs
  const [contextValues, setContextValues] = useState<Record<string, string>>({});
  const [detailsSubmitted, setDetailsSubmitted] = useState(initialSettings?.detailsSubmitted ?? false);
  const [showMobileMap, setShowMobileMap] = useState(false);
  // Right-panel view toggle: the map, or the live Itinerary Preview of the plan-so-far.
  const [rightPanelView, setRightPanelView] = useState<"map" | "preview">("map");
  
  
  // Wedding mode state (planning vs guest activities)
  const [weddingMode, setWeddingMode] = useState<"planning" | "guest">("planning");
  
  // P5: effectiveTabs — DB is the single source of truth; experienceConfigs no longer drives structure
  const effectiveTabs = useMemo(() => {
    if (!dbTabs || dbTabs.length === 0) return [];
    const allTabs = dbTabsToConfig(dbTabs, slug);
    // Wedding guest-mode: filter to guest-relevant tabTypes only (DB-driven)
    if (slug === "wedding" && weddingMode === "guest") {
      const GUEST_TAB_TYPES = new Set(["activities", "dining", "nightlife", "events", "hotels", "venue-search"]);
      const filtered = allTabs.filter(t => GUEST_TAB_TYPES.has(t.tabType ?? deriveTabType(t.id)));
      return filtered.length > 0 ? filtered : allTabs;
    }
    return allTabs;
  }, [dbTabs, slug, weddingMode]);

  // P5: Reset activeTab when dbTabs loads and current tab isn't present
  useEffect(() => {
    if (!dbTabs || dbTabs.length === 0) return;
    const tabIds = dbTabsToConfig(dbTabs, slug).map((t) => t.id);
    if (!tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0] ?? "venue");
    }
  }, [dbTabs, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Track whether we've done initial hydration
  const hasHydratedRef = useRef(false);
  const prevSlugRef = useRef(slug);
  
  // Rehydrate state on mount (for when returning from cart) and when slug changes
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;
    
    // Run if: first hydration OR slug changed
    const isSlugChange = prevSlugRef.current !== slug;
    const needsHydration = !hasHydratedRef.current || isSlugChange;
    
    if (needsHydration) {
      hasHydratedRef.current = true;
      prevSlugRef.current = slug;
      
      const settings = getPersistedSearchSettings(slug);
      
      // P5: DB-only-safe default — DB tabs aren't available here yet;
      // a separate useEffect syncs activeTab once dbTabs loads.
      const defaultActiveTab = settings?.activeTab ?? "venue";
      
      // Priority: query params > sessionStorage trip queue > stored settings > defaults
      // Check for destination from query params or sessionStorage (from Take me Here feature)
      let destinationValue = settings?.destination ?? "";
      
      // First check query params
      if (destinationsFromQuery) {
        destinationValue = destinationsFromQuery;
      } else if (destinationFromQuery) {
        destinationValue = countryFromQuery ? `${destinationFromQuery}, ${countryFromQuery}` : destinationFromQuery;
      }
      
      // If no query params, check sessionStorage for trip queue destinations
      if (!destinationValue) {
        const tripQueueDest = sessionStorage.getItem('tripQueueDestinations');
        if (tripQueueDest) {
          destinationValue = tripQueueDest;
          // Clear after reading so it doesn't persist across unrelated navigations
          sessionStorage.removeItem('tripQueueDestinations');
        }
      }
      
      // Merge stored settings with defaults (defaults used for missing fields)
      setDestination(destinationValue);
      setOriginCity(settings?.originCity ?? "");
      setOriginCode(settings?.originCode ?? "");
      setStartDate(settings?.startDate ? new Date(settings.startDate) : undefined);
      setEndDate(settings?.endDate ? new Date(settings.endDate) : undefined);
      setActiveTab(settings?.activeTab ?? defaultActiveTab);
      setSearchQuery(settings?.searchQuery ?? "");
      setPriceRange(settings?.priceRange ?? [0, 500]);
      setMinRating(settings?.minRating ?? 0);
      setSortBy(settings?.sortBy ?? "popular");
      setSelectedFilters(settings?.selectedFilters ?? []);
      setSelectedInterests(settings?.selectedInterests ?? []);
      setFlightMaxPrice(settings?.flightMaxPrice ?? 2000);
      setFlightStops(settings?.flightStops ?? "any");
      setFlightSortBy(settings?.flightSortBy ?? "price");
      setHotelMaxPrice(settings?.hotelMaxPrice ?? 5000);
      setHotelStarRating(settings?.hotelStarRating ?? 0);
      setHotelSortBy(settings?.hotelSortBy ?? "price");
      setAdults(settings?.adults ?? settings?.travelers ?? 2);
      setKids(settings?.kids ?? 0);
      setDetailsSubmitted(settings?.detailsSubmitted ?? false);
    }
  }, [slug, destinationsFromQuery, destinationFromQuery, countryFromQuery]);

  // P3b context→local sync: on mount and on every TripContext change, the
  // context wins over the per-slug searchSettings for the quartet. An explicit
  // ?destination= query param (fresh navigation intent) still wins for the
  // destination field — and reverse-syncs INTO the context via the persist
  // effect below. Guarded field-by-field so the reverse-sync can't loop.
  useEffect(() => {
    const hasDestFromQuery = !!(destinationsFromQuery || destinationFromQuery);
    if (tripCtx.destination && !hasDestFromQuery && tripCtx.destination !== destination) {
      setDestination(tripCtx.destination);
    }
    if (tripCtx.startDate && tripCtx.startDate !== startDate?.toISOString().split("T")[0]) {
      const next = new Date(tripCtx.startDate);
      if (!isNaN(next.getTime())) setStartDate(next);
    }
    if (tripCtx.endDate && tripCtx.endDate !== endDate?.toISOString().split("T")[0]) {
      const next = new Date(tripCtx.endDate);
      if (!isNaN(next.getTime())) setEndDate(next);
    }
    if (tripCtx.travelers && tripCtx.travelers > 0 && tripCtx.travelers !== adults + kids) {
      setAdults(tripCtx.travelers);
      setKids(0);
    }
    setCtxApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripCtx.destination, tripCtx.startDate, tripCtx.endDate, tripCtx.travelers, slug]);

  // Persist search settings to sessionStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const settingsToSave = {
      destination,
      originCity,
      originCode,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      activeTab,
      searchQuery,
      priceRange,
      minRating,
      sortBy,
      selectedFilters,
      selectedInterests,
      flightMaxPrice,
      flightStops,
      flightSortBy,
      hotelMaxPrice,
      hotelStarRating,
      hotelSortBy,
      adults,
      kids,
      detailsSubmitted,
    };
    sessionStorage.setItem(`searchSettings_${slug}`, JSON.stringify(settingsToSave));
    // P3b reverse-sync: any remaining internal setter (destination prompt, query
    // params, trip queue) still propagates to the site-wide TripContext. Merge
    // semantics + empty values skipped, so blanks never clobber the strip.
    // Gated on ctxApplied so the mount pass can't write stale local defaults
    // over the context before the context→local sync has applied.
    if (ctxApplied) {
      updateTripContext({
        destination: destination.trim() || undefined,
        startDate,
        endDate,
        travelers: adults + kids,
        experienceSlug: slug,
        experienceType: experienceType?.name,
      });
    }
  }, [
    slug, destination, originCity, originCode, startDate, endDate, activeTab,
    searchQuery, priceRange, minRating, sortBy, selectedFilters, selectedInterests,
    flightMaxPrice, flightStops, flightSortBy, hotelMaxPrice, hotelStarRating,
    hotelSortBy, adults, kids, detailsSubmitted, ctxApplied, experienceType?.name
  ]);
  
  const [cartOpen, setCartOpen] = useState(false);
  
  const [chatOpen, setChatOpen] = useState(false);
  const [aiOptimizeOpen, setAiOptimizeOpen] = useState(false);
  const [expertHelpDialogOpen, setExpertHelpDialogOpen] = useState(false);
  const [aiItineraryDialogOpen, setAiItineraryDialogOpen] = useState(false);
  const [expertHelpTab, setExpertHelpTab] = useState<"ai-match" | "chat">("ai-match");
  
  // Draggable Expert Chat button state
  const [chatButtonPos, setChatButtonPos] = useState({ x: 24, y: 24 }); // Distance from bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; buttonX: number; buttonY: number } | null>(null);
  
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    setHasDragged(false);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      buttonX: chatButtonPos.x,
      buttonY: chatButtonPos.y,
    };
  }, [chatButtonPos]);
  
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current) return;
    
    const deltaX = dragStartRef.current.x - clientX;
    const deltaY = dragStartRef.current.y - clientY;
    
    // Check if moved more than 5px to count as a drag
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      setHasDragged(true);
    }
    
    const newX = Math.max(24, Math.min(window.innerWidth - 80, dragStartRef.current.buttonX + deltaX));
    const newY = Math.max(24, Math.min(window.innerHeight - 80, dragStartRef.current.buttonY + deltaY));
    
    setChatButtonPos({ x: newX, y: newY });
  }, [isDragging]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);
  
  // Add global mouse/touch listeners for drag
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleTouchEnd = () => handleDragEnd();
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [creatingComparison, setCreatingComparison] = useState(false);
  const [addVenueModalOpen, setAddVenueModalOpen] = useState(false);
  
  // State for search result markers on map
  const [hotelSearchMarkers, setHotelSearchMarkers] = useState<Array<{ id: string; name: string; lat: number; lng: number; category: string; price: number; rating: number; description?: string }>>([]);
  const [activitySearchMarkers, setActivitySearchMarkers] = useState<Array<{ id: string; name: string; lat: number; lng: number; category: string; price: number; rating: number | null; description?: string }>>([]);

  // Geocode destination using server-side Google Maps Geocoding API for accurate city coordinates
  const [destinationCenter, setDestinationCenter] = useState<{ lat: number; lng: number } | null>(null);
  
  useEffect(() => {
    if (!destination || destination.length < 2) {
      return;
    }
    
    // Call server-side geocoding endpoint for secure API key handling
    const geocodeDestination = async () => {
      try {
        const response = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ address: destination }),
        });
        
        if (response.ok) {
          const data = await response.json();
          setDestinationCenter({ lat: data.lat, lng: data.lng });
        } else {
          console.warn("Geocoding failed:", response.status);
          setDestinationCenter(null);
        }
      } catch (error) {
        console.error("Geocoding error:", error);
        setDestinationCenter(null);
      }
    };
    
    geocodeDestination();
  }, [destination]);

  // Prompt for a destination on mount when none was provided (no ?destination= and no saved
  // settings). At mount `destination` already reflects saved settings, so this won't flash for
  // returning users. Once a destination is set (typed here or in the settings panel), close it.
  useEffect(() => {
    if (!destination.trim() && !destinationFromQuery && !destinationsFromQuery) {
      setShowDestPrompt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (destination.trim()) setShowDestPrompt(false);
  }, [destination]);

  const confirmDestPrompt = () => {
    const d = destPromptInput.trim();
    if (!d) return;
    setDestination(d);
    setShowDestPrompt(false);
  };

  const { data: customVenues = [] } = useQuery<CustomVenue[]>({
    queryKey: ["/api/custom-venues", { experienceType: slug }],
    enabled: !!slug,
  });

  const createComparison = async () => {
    if (cart.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add some services first" });
      return;
    }
    if (!user) {
      toast({ title: "Please sign in", description: "Sign in to use AI comparison" });
      return;
    }
    setCreatingComparison(true);
    
    const cartItems = cart.map((item) => ({
      name: item.name,
      category: item.type,
      price: item.price.toString(),
      provider: item.provider || "Provider",
      location: destination
    }));
    
    try {
      const response = await apiRequest("POST", "/api/itinerary-comparisons", {
        title: `${experienceType?.name || "Trip"} Experience`,
        destination: destination,
        startDate: startDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        endDate: endDate?.toISOString().split('T')[0] || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cartTotal.toString(),
        travelers: adults + kids,
        baselineItems: cartItems,
        experienceTypeSlug: slug || "travel",
      });
      
      const comparison = await response.json();
      // Also save to sessionStorage so the comparison page can retry if needed
      sessionStorage.setItem(`comparison_baseline_${comparison.id}`, JSON.stringify(cartItems));
      setCartOpen(false);
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      console.error("Failed to create comparison:", error);
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const { data: walletData } = useQuery<{ balance: number }>({
    queryKey: ["/api/wallet"],
    retry: false,
    staleTime: 30000,
  });

  const userCredits = walletData?.balance ?? 0;

  const { data: userComparisons = [] } = useQuery<any[]>({
    queryKey: ["/api/itinerary-comparisons"],
    retry: false,
    staleTime: 60_000,
  });

  const recentComparisonId = useMemo(() => {
    if (!destination || userComparisons.length === 0) return null;
    const dest = destination.toLowerCase().trim();
    const matching = userComparisons.filter(
      (c: any) => c.destination && c.destination.toLowerCase().trim().includes(dest)
    );
    if (matching.length === 0) return null;
    return matching[matching.length - 1].id as string;
  }, [userComparisons, destination]);

  const { data: recentComparisonData } = useQuery<any>({
    queryKey: ["/api/itinerary-comparisons", recentComparisonId],
    queryFn: async () => {
      const res = await fetch(`/api/itinerary-comparisons/${recentComparisonId}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!recentComparisonId,
    retry: false,
    staleTime: 60_000,
  });

  const recentVariantId: string | undefined = recentComparisonData?.variants?.[0]?.id;

  const dateError = useMemo(() => {
    if (startDate && endDate && endDate < startDate) {
      return "End date cannot be before start date";
    }
    return null;
  }, [startDate, endDate]);

  const canGenerateItinerary = !dateError && destination.trim();

  const generateItinerary = async () => {
    if (!canGenerateItinerary || cart.length === 0) return;
    setGeneratingItinerary(true);
    
    // Store experience context for cart page to use (dates normalized to
    // YYYY-MM-DD by the module — the previous full-ISO write broke date inputs).
    updateTripContext({
      experienceType: experienceType?.name,
      experienceSlug: slug,
      destination,
      startDate,
      endDate,
      travelers: adults + kids,
      // P4: include DB contextField values in AI itinerary prompt payload
      contextFields: Object.keys(contextValues).length > 0 ? contextValues : undefined,
      selectedServices: cart.map(item => ({
        name: item.name,
        provider: item.provider,
        price: item.price,
        category: item.type
      }))
    });
    
    // CON-A.P1: free preview path. Full LLM lives behind /api/optimization-payments
    // (Concierge surface, Phase 6) — this surface ships the heuristic preview only.
    const items = cart.map((item, i) => ({
      serviceType: item.type || "activity",
      price: item.price,
      duration: 90,
      dayNumber: Math.floor(i / 3) + 1,
    }));

    try {
      const response = await fetch("/api/optimization-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items,
          eventType: experienceType?.name,
        }),
      });
      if (response.ok) {
        const preview = await response.json();
        // Hand preview off to cart's existing "optimize" step (which already renders preview shape).
        sessionStorage.setItem("optimizationPreview", JSON.stringify(preview));
        setLocation("/cart?step=optimize");
      } else {
        // Go to cart without preview
        setLocation("/cart");
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
      setLocation("/cart");
    } finally {
      setGeneratingItinerary(false);
    }
  };

  // Tracks the last plan snapshot we shared with the expert queue, so repeated
  // "Get Expert Help" clicks don't spam a new lead for an unchanged plan.
  const lastSharedPlanRef = useRef<string>("");

  // Build a snapshot of everything the traveler has planned so far — the
  // "itinerary preview" work — to hand to the expert.
  const buildPlanSnapshot = () => ({
    source: "template" as const,
    experienceType: experienceType?.name,
    experienceSlug: slug,
    destination,
    originCity,
    startDate: startDate ? startDate.toISOString().split("T")[0] : undefined,
    endDate: endDate ? endDate.toISOString().split("T")[0] : undefined,
    travelers: adults + kids,
    interests: selectedInterests,
    cartItems: cart.map((i) => ({
      name: i.name,
      category: i.type,
      price: i.price,
      provider: i.provider || "Provider",
      quantity: i.quantity,
    })),
    cartTotal,
  });

  const openExpertChat = async () => {
    // Open the Expert Help dialog with AI matching + chat tabs.
    setExpertHelpDialogOpen(true);

    // Hand the traveler's current planning work to the expert queue so the
    // expert can help with the plan-in-progress, not a blank slate. Best-effort
    // and de-duplicated: only sends when signed in, a destination is set, and
    // the plan changed since the last share.
    if (!user || !destination.trim()) return;
    const snapshot = buildPlanSnapshot();
    const sig = JSON.stringify(snapshot);
    if (sig === lastSharedPlanRef.current) return;
    lastSharedPlanRef.current = sig;
    try {
      await fetch("/api/expert-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          destination,
          requestType: "template_inquiry",
          notes: `Traveler is planning a ${experienceType?.name || "trip"} to ${destination}` +
            (cart.length ? ` with ${cart.length} selected item(s) (~$${cartTotal}).` : "."),
          optimizationContext: { planSnapshot: snapshot },
        }),
      });
      toast({
        title: "Shared with an expert",
        description: "Your current plan was sent so an expert can jump right in.",
      });
    } catch {
      // Non-fatal — the dialog is already open; allow a retry on the next click.
      lastSharedPlanRef.current = "";
    }
  };
  
  const openAiItineraryBuilder = () => {
    // Open the AI Itinerary Builder dialog (powered by Grok)
    setAiItineraryDialogOpen(true);
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const isExternalProviderItem = (itemOrId: CartItem | string) => {
    if (typeof itemOrId === 'object') {
      return itemOrId.isExternal === true;
    }
    const item = cart.find(i => i.id === itemOrId);
    return item?.isExternal === true;
  };

  const addToCart = async (item: CartItem) => {
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
    
    const isCustomVenue = item.id.startsWith("custom-");
    // Check both the flag AND the ID prefix for external items (hotels, activities, flights from external APIs)
    const isExternalByPrefix = item.id.startsWith("hotel-") || item.id.startsWith("activity-") || item.id.startsWith("flight-");
    const isExternal = item.isExternal === true || isExternalByPrefix;
    const existing = cart.find((i) => i.id === item.id);
    
    if (isExternal) {
      if (existing) {
        setLocalExternalCart(prev => prev.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        ));
        toast({ title: "Cart updated", description: "Item quantity increased" });
      } else {
        setLocalExternalCart(prev => [...prev, { ...item, quantity: item.quantity || 1 }]);
        toast({ title: "Added to cart", description: `${item.name} added to your cart` });
      }
      updateTripContext({
                    title: `${experienceType?.name || slug} Experience`,
                    experienceType: experienceType?.name || slug,
                    experienceSlug: slug,
                    destination,
                    startDate,
                    endDate,
                    travelers: adults + kids
                  });
      return;
    }
    
    if (existing && existing.cartItemId) {
      try {
        await apiRequest("PATCH", `/api/cart/${existing.cartItemId}`, { quantity: existing.quantity + 1 });
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        toast({ title: "Cart updated", description: "Item quantity increased" });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to update cart" });
      }
    } else if (!existing) {
      try {
        const payload: any = { quantity: 1, experienceSlug: slug };
        if (isCustomVenue) {
          payload.customVenueId = item.id.replace("custom-", "");
        } else {
          payload.serviceId = item.id.startsWith("service-") ? item.id.replace("service-", "") : item.id;
        }
        await apiRequest("POST", "/api/cart", payload);
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        toast({ title: "Added to cart", description: `${item.name} added to your cart` });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to add to cart" });
      }
    }
    // Store experience context and navigate to full cart page
    updateTripContext({
                    title: `${experienceType?.name || slug} Experience`,
                    experienceType: experienceType?.name || slug,
                    experienceSlug: slug,
                    destination,
                    startDate,
                    endDate,
                    travelers: adults + kids
                  });
    setLocation("/cart");
  };

  const removeFromCart = async (id: string) => {
    if (isExternalProviderItem(id)) {
      setLocalExternalCart(prev => prev.filter(i => i.id !== id));
      toast({ title: "Removed from cart" });
      return;
    }
    
    const item = cart.find((i) => i.id === id);
    if (item?.cartItemId) {
      try {
        await apiRequest("DELETE", `/api/cart/${item.cartItemId}`);
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to remove from cart" });
      }
    }
  };

  const updateCartQuantity = async (id: string, quantity: number) => {
    const clampedQty = Math.max(1, Math.min(10, quantity));
    
    if (isExternalProviderItem(id)) {
      setLocalExternalCart(prev => prev.map(i => 
        i.id === id ? { ...i, quantity: clampedQty } : i
      ));
      return;
    }
    
    const item = cart.find((i) => i.id === id);
    if (item?.cartItemId) {
      try {
        await apiRequest("PATCH", `/api/cart/${item.cartItemId}`, { quantity: clampedQty });
        queryClient.invalidateQueries({ queryKey: ["/api/cart", slug] });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      } catch (error) {
        toast({ variant: "destructive", title: "Failed to update quantity" });
      }
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // P1/P5: use effectiveTabs (DB-driven) instead of config.tabs
  const currentTabCategory = effectiveTabs.find(t => t.id === activeTab)?.category;
  // P2/P5: tabType drives which filter panel / component renders for this tab
  const currentTabType = effectiveTabs.find(t => t.id === activeTab)?.tabType
    ?? deriveTabType(activeTab);
  // P462: DB-driven tab filter control config (replaces hardcoded flight/hotel filter JSX)
  const activeTabControlConfig = effectiveTabs.find(t => t.id === activeTab)?.controlConfig;

  // P462 reconcile (Phase 3): per-tab selection controls. Selecting options
  // resolves to the #462 working keys (priceRange / minRating / tags) and drives
  // the same filteredServices memo — the selection panel is the source of truth
  // for those keys on tabs that have controls.
  const [selectionState, setSelectionState] = useState<Record<string, string[]>>({});

  const applySelections = (controls: SelectionControl[], next: Record<string, string[]>) => {
    const opts: SelectionOption[] = [];
    for (const c of controls) {
      for (const id of next[c.id] ?? []) {
        const o = c.options.find(x => x.id === id);
        if (o) opts.push(o);
      }
    }
    const q = resolveSelectionsToFilterQuery(opts);
    setPriceRange(q.priceRange ?? [0, 500]);
    setMinRating(q.minRating ?? 0);
    setSelectedFilters(q.tags ?? []);
  };

  const handleSelectionToggle = (control: SelectionControl, optionId: string) => {
    const controls = activeTabControlConfig?.selectionControls ?? [];
    const cur = selectionState[control.id] ?? [];
    const nextIds = control.type === "single_select"
      ? (cur.includes(optionId) ? [] : [optionId])
      : (cur.includes(optionId) ? cur.filter(i => i !== optionId) : [...cur, optionId]);
    const next = { ...selectionState, [control.id]: nextIds };
    setSelectionState(next);
    applySelections(controls, next);
  };

  const handleSelectionClear = () => {
    setSelectionState({});
    setPriceRange([0, 500]);
    setMinRating(0);
    setSelectedFilters([]);
  };

  // Clear refinements when switching tabs (skip first mount to preserve any
  // restored saved-trip settings).
  const didMountTabRef = useRef(false);
  useEffect(() => {
    if (!didMountTabRef.current) { didMountTabRef.current = true; return; }
    setSelectionState({});
    setPriceRange([0, 500]);
    setMinRating(0);
    setSelectedFilters([]);
  }, [activeTab]);

  const filteredServices = useMemo(() => {
    if (!services) return [];

    // #462 filter predicate (extracted to shared/service-filter for unit-testing
    // and reuse by the selection-controls reconcile). Behavior unchanged.
    let filtered = filterServices([...services], {
      category: currentTabCategory || undefined,
      searchQuery: searchQuery || undefined,
      priceRange,
      minRating,
      tags: selectedFilters.length > 0 ? selectedFilters : undefined,
    });

    return sortServices(filtered, sortBy);
  }, [services, searchQuery, priceRange, minRating, sortBy, currentTabCategory, selectedFilters]);

  const mapProviders = useMemo(() => {
    // Show service markers when destination is set
    const serviceMarkers = destination && destination.length >= 2
      ? filteredServices.map((s, index) => {
          const numericId = typeof s.id === 'number' ? s.id : parseInt(String(s.id), 10) || index;
          // Use golden angle distribution for spreading markers around destination
          const goldenAngle = 137.5 * (Math.PI / 180);
          const angle = index * goldenAngle;
          const radius = 0.01 + (index * 0.002); // Spread markers 1-3km from center
          const latOffset = Math.cos(angle) * radius;
          const lngOffset = Math.sin(angle) * radius;
          // Use destination center when available, otherwise fall back to NYC
          const baseLat = destinationCenter?.lat ?? 40.7128;
          const baseLng = destinationCenter?.lng ?? -74.0060;
          return {
            id: s.id.toString(),
            name: s.serviceName,
            category: s.serviceType || currentTabCategory || "venue",
            price: Number(s.price) || 0,
            rating: Number(s.averageRating) || null,
            lat: baseLat + latOffset,
            lng: baseLng + lngOffset,
            description: s.shortDescription || s.description || undefined
          };
        })
      : [];
    
    // P5: tabType-driven venue marker visibility
    const customVenueMarkers = (currentTabType === "venue-search" || currentTabType === "hotels")
      ? customVenues
          .filter(v => v.latitude && v.longitude)
          .map(v => ({
            id: `custom-${v.id}`,
            name: v.name,
            category: "custom-venue",
            price: Number(v.estimatedCost) || 0,
            rating: 5,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            description: v.address || v.notes || "Custom location"
          }))
      : [];
    
    return [...customVenueMarkers, ...serviceMarkers, ...hotelSearchMarkers, ...activitySearchMarkers];
  }, [filteredServices, currentTabCategory, customVenues, activeTab, hotelSearchMarkers, activitySearchMarkers, destinationCenter, destination]);

  const selectedProviderIds = useMemo(() => cart.map(item => item.id), [cart]);

  const activityLocations = useMemo(() => {
    return cart
      .filter(item => item.type === "activities" && item.metadata?.meetingPointCoordinates)
      .map(item => ({
        id: item.id,
        name: item.name,
        lat: item.metadata!.meetingPointCoordinates!.lat,
        lng: item.metadata!.meetingPointCoordinates!.lng,
        meetingPoint: item.metadata?.meetingPoint,
        duration: item.metadata?.duration,
      }));
  }, [cart]);

  const hotelLocation = useMemo(() => {
    const hotelItem = cart.find(item => 
      (item.type === "hotels" || item.type === "hotel" || item.type === "accommodations") && 
      item.metadata?.rawData?.hotel?.latitude
    );
    if (hotelItem?.metadata?.rawData?.hotel) {
      const hotel = hotelItem.metadata.rawData.hotel;
      return {
        id: hotelItem.id,
        name: hotelItem.name,
        lat: hotel.latitude,
        lng: hotel.longitude,
      };
    }
    return undefined;
  }, [cart]);

  const [transitRoutes, setTransitRoutes] = useState<Map<string, any>>(new Map());
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null);

  // Auto-fetch transit routes when hotel and activities are available
  useEffect(() => {
    if (!hotelLocation || activityLocations.length === 0) {
      setTransitRoutes(new Map());
      return;
    }
    
    const fetchTransitRoutes = async () => {
      try {
        const res = await fetch("/api/routes/transit-multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            origin: {
              lat: hotelLocation.lat,
              lng: hotelLocation.lng,
              name: hotelLocation.name,
            },
            destinations: activityLocations.map(a => ({
              id: a.id,
              lat: a.lat,
              lng: a.lng,
              name: a.name,
            })),
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data?.routes) {
            const routeMap = new Map<string, any>();
            Object.entries(data.routes).forEach(([id, route]) => {
              routeMap.set(id, route);
            });
            setTransitRoutes(routeMap);
          }
        }
      } catch (error) {
        console.error("Failed to fetch transit routes:", error);
      }
    };
    
    fetchTransitRoutes();
  }, [
    hotelLocation?.id, 
    hotelLocation?.lat, 
    hotelLocation?.lng,
    JSON.stringify(activityLocations.map(a => ({ id: a.id, lat: a.lat, lng: a.lng })))
  ]);

  if (typeLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-background">
          <Skeleton className="h-[320px] w-full" />
          <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-12 w-full mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!experienceType) {
    return (
      <Layout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Experience Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The experience type you're looking for doesn't exist.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  // Explicit unavailable-state guard: hide templates not marked as active in DB
  if (!experienceType.isActive) {
    return (
      <Layout>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="p-8 max-w-md text-center">
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground mb-6">
              This experience type is not yet available. Check back soon!
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Explore Other Experiences
              </Button>
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  // config is kept as a read-only aesthetic reference only (hero images from pre-DB era).
  // All structural behavior (tabs, form fields, filters) is DB-driven via experienceType + dbTabs.

  // Experience-planning lens (§12): destination-aware SEO targets the high-intent
  // "<city> <event>" search the BP reframe flags as the missing acquisition funnel
  // (e.g. "Kyoto wedding") instead of a generic templates title.
  const eventLabel = experienceType?.name || (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Experience");
  const eventLower = eventLabel.toLowerCase();
  const seoCity = (destinationFromQuery || "").split(",")[0].trim();
  const seo = seoCity
    ? {
        title: `Plan Your ${seoCity} ${eventLabel}`,
        description: `Planning a ${eventLower} in ${seoCity}? Work with vetted local experts who handle venues, vendors, and cultural details, with AI-assisted planning. Get matched and start your ${seoCity} ${eventLower}.`,
        keywords: [
          `${seoCity} ${eventLower}`,
          `${seoCity} destination ${eventLower}`,
          `${eventLower} planner ${seoCity}`,
          `plan ${eventLower} in ${seoCity}`,
          `${seoCity} experience planning`,
        ],
        url: `/experiences/${slug}?destination=${encodeURIComponent(destinationFromQuery || "")}`,
      }
    : {
        title: `${eventLabel} Planning with Local Experts`,
        description: `Plan your ${eventLower} with vetted local experts and AI-assisted coordination — venues, vendors, and every detail handled. Choose your destination and get matched.`,
        keywords: [`${eventLower} planning`, `destination ${eventLower}`, `${eventLower} planner`, "experience planning", "local expert planning"],
        url: `/experiences/${slug}`,
      };

  return (
    <Layout>
      <SEOHead title={seo.title} description={seo.description} keywords={seo.keywords} url={seo.url} />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <PanelGroup direction="horizontal" className="h-screen hidden lg:flex">
          <Panel defaultSize={60} minSize={40} maxSize={80} className="h-full flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
          {/* Ribbon bar with Credits, Expert Help, Generate Itinerary */}
          <div className="flex-shrink-0 border-b bg-white/90 backdrop-blur-sm">
            <div className="px-4 py-2 flex items-center justify-end gap-3">
              {linkedTripId && (
                <Link href={`/trip/${linkedTripId}`} className="mr-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-primary hover:text-primary/80 font-medium"
                    data-testid="button-view-trip-planner"
                  >
                    View in Trip Planner →
                  </Button>
                </Link>
              )}
              <Link href="/credits">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-testid="button-credits"
                >
                  <Coins className="w-4 h-4 text-amber-500" />
                  {userCredits} Credits
                  <Plus className="w-3 h-3" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={openExpertChat}
                data-testid="button-expert-help-ribbon"
              >
                <MessageCircle className="w-4 h-4" />
                Get Expert Help
              </Button>
              {/* Generate Itinerary Button - Creates comparison directly */}
              <Button
                size="sm"
                onClick={createComparison}
                disabled={!canGenerateItinerary || cart.length === 0 || creatingComparison}
                className="gap-1.5 bg-primary"
                data-testid="button-generate-ribbon"
              >
                {creatingComparison ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {creatingComparison ? "Building preview..." : "Itinerary Preview"}
              </Button>
            </div>
          </div>

          {/* Linked Trip PlanCard Preview */}
          {linkedTripId && (
            <div className="w-full max-w-xl mx-auto mt-4 px-4 sm:px-0">
              <PlanCard
                trip={{
                  id: linkedTripId,
                  destination: destination || "",
                  title: experienceType?.name,
                  startDate: startDate?.toISOString(),
                  endDate: endDate?.toISOString(),
                  numberOfTravelers: adults + kids,
                  budget: cartTotal,
                  eventType: experienceType?.name?.toLowerCase(),
                }}
                stage="summary"
                role="owner"
              />
            </div>
          )}

        <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b">
          <div className="container mx-auto px-4">
            {/* Wedding Mode Toggle — DB-driven: shown whenever wedding template has DB tabs */}
            {slug === "wedding" && dbTabs && dbTabs.length > 0 && (
              <div className="flex items-center justify-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700">
                <Button
                  variant={weddingMode === "planning" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setWeddingMode("planning");
                    setActiveTab(dbTabsToConfig(dbTabs, slug)[0]?.id ?? "venues");
                  }}
                  className={weddingMode === "planning" ? "bg-primary" : ""}
                  data-testid="button-wedding-mode-planning"
                >
                  Planning Mode
                </Button>
                <Button
                  variant={weddingMode === "guest" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setWeddingMode("guest");
                    const GUEST_TAB_TYPES = new Set(["activities", "dining", "nightlife", "events"]);
                    const firstGuest = dbTabsToConfig(dbTabs, slug).find(t => GUEST_TAB_TYPES.has(t.tabType ?? ""));
                    setActiveTab(firstGuest?.id ?? "activities");
                  }}
                  className={weddingMode === "guest" ? "bg-primary" : ""}
                  data-testid="button-wedding-mode-guest"
                >
                  Guest Activities
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="h-auto bg-transparent p-0 gap-0">
                  {effectiveTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className={cn(
                        "rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:text-primary",
                        "data-[state=active]:shadow-none"
                      )}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Parallel lines below tabs */}
                <div className="mt-2 space-y-1">
                  <div className="h-px bg-gray-200 dark:bg-gray-700 w-full"></div>
                  <div className="h-px bg-gray-200 dark:bg-gray-700 w-full"></div>
                </div>
              </Tabs>

              <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                <SheetContent className="flex flex-col h-full">
                  <SheetHeader className="flex-shrink-0">
                    <SheetTitle>Your Selection</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto mt-4 pr-1">
                    {cart.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">Your cart is empty</p>
                    ) : (
                      <div className="space-y-4 pb-4">
                        {cart.map((item) => (
                          <Card key={item.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h4 className="font-medium">{item.name}</h4>
                                  <p className="text-sm text-muted-foreground">{item.provider}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFromCart(item.id)}
                                  data-testid={`button-remove-${item.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-muted-foreground">Quantity: {item.quantity}</Label>
                                  <span className="text-sm font-medium">${item.price * item.quantity}</span>
                                </div>
                                <Slider
                                  value={[item.quantity]}
                                  onValueChange={([val]) => updateCartQuantity(item.id, val)}
                                  min={1}
                                  max={10}
                                  step={1}
                                  className="w-full"
                                  data-testid={`slider-quantity-${item.id}`}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <div className="flex-shrink-0 pt-4 border-t mt-auto">
                      <CheckoutExpertBanner 
                        onConnect={() => {
                          setCartOpen(false);
                          openExpertChat();
                        }}
                        cartTotal={cartTotal}
                      />
                      <div className="flex justify-between mb-4">
                        <span className="font-medium">Total</span>
                        <span className="font-bold">${cartTotal}</span>
                      </div>
                      <div className="space-y-2">
                        <Button 
                          className="w-full bg-primary "
                          onClick={createComparison}
                          disabled={creatingComparison}
                          data-testid="button-compare-ai"
                        >
                          {creatingComparison ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <GitCompare className="w-4 h-4 mr-2" />
                          )}
                          Compare AI Alternatives
                        </Button>
                        <Button 
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setCartOpen(false);
                            setTimeout(() => setLocation("/cart"), 150);
                          }}
                          data-testid="button-checkout"
                        >
                          Proceed to Checkout
                        </Button>
                      </div>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6">
          {/* P5: tabType-registry driven — transport tab shows TripTransportPlanner */}
          {currentTabType === "transport" && (
            <div className="mb-6">
              <TripTransportPlanner
                cart={cart}
                destination={destination}
                startDate={startDate}
                endDate={endDate}
                travelers={adults + kids}
                variantId={recentVariantId}
                onBookTransfer={(segment, option) => {
                  addToCart({
                    id: `transport-${segment.id}-${Date.now()}`,
                    type: "transportation",
                    name: `${option.name}: ${segment.from.name} → ${segment.to.name}`,
                    price: option.price || 0,
                    quantity: 1,
                    provider: option.provider,
                    details: option.description,
                    isExternal: true,
                  });
                }}
              />
            </div>
          )}

          {/* Unified filter bar — all tabs including flights/hotels (#35).
              Flights: stops chips + max-price range slider + flight sort.
              Hotels: star-rating chips + max-price range slider + hotel sort.
              Other tabs: seeded selection controls + generic sort. */}
          {currentTabType === "flights" ? (
            <CompactFilterBar
              controls={[{
                id: "flight-stops",
                label: "Stops",
                type: "single_select",
                options: [
                  { id: "any",     label: "Any",     filterMapping: {} },
                  { id: "nonstop", label: "Nonstop", filterMapping: {} },
                  { id: "1stop",   label: "1 Stop",  filterMapping: {} },
                ],
              }]}
              selected={{ "flight-stops": [flightStops] }}
              onToggle={(_, optionId) => setFlightStops(optionId as "any" | "nonstop" | "1stop")}
              onClear={() => { setFlightStops("any"); setFlightMaxPrice(2000); }}
              sortValue={flightSortBy}
              onSortChange={(v) => setFlightSortBy(v as "price" | "duration" | "departure")}
              sortOptions={[
                { value: "price",     label: "Price" },
                { value: "duration",  label: "Duration" },
                { value: "departure", label: "Departure" },
              ]}
              rangeControls={[{
                id: "flightMaxPrice",
                label: "Max Price",
                min: 100,
                max: 5000,
                step: 100,
                format: (v) => `$${v.toLocaleString()}`,
              }]}
              rangeValues={{ flightMaxPrice }}
              onRangeChange={(id, val) => {
                if (id === "flightMaxPrice") setFlightMaxPrice(val);
              }}
            />
          ) : currentTabType === "hotels" ? (
            <CompactFilterBar
              controls={[{
                id: "hotel-stars",
                label: "Star Rating",
                type: "single_select",
                options: [
                  { id: "0", label: "All",  filterMapping: {} },
                  { id: "3", label: "3★+",  filterMapping: {} },
                  { id: "4", label: "4★+",  filterMapping: {} },
                  { id: "5", label: "5★",   filterMapping: {} },
                ],
              }]}
              selected={{ "hotel-stars": [String(hotelStarRating)] }}
              onToggle={(_, optionId) => setHotelStarRating(Number(optionId))}
              onClear={() => { setHotelStarRating(0); setHotelMaxPrice(5000); }}
              sortValue={hotelSortBy}
              onSortChange={(v) => setHotelSortBy(v as "price" | "rating")}
              sortOptions={[
                { value: "price",  label: "Price" },
                { value: "rating", label: "Rating" },
              ]}
              rangeControls={[{
                id: "hotelMaxPrice",
                label: "Max Price",
                min: 50,
                max: 2000,
                step: 50,
                format: (v) => `$${v.toLocaleString()}`,
              }]}
              rangeValues={{ hotelMaxPrice }}
              onRangeChange={(id, val) => {
                if (id === "hotelMaxPrice") setHotelMaxPrice(val);
              }}
            />
          ) : (
            <CompactFilterBar
              controls={activeTabControlConfig?.selectionControls ?? []}
              selected={selectionState}
              onToggle={handleSelectionToggle}
              onClear={handleSelectionClear}
              sortValue={sortBy}
              onSortChange={setSortBy}
              additionalFilters={currentTabType === "services" ? (
                <>
                  <div className="min-w-[160px]">
                    <Label className="text-xs font-medium text-muted-foreground">Category</Label>
                    <Select value={serviceCategoryFilter} onValueChange={(v) => setServiceCategoryFilter(v)}>
                      <SelectTrigger className="h-8 mt-1.5 w-[160px]" data-testid="select-service-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {serviceCategories?.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[160px]">
                    <Label className="text-xs font-medium text-muted-foreground">Distance</Label>
                    <Select value={serviceDistanceFilter} onValueChange={(v) => setServiceDistanceFilter(v)}>
                      <SelectTrigger className="h-8 mt-1.5 w-[160px]" data-testid="select-service-distance">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any distance</SelectItem>
                        <SelectItem value="1">Within 1 km</SelectItem>
                        <SelectItem value="2">Within 2 km</SelectItem>
                        <SelectItem value="5">Within 5 km</SelectItem>
                        <SelectItem value="10">Within 10 km</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : undefined}
            />
          )}

          {/* P5: tabType-registry driven — any tab with tabType "flights" renders FlightSearch */}
          {currentTabType === "flights" && (
            <div className="mb-6">
              <FlightSearch
                destination={destination}
                origin={originCity}
                startDate={startDate}
                endDate={endDate}
                travelers={adults + kids}
                maxPrice={flightMaxPrice}
                stops={flightStops}
                sortBy={flightSortBy}
                onSelectFlight={(flight) => {
                  const outbound = flight.itineraries[0];
                  const firstSegment = outbound?.segments[0];
                  const lastSegment = outbound?.segments[outbound.segments.length - 1];
                  const travelerPricing = flight.travelerPricings?.[0];
                  const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];
                  const checkedBags = fareDetails?.includedCheckedBags;
                  const bagsInfo = checkedBags?.quantity !== undefined 
                    ? `${checkedBags.quantity} bag${checkedBags.quantity !== 1 ? 's' : ''}`
                    : checkedBags?.weight 
                      ? `${checkedBags.weight}${checkedBags.weightUnit || 'kg'}`
                      : undefined;
                  
                  addToCart({
                    id: `flight-${flight.id}`,
                    type: "flights",
                    name: `${firstSegment?.departure.iataCode} → ${lastSegment?.arrival.iataCode}`,
                    price: parseFloat(flight.price.total),
                    quantity: 1,
                    provider: `${firstSegment?.carrierCode} ${firstSegment?.number}`,
                    details: `${fareDetails?.cabin || 'Economy'} class${bagsInfo ? `, ${bagsInfo}` : ''}`,
                    isExternal: true,
                    metadata: {
                      cabin: fareDetails?.cabin,
                      baggage: bagsInfo,
                      stops: outbound?.segments.length - 1,
                      duration: outbound?.duration,
                      airline: firstSegment?.carrierCode,
                      flightNumber: `${firstSegment?.carrierCode}${firstSegment?.number}`,
                      departureTime: firstSegment?.departure.at,
                      arrivalTime: lastSegment?.arrival.at,
                      seatsLeft: flight.numberOfBookableSeats,
                      lastTicketingDate: flight.lastTicketingDate,
                      travelers: adults + kids,
                      rawData: flight,
                    },
                  });
                }}
              />
            </div>
          )}

          {currentTabType === "flights" && destination && (
            <ESimSidebarWidget destination={destination} origin={originCity} />
          )}

          {/* P5: tabType-registry driven — any tab with tabType "hotels" renders HotelSearch */}
          {currentTabType === "hotels" && destination && (
            <BookingComCatalogSection destination={destination} />
          )}

          {currentTabType === "hotels" && (
            <div className="mb-6">
              <HotelSearch
                destination={destination}
                checkIn={startDate}
                checkOut={endDate}
                guests={adults + kids}
                maxPrice={hotelMaxPrice}
                starRating={hotelStarRating}
                sortBy={hotelSortBy}
                activityLocations={activityLocations}
                onResultsLoaded={setHotelSearchMarkers}
                destinationCenter={destinationCenter}
                onSelectHotel={(hotelData) => {
                  const hotel = hotelData.hotel;
                  const offer = hotelData.offers?.[0];
                  
                  const nights = offer 
                    ? Math.max(1, Math.ceil((new Date(offer.checkOutDate).getTime() - new Date(offer.checkInDate).getTime()) / (1000 * 60 * 60 * 24)))
                    : 1;
                  const totalPrice = offer ? parseFloat(offer.price.total) : 0;
                  const pricePerNight = totalPrice / nights;
                  
                  const refundStatus = offer?.policies?.refundable?.cancellationRefund;
                  const isRefundable = refundStatus === "REFUNDABLE_UP_TO_DEADLINE" || refundStatus === "REFUNDABLE";
                  const cancellationDeadline = offer?.policies?.cancellations?.[0]?.deadline;
                  const boardType = offer?.boardType;
                  
                  const roomEstimate = offer?.room?.typeEstimated;
                  const bedInfo = roomEstimate?.beds && roomEstimate?.bedType 
                    ? `${roomEstimate.beds} ${roomEstimate.bedType.toLowerCase()}` 
                    : undefined;
                  const roomCategory = roomEstimate?.category?.replace(/_/g, " ").toLowerCase();
                  
                  const taxes = offer?.price?.taxes?.filter((t: any) => !t.included);
                  const taxTotal = taxes?.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0) || 0;
                  
                  addToCart({
                    id: `hotel-${hotel.hotelId}`,
                    type: activeTab,
                    name: hotel.name,
                    price: totalPrice,
                    quantity: 1,
                    provider: "Amadeus Hotels",
                    details: `${nights} nights${boardType ? `, ${boardType.replace(/_/g, " ").toLowerCase()}` : ''}${isRefundable ? ', refundable' : ''}`,
                    isExternal: true,
                    metadata: {
                      refundable: isRefundable,
                      cancellationDeadline: cancellationDeadline,
                      boardType: boardType,
                      bedInfo: bedInfo,
                      roomCategory: roomCategory,
                      taxTotal: taxTotal,
                      nights: nights,
                      pricePerNight: pricePerNight,
                      checkInDate: offer?.checkInDate,
                      checkOutDate: offer?.checkOutDate,
                      travelers: adults + kids,
                      rawData: hotelData,
                    },
                  });
                }}
              />
            </div>
          )}

          {currentTabType === "hotels" && destination && (
            <ESimSidebarWidget destination={destination} origin={originCity} />
          )}

          {/* P5: tabType-registry driven — any tab with tabType "services" */}
          {currentTabType === "services" && (
            <div className="mb-6">
              <ServiceBrowser
                defaultLocation={destination}
                categoryFilter={serviceCategoryFilter}
                distanceFilter={serviceDistanceFilter}
                onAddToCart={(service) => {
                  addToCart({
                    id: `service-${service.id}`,
                    type: "services",
                    name: service.serviceName,
                    price: parseFloat(service.price) || 0,
                    quantity: 1,
                    provider: "Platform Service",
                  });
                }}
              />
            </div>
          )}

          {/* P5: tabType-registry driven — any tab with tabType "activities" */}
          {currentTabType === "activities" && (
            <div className="mb-6 space-y-4">
              <ActivitySearch
                destination={destination}
                startDate={startDate}
                endDate={endDate}
                travelers={adults + kids}
                interests={selectedInterests}
                onResultsLoaded={setActivitySearchMarkers}
                destinationCenter={destinationCenter}
                onSelectActivity={(activity) => {
                  const durationMinutes = activity.duration?.fixedDurationInMinutes || 
                    activity.duration?.variableDurationFromMinutes || 0;
                  const durationHours = durationMinutes > 0 ? Math.ceil(durationMinutes / 60) : undefined;
                  
                  const cancellation = activity.cancellationPolicy;
                  const fullRefund = cancellation?.refundEligibility?.find(r => r.percentageRefundable === 100);
                  const isRefundable = !!fullRefund;
                  
                  const logistics = activity.logistics as any;
                  let meetingPoint: string | undefined;
                  let meetingPointCoordinates: { lat: number; lng: number } | undefined;
                  
                  if (logistics?.start?.[0]) {
                    const startLoc = logistics.start[0].location;
                    const addr = startLoc?.address;
                    meetingPoint = startLoc?.name || 
                      [addr?.street, addr?.city, addr?.state, addr?.country].filter(Boolean).join(', ') ||
                      logistics.start[0].description;
                    if (startLoc?.coordinates) {
                      meetingPointCoordinates = {
                        lat: startLoc.coordinates.latitude,
                        lng: startLoc.coordinates.longitude
                      };
                    }
                  }
                  
                  addToCart({
                    id: `activity-${activity.productCode}`,
                    type: "activities",
                    name: activity.title,
                    price: (activity.pricing?.summary?.fromPrice || 0) * (adults + kids),
                    quantity: 1,
                    provider: "Viator",
                    details: `${durationHours ? `${durationHours}h` : 'Duration varies'}${isRefundable ? ', Free cancellation' : ''}${meetingPoint ? ` | ${meetingPoint}` : ''}`,
                    isExternal: true,
                    metadata: {
                      refundable: isRefundable,
                      cancellationDeadline: fullRefund?.dayRangeMin ? `${fullRefund.dayRangeMin} days before` : undefined,
                      duration: durationHours ? `${durationHours} hours` : undefined,
                      travelers: adults + kids,
                      meetingPoint,
                      meetingPointCoordinates,
                      rawData: activity,
                    },
                  });
                }}
              />

              {/* Travelpayouts: Tiqets, WeGoTrip, Viator discounted feed */}
              {destination && (
                <TravelpayoutsActivities destination={destination} />
              )}

              {/* Points of Interest and Destination Safety */}
              {destinationCenter && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="md:col-span-2">
                    <AmadeusPOIs
                      latitude={destinationCenter.lat}
                      longitude={destinationCenter.lng}
                      onAddToCart={(item) => {
                        addToCart({
                          id: item.id,
                          type: item.type,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity,
                          provider: item.provider,
                          details: item.details,
                          isExternal: item.isExternal,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <AmadeusSafety
                      latitude={destinationCenter.lat}
                      longitude={destinationCenter.lng}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* P5: tabType-registry driven — any tab with tabType "events" */}
          {currentTabType === "events" && (
            <div className="mb-6">
              <FeverEventsSection
                destination={destination}
                startDate={startDate?.toISOString().split('T')[0]}
                endDate={endDate?.toISOString().split('T')[0]}
              />
            </div>
          )}

          {/* P5: tabType-registry driven — any tab with tabType "transport" */}
          {currentTabType === "transport" && (
            <div className="mb-6">
              <AmadeusTransfers
                destination={destination || ""}
                startDate={startDate?.toISOString().split('T')[0]}
                travelers={adults + kids}
                onAddToCart={(item) => {
                  addToCart({
                    id: item.id,
                    type: "transportation",
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    provider: item.provider,
                    details: item.details,
                    isExternal: item.isExternal,
                  });
                }}
              />
            </div>
          )}

          {/* Restaurant Catalog Section — shown for any tab with tabType "dining" */}
          {currentTabType === "dining" && destination && (
            <RestaurantCatalogSection destination={destination} />
          )}

          {/* Venue Search Panel — fallback for venue-search / dining / nightlife / vendors and any tab in TAB_FALLBACK_CONFIG */}
          {currentTabType !== "flights" && currentTabType !== "hotels" && currentTabType !== "services" && currentTabType !== "activities" && currentTabType !== "events" && currentTabType !== "transport" && currentTabType !== "planning-tools" && currentTabType !== "itinerary-builder" && (
            (currentTabType === "vendors" || activeTab in TAB_FALLBACK_CONFIG || currentTabType === "venue-search" || currentTabType === "dining" || currentTabType === "nightlife") && (
              <div className="mb-6">
                <VenueSearchPanel
                  template={slug || ''}
                  location={destination}
                  tabId={activeTab}
                  onAddToCart={(item) => {
                    addToCart(item);
                  }}
                  externalVendorType={currentTabType === "vendors" ? vendorType : undefined}
                  externalMinRating={minRating}
                  externalKeyword={currentTabType !== "vendors" ? searchQuery : undefined}
                  hideFilters={true}
                />
              </div>
            )
          )}

          {/* Recommended by Traveloure — content hub items matched to this tab + destination */}
          {destination && currentTabType !== "flights" && currentTabType !== "hotels" && currentTabType !== "planning-tools" && currentTabType !== "itinerary-builder" && (
            <CuratedContentSection
              destination={destination}
              tab={activeTab}
              surface="experience-template"
              label="Recommended by Traveloure"
              className="mb-6"
            />
          )}

          {currentTabType !== "flights" && currentTabType !== "hotels" && currentTabType !== "services" && currentTabType !== "activities" && currentTabType !== "events" && currentTabType !== "transport" && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredServices.length > 0 
                ? `Showing ${filteredServices.length} ${filteredServices.length === 1 ? 'provider' : 'providers'}${customVenues.length > 0 ? ` + ${customVenues.length} custom` : ''}${destination ? ` in ${destination}` : ''}`
                : destination 
                  ? `No providers found in ${destination}` 
                  : "Enter a location to see available options"}
            </p>
            {(currentTabType === "venue-search" || currentTabType === "hotels") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddVenueModalOpen(true)}
                data-testid="button-add-custom-venue"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Custom Location
              </Button>
            )}
          </div>
          )}

          {currentTabType !== "flights" && currentTabType !== "hotels" && currentTabType !== "services" && currentTabType !== "activities" && currentTabType !== "events" && currentTabType !== "transport" && (
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(currentTabType === "venue-search" || currentTabType === "hotels") && customVenues.length > 0 && customVenues.map((venue) => {
                    const venueId = `custom-${venue.id}`;
                    const isInCart = selectedProviderIds.includes(venueId);
                    return (
                      <Card key={venueId} className="overflow-hidden hover-elevate border-dashed border-2 border-primary/30">
                        <div className="h-48 bg-gradient-to-br from-[#FF385C]/10 to-[#FF385C]/20 flex items-center justify-center">
                          <MapPin className="w-12 h-12 text-primary" />
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-lg">{venue.name}</h3>
                            <Badge variant="outline" className="text-xs border-primary text-primary">
                              Custom
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {venue.address || venue.notes || "Custom location"}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">
                              {venue.estimatedCost ? `$${venue.estimatedCost}` : "Free"}
                            </span>
                            {isInCart ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-500 hover:bg-red-50"
                                onClick={() => removeFromCart(venueId)}
                                data-testid={`button-remove-custom-${venue.id}`}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-primary "
                                onClick={() => addToCart({
                                  id: venueId,
                                  type: "venue",
                                  name: venue.name,
                                  price: Number(venue.estimatedCost) || 0,
                                  quantity: 1,
                                  provider: "Custom Venue",
                                })}
                                data-testid={`button-add-custom-${venue.id}`}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {servicesLoading ? (
                    [1, 2, 3, 4, 5, 6].map((i) => (
                      <Card key={i}>
                        <Skeleton className="h-48 w-full" />
                        <CardContent className="p-4">
                          <Skeleton className="h-6 w-3/4 mb-2" />
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardContent>
                      </Card>
                    ))
                  ) : filteredServices.length > 0 ? (
                    filteredServices.map((service) => (
                      <Card key={service.id} className="overflow-hidden hover-elevate">
                        <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                          <Building2 className="w-12 h-12 text-gray-400" />
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-lg">{service.serviceName}</h3>
                            {service.averageRating ? (
                              <Badge variant="secondary" className="text-xs">
                                <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />
                                {service.averageRating}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">New</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {service.shortDescription || service.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">${service.price || 0}</span>
                            <Button
                              size="sm"
                              className="bg-primary "
                              onClick={() => addToCart({
                                id: service.id.toString(),
                                type: activeTab,
                                name: service.serviceName,
                                price: Number(service.price) || 0,
                                quantity: 1,
                                provider: "Platform Provider",
                              })}
                              data-testid={`button-add-${service.id}`}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-12">
                      <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No providers available yet</h3>
                      <p className="text-muted-foreground mb-4">
                        We're adding providers for this category. Check back soon!
                      </p>
                      <Button variant="outline" data-testid="button-notify-me">
                        Notify Me When Available
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
            </div>
          )}
        </div>
        
          </div>
          
          {/* Persistent Cart Summary - stays visible while scrolling */}
          {cart.length > 0 && (
            <div className="flex-shrink-0 border-t bg-white dark:bg-gray-800 px-4 py-3 shadow-lg" data-testid="cart-summary-persistent">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <Badge variant="secondary" className="flex-shrink-0" data-testid="badge-cart-count">
                    {cart.length} item{cart.length !== 1 ? 's' : ''}
                  </Badge>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {cart.slice(0, 3).map((item) => (
                      <Badge 
                        key={item.id} 
                        variant="outline" 
                        className="flex-shrink-0 max-w-[120px] truncate text-xs"
                        data-testid={`badge-cart-item-${item.id}`}
                      >
                        {item.name}
                      </Badge>
                    ))}
                    {cart.length > 3 && (
                      <Badge variant="outline" className="flex-shrink-0 text-xs">
                        +{cart.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-bold text-lg" data-testid="text-cart-total-persistent">
                    ${cartTotal.toLocaleString()}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      updateTripContext({
                    title: `${experienceType?.name} Experience`,
                    experienceType: experienceType?.name,
                    experienceSlug: slug,
                    destination,
                    startDate,
                    endDate,
                    travelers: adults + kids
                  });
                      setLocation("/cart");
                    }}
                    className="bg-primary"
                    data-testid="button-view-cart-persistent"
                  >
                    <ShoppingCart className="w-4 h-4 mr-1" />
                    View Cart
                  </Button>
                </div>
              </div>
            </div>
          )}
          </Panel>

          <PanelResizeHandle className="w-2 bg-gray-200 dark:bg-gray-700 hover:bg-primary transition-colors cursor-col-resize flex items-center justify-center">
            <div className="w-1 h-8 bg-gray-400 dark:bg-gray-500 rounded-full" />
          </PanelResizeHandle>

          <Panel defaultSize={40} minSize={20} maxSize={60} className="relative flex flex-col">
            {/* Map | Preview tab — the right panel shows the live map or the
                Itinerary Preview of the plan-so-far. */}
            <div className="flex-shrink-0 flex items-center gap-1 border-b bg-background px-2 py-1.5">
              <button
                type="button"
                onClick={() => setRightPanelView("map")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  rightPanelView === "map" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                }`}
                data-testid="tab-right-map"
              >
                <MapPin className="w-4 h-4" />
                Map
              </button>
              <button
                type="button"
                onClick={() => setRightPanelView("preview")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  rightPanelView === "preview" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                }`}
                data-testid="tab-right-preview"
              >
                <Sparkles className="w-4 h-4" />
                Itinerary Preview
                {cart.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                    {cart.length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              {rightPanelView === "map" ? (
                <ExperienceMap
                  providers={mapProviders}
                  selectedProviderIds={selectedProviderIds}
                  destination={destination}
                  destinationCenter={destinationCenter}
                  onAddToCart={(provider) => addToCart({
                    id: provider.id,
                    type: provider.category,
                    name: provider.name,
                    price: provider.price,
                    quantity: 1,
                    provider: "Platform Provider"
                  })}
                  onRemoveFromCart={removeFromCart}
                  height="100%"
                  activityLocations={activityLocations}
                  hotelLocation={hotelLocation}
                  transitRoutes={transitRoutes}
                  highlightedActivityId={highlightedActivityId}
                />
              ) : (
                <ItineraryPreviewPanel
                  destination={destination}
                  startDate={startDate}
                  endDate={endDate}
                  travelers={adults + kids}
                  items={cart.map((i) => ({
                    id: i.id,
                    name: i.name,
                    type: i.type,
                    price: i.price,
                    quantity: i.quantity,
                    provider: i.provider,
                  }))}
                  total={cartTotal}
                  onRemove={removeFromCart}
                  onGenerate={createComparison}
                  generating={creatingComparison}
                  canGenerate={canGenerateItinerary}
                />
              )}
            </div>
          </Panel>
        </PanelGroup>

        {/* Mobile Layout - Content stacked with collapsible map */}
        <div className="lg:hidden flex flex-col min-h-screen">
          {/* Mobile Hero Section */}
          <div className="relative h-48 flex-shrink-0 overflow-hidden">
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${experienceType.heroImage ?? ""}')` }}
            />
            <div className="absolute top-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-3 py-2 flex items-center justify-between z-10">
              {/* Mobile Map/Form Toggle or Trip Planner link */}
              {linkedTripId ? (
                <Link href={`/trip/${linkedTripId}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-primary font-medium"
                    data-testid="button-view-trip-planner-mobile"
                  >
                    View Trip →
                  </Button>
                </Link>
              ) : (
              <Button
                variant={showMobileMap ? "default" : "outline"}
                size="sm"
                className={cn("gap-1 text-xs", showMobileMap && "bg-primary")}
                onClick={() => setShowMobileMap(!showMobileMap)}
                data-testid="button-toggle-view-mobile"
              >
                {showMobileMap ? (
                  <>
                    <SlidersHorizontal className="w-3 h-3" />
                    Form
                  </>
                ) : (
                  <>
                    <MapPin className="w-3 h-3" />
                    Map
                  </>
                )}
              </Button>
              )}
              <div className="flex items-center gap-2">
              <Link href="/credits">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <Coins className="w-3 h-3 text-amber-500" />
                  {userCredits}
                  <Plus className="w-2 h-2" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={openExpertChat}
                data-testid="button-expert-help-ribbon-mobile"
              >
                <MessageCircle className="w-3 h-3" />
                Expert
              </Button>
              {/* Mobile Generate Itinerary Button */}
              <Button
                size="sm"
                onClick={createComparison}
                disabled={!canGenerateItinerary || cart.length === 0 || creatingComparison}
                className="gap-1 px-2 bg-primary"
                data-testid="button-generate-ribbon-mobile"
              >
                {creatingComparison ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {creatingComparison ? "..." : "Preview"}
              </Button>
              </div>
            </div>
          </div>

          {/* Mobile Map View (Full Screen when toggle active) */}
          {showMobileMap && (
            <div className="flex-1 relative" style={{ height: 'calc(100vh - 48px)' }}>
              <ExperienceMap
                destination={destination}
                cart={cart.map(item => ({
                  id: item.id,
                  name: item.name,
                  type: item.type,
                  price: item.price,
                  quantity: 1,
                  provider: "Platform Provider"
                }))}
                onRemoveFromCart={removeFromCart}
                height="100%"
                activityLocations={activityLocations}
                hotelLocation={hotelLocation}
                transitRoutes={transitRoutes}
                highlightedActivityId={highlightedActivityId}
              />
              {/* Cart summary floating on map */}
              {cart.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{cart.length} items</span>
                    <span className="text-lg font-bold ml-2">${cartTotal}</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={createComparison}
                    disabled={!canGenerateItinerary || cart.length === 0 || creatingComparison}
                    className="bg-primary"
                  >
                    {creatingComparison ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                    Preview
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Mobile Trip Details Card - Hidden when map is shown */}
          <Card className={cn(
            "bg-white dark:bg-gray-800 rounded-xl shadow-md border p-4 w-full max-w-md mx-auto mt-[-80px] z-20 relative",
            showMobileMap && "hidden"
          )}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">{experienceType.name} Details</h2>
                <Users className="w-4 h-4 text-gray-400" />
              </div>
              <div className="space-y-3">
                {/* P3b: destination/dates/travelers now live in the global Trip Strip */}
                <button
                  type="button"
                  onClick={() => setEditTripOpen(true)}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors text-left"
                  data-testid="button-template-edit-trip-mobile"
                >
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Trip details are in the bar above —{" "}
                    <span className="font-medium text-primary underline">Edit trip</span>
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Mode Toggle for Wedding — DB-driven */}
          {slug === "wedding" && dbTabs && dbTabs.length > 0 && !showMobileMap && (
            <div className="flex items-center justify-center gap-2 py-2 border-b bg-white dark:bg-gray-800">
              <Button
                variant={weddingMode === "planning" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setWeddingMode("planning");
                  setActiveTab(dbTabsToConfig(dbTabs, slug)[0]?.id ?? "venues");
                }}
                className={weddingMode === "planning" ? "bg-primary" : ""}
              >
                Planning
              </Button>
              <Button
                variant={weddingMode === "guest" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setWeddingMode("guest");
                  const GUEST_TAB_TYPES = new Set(["activities", "dining", "nightlife", "events"]);
                  const firstGuest = dbTabsToConfig(dbTabs, slug).find(t => GUEST_TAB_TYPES.has(t.tabType ?? ""));
                  setActiveTab(firstGuest?.id ?? "activities");
                }}
                className={weddingMode === "guest" ? "bg-primary" : ""}
              >
                Guest Activities
              </Button>
            </div>
          )}

          {/* Mobile Tabs */}
          <div className={cn(
            "bg-white dark:bg-gray-800 border-b mt-4 px-2 overflow-x-auto",
            showMobileMap && "hidden"
          )}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-auto bg-transparent p-0 gap-0 flex-nowrap">
                {effectiveTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm data-[state=active]:border-primary data-[state=active]:text-primary whitespace-nowrap"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Mobile Content */}
          <div className={cn("flex-1 p-4 pb-20", showMobileMap && "hidden")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servicesLoading ? (
                  [1, 2, 3, 4].map((i) => (
                    <Card key={i}><Skeleton className="h-40 w-full" /></Card>
                  ))
                ) : filteredServices.length > 0 ? (
                  filteredServices.slice(0, 6).map((service) => (
                    <Card key={service.id} className="overflow-hidden">
                      <div className="h-32 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-gray-400" />
                      </div>
                      <CardContent className="p-3">
                        <h3 className="font-medium text-sm truncate">{service.serviceName}</h3>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold">${service.price || 0}</span>
                          <Button
                            size="sm"
                            className="bg-primary  h-7 text-xs"
                            onClick={() => addToCart({
                              id: service.id.toString(),
                              type: activeTab,
                              name: service.serviceName,
                              price: Number(service.price) || 0,
                              quantity: 1,
                              provider: "Platform Provider",
                            })}
                          >
                            <Plus className="w-3 h-3 mr-1" />Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8">
                    <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">No providers available yet</p>
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Mobile Map Collapsible - hidden when full map is shown */}
        <div className={cn("lg:hidden", showMobileMap && "hidden")}>
          <Collapsible>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t shadow-lg z-40">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-between p-4 h-auto"
                  data-testid="button-toggle-map-mobile"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    <span className="font-medium">View Map</span>
                    {cart.length > 0 && (
                      <Badge className="bg-primary">{cart.length} selected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {cart.length > 0 && (
                      <span className="font-bold text-primary">${cartTotal}</span>
                    )}
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="h-[300px] border-t">
                  <ExperienceMap
                    providers={mapProviders}
                    selectedProviderIds={selectedProviderIds}
                    destination={destination}
                    destinationCenter={destinationCenter}
                    onAddToCart={(provider) => addToCart({
                      id: provider.id,
                      type: provider.category,
                      name: provider.name,
                      price: provider.price,
                      quantity: 1,
                      provider: "Platform Provider"
                    })}
                    onRemoveFromCart={removeFromCart}
                    height="100%"
                    activityLocations={activityLocations}
                    hotelLocation={hotelLocation}
                    transitRoutes={transitRoutes}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>

        {/* AI Optimization Sheet */}
        <Sheet open={aiOptimizeOpen} onOpenChange={setAiOptimizeOpen}>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Optimization
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <AIOptimizationTab 
                experienceType={experienceType}
                destination={destination}
                date={startDate}
                cart={cart}
              />
            </div>
          </SheetContent>
        </Sheet>
        
        <ExpertChatWidget
          experienceType={experienceType?.name}
          destination={destination}
          onRequestExpert={() => {}}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
        />
        
        {!chatOpen && (
          <Button
            onClick={() => {
              if (!hasDragged) {
                setChatOpen(true);
              }
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleDragStart(e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
              }
            }}
            className={cn(
              "fixed h-14 w-14 rounded-full bg-primary  shadow-lg z-[9999] cursor-grab",
              isDragging && "cursor-grabbing"
            )}
            style={{
              bottom: `${chatButtonPos.y}px`,
              right: `${chatButtonPos.x}px`,
            }}
            size="icon"
            data-testid="button-open-chat"
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
        )}
        
        <AddCustomVenueModal
          open={addVenueModalOpen}
          onOpenChange={setAddVenueModalOpen}
          experienceType={slug}
          userId={user?.id}
          onVenueAdded={(venue) => {
            queryClient.invalidateQueries({ queryKey: ["/api/custom-venues", slug] });
            addToCart({
              id: `custom-${venue.id}`,
              type: "venue",
              name: venue.name,
              price: Number(venue.estimatedCost) || 0,
              quantity: 1,
              provider: "Custom Venue",
            });
            toast({ title: "Custom venue added", description: `${venue.name} is now in your plan` });
          }}
        />
        
        {/* Expert Help Dialog - AI Matching + Chat */}
        <Dialog open={expertHelpDialogOpen} onOpenChange={setExpertHelpDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Get Expert Help
              </DialogTitle>
              <DialogDescription>
                Find AI-matched experts or chat with an advisor for personalized travel guidance
              </DialogDescription>
            </DialogHeader>
            <Tabs value={expertHelpTab} onValueChange={(v) => setExpertHelpTab(v as "ai-match" | "chat")} className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ai-match" className="gap-2" data-testid="tab-ai-match">
                  <Sparkles className="w-4 h-4" />
                  AI-Matched Experts
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-2" data-testid="tab-chat">
                  <MessageCircle className="w-4 h-4" />
                  Live Chat
                </TabsTrigger>
              </TabsList>
              <div className="mt-4">
                {expertHelpTab === "ai-match" && (
                  <AIMatchedExpertsSection
                    destination={destination}
                    startDate={startDate}
                    endDate={endDate}
                    experienceType={experienceType?.name}
                    travelers={adults + kids}
                    preferences={selectedInterests}
                    userId={user?.id}
                    isVisible={true}
                  />
                )}
                {expertHelpTab === "chat" && (
                  <div className="min-h-[400px]">
                    <p className="text-center text-muted-foreground mb-4">
                      Click the chat button in the bottom right corner to start a conversation with a travel advisor.
                    </p>
                    <div className="flex justify-center">
                      <Button
                        onClick={() => {
                          setExpertHelpDialogOpen(false);
                          setChatOpen(true);
                        }}
                        className="bg-primary"
                        data-testid="button-start-chat"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Start Chat with Expert
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
        
        {/* AI Itinerary Builder Dialog - Powered by Grok */}
        <Dialog open={aiItineraryDialogOpen} onOpenChange={setAiItineraryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" />
                AI Itinerary Builder
                <Badge variant="secondary" className="text-[10px] ml-2">Powered by Grok</Badge>
              </DialogTitle>
              <DialogDescription>
                Let AI create a personalized day-by-day itinerary for your {experienceType?.name || "travel"} to {destination || "your destination"}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {!destination.trim() || !startDate || !endDate ? (
                <div className="text-center py-8">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Complete Your Travel Details</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Please fill in your destination and travel dates before generating an AI itinerary.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAiItineraryDialogOpen(false);
                      // P3b: the quartet lives in the Trip Strip — open the shared panel
                      setEditTripOpen(true);
                    }}
                    data-testid="button-close-itinerary-dialog"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Fill Travel Details
                  </Button>
                </div>
              ) : (
                <AIItineraryBuilder
                  destination={destination}
                  startDate={startDate}
                  endDate={endDate}
                  travelers={adults + kids}
                  adults={adults}
                  kids={kids}
                  experienceType={experienceType?.name}
                  onClose={() => setAiItineraryDialogOpen(false)}
                  onSave={(tripId) => {
                    setAiItineraryDialogOpen(false);
                    setLocation(`/itinerary/${tripId}`);
                  }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Destination prompt — opens when the template loads without a destination, so the
            content sections (curated, venues, catalog) have a city to populate from. */}
        <Dialog open={showDestPrompt} onOpenChange={setShowDestPrompt}>
          <DialogContent className="max-w-md" data-testid="dialog-choose-destination">
            <DialogHeader>
              <DialogTitle>Where are you headed?</DialogTitle>
              <DialogDescription>
                Choose a destination so we can show venues, activities, and recommendations for your{" "}
                {(experienceType?.name || "experience").toLowerCase()}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label htmlFor="dest-prompt-input">Destination city</Label>
              <Input
                id="dest-prompt-input"
                placeholder="Eg: Kyoto, Paris, New York"
                value={destPromptInput}
                onChange={(e) => setDestPromptInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmDestPrompt(); }}
                autoFocus
                data-testid="input-choose-destination"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDestPrompt(false)} data-testid="button-skip-destination">
                Skip for now
              </Button>
              <Button onClick={confirmDestPrompt} disabled={!destPromptInput.trim()} data-testid="button-confirm-destination">
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* P3b: shared edit surface for the strip-owned quartet (destination/dates/party) */}
        <EditTripPanel open={editTripOpen} onOpenChange={setEditTripOpen} />
      </div>
    </Layout>
  );
}
