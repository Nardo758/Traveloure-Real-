import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { createComparison as createComparisonRequest } from "@/lib/create-comparison";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation, useSearch } from "wouter";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
  X,
  Camera,
  Car,
  UtensilsCrossed,
  Baby,
  Compass,
  Briefcase,
  Wrench,
  Heart,
  Sparkles,
  Dog,
  PartyPopper,
  Laptop,
  Languages,
  Award,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingCart,
  Plus,
  Check,
  Building2,
  Globe,
  BookOpen,
  Ticket,
  TrendingUp,
  Calendar,
  Users,
  ArrowRight,
  GitCompare,
  Zap,
  Trophy,
  CheckCircle,
  ArrowUpRight,
  Mountain,
  Cake,
  Gem,
  Flower2,
  Music,
  Landmark,
  Umbrella,
  ShoppingBag,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TravelPulseCard, TravelPulseTrendingData } from "@/components/travelpulse/TravelPulseCard";
import { CityGrid } from "@/components/travelpulse/CityGrid";
import { GlobalCalendar } from "@/components/travelpulse/GlobalCalendar";
import { TripQueueIndicator } from "@/components/TripQueueIndicator";
import { SEOHead } from "@/components/seo-head";
import { AIMatchedExpertsSection } from "@/components/ai-matched-experts-section";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { planTypeLabel, planTypeDisplay } from "@shared/ready-made-plan-types";
import { trackSearchEvent } from "@/lib/analytics";
import { CuratedContentSection } from "@/components/curated-content-section";
import { UnifiedResultGrid, catalogItemToUnifiedResult } from "@/components/unified-result-card";
import type { CatalogItem } from "@/types/catalog";
import "./marketplace-field-guide.css";

// Ready-Made shelf DTO (GET /api/ready-made) — teaser fields only; the itinerary stays behind
// the purchase→clone gate.
type ReadyMadeShelfListing = {
  id: string;
  title: string;
  planType: string | null;
  planTypeCustom: string | null;
  market: string;
  durationDays: number;
  pricingMode: string;
  priceCents: number | null;
  heroImageUrl: string | null;
  authorName: string;
  authorHandle: string | null;
  section: "trips_by_locals" | "advisor";
};

// Theme chip/shelf ICONS only — presentational metadata. Labels always come from the shared
// vocabulary (planTypeLabel/planTypeDisplay, shared/ready-made-plan-types.ts), never restated
// here, so a vocabulary change can't drift this file's text.
const READY_MADE_THEME_ICONS: Record<string, typeof Award> = {
  hiking_itinerary: Mountain,
  road_trip_itinerary: Car,
  city_itinerary: Building2,
  food_culture_itinerary: UtensilsCrossed,
  birthday_plan: Cake,
  wedding_plan: Heart,
  proposal_plan: Gem,
  corporate_retreat_plan: Briefcase,
  adventure_outdoors: Compass,
  romance_honeymoon: Heart,
  family_trip: Users,
  wellness_retreat: Flower2,
  photography_tour: Camera,
  nightlife_entertainment: Music,
  cultural_heritage: Landmark,
  beach_island: Umbrella,
  festival_seasonal: PartyPopper,
  shopping_style: ShoppingBag,
  custom: Sparkles,
};

/** Chip/shelf heading for a theme KEY (aggregate label — per-listing custom text stays on the
 *  card via planTypeDisplay). `custom` aggregates as "Custom themes"; untyped grandfathers as
 *  "More trips". */
function readyMadeThemeHeading(key: string): string {
  if (key === "custom") return "Custom themes";
  return planTypeLabel(key) ?? "More trips";
}

/**
 * Ready-Made shelf card, theme-first: the theme is the eyebrow (per-listing custom text via
 * planTypeDisplay), the author type is a badge. The author row lives OUTSIDE the detail-page
 * link so the storefront link is a real, un-nested anchor — StorefrontLink's Discover-card
 * constraint solved by structure. No handle → plain text, never a dead /s/ link (rule 1).
 */
function ReadyMadeThemeCard({ listing: l }: { listing: ReadyMadeShelfListing }) {
  return (
    <article
      className="marketplace-card flex flex-col h-full"
      data-testid={`rm-shelf-card-${l.id}`}
    >
      <Link href={`/ready-made/${l.id}`} className="block flex-1 cursor-pointer group hover:no-underline text-inherit">
        <div
          className="marketplace-trip-image overflow-hidden"
          style={l.heroImageUrl ? { backgroundImage: `url(${l.heroImageUrl})` } : {}}
        >
          <span className="marketplace-trip-destination">{l.market}</span>
        </div>
        <div className="marketplace-trip-body flex flex-col flex-1">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <p className="marketplace-kicker">{planTypeDisplay(l.planType, l.planTypeCustom)}</p>
            <span className="marketplace-status gold">Editable after purchase</span>
          </div>
          <p className="marketplace-trip-title line-clamp-2">{l.title}</p>
          <p className="marketplace-trip-details">{l.durationDays} days · editable plan</p>
          <div className="marketplace-facts mt-auto">
            <div className="marketplace-fact">
              <strong>{l.priceCents === null ? "—" : `$${(l.priceCents / 100).toFixed(2)}`}</strong>
              {l.pricingMode === "per_traveler" ? "per traveler" : "complete trip"}
            </div>
            <div className="marketplace-fact">
              <strong>{l.durationDays} days</strong>
              trip length
            </div>
            <div className="marketplace-fact">
              <strong>By {l.authorName.split(" ")[0]}</strong>
              {l.section === "trips_by_locals" ? "Local Expert" : "Trip Planner"}
            </div>
          </div>
          <div className="marketplace-trip-actions">
            <span className="marketplace-meta" style={{ margin: 0 }}>
              Editable plan · yours after checkout
            </span>
            <span className="marketplace-card-cta">
              View trip <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
      <div className="marketplace-card-owner">
        <span>Trip editor</span>
        {l.authorHandle ? (
          <Link
            href={`/s/${l.authorHandle}`}
            className="marketplace-owner-link"
            data-testid={`link-rm-author-${l.id}`}
          >
            {l.authorName}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        ) : (
          <span>{l.authorName}</span>
        )}
      </div>
    </article>
  );
}

type ServiceCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryType: string;
  priceRange: { min: number; max: number } | null;
  categoryKey?: string | null;   // brief's join key; already returned by /api/service-categories (full select)
};

type Service = {
  id: string;
  userId: string;
  serviceName: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  price: string;
  location: string;
  averageRating: string;
  reviewCount: number;
  status: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  revisionsIncluded?: number;
  includesExpertNotes?: boolean;
  providerFirstName?: string | null;
  providerLastName?: string | null;
  providerImageUrl?: string | null;
  providerRating?: string | null;
  providerBusinessName?: string | null;
  serviceImage?: string | null;
  galleryImages?: string[] | null;
  /** MP-2 storefront return path — null when the owner has no claimed handle (no /s/ page). */
  providerHandle?: string | null;
};

type DiscoverResult = {
  services: Service[];
  total: number;
  packagesTotal?: number;
  suggestion?: string | null;
};

