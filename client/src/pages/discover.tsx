import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { createComparison as createComparisonRequest } from "@/lib/create-comparison";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Mountain,
  Cake,
  Gem,
  Palmtree,
  ConciergeBell,
  Flower2,
  Music,
  Landmark,
  Umbrella,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import { isExpertRole, isProviderRole } from "@shared/roles";
import { useTripContext } from "@/lib/trip-context";
import type { LucideIcon } from "lucide-react";

// Geist Mono — labels & numbers per the earn grammar (2026-08-25-marketplace-earn-grammar).
// Applied inline the same way Fraunces is (runtime theme fonts, loaded in index.html).
const EARN_MONO = "'Geist Mono', ui-monospace, monospace";
const SERVICE_SORT_OPTIONS = [
  { value: "rating", label: "Top Rated" },
  { value: "reviews", label: "Most Reviews" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
] as const;
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
  /** source-link fallback (2026-08-25-card-source-link): a handle-less author (no /s/ page)
   *  links to their expert profile /experts/:id — never plain text. */
  authorId: string;
  authorHandle: string | null;
  /** Approval-time snapshot counts (jsonb); teaser display only, may be null (§13). */
  insideCounts: { days?: number; items?: number; byType?: Record<string, number> } | null;
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
  const [, navigateTo] = useLocation();
  const price = l.priceCents === null ? null : l.priceCents / 100;
  const itemCount = l.insideCounts?.items ?? null;
  const roleLabel = l.section === "trips_by_locals" ? "Local Expert" : "Trip Planner";
  // Card-source-link (2026-08-25-card-source-link): the author ALWAYS links to its source —
  // claimed handle → /s/:handle, else the author's expert profile. Never plain text.
  const sourceHref = l.authorHandle ? `/s/${l.authorHandle}` : `/experts/${l.authorId}`;
  const sourceLabel = l.authorHandle ? `@${l.authorHandle}` : l.authorName;

  return (
    <div
      className="h-full flex flex-col bg-[var(--earn-card)] border border-[color:var(--earn-border)] rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow"
      data-testid={`rm-shelf-card-${l.id}`}
    >
      {/* Photo — real cover or honest gradient placeholder (§13); opens the detail page. */}
      <Link href={`/ready-made/${l.id}`} className="block cursor-pointer">
        <div className="relative h-[140px] bg-gradient-to-br from-[var(--earn-chip)] to-[color:var(--earn-border)]">
          {l.heroImageUrl && (
            <img src={l.heroImageUrl} alt={l.title} className="w-full h-full object-cover" />
          )}
          <span
            className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[9.5px] uppercase tracking-wide bg-[var(--earn-ink)]/70 text-white"
            style={{ fontFamily: EARN_MONO }}
          >
            {l.market}
          </span>
          <span
            className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[12px] font-semibold bg-[var(--earn-card)] text-[color:var(--earn-ink)] border border-[color:var(--earn-border)]"
            style={{ fontFamily: EARN_MONO }}
          >
            {price === null ? "—" : `$${price.toFixed(0)}`}
            {price !== null && l.pricingMode === "per_traveler" ? "/traveler" : ""}
          </span>
        </div>
      </Link>

      {/* Body */}
      <div className="p-3.5 flex-1 flex flex-col">
        <span
          className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]"
          style={{ fontFamily: EARN_MONO }}
        >
          {planTypeDisplay(l.planType, l.planTypeCustom)}
        </span>
        <Link
          href={`/ready-made/${l.id}`}
          className="text-[15px] font-semibold text-[color:var(--earn-ink)] leading-snug line-clamp-1 mt-0.5 hover:underline"
        >
          {l.title}
        </Link>
        <div className="text-[12px] text-[color:var(--earn-muted)] mt-1 truncate">
          {l.market} · {l.durationDays} days · by{" "}
          <Link
            href={sourceHref}
            className="text-[color:var(--earn-teal-ink)] hover:underline"
            data-testid={`link-rm-author-${l.id}`}
          >
            {sourceLabel}
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span
            className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)]"
            style={{ fontFamily: EARN_MONO }}
          >
            {roleLabel}
          </span>
          {itemCount != null && (
            <span
              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--earn-chip)] text-[color:var(--earn-muted)]"
              style={{ fontFamily: EARN_MONO }}
            >
              {itemCount} items
            </span>
          )}
        </div>

        {/* Get this trip — teal full-width. Disabled with a reason ONLY when price is null
            (2026-08-25 submit/approve gate now prevents priceless new listings). */}
        <div className="mt-auto pt-3">
          <Button
            size="sm"
            disabled={price === null}
            title={price === null ? "Pricing is finalized at approval" : undefined}
            className="w-full bg-[var(--earn-teal)] hover:bg-[var(--earn-teal)] text-white border border-[var(--earn-teal)] disabled:opacity-60"
            onClick={() => navigateTo(`/ready-made/${l.id}`)}
          >
            {price === null ? "Pricing pending" : "Get this trip"}
          </Button>
        </div>
      </div>
    </div>
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
  /** MP-2 storefront return path — null when the owner has no claimed handle (no /s/ page). */
  providerHandle?: string | null;
  /** Seller role (source-link resolution, 2026-08-25-card-source-link): expert-family → /experts/:id,
   *  service_provider → their /providers card, when there is no claimed handle. */
  providerRole?: string | null;
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
  const [, navigateTo] = useLocation();
  const rating = parseFloat(service.averageRating || "0") || 0;
  const price = parseFloat(service.price || "0") || 0;
  const reviewCount = service.reviewCount || 0;
  const location = service.location || "Remote";
  // §13: a "Verified local" line is a claim, shown only once the service has real reviews.
  const isVerified = reviewCount >= 3;
  const serviceType = category?.name || service.deliveryMethod || "Service";

  // Real provider display name / initials from API data — never fabricated (§13).
  const providerName =
    [service.providerFirstName, service.providerLastName].filter(Boolean).join(" ") ||
    service.providerBusinessName ||
    "Provider";
  const providerInitials = (
    [service.providerFirstName?.[0], service.providerLastName?.[0]].filter(Boolean).join("") ||
    service.providerBusinessName?.[0] ||
    "P"
  ).toUpperCase();

  // Card-family source row (2026-08-25-card-source-link): claimed handle → /s/:handle;
  // expert without handle → /experts/:id; provider without handle → their /providers card.
  // Role comes from the /api/discover row (server-derived from users.role). Never a dead link:
  // when neither a handle nor a resolvable role is present, the name renders as plain text.
  const sourceHref = service.providerHandle
    ? `/s/${service.providerHandle}`
    : isExpertRole(service.providerRole)
      ? `/experts/${service.userId}`
      : isProviderRole(service.providerRole)
        ? `/providers`
        : null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="group h-full">
      <div
        className="h-full flex flex-col bg-[var(--earn-card)] border border-[color:var(--earn-border)] rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow"
        data-testid={`card-service-${service.id}`}
      >
        {/* Photo — honest gradient placeholder (never a stock photo, §13); opens the detail page. */}
        <Link href={`/services/${service.id}`} data-testid={`link-service-${service.id}`}>
          <div className="relative h-[140px] cursor-pointer bg-gradient-to-br from-[var(--earn-chip)] to-[color:var(--earn-border)]">
            <span
              className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[9.5px] uppercase tracking-wide bg-[var(--earn-ink)]/70 text-white"
              style={{ fontFamily: EARN_MONO }}
            >
              {serviceType}
            </span>
            <span
              className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--earn-card)] text-[color:var(--earn-ink)] border border-[color:var(--earn-border)]"
              style={{ fontFamily: EARN_MONO }}
            >
              {reviewCount > 0 ? `★ ${rating.toFixed(1)}` : "New"}
            </span>
          </div>
        </Link>

        {/* Body */}
        <div className="p-3.5 flex-1 flex flex-col">
          {isVerified && (
            <div
              className="flex items-center gap-1 text-[11px] font-semibold text-[color:var(--earn-green-ink)] mb-1"
              style={{ fontFamily: EARN_MONO }}
            >
              <Check className="w-3 h-3" /> Verified local
            </div>
          )}
          <h4
            className="text-[15px] font-semibold text-[color:var(--earn-ink)] leading-snug line-clamp-1"
            data-testid={`text-service-name-${service.id}`}
          >
            {service.serviceName}
          </h4>
          <div className="flex items-center gap-1.5 text-[12px] text-[color:var(--earn-muted)] mt-1 flex-wrap">
            {service.deliveryTimeframe && (
              <>
                <Clock className="w-3 h-3 shrink-0" />
                <span>{service.deliveryTimeframe}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <MapPin className="w-3 h-3 shrink-0" />
            <span data-testid={`text-location-${service.id}`}>{location}</span>
          </div>

          {/* Facts row — 3 cols, mono (card family). */}
          <div
            className="grid grid-cols-3 gap-2 border-t border-[color:var(--earn-border)] mt-3 pt-2.5"
            style={{ fontFamily: EARN_MONO }}
          >
            <div>
              <div className="text-[13px] font-semibold text-[color:var(--earn-ink)]">${price.toFixed(0)}</div>
              <div className="text-[10px] text-[color:var(--earn-muted)]">per service</div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[color:var(--earn-ink)]">
                {reviewCount > 0 ? rating.toFixed(1) : "New"}
              </div>
              <div className="text-[10px] text-[color:var(--earn-muted)]">guest rating</div>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[color:var(--earn-ink)] truncate">{serviceType}</div>
              <div className="text-[10px] text-[color:var(--earn-muted)]">service type</div>
            </div>
          </div>

          {/* Source row — every card points back to its source (2026-08-25-card-source-link). */}
          <div className="flex items-center gap-2 mt-2.5 text-[12px] min-w-0">
            <span
              className="w-6 h-6 rounded-full bg-[var(--earn-chip)] text-[color:var(--earn-muted)] grid place-items-center text-[10px] font-semibold shrink-0"
              style={{ fontFamily: EARN_MONO }}
            >
              {providerInitials}
            </span>
            {service.providerHandle ? (
              <Link
                href={sourceHref!}
                className="text-[color:var(--earn-teal-ink)] hover:underline truncate"
                data-testid={`link-provider-storefront-${service.id}`}
              >
                More from <span data-testid={`text-provider-name-${service.id}`}>@{service.providerHandle}</span>
              </Link>
            ) : sourceHref ? (
              <Link
                href={sourceHref}
                className="text-[color:var(--earn-teal-ink)] hover:underline truncate"
                data-testid={`link-provider-storefront-${service.id}`}
              >
                More from <span data-testid={`text-provider-name-${service.id}`}>{providerName}</span>
              </Link>
            ) : (
              <span className="text-[color:var(--earn-muted)] truncate" data-testid={`text-provider-name-${service.id}`}>
                {providerName}
              </span>
            )}
          </div>

          {/* Action row — platform state. provider_services are always Traveloure-bookable; the
              affiliate ("Book on {Partner}") and not-bookable states of the card family live on the
              partner-activities / viewpoint cards, not on a provider service. */}
          <div className="border-t border-dashed border-[color:var(--earn-border-dash)] mt-3 pt-2.5">
            <div
              className="text-[9.5px] uppercase tracking-wider text-[color:var(--earn-teal-ink)] mb-1.5"
              style={{ fontFamily: EARN_MONO }}
            >
              Book on Traveloure
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="bg-[var(--earn-teal)] hover:bg-[var(--earn-teal)] text-white border border-[var(--earn-teal)]"
                onClick={() => navigateTo(`/services/${service.id}`)}
              >
                Book now
              </Button>
              {onAddToCart && (
                <Button
                  size="sm"
                  className={cn(
                    "bg-[var(--earn-navy)] hover:bg-[var(--earn-navy)] text-white border border-[var(--earn-navy)]",
                    isAdded && "opacity-90",
                  )}
                  onClick={() => onAddToCart(service.id)}
                  disabled={isAddingToCart || isAdded}
                  data-testid={`button-add-to-cart-${service.id}`}
                >
                  {isAdded ? "Added" : isAddingToCart ? "Adding…" : "Add to trip"}
                </Button>
              )}
            </div>
            <button
              type="button"
              className="text-[12px] text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] mt-2 transition-colors"
              onClick={() =>
                navigateTo(`/services?showExperts=true&destination=${encodeURIComponent(location)}`)
              }
            >
              Ask an expert
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Marketplace un-group (decision-maker ratified Aug 23, ledger
 * 2026-08-23-marketplace-ungroup): each Marketplace surface is its OWN page —
 * /destinations, /ready-made, /events, /services — reached straight from the nav
 * dropdown, with NO tab bar (the grouped header is gone). `surface` is REQUIRED
 * and pins this component to one surface: the masthead titles itself for that
 * surface and only the matching TabsContent renders. The legacy tabbed shell and
 * ?tab= switching were removed (2026-08-25-discover-shell-removed); /discover is a
 * redirect-only route that maps old ?tab= links onto the surface routes.
 */
export type MarketplaceSurface = "travelpulse" | "packages" | "events" | "services";

// Each surface masthead is the earn-grammar band (2026-08-25-marketplace-earn-grammar):
// a lucide glyph in a teal-wash tile + a Fraunces title + a muted one-line sub, with the
// four-link Marketplace rail. `icon` is the masthead glyph per 2026-08-25-nav-icons
// (Destinations Palmtree · Ready-Made Gem · Events Ticket · Services ConciergeBell — never a
// generic Compass/Store/MapPin/Calendar). NOTE: Lane 2 unifies these into the single
// NAV_LEAF_ICONS source object (layout.tsx); until then this local map carries the same map.
const SURFACE_META: Record<MarketplaceSurface, { icon: LucideIcon; title: string; subtitle: string; url: string; seoTitle: string }> = {
  travelpulse: {
    icon: Palmtree,
    title: "Destinations",
    subtitle: "Explore destinations & trending cities.",
    url: "/destinations",
    seoTitle: "Destinations — Trending Cities & Travel Intel",
  },
  packages: {
    icon: Gem,
    title: "Ready-Made Trips",
    subtitle: "Guided itineraries crafted by verified experts — buy the plan and travel it your way",
    url: "/ready-made",
    seoTitle: "Ready-Made Trips — Expert-Built, Ready to Buy",
  },
  events: {
    icon: Ticket,
    title: "Events",
    subtitle: "Upcoming events & activities around the world.",
    url: "/events",
    seoTitle: "Events — Festivals & Travel Calendar",
  },
  services: {
    icon: ConciergeBell,
    title: "Services",
    subtitle: "Book local expertise for the part of your trip that deserves to feel effortless.",
    url: "/services",
    seoTitle: "Services — Tours, Photography, Transport & More",
  },
};

// The four Marketplace surfaces in rail order (Destinations · Ready-Made · Events · Services).
// A plain link list, current one filled navy — not a tab with state (2026-08-25-surface-rail;
// 2026-08-23-marketplace-ungroup still holds).
const MARKETPLACE_RAIL: { key: MarketplaceSurface; label: string }[] = [
  { key: "travelpulse", label: "Destinations" },
  { key: "packages", label: "Ready-Made" },
  { key: "events", label: "Events" },
  { key: "services", label: "Services" },
];

function TwoFieldSearch({
  query,
  onQueryChange,
  location,
  onLocationChange,
  trailing,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  trailing?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className={cn(
        "mt-4 grid grid-cols-1 gap-2",
        trailing ? "sm:grid-cols-[1.4fr_1fr_auto] max-w-4xl" : "sm:grid-cols-[1.4fr_1fr] max-w-3xl",
      )}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="What do you need help with?"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-9 h-10 text-foreground"
          data-testid="input-search"
        />
      </div>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Where are you going?"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="pl-9 h-10 text-foreground"
          data-testid="input-location"
        />
      </div>
      {trailing}
    </motion.div>
  );
}

function ServiceFiltersPopover({
  minPrice,
  onMinPriceChange,
  maxPrice,
  onMaxPriceChange,
  minRating,
  onMinRatingChange,
  sortBy,
  onSortByChange,
  hasActiveFilters,
  onClear,
}: {
  minPrice: number;
  onMinPriceChange: (value: number) => void;
  maxPrice: number;
  onMaxPriceChange: (value: number) => void;
  minRating: number;
  onMinRatingChange: (value: number) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 whitespace-nowrap"
          data-testid="button-filters"
        >
          <SlidersHorizontal className="w-4 h-4 mr-1.5" />
          Filters +
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] space-y-4"
        data-testid="popover-filters"
      >
        <div>
          <p className="font-medium text-sm">Refine services</p>
          <p className="text-xs text-muted-foreground mt-1">
            Narrow the list without changing your search.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Min $"
            value={minPrice || ""}
            onChange={(e) => onMinPriceChange(Number(e.target.value) || 0)}
            data-testid="input-min-price"
          />
          <Input
            type="number"
            placeholder="Max $"
            value={maxPrice || ""}
            onChange={(e) => onMaxPriceChange(Number(e.target.value) || 0)}
            data-testid="input-max-price"
          />
        </div>
        <Select value={String(minRating)} onValueChange={(v) => onMinRatingChange(parseFloat(v))}>
          <SelectTrigger data-testid="select-rating">
            <SelectValue placeholder="Any rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any rating</SelectItem>
            <SelectItem value="3">3.0+ ★</SelectItem>
            <SelectItem value="4">4.0+ ★</SelectItem>
            <SelectItem value="4.5">4.5+ ★</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={onSortByChange}>
          <SelectTrigger data-testid="select-sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-end border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={!hasActiveFilters}
            data-testid="button-clear-filters"
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function DiscoverPage({ surface }: { surface: MarketplaceSurface }) {
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
  const [tripCtx] = useTripContext();
  const tripDestination = (tripCtx?.destination || tripCtx?.city || "").toString();
  
  // Ref for experts section to scroll to
  const expertsSectionRef = useRef<HTMLDivElement>(null);

  // Search and filter state
  const initialQuery = urlParams.get("q") || "";
  const initialLocation = urlParams.get("location") || expertHandoffDestination || tripDestination;
  const readNumberParam = (name: string) => {
    const value = Number(urlParams.get(name));
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const initialPage = Math.max(0, (Number.parseInt(urlParams.get("page") || "1", 10) || 1) - 1);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [locationFilter, setLocationFilter] = useState(initialLocation);
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
  
  // Surface pages are PINNED by their route. The legacy tabbed Discover shell —
  // ?tab= switching, the TabsList, and the `articles` tab — was removed
  // (2026-08-25-discover-shell-removed). `surface` is required, so the active
  // surface IS `surface`. urlCity still seeds CityGrid on /destinations.
  const urlCity = urlParams.get("city") || "";
  const activeTab = surface;

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
    setSelectedCategory("all");
    setMinPrice(0);
    setMaxPrice(0);
    setMinRating(0);
    setLocationFilter("");
    setPage(0);
  };

  const hasActiveFilters = 
    selectedCategory !== "all" || 
    minPrice > 0 || 
    maxPrice > 0 || 
    minRating > 0 ||
    locationFilter !== "";
  const sortLabel = SERVICE_SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? "Top Rated";

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  return (
    <>
      <SEOHead
        title={SURFACE_META[surface].seoTitle}
        description="Browse expert services, curated trip packages, and get AI-powered recommendations for your next adventure. Find travel planners, venues, and unique experiences."
        keywords={["discover travel", "travel services", "trip packages", "vacation planning", "experience marketplace"]}
        url={SURFACE_META[surface].url}
      />
      <div className="min-h-screen bg-background">

        {/* Hero — UNIFIED header band, shared pattern with /experts: navy title +
            one-line muted subtitle, then the page's control row beneath. py-5 =
            compacted. Change the pattern in BOTH places or not at all — /experts
            carries the identical band. */}
        {/* The legacy tabbed Discover shell was removed (2026-08-25-discover-shell-removed):
            no TabsList, no tab triggers, no ?tab= switching. `surface` is required and
            pins the page to one surface; the Tabs root remains only so Radix mounts the
            matching TabsContent (context, not layout). */}
        <Tabs value={activeTab} className="w-full">
        <section className="bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-5">
          <div className="container mx-auto px-4 max-w-6xl">
            {/* Surface masthead = the ratified Ready-Made-by-Theme band: a Fraunces
                serif title with a leading emoji + a muted one-line sub, left-aligned,
                content immediately below. The search bar renders ONLY on Services (the
                surface whose query it feeds). Fraunces is applied inline (loaded in
                index.html) because --font-serif is a runtime theme token, not a static
                one. Phase 2 replaces the emoji + this band with the earn-grammar
                masthead tile + four-link rail. */}
            {/* Band: teal-wash tile + Fraunces title + sub on the left; MARKETPLACE eyebrow +
                four-link rail on the right (2026-08-25-surface-rail). The rail renders on every
                Marketplace surface; the current one is filled navy. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"
            >
              <div className="flex items-start gap-3 text-left">
                <span className="w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)] grid place-items-center shrink-0">
                  {(() => {
                    const SurfaceIcon = SURFACE_META[surface].icon;
                    return <SurfaceIcon className="w-[22px] h-[22px]" />;
                  })()}
                </span>
                <div>
                  <h1
                    className="text-2xl md:text-[26px] font-semibold text-[color:var(--earn-navy)] leading-tight"
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  >
                    <span data-testid="text-page-title">{SURFACE_META[surface].title}</span>
                  </h1>
                  <p className="text-sm text-[color:var(--earn-muted)] mt-1 max-w-[60ch]">
                    {SURFACE_META[surface].subtitle}
                  </p>
                </div>
              </div>
              <nav className="md:text-right" aria-label="Marketplace surfaces">
                <p
                  className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-muted)] mb-2"
                  style={{ fontFamily: EARN_MONO }}
                >
                  Marketplace
                </p>
                <div className="flex flex-wrap md:justify-end gap-1.5" style={{ fontFamily: EARN_MONO }}>
                  {MARKETPLACE_RAIL.map(({ key, label }) => {
                    const active = key === surface;
                    return (
                      <Link
                        key={key}
                        href={SURFACE_META[key].url}
                        className={cn(
                          "text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors",
                          active
                            ? "bg-[var(--earn-navy)] text-white font-semibold"
                            : "text-[color:var(--earn-muted)] hover:text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]",
                        )}
                        aria-current={active ? "page" : undefined}
                        data-testid={`marketplace-route-${key}`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </motion.div>
             {/* Two-field search (2026-08-25-two-field-search): "what" filters the results, "where"
                 is the location filter (pre-filled from the trip's destination above). Services adds
                 its legacy price/rating/sort controls through Filters +. Events has no search. */}
             {surface !== "events" && (
               <TwoFieldSearch
                 query={searchQuery}
                 onQueryChange={setSearchQuery}
                 location={locationFilter}
                 onLocationChange={setLocationFilter}
                 trailing={
                   surface === "services" ? (
                     <ServiceFiltersPopover
                       minPrice={minPrice}
                       onMinPriceChange={setMinPrice}
                       maxPrice={maxPrice}
                       onMaxPriceChange={setMaxPrice}
                       minRating={minRating}
                       onMinRatingChange={setMinRating}
                       sortBy={sortBy}
                       onSortByChange={setSortBy}
                       hasActiveFilters={hasActiveFilters}
                       onClear={clearFilters}
                     />
                   ) : undefined
                 }
               />
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
        <section className="py-12">
          <div className="container mx-auto px-4 max-w-[1400px]">
            {/* Tab bar moved INTO the hero band (funnel PR1) — TabsContents below stay
                inside the same Tabs root, which now opens above the hero. */}

              {/* Browse Services Tab */}
              <TabsContent value="services">

                {/* Category chips — earn grammar (2026-08-25-card-family), active = teal fill.
                    §13: real per-category live-stock counts need a server count endpoint (filed
                    FOLLOWUP); until it lands these are a curated quick-filter shortlist, never a
                    fabricated count. */}
                {categories && categories.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        key="all"
                        type="button"
                        onClick={() => setSelectedCategory("all")}
                        data-testid="button-quick-cat-all"
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors",
                          selectedCategory === "all"
                            ? "bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                            : "bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]",
                        )}
                      >
                        All
                      </button>
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
                        .map((cat: any) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            data-testid={`button-quick-cat-${cat.slug}`}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors",
                              selectedCategory === cat.id
                                ? "bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                                : "bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]",
                            )}
                          >
                            {cat.name}
                          </button>
                        ))}
                    </div>
                    <p className="text-[11.5px] text-[color:var(--earn-muted)] mb-6" style={{ fontFamily: EARN_MONO }}>
                      Quick category filters for this destination — a curated shortlist, not the full taxonomy.
                    </p>
                  </>
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


                <div>
                    {/* Services Grid */}
                    {servicesLoading ? (
                      <CardGridSkeleton count={8} />
                    ) : result?.services && result.services.length > 0 ? (
                      <>
                        {/* Section head (earn grammar): coral eyebrow with the server's real
                            count + an editorial Fraunces heading + a real match line (§13). */}
                        <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
                          <div>
                            <p className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--earn-coral-ink)]" style={{ fontFamily: EARN_MONO }}>
                              {selectedCategory === "all"
                                ? "All services"
                                : (categories?.find((c: any) => c.id === selectedCategory)?.name ?? "Services")}
                              {typeof result?.total === "number" ? ` · ${result.total}` : ""}
                            </p>
                            <h3 className="text-[22px] font-semibold text-[color:var(--earn-ink)] leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                              Good hands, exactly where you need them
                            </h3>
                          </div>
                          <span className="text-[11.5px] text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
                            {result?.total ?? 0} {(result?.total ?? 0) === 1 ? "match" : "matches"} · {sortLabel}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
              <TabsContent value="packages">
                {/* D3 (lane nav-storefront): the tab's content is width-aligned to the hero
                    band (max-w-6xl) — the surrounding shared container is max-w-[1400px]
                    for the other tabs, which left this tab visibly wider than its own
                    header. Scoped here so the services tab keeps its wide grid. */}
                <div className="max-w-6xl mx-auto">
                {/* Cloneable trips shelf (Phase 4): approved store listings from GET /api/ready-made,
                    sectioned by author type per the ratified store model. Surfaced now that the buy
                    loop (purchase→clone→refund) is closed end-to-end (§10 B4). Hidden entirely when
                    the shelf is empty — never an empty aisle.
                     D3 naming: ready_made_trips = "Ready-Made Trips" (the purchasable ready-made
                     products); the author-type sections become subheadings under that one banner. */}
                {readyMadeShelf && readyMadeShelf.length > 0 && (
                  <div className="mb-10">
                    {/* Theme chip rail (ledger 2026-08-22-ready-made-themes): only themes with
                        live stock render, with real counts — never the full 20-key vocabulary
                        as empty aisles (§13). Order follows the feed (badge-first, recency). */}
                    <div className="flex flex-wrap gap-2 mb-2" data-testid="rail-ready-made-themes">
                      <button
                        type="button"
                        onClick={() => setSelectedTheme("all")}
                        data-testid="button-theme-chip-all"
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors",
                          selectedTheme === "all"
                            ? "bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                            : "bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]",
                        )}
                      >
                        All experiences
                      </button>
                      {readyMadeThemes.order
                        .filter((key) => key !== "__untyped__")
                        .map((key) => {
                          // Expert-minted groups ("custom:<label>") slugify their testid since
                          // author labels aren't DOM-safe.
                          const isMinted = key.startsWith("custom:");
                          const testKey = isMinted
                            ? `custom-${key.slice(7).replace(/[^a-z0-9]+/g, "-")}`
                            : key;
                          const count = readyMadeThemes.byTheme.get(key)?.length ?? 0;
                          const active = selectedTheme === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setSelectedTheme(key)}
                              data-testid={`button-theme-chip-${testKey}`}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors inline-flex items-center gap-1.5",
                                active
                                  ? "bg-[var(--earn-teal)] text-white border-[var(--earn-teal)]"
                                  : "bg-[var(--earn-chip)] text-[color:var(--earn-ink)] border-[color:var(--earn-border)] hover:border-[color:var(--earn-teal)]",
                              )}
                            >
                              {themeHeadingFor(key)}
                              <span className="text-[11px] font-semibold" style={{ fontFamily: EARN_MONO }}>{count}</span>
                            </button>
                          );
                        })}
                    </div>
                    <p className="text-[11.5px] text-[color:var(--earn-muted)] mb-6" style={{ fontFamily: EARN_MONO }}>
                      Chips render only for themes with at least one live listing. Counts are real, never the full taxonomy.
                    </p>

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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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


              {/* Events Tab - Global Calendar */}
              <TabsContent value="events">
                <GlobalCalendar />
              </TabsContent>

              {/* TravelPulse Tab */}
              <TabsContent value="travelpulse">
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

        {/* Earn on Traveloure — the Apply-to-Earn funnel, always rendered below the
            surface content. Role-gated: experts see "build a store trip", everyone
            else sees "become an expert". */}
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
                  <Button size="lg" className="px-8" data-testid="button-build-store-trip">
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