interface CartData {
  items: any[];
  itemCount: number;
  subtotal: string;
  total: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  "photography-videography": Camera,
  "transportation-logistics": Car,
  "food-culinary": UtensilsCrossed,
  "childcare-family": Baby,
  "tours-experiences": Compass,
  "personal-assistance": Briefcase,
  "taskrabbit-services": Wrench,
  "health-wellness": Heart,
  "beauty-styling": Sparkles,
  "pets-animals": Dog,
  "events-celebrations": PartyPopper,
  "technology-connectivity": Laptop,
  "language-translation": Languages,
  "specialty-services": Award,
  "custom-other": HelpCircle,
  "visa-assistance": Globe,
};

const tripCategories = [
  { id: "all", label: "All", icon: Globe },
  { id: "adventure", label: "Adventure", icon: TrendingUp },
  { id: "cultural", label: "Cultural", icon: BookOpen },
  { id: "relaxation", label: "Relaxation", icon: Heart },
  { id: "romantic", label: "Romantic", icon: Heart },
  { id: "family", label: "Family", icon: Users },
];


function ServiceCard({
  service,
  category,
  onAddToCart,
  isAddingToCart,
  isAdded,
}: {
  service: Service;
  category?: ServiceCategory;
  onAddToCart?: (serviceId: string) => void;
  isAddingToCart?: boolean;
  isAdded?: boolean;
}) {
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const reviewCount = service.reviewCount || 0;
  const location = service.location || "Remote";
  const categoryName = category?.name || "Service";
  const hasReviews = reviewCount > 0;
  const providerName = [service.providerFirstName, service.providerLastName].filter(Boolean).join(" ") || service.providerBusinessName || "Provider";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group h-full"
    >
      <article
        className="marketplace-card marketplace-service-card bg-card dark:bg-card overflow-hidden h-full flex flex-col hover-elevate transition-all"
        data-testid={`card-service-${service.id}`}
      >
        <Link href={`/services/${service.id}`} className="block flex-1 cursor-pointer group hover:no-underline text-inherit" data-testid={`link-service-${service.id}`}>
          <div className="marketplace-service-top">
            <span className="marketplace-service-provider">
              {hasReviews ? "Guest-rated service" : "New listing"}
            </span>
            <span className="marketplace-status teal">
              {service.status === "active" ? "Active listing" : "Service listing"}
            </span>
          </div>

          <p
            className="marketplace-card-title line-clamp-2"
            style={{ marginTop: 19 }}
            data-testid={`text-service-name-${service.id}`}
          >
            {service.serviceName}
          </p>

          <p className="marketplace-meta truncate">
            <span data-testid={`text-provider-name-${service.id}`}>{providerName}</span>
            {" · "}
            <span data-testid={`text-provider-rating-${service.id}`}>{rating > 0 ? rating.toFixed(1) : "New"}</span>
            {" · "}
            <span data-testid={`text-location-${service.id}`}>{location}</span>
          </p>

          {Boolean(service.shortDescription || service.description) && (
            <p className="marketplace-service-summary line-clamp-2">
              {service.shortDescription || service.description}
            </p>
          )}

          <p className="marketplace-meta" style={{ color: "var(--teal)", fontWeight: 700, marginTop: 12 }}>
            {service.deliveryTimeframe || "Flexible timing"}
          </p>

          {(service.deliveryMethod || service.revisionsIncluded !== undefined || service.includesExpertNotes) && (
            <div className="marketplace-service-inclusions">
              {service.deliveryMethod && <span>{service.deliveryMethod}</span>}
              {service.revisionsIncluded !== undefined && (
                <span>
                  {service.revisionsIncluded} revision{service.revisionsIncluded === 1 ? "" : "s"}
                </span>
              )}
              {service.includesExpertNotes && <span>Expert notes included</span>}
            </div>
          )}

          <div className="marketplace-facts" data-testid={`stats-footer-${service.id}`}>
            <div className="marketplace-fact">
              <strong>${price.toFixed(0)}</strong>
              per service
            </div>
            <div className="marketplace-fact" data-testid={`stat-rating-${service.id}`}>
              <strong>{rating > 0 ? rating.toFixed(1) : "—"}</strong>
              guest rating
            </div>
            <div className="marketplace-fact truncate" title={categoryName}>
              <strong>{categoryName}</strong>
              service type
            </div>
          </div>
        </Link>

        <div className="marketplace-card-owner">
          <span>Offered by</span>
          {service.providerHandle ? (
            <Link
              href={`/s/${service.providerHandle}`}
              className="marketplace-owner-link"
              data-testid={`link-provider-storefront-${service.id}`}
            >
              {providerName}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : (
            <span>{providerName}</span>
          )}
        </div>

        <div className="marketplace-card-rule" />

        <div className="marketplace-card-foot">
          <span className="marketplace-service-price">
            ${price.toFixed(0)}<span>per service</span>
          </span>
          {onAddToCart && (
            <button
              className="marketplace-card-cta"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart(service.id);
              }}
              disabled={isAddingToCart || isAdded}
              data-testid={`button-add-to-cart-${service.id}`}
            >
              {isAdded ? "Added ✓" : "Add to trip"}
              {!isAdded && <ArrowUpRight size={13} />}
            </button>
          )}
        </div>
      </article>
    </motion.div>
  );
}

/**
 * Each Marketplace surface remains its own route and keeps its existing route
 * semantics. `surface` pins the content while the Field Guide route rail uses
 * real links to connect the four sibling pages; ?tab= remains ignored.
 */
export type MarketplaceSurface = "travelpulse" | "packages" | "events" | "services";

// Shared Field Guide masthead metadata. Icons and copy establish each route's job
// while the route rail keeps the four Marketplace surfaces visibly connected.
const SURFACE_META: Record<MarketplaceSurface, { icon: typeof Compass; title: string; subtitle: string; label: string; url: string; seoTitle: string }> = {
  travelpulse: {
    icon: Compass,
    title: "Destinations",
    subtitle: "Field notes on places worth planning around — seasons, culture, and the feeling of being there.",
    label: "Travel intelligence",
    url: "/destinations",
    seoTitle: "Destinations — Trending Cities & Travel Intel",
  },
  packages: {
    icon: Sparkles,
    title: "Ready-Made Trips",
    subtitle: "Guided itineraries crafted by verified experts — buy the plan and travel it your way.",
    label: "Trip editions",
    url: "/ready-made",
    seoTitle: "Ready-Made Trips — Expert-Built, Ready to Buy",
  },
  events: {
    icon: Calendar,
    title: "Events",
    subtitle: "Use the calendar to find a date, then see the festivals and places that make it worth the journey.",
    label: "Time-led planning",
    url: "/events",
    seoTitle: "Events — Festivals & Travel Calendar",
  },
  services: {
    icon: Sparkles,
    title: "Services",
    subtitle: "Book local expertise for the part of your trip that deserves to feel effortless.",
    label: "Book with confidence",
    url: "/services",
    seoTitle: "Services — Tours, Photography, Transport & More",
  },
};

export default function DiscoverPage({ surface }: { surface?: MarketplaceSurface } = {}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  // Parse URL params for expert handoff context (useSearch makes this reactive to navigation)
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const showExperts = urlParams.get("showExperts") === "true";
  const expertHandoffDestination = urlParams.get("destination") || "";
  const expertHandoffCountry = urlParams.get("country") || "";
  const expertHandoffExperienceType = urlParams.get("experienceType") || "";
  const expertHandoffTripId = urlParams.get("tripId") || "";
  const expertHandoffStartDate = urlParams.get("startDate") || "";
  const expertHandoffEndDate = urlParams.get("endDate") || "";
  const isFromQuickStart = urlParams.get("source") === "quick-start";
  
  // Ref for experts section to scroll to
  const expertsSectionRef = useRef<HTMLDivElement>(null);

  // Search and filter state
  const initialQuery = urlParams.get("q") || "";
  const readNumberParam = (name: string) => {
    const value = Number(urlParams.get(name));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const initialPage = Math.max(0, (Number.parseInt(urlParams.get("page") || "1", 10) || 1) - 1);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [locationFilter, setLocationFilter] = useState(urlParams.get("location") || expertHandoffDestination);
  const [selectedCategory, setSelectedCategory] = useState(urlParams.get("categoryId") || "all");
  const [sortBy, setSortBy] = useState(urlParams.get("sortBy") || "rating");
  const [minPrice, setMinPrice] = useState(readNumberParam("minPrice"));
  const [maxPrice, setMaxPrice] = useState(readNumberParam("maxPrice"));
  const [minRating, setMinRating] = useState(readNumberParam("minRating"));
  const [page, setPage] = useState(initialPage);
  const hasMountedSearch = useRef(false);
  const limit = 12;

  // Trip packages state
  const [favorites, setFavorites] = useState<number[]>([]);

  // Cart state
  const [addedServices, setAddedServices] = useState<Set<string>>(new Set());
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);
  const [creatingComparison, setCreatingComparison] = useState(false);
  
  // Expert handoff state
  const [showExpertHandoffBanner, setShowExpertHandoffBanner] = useState(isFromQuickStart && showExperts);
  
  // Tab navigation state (read from URL).
  // articles tab hidden in Phase 1a — fall back to travelpulse.
  // "packages" added to the URL-addressable set alongside the B4 un-hide of its
  // TabsTrigger (the trigger + TabsContent already render; this only lets
  // ?tab=packages deep-link to it, e.g. from the calendar "More info" modal).
  const VISIBLE_TABS = new Set(["travelpulse", "packages", "events", "services"]);
  const rawUrlTab = urlParams.get("tab") || "travelpulse";
  const urlTab = VISIBLE_TABS.has(rawUrlTab) ? rawUrlTab : "travelpulse";
  const urlCity = urlParams.get("city") || "";
  // A surface page is PINNED — ?tab= never overrides it (the /discover redirect
  // is what maps old ?tab= links onto the right surface route).
  //
  // `activeTab` is DERIVED from `surface`, not just seeded from it: navigating
  // between surface routes (/services → /destinations) reuses this same
  // DiscoverPage instance (both routes render Layout > DiscoverPage), so the
  // useState initializer does NOT re-run and the effect below (gated on
  // `!surface`) does NOT fire. If the tab lived only in state it would go stale —
  // the masthead (which reads `surface`) would update while the body (which reads
  // the tab) would not. Deriving keeps the two in lockstep with no render flash.
  const [selectedTab, setSelectedTab] = useState(urlTab);
  const activeTab = surface ?? selectedTab;

  // Sync the selected tab whenever the URL ?tab= param changes (legacy tabbed
  // shell only — surface pages are fixed by their route and ignore ?tab=).
  useEffect(() => {
    if (!surface) setSelectedTab(urlTab);
  }, [urlTab, surface]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      if (hasMountedSearch.current) setPage(0);
      else hasMountedSearch.current = true;
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keep the full discovery state addressable so refreshes, shares, and a
  // browser-back return from a detail page restore the same result set.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (name: string, value: string, omit = false) => {
      if (!value || omit) params.delete(name);
      else params.set(name, value);
    };
    setOrDelete("q", debouncedQuery);
    setOrDelete("location", locationFilter);
    setOrDelete("categoryId", selectedCategory, selectedCategory === "all");
    setOrDelete("minPrice", String(minPrice), minPrice <= 0);
    setOrDelete("maxPrice", String(maxPrice), maxPrice <= 0);
    setOrDelete("minRating", String(minRating), minRating <= 0);
    setOrDelete("sortBy", sortBy, sortBy === "rating");
    setOrDelete("page", String(page + 1), page === 0);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [debouncedQuery, locationFilter, selectedCategory, minPrice, maxPrice, minRating, sortBy, page]);

  // Track search events for tourism analytics
  useEffect(() => {
    // Only track when there's a meaningful search (destination/location filter)
    if (locationFilter && locationFilter.length >= 2) {
      trackSearchEvent({
        destination: locationFilter,
        searchContext: 'discover',
      });
    }
  }, [locationFilter]);

  // Data queries
  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
  });

  // Upsell deep-link (issue #51): ?categoryKey=<service_categories.category_key>
  // preselects the matching category. Resolves to the row id via the already-loaded
  // categories array — the one source; no per-surface categoryKey→id map.
  const upsellCategoryKey = urlParams.get("categoryKey");
  useEffect(() => {
    if (upsellCategoryKey && categories?.length) {
      const match = categories.find((c) => c.categoryKey === upsellCategoryKey);
      if (match) setSelectedCategory(match.id);
    }
  }, [upsellCategoryKey, categories]);

  const { data: result, isLoading: servicesLoading } = useQuery<DiscoverResult>({
    queryKey: [
      "/api/discover",
      debouncedQuery,
      selectedCategory,
      locationFilter,
      minPrice,
      maxPrice,
      minRating,
      sortBy,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (selectedCategory && selectedCategory !== "all") params.set("categoryId", selectedCategory);
      if (locationFilter) params.set("location", locationFilter);
      if (minPrice > 0) params.set("minPrice", String(minPrice));
      if (maxPrice > 0) params.set("maxPrice", String(maxPrice));
      if (minRating > 0) params.set("minRating", String(minRating));
      if (sortBy) params.set("sortBy", sortBy);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: cart } = useQuery<CartData>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  // Expert Templates Query
  // Phase-4 shelf: approved cloneable store listings (server-gated teaser feed).
  // Theme-first redesign (ledger 2026-08-22-ready-made-themes): the shelf organizes around the
  // listing's declared theme (plan_type — required at submit, closed vocabulary); the author
  // type demotes to a card badge. This unfiltered feed stays mounted as the source of the chip
  // rail's REAL per-theme counts.
  const { data: readyMadeShelfData } = useQuery<{ listings: ReadyMadeShelfListing[] }>({
    queryKey: ["/api/ready-made"],
    staleTime: 60_000,
  });
  const readyMadeShelf = readyMadeShelfData?.listings;

  // One theme selected → the server-validated filter. Vocabulary keys ride ?planType=; an
  // expert-minted theme (ledger 2026-08-22-expert-minted-themes) rides ?customLabel= — the
  // author's own label is the category, matched against stored data server-side. While the
  // filtered fetch loads, the client-side subset of the already-fetched feed renders instantly —
  // same rows by construction (same read-gate, same predicate), so there is no flash of wrong
  // content. Group-key shapes: "all" | <vocab key> | "custom:<normalized label>" | "custom"
  // (label-less custom rows) | "__untyped__".
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const selectedCustomLabel = selectedTheme.startsWith("custom:")
    ? selectedTheme.slice("custom:".length)
    : null;
  const readyMadeThemeUrl = selectedCustomLabel
    ? `/api/ready-made?customLabel=${encodeURIComponent(selectedCustomLabel)}`
    : `/api/ready-made?planType=${encodeURIComponent(selectedTheme)}`;
  const { data: readyMadeThemeData } = useQuery<{ listings: ReadyMadeShelfListing[] }>({
    queryKey: [readyMadeThemeUrl],
    // The plain "custom" group (label-less rows) filters client-side only: ?planType=custom
    // would also return every LABELED custom listing — a different set than the shelf shows.
    enabled: selectedTheme !== "all" && selectedTheme !== "custom",
    staleTime: 60_000,
  });

  // Themes present in the live feed, in feed order (badge-first, then approval recency), with
  // real counts — chips render only for themes that actually have stock (§13: no empty aisles,
  // never the full 20-key vocabulary as decoration). Expert-minted themes are FIRST-CLASS:
  // each distinct custom label is its own group (key "custom:<normalized>", display label =
  // the author's casing at first occurrence) — an expert who types a new theme has created a
  // browsable category, not a card in a generic bucket. Label-less custom rows keep the plain
  // "custom" group; untyped grandfathers group under a chip-less trailing shelf.
  const readyMadeThemes = useMemo(() => {
    const order: string[] = [];
    const byTheme = new Map<string, ReadyMadeShelfListing[]>();
    const customLabels = new Map<string, string>();
    for (const l of readyMadeShelf ?? []) {
      let key: string;
      if (l.planType === "custom") {
        const label = (l.planTypeCustom ?? "").trim();
        if (label) {
          key = `custom:${label.toLowerCase()}`;
          if (!customLabels.has(key)) customLabels.set(key, label);
        } else {
          key = "custom";
        }
      } else {
        key = l.planType ?? "__untyped__";
      }
      if (!byTheme.has(key)) {
        byTheme.set(key, []);
        order.push(key);
      }
      byTheme.get(key)!.push(l);
    }
    return { order, byTheme, customLabels };
  }, [readyMadeShelf]);

  // One display-name resolution for group keys, vocab and expert-minted alike.
  const themeHeadingFor = (key: string): string =>
    readyMadeThemes.customLabels.get(key) ?? readyMadeThemeHeading(key);

  // TravelPulse city data is consumed directly by the <CityGrid> component in the
  // travelpulse tab — no mapping needed here.
  
  // Experts query for handoff - fetch experts filtered by destination/experience type
  const expertsApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (expertHandoffDestination) params.set("location", expertHandoffDestination);
    if (expertHandoffExperienceType) params.set("experienceType", expertHandoffExperienceType);
    const queryStr = params.toString();
    return queryStr ? `/api/experts?${queryStr}` : "/api/experts";
  }, [expertHandoffDestination, expertHandoffExperienceType]);
  
  const { data: matchedExperts = [], isLoading: expertsLoading } = useQuery<any[]>({
    queryKey: [expertsApiUrl],
    enabled: showExperts,
  });

  // Partner catalog activities — fetched when the user has narrowed to a location.
  // Results are shown below the native service grid so real prices (e.g. "$89") are
  // visible instead of tier symbols; uses catalogItemToUnifiedResult + UnifiedResultGrid.
  const { data: catalogActivityData, isLoading: catalogActivitiesLoading } = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: ["/api/catalog/activities-gyg", locationFilter],
    enabled: !!locationFilter && activeTab === "services",
    queryFn: async () => {
      const params = new URLSearchParams({ destination: locationFilter, limit: "8" });
      const res = await fetch(`/api/catalog/activities-gyg?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Catalog fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const catalogActivities = (catalogActivityData?.items ?? []).map(catalogItemToUnifiedResult);
  
  // Auto-scroll to experts section when coming from quick-start
  useEffect(() => {
    if (showExperts && expertsSectionRef.current) {
      setTimeout(() => {
        expertsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 500);
    }
  }, [showExperts]);

  const getCategoryById = (id: string) => categories?.find((c) => c.id === id);

  // AI Recommendations panel removed (funnel PR1) — the AI sell lives in the cart's
  // paid-optimization step now. Its server endpoint (POST /api/discover/recommendations)
  // was removed too (roadmap 3.4, consumer-less; restore from git history if revived).

  // Guest cart fallback — used when auth has resolved to no user, or when the
  // server returns 401 (the definitive "not authenticated" signal).
  const saveToGuestCart = (serviceId: string) => {
    const GUEST_CART_KEY = "traveloure_guest_cart_pending";
    try {
      const existing: string[] = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || "[]");
      if (!existing.includes(serviceId)) {
        localStorage.setItem(GUEST_CART_KEY, JSON.stringify([...existing, serviceId]));
      }
    } catch { /* ignore */ }
    toast({ title: "Saved!", description: "Sign in to checkout and save your selection." });
  };

  // Cart mutations
  const addToCartMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      setAddingToCartId(serviceId);
      return apiRequest("POST", "/api/cart", { serviceId, quantity: 1 });
    },
    onSuccess: (_, serviceId) => {
      setAddedServices(prev => new Set(prev).add(serviceId));
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart!", description: "Service has been added to your cart." });
      setAddingToCartId(null);
    },
    onError: (error: any, serviceId: string) => {
      // A 401 means the session cookie was not established server-side — i.e. a
      // genuine guest, or a click that beat the /api/auth/user query on a cold
      // load. Fall back to the guest cart instead of a scary error toast; this
      // closes the auth-state race that dropped authed users' items into
      // localStorage (Stage-1 journey-1A cart-empty failure).
      if (typeof error?.message === "string" && error.message.startsWith("401")) {
        saveToGuestCart(serviceId);
        setAddingToCartId(null);
        return;
      }
      console.error("[Cart] addToCartMutation failed:", error);
      toast({ variant: "destructive", title: "Failed to add to cart", description: error.message });
      setAddingToCartId(null);
    },
  });

  const handleAddToCart = (serviceId: string) => {
    // Auth is authoritative server-side (the session cookie), not the client
    // `user` query — which can still be loading on a cold page load. Only take
    // the guest path once auth has DEFINITIVELY resolved to no user; while it is
    // still loading, attempt the authenticated add and let the server's 401
    // (handled in the mutation's onError) fall back to the guest cart. Branching
    // on `!user` alone raced the auth query and silently dropped authenticated
    // users' selections into localStorage (Stage-1 journey-1A cart-empty).
    if (!user && !authLoading) {
      saveToGuestCart(serviceId);
      return;
    }
    addToCartMutation.mutate(serviceId);
  };

  const createComparison = async () => {
    if (!cart || cart.items.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty", description: "Add some services first" });
      return;
    }
    if (!user) {
      toast({ title: "Please sign in", description: "Sign in to use AI comparison" });
      return;
    }
    // §13 honest-or-absent: this page has no destination the user actually told us — no
    // traveler-count picker either. Prefer a real destination (the cart's own service location,
    // then whatever the user typed into the location filter); if neither exists, don't invent
    // "Paris, France" — block with a toast instead of silently fabricating a destination.
    const knownDestination = cart.items[0]?.service?.location || locationFilter.trim();
    if (!knownDestination) {
      toast({
        title: "Tell us where you're headed",
        description: "Search or filter by a destination first so we know where to plan for.",
      });
      return;
    }

    setCreatingComparison(true);

    const cartItems = cart.items.map((item: any) => ({
      name: item.service?.serviceName || "Service",
      category: item.service?.category || "service",
      price: item.service?.price || "0",
      provider: item.service?.providerName || "Provider",
      location: item.service?.location || ""
    }));

    try {
      // NOTE (payload-preservation): the pre-existing call here never sent `baselineItems` in the
      // POST body (unlike the other three sites) — only sessionStorage carried the cart snapshot,
      // for the comparison page's retry path. Preserved exactly; not a candidate fix for this lane.
      const comparison = await createComparisonRequest({
        title: "My Trip",
        destination: knownDestination,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budget: cart.total,
      });

      sessionStorage.setItem(`comparison_baseline_${comparison.id}`, JSON.stringify(cartItems));
      setLocation(`/itinerary-comparison/${comparison.id}`);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Failed to create comparison",
        description: error?.message || "Please try again"
      });
    } finally {
      setCreatingComparison(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedCategory("all");
    setMinPrice(0);
    setMaxPrice(0);
    setMinRating(0);
    setLocationFilter("");
    setPage(0);
  };

  const hasActiveFilters = 
    searchQuery.trim() !== "" ||
    selectedCategory !== "all" || 
    minPrice > 0 || 
    maxPrice > 0 || 
    minRating > 0 ||
    locationFilter !== "";

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const influencerContent: any[] = [];

  return (
    <>
      <SEOHead
        title={surface ? SURFACE_META[surface].seoTitle : "Discover Services & Experiences"}
        description="Browse expert services, curated trip packages, and get AI-powered recommendations for your next adventure. Find travel planners, venues, and unique experiences."
        keywords={["discover travel", "travel services", "trip packages", "vacation planning", "experience marketplace"]}
        url={surface ? SURFACE_META[surface].url : "/discover"}
      />
      <div
        className={cn(
          "min-h-screen bg-background",
          surface && "marketplace-field-guide",
          surface && (
            surface === "packages" || surface === "services"
              ? "marketplace-field-guide--full"
              : "marketplace-field-guide--delicate"
          ),
        )}
      >

        {/* Hero — UNIFIED header band, shared pattern with /experts: centered navy
            title (text-[28px]/3xl) + one-line muted subtitle, then the page's control
            row beneath. py-5 = compacted (decision-maker Aug 23: the py-9 masthead
            pushed page content too far down). Change the pattern in BOTH places or not
            at all — /experts carries the identical band. */}
        {/* Funnel PR1: the whole header region (hero + tab bar) lives inside ONE Tabs
            root so the tab bar renders INSIDE the hero band (Radix TabsList needs the
            Tabs context). The sections between the hero and the TabsContents are
            unaffected — Tabs is context, not layout. The hero carries the ONE
            instructional ad (browse → add to cart → we assemble & optimize); the old
            AI-Suggestions button, Plan-Experience button, and the standalone banner
            are all removed — each duplicated another entry (funnel audit, Jul 17).
            The AI sell lives in the cart's paid-optimization step instead. */}
        <Tabs value={activeTab} onValueChange={setSelectedTab} className="w-full">
        <section className="marketplace-masthead bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-5">
          <div className="container mx-auto px-4 max-w-6xl">
            {/* Field Guide masthead: a route-specific icon, serif title, concise deck,
                and real-link route rail. Services search lives with its result filters;
                the legacy tabbed shell keeps its existing centered search and ad. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={surface ? "marketplace-titlebar" : "text-center mb-4"}
            >
              <div>
                <h1
                  className={surface
                    ? "marketplace-title"
                    : "text-[28px] md:text-3xl font-semibold tracking-tight text-[color:var(--earn-navy)]"}
                >
                  {surface ? (
                    <>
                      <span className={`marketplace-title-icon marketplace-title-icon--${surface}`} aria-hidden="true">
                        {(() => { const SurfaceIcon = SURFACE_META[surface].icon; return <SurfaceIcon />; })()}
                      </span>
                      <span data-testid="text-page-title">{SURFACE_META[surface].title}</span>
                    </>
                  ) : (
                    <span data-testid="text-page-title">Explore Services &amp; Ready-Made Trips</span>
                  )}
                </h1>
                <p className={surface
                  ? "marketplace-deck"
                  : "text-[15px] text-[color:var(--earn-muted)] mt-1"}>
                  {surface ? SURFACE_META[surface].subtitle : "Expert services, ready-made trips, and AI-powered recommendations."}
                </p>
              </div>
              {surface && (
                <div className="marketplace-surface-block">
                  <p>{SURFACE_META[surface].label}</p>
                  <nav className="marketplace-surface-nav" aria-label="Marketplace sections">
                    {(Object.keys(SURFACE_META) as MarketplaceSurface[]).map((key) => (
                      <Link
                        key={key}
                        href={SURFACE_META[key].url}
                        className={key === surface ? "active" : ""}
                        aria-current={key === surface ? "page" : undefined}
                        data-testid={`marketplace-route-${key}`}
                      >
                        {SURFACE_META[key].title.replace(" Trips", "")}
                      </Link>
                    ))}
                  </nav>
                </div>
              )}
            </motion.div>
            {!surface && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={surface ? "mt-3" : "max-w-3xl mx-auto"}
            >
              <div className={surface ? "relative max-w-xl" : "relative"}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services, destinations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 text-foreground"
                  data-testid="input-search"
                />
              </div>
              {/* The instructional ad — legacy tabbed shell only (funnel's one pitch). */}
              {!surface && (
              <button
                type="button"
                onClick={() => setSelectedTab("services")}
                className="w-full mt-3 flex items-center gap-2.5 rounded-lg border border-[color:var(--earn-border)] bg-[var(--earn-chip)] px-4 py-2 text-left hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="cta-how-it-works"
              >
                <Globe className="w-4 h-4 text-[color:var(--earn-teal-ink)] flex-shrink-0" />
                <p className="text-sm truncate min-w-0">
                  <span className="font-medium">Planning a wedding, proposal, or getaway?</span>{" "}
                  <span className="text-muted-foreground hidden sm:inline">
                    Browse services and add them to your cart — we assemble &amp; optimize your trip.
                  </span>
                </p>
                <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-[color:var(--earn-teal-ink)] whitespace-nowrap">
                  Browse services <ArrowRight className="w-4 h-4" />
                </span>
              </button>
              )}
              {/* Tab bar — legacy tabbed shell ONLY. A surface page renders NO tab bar
                  (the grouped header is the thing the un-group removes); navigation
                  between surfaces is the nav dropdown. */}
              {!surface && (
              <div className="relative mt-3">
                <TabsList className="bg-card border p-1 w-full overflow-x-auto flex justify-start gap-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  <TabsTrigger
                    value="travelpulse"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0 min-h-11"
                    data-testid="tab-travelpulse"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Destinations
                  </TabsTrigger>
                  <TabsTrigger
                    value="packages"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0 min-h-11"
                    data-testid="tab-packages"
                  >
                    <Award className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Ready-Made&nbsp;</span>Trips
                  </TabsTrigger>
                  <TabsTrigger
                    value="events"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0 min-h-11"
                    data-testid="tab-events"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Events
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap flex-shrink-0 min-h-11"
                    data-testid="tab-services"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Services
                  </TabsTrigger>
                </TabsList>
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
              </div>
              )}
            </motion.div>
            )}
          </div>
        </section>

        {/* Expert Handoff Banner - shown when coming from quick-start */}
        {showExpertHandoffBanner && (
          <section className="bg-gradient-to-r from-amber-500/10 to-primary/10 border-b py-4">
            <div className="container mx-auto px-4 max-w-6xl">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Your AI itinerary for {expertHandoffDestination}{expertHandoffCountry ? `, ${expertHandoffCountry}` : ""} is ready!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {expertHandoffStartDate && expertHandoffEndDate
                        ? `${expertHandoffStartDate} to ${expertHandoffEndDate} • `
                        : ""}
                      Connect with a local expert below to refine your trip
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExpertHandoffBanner(false)}
                  data-testid="button-dismiss-handoff-banner"
                >
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </section>
        )}

        {/* Matched Experts Section - shown when coming from quick-start with showExperts */}
        {showExperts && (
          <section ref={expertsSectionRef} className="py-8 bg-muted/30">
            <div className="container mx-auto px-4 max-w-6xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold" data-testid="text-matched-experts-title">
                    Experts for {expertHandoffDestination}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Local experts who can help refine your itinerary and add bookable services
                  </p>
                </div>
              </div>

              {/* AI-Matched Experts — surfaced via ExpertMatchCard */}
              <div className="mb-6">
                <AIMatchedExpertsSection
                  destination={expertHandoffDestination}
                  experienceType={expertHandoffExperienceType || undefined}
                  tripId={expertHandoffTripId || undefined}
                  userId={user?.id}
                  isVisible={showExperts}
                />
              </div>
              
              {expertsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-32 mb-2" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : matchedExperts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedExperts.slice(0, 6).map((expert: any) => (
                    <Card key={expert.id} className="overflow-hidden hover-elevate transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            {expert.profileImageUrl ? (
                              <img
                                src={expert.profileImageUrl}
                                alt={expert.firstName || expert.username}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <Users className="h-6 w-6 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">
                              {expert.firstName} {expert.lastName || ""}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {expert.expertSpecialty || "Local Expert"}
                            </p>
                            {expert.expertLocations && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{expert.expertLocations}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          {expert.averageRating && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              {parseFloat(expert.averageRating).toFixed(1)}
                            </Badge>
                          )}
                          {expert.isExpert && (
                            <Badge variant="outline" className="text-xs">Verified Expert</Badge>
                          )}
                        </div>
                        <Button
                          className="w-full mt-3"
                          size="sm"
                          onClick={() => {
                            const params = new URLSearchParams();
                            if (expertHandoffTripId) params.set("tripId", expertHandoffTripId);
                            params.set("source", "quick-start");
                            setLocation(`/experts/${expert.id}?${params.toString()}`);
                          }}
                          data-testid={`button-connect-expert-${expert.id}`}
                        >
                          Connect
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <h3 className="font-medium mb-1">No experts found for this location</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try browsing all experts or adjusting your destination
                    </p>
                    <Button onClick={() => setLocation("/experts")} data-testid="button-browse-all-experts">
                      Browse All Experts
                    </Button>
                  </CardContent>
                </Card>
              )}
              
              {matchedExperts.length > 6 && (
                <div className="text-center mt-6">
                  <Link href={`/experts?destination=${encodeURIComponent(expertHandoffDestination)}`}>
                    <Button variant="outline" data-testid="button-view-all-experts">
                      View All {matchedExperts.length} Experts
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Main Content */}
        <section className={surface ? "marketplace-content py-7 md:py-8" : "py-12"}>
          <div className="container mx-auto px-4 max-w-[1400px]">
            {/* Tab bar moved INTO the hero band (funnel PR1) — TabsContents below stay
                inside the same Tabs root, which now opens above the hero. */}

              {/* Browse Services Tab */}
              <TabsContent value="services" className="marketplace-surface-content">

                {/* Quick Category Chips */}
                {categories && categories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    <Button
                      key="all"
                      variant={selectedCategory === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory("all")}
                      data-testid="button-quick-cat-all"
                    >
                      All Services
                    </Button>
                    {[
                      "tours-experiences",
                      "food-culinary",
                      "photography-videography",
                      "transportation-logistics",
                      "health-wellness",
                      "visa-assistance",
                    ]
                      .map((slug) => categories.find((c: any) => c.slug === slug))
                      .filter(Boolean)
                      .map((cat: any) => {
                        const Icon = categoryIcons[cat.slug] || Globe;
                        return (
                          <Button
                            key={cat.id}
                            variant={selectedCategory === cat.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedCategory(cat.id)}
                            data-testid={`button-quick-cat-${cat.slug}`}
                          >
                            <Icon className="w-3.5 h-3.5 mr-1.5" />
                            {cat.name}
                          </Button>
                        );
                      })}
                  </div>
                )}

                {/* Curated Content Hub — shows affiliate + platform-curated items matching destination */}
                {locationFilter && (
                  <CuratedContentSection
                    destination={locationFilter}
                    surface="travelpulse-discover"
                    label="Curated Experiences"
                    className="mb-6"
                  />
                )}


                {/* Unified Filter Bar — one earn-styled bar (mirrors the /experts filter
                    bar) replacing the old desktop sidebar Card + scattered Location/Sort
                    row + mobile filter Sheet. Every control inline; wraps on small screens. */}
                <div className="marketplace-filter-bar bg-[var(--earn-card)] border border-[color:var(--earn-border)] rounded-xl p-3 mb-6 flex flex-wrap items-center gap-2" data-testid="services-filter-bar">
                  {surface && <div className="relative flex-[1.4] min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="What do you need help with?"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>}
                  <div className="relative flex-1 min-w-[170px]">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Location"
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      className="pl-10"
                      data-testid="input-location"
                    />
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[170px]" data-testid="select-category">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {(categories ?? []).map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Min $"
                    value={minPrice || ""}
                    onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
                    className="w-24"
                    data-testid="input-min-price"
                  />
                  <Input
                    type="number"
                    placeholder="Max $"
                    value={maxPrice || ""}
                    onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
                    className="w-24"
                    data-testid="input-max-price"
                  />
                  <Select value={String(minRating)} onValueChange={(v) => setMinRating(parseFloat(v))}>
                    <SelectTrigger className="w-[130px]" data-testid="select-rating">
                      <SelectValue placeholder="Any rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Any rating</SelectItem>
                      <SelectItem value="3">3.0+ ★</SelectItem>
                      <SelectItem value="4">4.0+ ★</SelectItem>
                      <SelectItem value="4.5">4.5+ ★</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[170px]" data-testid="select-sort">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating">Top Rated</SelectItem>
                      <SelectItem value="reviews">Most Reviews</SelectItem>
                      <SelectItem value="price_low">Price: Low to High</SelectItem>
                      <SelectItem value="price_high">Price: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>

                <div className="marketplace-section-head">
                  <div>
                    <p className="marketplace-kicker">
                      {selectedCategory === "all" ? "All services" : getCategoryById(selectedCategory)?.name}
                    </p>
                    <h2>Good hands, exactly where you need them</h2>
                  </div>
                  {result && (
                    <p>{result.total} {result.total === 1 ? "match" : "matches"} · {sortBy.replaceAll("_", " ")}</p>
                  )}
                </div>

                <div>
                    {/* Active Filters */}
                    {hasActiveFilters && (
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <span className="text-sm text-muted-foreground">Active filters:</span>
                        {selectedCategory !== "all" && (
                          <Badge variant="secondary" className="gap-1">
                            {getCategoryById(selectedCategory)?.name}
                            <button
                              onClick={() => setSelectedCategory("all")}
                              data-testid="button-remove-category-filter"
                              className="ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Min: ${minPrice}
                            <button onClick={() => setMinPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {maxPrice > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            Max: ${maxPrice}
                            <button onClick={() => setMaxPrice(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {minRating > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            {minRating}+ stars
                            <button onClick={() => setMinRating(0)} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        {locationFilter && (
                          <Badge variant="secondary" className="gap-1">
                            {locationFilter}
                            <button onClick={() => setLocationFilter("")} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                          Clear all
                        </Button>
                      </div>
                    )}

                    {/* Services Grid */}
                    {servicesLoading ? (
                      <CardGridSkeleton count={8} />
                    ) : result?.services && result.services.length > 0 ? (
                      <>
                        <div className="marketplace-service-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {result.services.map((service) => (
                            <ServiceCard
                              key={service.id}
                              service={service}
                              category={getCategoryById(service.categoryId)}
                              onAddToCart={handleAddToCart}
                              isAddingToCart={addingToCartId === service.id}
                              isAdded={addedServices.has(service.id)}
                            />
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-8">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page === 0}
                              onClick={() => setPage(p => p - 1)}
                              data-testid="button-prev-page"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              Page {page + 1} of {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={page >= totalPages - 1}
                              onClick={() => setPage(p => p + 1)}
                              data-testid="button-next-page"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-16" data-testid="services-no-results">
                        <Building2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No services found</h3>
                        {result?.suggestion ? (
                          <p className="text-muted-foreground mb-4" data-testid="text-search-suggestion">
                            Did you mean{" "}
                            <button
                              type="button"
                              className="text-primary font-medium underline underline-offset-2 hover:no-underline"
                              onClick={() => {
                                setSearchQuery(result.suggestion!);
                                setPage(0);
                              }}
                              data-testid="button-search-suggestion"
                            >
                              {result.suggestion}
                            </button>
                            ?
                          </p>
                        ) : (
                          <p className="text-muted-foreground mb-4">
                            Try adjusting your search or filters
                          </p>
                        )}
                        <Button variant="outline" onClick={clearFilters}>
                          Clear Filters
                        </Button>
                      </div>
                    )}

                  {/* Partner catalog activities — only shown when a location is filtered.
                      Uses UnifiedResultGrid + catalogItemToUnifiedResult so real numeric
                      prices (e.g. "$89") are displayed instead of tier symbols. */}
                  {locationFilter && (catalogActivitiesLoading || catalogActivities.length > 0) && (
                    <div className="mt-10" data-testid="section-partner-activities">
                      <div className="flex items-center gap-2 mb-4">
                        <Ticket className="h-4 w-4 text-primary" />
                        <h2 className="text-lg font-semibold">
                          Activities in {locationFilter}
                        </h2>
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          via Partners
                        </Badge>
                      </div>
                      <UnifiedResultGrid
                        results={catalogActivities}
                        destination={locationFilter}
                        isLoading={catalogActivitiesLoading}
                        showInquiryButton={false}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Trip Packages Tab */}
              <TabsContent value="packages" className="marketplace-surface-content">
                {/* D3 (lane nav-storefront): the tab's content is width-aligned to the hero
                    band (max-w-6xl) — the surrounding shared container is max-w-[1400px]
                    for the other tabs, which left this tab visibly wider than its own
                    header. Scoped here so the services tab keeps its wide grid. */}
                <div className="max-w-6xl mx-auto">
                {surface && (
                  <div className="marketplace-section-head">
                    <div>
                      <p className="marketplace-kicker">Curated for right now</p>
                      <h2>Travel like you have a local editor</h2>
                    </div>
                    {readyMadeShelf && (
                      <p>{readyMadeShelf.length} {readyMadeShelf.length === 1 ? "edition" : "editions"} · one clear price</p>
                    )}
                  </div>
                )}
                {/* Cloneable trips shelf (Phase 4): approved store listings from GET /api/ready-made,
                    sectioned by author type per the ratified store model. Surfaced now that the buy
                    loop (purchase→clone→refund) is closed end-to-end (§10 B4). Hidden entirely when
                    the shelf is empty — never an empty aisle.
                    D3 naming: ready_made_trips = "Ready-Made Trips" (the purchasable ready-made
                    products); the author-type sections become subheadings under that one banner,
                    ending the heading collision with the expert_templates section below (now
                    "Itinerary Templates", the storefront vocabulary). */}
                {readyMadeShelf && readyMadeShelf.length > 0 && (
                  <div className="mb-10">
                    {/* On the /ready-made SURFACE the masthead already reads
                        "🏅 Ready-Made Trips" with this exact sub — so this section
                        header would be a literal duplicate. Show it only in the
                        legacy tabbed shell, where the masthead is generic. */}
                    {!surface && (
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Award className="w-5 h-5 text-primary" />
                        Ready-Made Trips
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Buy a complete trip built around an experience — it becomes your own editable plan
                      </p>
                    </div>
                    )}

                    {/* Theme chip rail (ledger 2026-08-22-ready-made-themes): only themes with
                        live stock render, with real counts — never the full 20-key vocabulary
                        as empty aisles (§13). Order follows the feed (badge-first, recency). */}
                    <div className="flex flex-wrap gap-2 mb-6" data-testid="rail-ready-made-themes">
                      <Button
                        variant={selectedTheme === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTheme("all")}
                        data-testid="button-theme-chip-all"
                      >
                        All experiences
                      </Button>
                      {readyMadeThemes.order
                        .filter((key) => key !== "__untyped__")
                        .map((key) => {
                          // Expert-minted groups ("custom:<label>") wear the Sparkles mark;
                          // their testid is slugified since author labels aren't DOM-safe.
                          const isMinted = key.startsWith("custom:");
                          const Icon = isMinted
                            ? Sparkles
                            : READY_MADE_THEME_ICONS[key] ?? Award;
                          const testKey = isMinted
                            ? `custom-${key.slice(7).replace(/[^a-z0-9]+/g, "-")}`
                            : key;
                          const count = readyMadeThemes.byTheme.get(key)?.length ?? 0;
                          return (
                            <Button
                              key={key}
                              variant={selectedTheme === key ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSelectedTheme(key)}
                              data-testid={`button-theme-chip-${testKey}`}
                            >
                              <Icon className="w-3.5 h-3.5 mr-1.5" />
                              {themeHeadingFor(key)}
                              <span className="ml-1.5 text-xs opacity-70">{count}</span>
                            </Button>
                          );
                        })}
                    </div>

                    {selectedTheme === "all" ? (
                      // Theme shelves — the experience is the organizing idea; author type is a
                      // badge on the card (the old "Trips by Locals"/"Trips by Trip Planners"
                      // sections demoted, not lost).
                      readyMadeThemes.order.map((key) => {
                        const rows = readyMadeThemes.byTheme.get(key) ?? [];
                        if (rows.length === 0) return null;
                        const sectionKey = key.startsWith("custom:")
                          ? `custom-${key.slice(7).replace(/[^a-z0-9]+/g, "-")}`
                          : key;
                        return (
                          <div key={key} className="mb-8" data-testid={`section-theme-${sectionKey}`}>
                            <div className="flex items-baseline gap-3 mb-3">
                              <h3 className="text-lg font-semibold">{themeHeadingFor(key)}</h3>
                              {rows.length > 3 && (
                                <button
                                  type="button"
                                  className="ml-auto text-sm font-medium text-primary hover:underline"
                                  onClick={() => setSelectedTheme(key)}
                                  data-testid={`button-theme-see-all-${sectionKey}`}
                                >
                                  See all {rows.length} →
                                </button>
                              )}
                            </div>
                            <div className="marketplace-ready-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {rows.slice(0, 3).map((l) => (
                                <ReadyMadeThemeCard key={l.id} listing={l} />
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      (() => {
                        // Server-filtered rows once loaded; the client-side subset of the same
                        // gated feed renders instantly meanwhile (same predicate by construction).
                        // Expert-minted keys match on the normalized author label; the plain
                        // "custom" group (label-less rows) is client-side only by design.
                        const filteredRows =
                          readyMadeThemeData?.listings ??
                          (readyMadeShelf ?? []).filter((l) =>
                            selectedCustomLabel !== null
                              ? l.planType === "custom" &&
                                (l.planTypeCustom ?? "").trim().toLowerCase() === selectedCustomLabel
                              : selectedTheme === "custom"
                                ? l.planType === "custom" && !(l.planTypeCustom ?? "").trim()
                                : l.planType === selectedTheme,
                          );
                        return (
                          <>
                            <div
                              className="flex items-center gap-3 flex-wrap rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 mb-4 text-sm"
                              data-testid="bar-theme-filter"
                            >
                              <span>
                                Showing <strong>{filteredRows.length}</strong>{" "}
                                {themeHeadingFor(selectedTheme)} trip{filteredRows.length === 1 ? "" : "s"}
                              </span>
                              <button
                                type="button"
                                className="ml-auto font-medium text-primary underline"
                                onClick={() => setSelectedTheme("all")}
                                data-testid="button-theme-clear"
                              >
                                Show all experiences
                              </button>
                            </div>
                            <div className="marketplace-ready-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {filteredRows.map((l) => (
                                <ReadyMadeThemeCard key={l.id} listing={l} />
                              ))}
                            </div>
                          </>
                        );
                      })()
                    )}
                  </div>
                )}

                </div>

              </TabsContent>

              {/* Influencer Curated Content Tab */}
              <TabsContent value="articles">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Creator Spotlight
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Curated by Travel Creators</h2>
                  <p className="text-muted-foreground">Discover authentic recommendations from verified travel influencers and local experts.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {influencerContent.map((content, idx) => (
                    <motion.div
                      key={content.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                    >
                      <Card
                        className="hover-elevate overflow-hidden cursor-pointer group h-full"
                        data-testid={`card-influencer-${content.id}`}
                      >
                        <CardContent className="p-0 flex flex-col h-full">
                          <div className="relative h-44 overflow-hidden">
                            {content.imageUrl ? (
                              <img
                                src={content.imageUrl}
                                alt={content.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
                                <Camera className="h-12 w-12 text-purple-500/30" />
                              </div>
                            )}
                            
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                            
                            <div className="absolute top-3 right-3">
                              <Badge 
                                className={cn(
                                  "text-xs border-0 font-medium",
                                  content.platform === "instagram" && "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
                                  content.platform === "youtube" && "bg-red-500 text-white",
                                  content.platform === "tiktok" && "bg-black text-white",
                                  content.platform === "linkedin" && "bg-blue-600 text-white"
                                )}
                              >
                                {content.platform === "instagram" && "Instagram"}
                                {content.platform === "youtube" && "YouTube"}
                                {content.platform === "tiktok" && "TikTok"}
                                {content.platform === "linkedin" && "LinkedIn"}
                              </Badge>
                            </div>

                            <div className="absolute bottom-3 left-3 right-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={content.avatarUrl}
                                  alt={content.creatorName}
                                  className="w-10 h-10 rounded-full border-2 border-white object-cover"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm truncate">{content.creatorName}</p>
                                  <p className="text-white/70 text-xs">{content.creator}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {content.category}
                              </Badge>
                              <Badge className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            </div>
                            
                            <h3 className="font-semibold text-base mb-2 group-hover:text-primary transition-colors line-clamp-2 flex-1">
                              {content.title}
                            </h3>
                            
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <MapPin className="w-4 h-4 text-primary" />
                              <span>{content.destination}</span>
                            </div>
                            
                            <div className="flex items-center justify-between text-sm pt-3 border-t">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Users className="w-4 h-4" />
                                {content.followers}
                              </span>
                              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                <TrendingUp className="w-4 h-4" />
                                {content.engagementRate}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <div className="text-center mt-8">
                  <Button variant="outline" className="px-8" data-testid="button-view-all-creators">
                    View All Creators
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </TabsContent>

              {/* Events Tab - Global Calendar */}
              <TabsContent value="events" className="marketplace-surface-content marketplace-events-content">
                <GlobalCalendar />
              </TabsContent>

              {/* TravelPulse Tab */}
              <TabsContent value="travelpulse" className="marketplace-surface-content marketplace-destinations-content">
                {surface && (
                  <div className="marketplace-section-head">
                    <div>
                      <p className="marketplace-kicker">Now worth knowing</p>
                      <h2>Cities with a story this season</h2>
                    </div>
                    <p>One travel signal · one reason to go</p>
                  </div>
                )}
                {/* On the /destinations SURFACE the masthead is the page header, so
                    suppress CityGrid's own "Trending Cities" header (no stacked dup). */}
                <CityGrid selectedCityName={urlCity} hideHeader={!!surface} />
              </TabsContent>
          </div>
        </section>
        </Tabs>

        {/* Still Undecided CTA */}
        <section className="py-16 bg-card border-t">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">
              Need Help Deciding?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Talk to one of our local experts or trip planners. They'll help you find the perfect
              trip based on your preferences, budget, and travel style.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/experts">
                <Button size="lg" className="px-8" data-testid="button-talk-to-expert">
                  Talk to an Expert
                </Button>
              </Link>
              <Link href="/experiences">
                <Button size="lg" variant="outline" className="px-8" data-testid="button-plan-experience-cta">
                  Plan Your Experience
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Earn on Traveloure — relocated from the hidden `packages` tab so the
            Apply-to-Earn funnel is reachable on a visible surface (the packages
            tab is not in VISIBLE_TABS). Role-gated: experts see "create a
            template", everyone else sees "become an expert". */}
        <section className="py-16 border-t">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-4">
              Share your local expertise — get paid
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Local experts publish ready-made itinerary packages and offer services to
              travelers on Traveloure. Turn what you know into income.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {["expert", "travel_expert", "local_expert"].includes(user?.role ?? "") ? (
                <Link href="/expert/workspace">
                  <Button size="lg" className="px-8" data-testid="button-create-first-template">
                    Build a store trip in the Workstation
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Link href="/expert-status">
                  <Button size="lg" variant="outline" className="px-8" data-testid="button-become-expert-hero">
                    Become an expert
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
      <TripQueueIndicator />
    </>
  );
}
