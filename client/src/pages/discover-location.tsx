/**
 * LocationView — Phase 3 Marketplace Redesign (Task #239)
 *
 * §1  Hero (photo, pulse, happening-now strip) — unchanged
 * §2  Explore Spine — stateful filter (All gems / Eat / Do / Stay / Experts / Events / Photo spots)
 * §3  All Gems Feed — bento, grouped by neighborhood containers + "Elsewhere" catch-all
 *       Every card: match-resolved primary action + universal Add + Ask Expert
 *       Sparse containers never stretch full-width (flex-wrap, max-w-[360px] per card)
 * §4  Expert feed cards — appear after every other neighborhood cluster
 * §5  "About {city}" accordion — Media Gallery + 9 AI Insights subcards (collapsed by default)
 * §6  Footer Events CTA
 *
 * Phase C preserved: AddItemDialog wired to every card.
 * Perf fixes preserved: parallel media query, no enriched call, 5-min staleTime.
 */

import { useRef, useEffect, useState, useMemo, createContext, useContext } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import DOMPurify from "dompurify";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  MapPin, Sparkles, Brain, Image as ImageIcon, Play, Camera,
  ExternalLink, Star, Clock, Wallet, Lightbulb, Shield, Sun, Heart,
  CalendarX, AlertCircle, Activity, Users, Gem, ChevronRight, ChevronDown,
  Plus, Loader2, Package, Compass, Zap, Utensils, Hotel, Ticket, UserCheck,
  BookOpen, Send, X as XIcon, Calendar, List, Map as MapIcon,
} from "lucide-react";
import { APIProvider, Map as GMap, Marker, InfoWindow } from "@vis.gl/react-google-maps";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CityMedia {
  id: string; url: string; thumbnailUrl?: string | null; previewUrl?: string | null;
  source?: string | null; sourceName?: string | null; sourceUrl?: string | null;
  downloadLocationUrl?: string | null; attractionName?: string | null;
  photographerName?: string | null; isPrimary?: boolean | null;
  htmlAttributions?: string[] | null; duration?: number | null;
}
interface CityMediaResponse {
  hero: CityMedia | null; gallery: CityMedia[]; videos: CityMedia[];
  byAttraction: Record<string, CityMedia[]>;
}
interface Neighborhood {
  id: string; name: string; slug: string; description?: string | null;
  isFeatured?: boolean | null; gemCount: number; serviceCount: number;
}
interface HiddenGem {
  id: string; placeName: string; placeType?: string | null; neighborhood?: string | null;
  whyHidden?: string | null; description?: string | null; whyLocalsLoveIt?: string | null;
  imageUrl?: string | null; localRating?: string | number | null;
  priceRange?: string | null; reviewCount?: number | null;
  curatedByExpertId?: string | null;
}
interface ExpertMatchInfo {
  id: string; name: string; specialty?: string | null; hourlyRate?: string | null;
}
interface PlatformService {
  id: string; serviceName: string; serviceType?: string | null;
  shortDescription?: string | null; description?: string | null;
  price?: string | null; priceType?: string | null;
  serviceImage?: string | null; neighborhood?: string | null;
  location?: string | null; averageRating?: string | null;
  isFeatured?: boolean | null; bookingsCount?: number | null;
  reviewCount?: number | null;
}
interface SectionResult<T> { data: T | null; error: string | null }
interface LocationViewPayload {
  city: string; country: string | null; generatedAt: string;
  hero: SectionResult<{ city?: any; happeningNow?: any[]; liveActivity?: any[]; hiddenGems?: HiddenGem[] }>;
  recommendations: SectionResult<{ hotels?: any[]; activities?: any[]; experts?: any[] }>;
  events: SectionResult<{ events?: any[]; total?: number }>;
  neighborhoods: SectionResult<Neighborhood[]>;
  gems?: SectionResult<HiddenGem[]>;
  services?: SectionResult<PlatformService[]>;
}
interface AddDialogTarget { name: string; type: string; imageUrl?: string; description?: string }

type FeedFilter = "all" | "eat" | "do" | "stay" | "experts" | "events" | "photo-spots";

// ─── Category badge resolver (colored, shown above gem name) ─────────────────

function resolveCategoryBadge(placeType: string | null | undefined): { label: string; className: string } {
  const t = (placeType ?? "").toLowerCase();
  if (t.includes("photo") || t.includes("viewpoint") || t.includes("scenic") || t.includes("vista"))
    return { label: "PHOTO SPOT", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (t.includes("attraction") || t.includes("museum") || t.includes("temple") || t.includes("shrine") || t.includes("castle"))
    return { label: "ATTRACTION", className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (t.includes("cafe"))
    return { label: "CAFÉ", className: "bg-orange-50 text-orange-700 border-orange-200" };
  if (t.includes("restaurant") || t.includes("food") || t.includes("dining") || t.includes("ramen") || t.includes("sushi") || t.includes("eat"))
    return { label: "RESTAURANT", className: "bg-orange-50 text-orange-700 border-orange-200" };
  if (t.includes("experience"))
    return { label: "EXPERIENCE", className: "bg-violet-50 text-violet-700 border-violet-200" };
  if (t.includes("neighborhood") || t.includes("district") || t.includes("area"))
    return { label: "NEIGHBORHOOD", className: "bg-violet-50 text-violet-700 border-violet-200" };
  if (t.includes("park") || t.includes("garden") || t.includes("nature") || t.includes("forest"))
    return { label: "NATURE", className: "bg-green-50 text-green-700 border-green-200" };
  if (t.includes("hotel") || t.includes("stay") || t.includes("ryokan") || t.includes("accommodation") || t.includes("hostel"))
    return { label: "MARQUEE STAY", className: "bg-blue-50 text-blue-700 border-blue-200" };
  const raw = (placeType ?? "").replace(/_/g, " ").toUpperCase();
  return { label: raw || "GEM", className: "bg-muted text-muted-foreground border-border" };
}

// ─── Neighborhood hue palette (rotates by index) ──────────────────────────────

const NEIGHBORHOOD_HUES = [
  { bg: "bg-emerald-100", icon: "text-emerald-700" },
  { bg: "bg-rose-100",    icon: "text-rose-700"    },
  { bg: "bg-violet-100",  icon: "text-violet-700"  },
  { bg: "bg-amber-100",   icon: "text-amber-700"   },
  { bg: "bg-sky-100",     icon: "text-sky-700"     },
  { bg: "bg-orange-100",  icon: "text-orange-700"  },
];

// ─── Match-rule resolver ──────────────────────────────────────────────────────

interface MatchResult {
  primaryLabel: string | null;
  badgeLabel: string;
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string }> | null;
}

function resolveMatch(item: {
  placeType?: string | null; type?: string | null; bookingUrl?: string | null;
}): MatchResult {
  const t = (item.placeType ?? item.type ?? "").toLowerCase();
  const hasBooking = !!item.bookingUrl;

  if (t.includes("photo") || t.includes("viewpoint") || t.includes("scenic")) {
    return { primaryLabel: "Book a shoot here", badgeLabel: "Photography available", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", Icon: Camera };
  }
  if (t.includes("hotel") || t.includes("lodging") || t.includes("accommodation") || t.includes("ryokan")) {
    return {
      primaryLabel: hasBooking ? "Book + transfer" : null,
      badgeLabel: hasBooking ? "Book on Traveloure" : "Enquire",
      badgeClass: hasBooking ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border",
      Icon: Hotel,
    };
  }
  if (t.includes("restaurant") || t.includes("cafe") || t.includes("food") || t.includes("eat") || t.includes("dining") || t.includes("ramen") || t.includes("sushi")) {
    return { primaryLabel: "Reserve", badgeLabel: "via partner", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", Icon: Utensils };
  }
  if (t.includes("event") || t.includes("festival") || t.includes("concert")) {
    return {
      primaryLabel: hasBooking ? "Tickets" : null,
      badgeLabel: hasBooking ? "Book on Traveloure" : "Not bookable",
      badgeClass: hasBooking ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border",
      Icon: Ticket,
    };
  }
  if (t.includes("attraction") || t.includes("museum") || t.includes("temple") || t.includes("shrine") || t.includes("park") || t.includes("garden") || t.includes("castle")) {
    return { primaryLabel: "Book guide", badgeLabel: "via partner", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", Icon: BookOpen };
  }
  if (t.includes("wellness") || t.includes("spa") || t.includes("onsen")) {
    return { primaryLabel: "Book treatment", badgeLabel: "via partner", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", Icon: Heart };
  }
  return { primaryLabel: null, badgeLabel: "Not bookable", badgeClass: "bg-muted text-muted-foreground border-border", Icon: null };
}

// ─── GemCard — compact bento card (2-col half or span-2 row) ─────────────────

function GemCard({
  item, idx, onAdd, testPrefix, onRequestBooking, cityName, expertMatch, curatedByExpert,
}: {
  item: {
    id?: string; placeName?: string; title?: string; name?: string;
    placeType?: string | null; type?: string | null; imageUrl?: string | null;
    media?: any[]; whyHidden?: string | null; description?: string | null;
    localRating?: number | null; starRating?: number | null;
    bookingUrl?: string | null; price?: string | null;
    neighborhood?: string | null; address?: string | null;
    curatedByExpertId?: string | null;
  };
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
  cityName?: string;
  expertMatch?: ExpertMatchInfo | null;
  curatedByExpert?: ExpertMatchInfo | null;
}) {
  const [, navigate] = useLocation();
  const displayName = item.placeName ?? item.title ?? item.name ?? "Unnamed";
  const image = item.imageUrl ?? item.media?.[0]?.url ?? null;
  const description = item.whyHidden ?? item.description ?? null;
  const rating = item.localRating ?? item.starRating ?? null;
  const catBadge = resolveCategoryBadge(item.placeType ?? item.type);
  const bd = detectBadge(item.bookingUrl);
  const t = (item.placeType ?? item.type ?? "").toLowerCase();
  const isPhoto = t.includes("photo") || t.includes("viewpoint") || t.includes("scenic") || t.includes("vista");
  const isAttraction = t.includes("attraction") || t.includes("museum") || t.includes("temple") || t.includes("shrine") || t.includes("castle");

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden flex flex-col"
      data-testid={`${testPrefix}-${idx}`}
    >
      {/* Image — compact fixed height (reference spec: 104px) */}
      <div className="relative h-[104px] bg-muted flex-shrink-0 w-full overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <Gem className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        <WishlistButton
          contentId={item.id ?? displayName}
          contentName={displayName}
          contentType={item.placeType ?? item.type ?? "gem"}
          contentImage={image}
          className="absolute top-1.5 left-1.5"
        />
        {rating && (
          <span className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-400 text-white rounded px-1.5 py-0.5 flex items-center gap-0.5 shadow-sm" data-testid={`${testPrefix}-rating-${idx}`}>
            <Star className="h-2.5 w-2.5 fill-white text-white" />{rating}
            {(item.reviewCount ?? 0) > 0 && (
              <span className="opacity-90"> · {item.reviewCount} reviews</span>
            )}
          </span>
        )}
      </div>

      <div className="p-2.5 flex flex-col flex-1 gap-1.5">
        {/* Category badge */}
        <span className={`text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 self-start ${catBadge.className}`}>
          {catBadge.label}
        </span>

        {/* Name */}
        <p className="font-semibold text-sm leading-snug line-clamp-2" data-testid={`${testPrefix}-name-${idx}`}>
          {displayName}
        </p>

        {/* Description */}
        {description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{description}</p>
        )}

        {/* Price + booking badge strip */}
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {item.price && (
            <span className="text-sm font-bold">{item.price}</span>
          )}
          <span className={`text-[9px] font-semibold border rounded px-1.5 py-0.5 ${bd.badgeClass}`}>
            {bd.badgeText}
          </span>
        </div>

        {/* Match strip — photographer (photo spots) or guide (attractions) */}
        {isPhoto && (
          <div className="border-t border-dashed border-muted-foreground/20 pt-1.5 mt-0.5 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">📷 photographer available</span>
            <Button size="sm" className="text-[10px] h-6 px-2 flex-shrink-0" data-testid={`${testPrefix}-shoot-${idx}`}
              onClick={() => onRequestBooking?.({ itemName: displayName, partnerName: "Photographer", affiliateUrl: "", partnerCategory: "photography" })}>
              Book shoot
            </Button>
          </div>
        )}
        {isAttraction && (
          <div className="border-t border-dashed border-muted-foreground/20 pt-1.5 mt-0.5 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">🧭 local guide available</span>
            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 flex-shrink-0" data-testid={`${testPrefix}-guide-${idx}`}>
              Book guide
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {/* Primary book button */}
          {item.bookingUrl && (() => {
            if (bd.isPartner) {
              return (
                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 border-violet-300 text-violet-700 hover:bg-violet-50" data-testid={`${testPrefix}-book-${idx}`}
                  onClick={() => onRequestBooking?.({ itemName: displayName, partnerName: bd.partnerName || "Partner", affiliateUrl: item.bookingUrl!, partnerCategory: item.placeType ?? item.type ?? "activity", itemDescription: description ?? undefined })}>
                  Request booking
                </Button>
              );
            }
            return (
              <Button size="sm" className="text-[10px] h-6 px-2" asChild data-testid={`${testPrefix}-book-${idx}`}>
                <a href={item.bookingUrl} rel="noopener noreferrer">Book</a>
              </Button>
            );
          })()}
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
            onClick={() => onAdd({ name: displayName, type: item.placeType ?? item.type ?? "activity", imageUrl: image ?? undefined, description: description ?? undefined })}
            data-testid={`${testPrefix}-add-${idx}`}>
            + Add
          </Button>
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
            onClick={() => navigate(`/chat?about=${encodeURIComponent(displayName)}`)}
            data-testid={`${testPrefix}-ask-${idx}`}>
            💬 Ask expert
          </Button>
        </div>

        {/* Expert attribution — curated-by takes priority over soft expert pick */}
        {curatedByExpert ? (
          <ExpertPickAttribution
            expert={curatedByExpert}
            contentName={displayName}
            variant="curated"
          />
        ) : expertMatch ? (
          <ExpertPickAttribution
            expert={expertMatch}
            contentName={displayName}
            variant="pick"
          />
        ) : null}

        {/* Cross-sell strip */}
        <CrossSellStrip
          placeType={item.placeType ?? item.type ?? "gem"}
          neighborhood={item.neighborhood}
          cityName={cityName}
          sourceContentId={item.id ?? displayName}
          sourceContentType={item.placeType ?? item.type ?? "gem"}
        />
      </div>
    </div>
  );
}

// ─── ActivityRow — text-based row for bookable activities (like the mockup) ───

// ─── AffiliateBookingModal ────────────────────────────────────────────────────

interface AffiliateBookingTarget {
  itemName: string;
  partnerName: string;
  affiliateUrl: string;
  partnerCategory?: string;
  itemDescription?: string;
}

// ─── Saved Items Context ──────────────────────────────────────────────────────

interface SavedItemsContextValue {
  savedMap: Map<string, string>; // contentId → savedItem.id
  onSave: (item: { contentId: string; contentName: string; contentType: string; contentImage?: string | null; city?: string }) => void;
  onUnsave: (savedItemId: string) => void;
  isAuth: boolean;
}

const SavedItemsContext = createContext<SavedItemsContextValue>({
  savedMap: new Map(),
  onSave: () => {},
  onUnsave: () => {},
  isAuth: false,
});

function WishlistButton({
  contentId, contentName, contentType, contentImage, city, className,
}: {
  contentId: string;
  contentName: string;
  contentType: string;
  contentImage?: string | null;
  city?: string;
  className?: string;
}) {
  const { savedMap, onSave, onUnsave, isAuth } = useContext(SavedItemsContext);
  const { toast } = useToast();
  const savedId = savedMap.get(contentId);
  const isSaved = !!savedId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuth) {
      toast({ title: "Sign in to save places", description: "Create an account to build your wishlist." });
      return;
    }
    if (isSaved) {
      onUnsave(savedId!);
    } else {
      onSave({ contentId, contentName, contentType, contentImage, city });
    }
  };

  return (
    <button
      className={`p-1.5 rounded-full bg-white/85 hover:bg-white transition-colors shadow-sm ${className ?? ""}`}
      onClick={handleClick}
      data-testid={`wishlist-btn-${contentId}`}
      aria-label={isSaved ? "Remove from saved" : "Save to wishlist"}
    >
      <Heart className={`h-3.5 w-3.5 transition-colors ${isSaved ? "fill-rose-500 text-rose-500" : "text-gray-500"}`} />
    </button>
  );
}

// ─── CrossSellStrip ───────────────────────────────────────────────────────────
// Horizontal-scroll strip of matched provider services.
// Appears below the primary action buttons on GemCard, HotelMiniCard, and ActivityRow.
// Automatically hidden when zero providers match (no layout shift).

interface CrossSellProvider {
  serviceId: string;
  serviceName: string;
  shortDescription: string | null;
  serviceType: string | null;
  price: string | null;
  priceType: string | null;
  providerId: string;
  providerName: string;
  isFeatured: boolean;
  averageRating: string | null;
  bookingsCount: number;
  /** Optional external partner URL — when present, opens AffiliateBookingModal instead of navigating */
  affiliateUrl?: string | null;
}

function isTransportService(serviceType: string | null): boolean {
  const t = (serviceType ?? "").toLowerCase();
  return t.includes("action") || t.includes("concierge") || t.includes("transfer") || t.includes("transport");
}

function CrossSellStrip({
  placeType,
  neighborhood,
  cityName,
  sourceContentId,
  sourceContentType,
}: {
  placeType: string;
  neighborhood?: string | null;
  cityName?: string;
  sourceContentId: string;
  sourceContentType: string;
}) {
  const [, navigate] = useLocation();
  const [affiliateTarget, setAffiliateTarget] = useState<AffiliateBookingTarget | null>(null);
  const [affiliateOpen, setAffiliateOpen] = useState(false);

  const params = new URLSearchParams({ type: placeType, limit: "3" });
  if (neighborhood) params.set("neighborhood", neighborhood);
  if (cityName) params.set("city", cityName);

  const { data, isLoading } = useQuery<{ providers: CrossSellProvider[]; affiliateFallback: boolean }>({
    queryKey: ["/api/content-match", placeType, neighborhood ?? "", cityName ?? ""],
    queryFn: () => fetch(`/api/content-match?${params.toString()}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const providers = data?.providers ?? [];

  const fireCrossSellClick = async (targetServiceId: string) => {
    try {
      await apiRequest("POST", "/api/cross-sell-events", {
        sourceContentId,
        sourceContentType,
        targetServiceId,
        eventType: "click",
      });
    } catch {
      // Non-blocking — tracking failure must never block navigation
    }
  };

  /**
   * Chip click: fire tracking first, then route.
   * All content-match results are native Traveloure services → navigate to /services/:id.
   * If a service ever carries an external affiliateUrl, open the AffiliateBookingModal instead.
   */
  const handleChipClick = async (svc: CrossSellProvider) => {
    await fireCrossSellClick(svc.serviceId);
    if (svc.affiliateUrl) {
      setAffiliateTarget({
        itemName: svc.serviceName,
        partnerName: svc.providerName,
        affiliateUrl: svc.affiliateUrl,
        partnerCategory: svc.serviceType ?? "service",
        itemDescription: svc.shortDescription ?? undefined,
      });
      setAffiliateOpen(true);
    } else {
      navigate(`/services/${svc.serviceId}`);
    }
  };

  // Detect strip label from matched service types — transport/concierge → "Getting there", else "Also popular"
  const stripLabel = providers.length > 0 && providers.every(p => isTransportService(p.serviceType))
    ? "Getting there"
    : "Also popular";

  if (isLoading) {
    return (
      <div className="border-t border-dashed border-muted-foreground/20 pt-1.5 mt-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
          Users also book
        </span>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {[0, 1].map(i => (
            <Skeleton key={i} className="h-7 w-24 rounded-full flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (providers.length === 0) return null;

  return (
    <>
      <div className="border-t border-dashed border-muted-foreground/20 pt-1.5 mt-0.5" data-testid={`cross-sell-strip-${sourceContentId}`}>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
          {stripLabel}
        </span>
        <TooltipProvider delayDuration={300}>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {providers.slice(0, 3).map((svc) => {
              const initials = svc.providerName
                .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              const priceDisplay = formatServicePrice(svc.price, svc.priceType);

              return (
                <Tooltip key={svc.serviceId}>
                  <TooltipTrigger asChild>
                    {/* Chip container is the primary click target — fires tracking on any tap/click */}
                    <div
                      className="flex items-center gap-1 bg-muted/70 hover:bg-muted border border-border rounded-full px-2 py-1 flex-shrink-0 cursor-pointer transition-colors group"
                      data-testid={`cross-sell-chip-${svc.serviceId}`}
                      onClick={() => handleChipClick(svc)}
                    >
                      {/* Provider avatar */}
                      <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[8px] font-bold flex items-center justify-center flex-shrink-0">
                        {initials}
                      </span>
                      {/* Service name + price */}
                      <span className="text-[10px] font-medium leading-none max-w-[80px] truncate">
                        {svc.serviceName}
                      </span>
                      {priceDisplay && (
                        <span className="text-[9px] text-muted-foreground leading-none flex-shrink-0">
                          {priceDisplay}
                        </span>
                      )}
                      {/* Book button — stopPropagation so chip onClick doesn't double-fire */}
                      <Button
                        size="sm"
                        className="text-[9px] h-5 px-1.5 rounded-full flex-shrink-0 ml-0.5"
                        data-testid={`cross-sell-book-${svc.serviceId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChipClick(svc);
                        }}
                      >
                        Book
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {svc.shortDescription && (
                    <TooltipContent side="top" className="max-w-[200px] text-xs">
                      {svc.shortDescription}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
      <AffiliateBookingModal item={affiliateTarget} open={affiliateOpen} onOpenChange={setAffiliateOpen} />
    </>
  );
}

function AffiliateBookingModal({
  item, open, onOpenChange,
}: {
  item: AffiliateBookingTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [travelDate, setTravelDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      return apiRequest("POST", "/api/affiliate-booking-requests", {
        itemName: item.itemName,
        itemDescription: item.itemDescription ?? null,
        partnerName: item.partnerName,
        partnerCategory: item.partnerCategory ?? "activity",
        affiliateUrl: item.affiliateUrl,
        travelDate: travelDate || null,
        travelers,
        userNotes: notes || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Booking requested!", description: "An expert will handle this for you." });
      onOpenChange(false);
      setTravelDate(""); setTravelers(1); setNotes("");
    },
    onError: () => {
      toast({ title: "Sign in required", description: "Please sign in to request a booking.", variant: "destructive" });
    },
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="affiliate-booking-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">{item.partnerName}</span>
            Request Expert Booking
          </DialogTitle>
          <DialogDescription>{item.itemName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5 flex items-start gap-2">
            <UserCheck className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-violet-700">A Traveloure expert will book this on your behalf using the platform's tracked link. You'll be notified when it's confirmed.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abm-date" className="text-xs font-medium">Travel date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input id="abm-date" type="date" className="pl-8 text-sm" value={travelDate} onChange={e => setTravelDate(e.target.value)} data-testid="input-travel-date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abm-travelers" className="text-xs font-medium">Number of travelers</Label>
            <Input id="abm-travelers" type="number" min={1} max={12} className="text-sm" value={travelers} onChange={e => setTravelers(parseInt(e.target.value) || 1)} data-testid="input-travelers" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abm-notes" className="text-xs font-medium">Notes for the expert <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="abm-notes" placeholder="Any special requests, dietary needs, accessibility requirements…" className="text-sm resize-none h-20" value={notes} onChange={e => setNotes(e.target.value)} data-testid="textarea-booking-notes" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} data-testid="button-cancel-booking">
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-submit-booking">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Request booking
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExpertPickAttribution — slim attribution line on gem/activity cards ──────
// Two variants: "Expert pick" (soft match) and "Curated by" (explicit curation).

function ExpertPickAttribution({
  expert, contentName, variant = "pick",
}: {
  expert: ExpertMatchInfo;
  contentName: string;
  variant?: "pick" | "curated";
}) {
  const [, navigate] = useLocation();
  const initials = expert.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (variant === "curated") {
    return (
      <div
        className="border-t border-dashed border-emerald-200 pt-1.5 mt-0.5 flex items-center gap-1.5"
        data-testid={`curated-by-${expert.id}`}
      >
        <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-bold flex items-center justify-center flex-shrink-0">
          {initials}
        </div>
        <span className="text-[10px] text-emerald-700 font-semibold flex-1 min-w-0 truncate flex items-center gap-1">
          <UserCheck className="h-2.5 w-2.5 flex-shrink-0" />
          Curated by {expert.name}
          {expert.specialty && <span className="font-normal text-emerald-600 opacity-80">· {expert.specialty}</span>}
        </span>
        <button
          className="text-[10px] text-emerald-700 underline underline-offset-1 hover:opacity-70 flex-shrink-0"
          onClick={() => navigate(`/chat?expertId=${expert.id}&about=${encodeURIComponent(contentName)}`)}
          data-testid={`curated-plan-link-${expert.id}`}
        >
          Plan with {expert.name.split(" ")[0]} →
        </button>
      </div>
    );
  }

  return (
    <div
      className="border-t border-dashed border-muted-foreground/20 pt-1.5 mt-0.5 flex items-center gap-1.5"
      data-testid={`expert-pick-${expert.id}`}
    >
      <div className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[8px] font-bold flex items-center justify-center flex-shrink-0">
        {initials}
      </div>
      <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">
        Expert pick · <span className="font-medium text-foreground/70">{expert.name}</span>
        {expert.specialty && <span> · {expert.specialty}</span>}
      </span>
      <button
        className="text-[10px] text-primary underline underline-offset-1 hover:opacity-70 flex-shrink-0 whitespace-nowrap"
        onClick={() => navigate(`/chat?expertId=${expert.id}&about=${encodeURIComponent(contentName)}`)}
        data-testid={`expert-pick-link-${expert.id}`}
      >
        Plan with {expert.name.split(" ")[0]} →
      </button>
    </div>
  );
}

// ─── BundleBookingModal — hotel + transfer checkout in one step ───────────────

interface BundleItem {
  serviceId: string;
  name: string;
  price: string | null;
  priceType?: string | null;
  type: "hotel" | "transport";
}

function BundleBookingModal({
  hotel, transport, open, onOpenChange,
}: {
  hotel: BundleItem;
  transport: BundleItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [travelDate, setTravelDate] = useState("");
  const [travelers, setTravelers] = useState(1);

  const transportPriceNum = parseFloat(String(transport.price ?? 0)) || 0;

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bundle-bookings", {
      transportServiceId: transport.serviceId,
      travelDate: travelDate || null,
      travelers,
    }),
    onSuccess: (data: any) => {
      if (data?.checkoutUrl) {
        toast({
          title: "Transfer reserved!",
          description: "Redirecting to Stripe to complete payment…",
        });
        onOpenChange(false);
        setTravelDate(""); setTravelers(1);
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Transfer reserved!", description: "Pending booking created. Check My Bookings." });
        onOpenChange(false);
        setTravelDate(""); setTravelers(1);
      }
    },
    onError: (err: any) => {
      const msg = err?.message ?? "";
      const isForbidden = msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized");
      toast({
        title: isForbidden ? "Sign in required" : "Booking failed",
        description: isForbidden ? "Please sign in to book." : "Something went wrong — please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="bundle-booking-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Book transfer + hotel
          </DialogTitle>
          <DialogDescription>Book your airport transfer through Traveloure, then complete the hotel on its own booking page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Side-by-side items */}
          <div className="grid grid-cols-2 gap-2">
            {/* Hotel — external booking */}
            <div className="rounded-lg border bg-muted/40 p-3">
              <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                HOTEL
              </span>
              <p className="text-xs font-semibold mt-1.5 leading-snug line-clamp-2">{hotel.name}</p>
              {hotel.price && (
                <p className="text-sm font-bold mt-1 text-primary">{hotel.price}</p>
              )}
              <p className="text-[9px] text-muted-foreground mt-1">Book via hotel site</p>
            </div>
            {/* Transfer — booked through Traveloure */}
            <div className="rounded-lg border bg-violet-50/60 border-violet-200 p-3">
              <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-violet-50 text-violet-700 border-violet-200">
                TRANSFER
              </span>
              <p className="text-xs font-semibold mt-1.5 leading-snug line-clamp-2">{transport.name}</p>
              {transport.price && (
                <p className="text-sm font-bold mt-1 text-primary">
                  {formatServicePrice(transport.price, transport.priceType)}
                </p>
              )}
              <p className="text-[9px] text-violet-600 mt-1 font-medium">Via Traveloure ✓</p>
            </div>
          </div>
          {/* Transfer price — what you pay now */}
          {transportPriceNum > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-medium">Transfer payment today</span>
              <span className="text-base font-bold text-primary">
                from €{transportPriceNum.toFixed(0)}
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="bundle-date" className="text-xs font-medium">Travel date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input id="bundle-date" type="date" className="pl-8 text-sm" value={travelDate}
                onChange={e => setTravelDate(e.target.value)} data-testid="input-bundle-date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bundle-travelers" className="text-xs font-medium">Travelers</Label>
            <Input id="bundle-travelers" type="number" min={1} max={12} className="text-sm"
              value={travelers} onChange={e => setTravelers(parseInt(e.target.value) || 1)}
              data-testid="input-bundle-travelers" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}
              data-testid="button-bundle-cancel">
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending}
              data-testid="button-bundle-confirm">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Package className="h-4 w-4 mr-1" />}
              Book transfer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ExpertTourRow — editorial cross-link for "Eat" filter ───────────────────
// Shown at the top of the eat-filter flat feed when a food-tour service exists.

function ExpertTourRow({
  service, expert, cityName,
}: {
  service: PlatformService;
  expert?: any;
  cityName: string;
}) {
  const [, navigate] = useLocation();
  const expertName = expert?.name ?? `Local ${cityName} expert`;
  const initials = expertName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const priceDisplay = formatServicePrice(service.price, service.priceType);

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 flex items-center gap-3 mb-4"
      data-testid="expert-tour-row"
    >
      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">
          EXPERT FOOD TOURS THAT INCLUDE THESE SPOTS
        </span>
        <p className="text-sm font-semibold leading-snug mt-0.5 line-clamp-1">{service.serviceName}</p>
        <p className="text-xs text-muted-foreground">
          by {expertName}
          {priceDisplay && <span className="font-medium text-foreground/80"> · {priceDisplay}</span>}
        </p>
      </div>
      <Button
        size="sm"
        className="text-xs h-7 px-3 flex-shrink-0 bg-amber-500 hover:bg-amber-600 whitespace-nowrap"
        onClick={() => navigate(`/services/${service.id}`)}
        data-testid="button-see-food-tour"
      >
        See full tour →
      </Button>
    </div>
  );
}

// ─── Helper: match a city expert to content type ─────────────────────────────

function matchExpertToContent(experts: any[], placeType: string | null | undefined): ExpertMatchInfo | null {
  if (!experts || experts.length === 0 || !placeType) return null;
  const t = placeType.toLowerCase();

  const toInfo = (e: any): ExpertMatchInfo => ({
    id: e.id,
    name: e.name ?? [e.firstName, e.lastName].filter(Boolean).join(" "),
    specialty: Array.isArray(e.specializations)
      ? e.specializations[0]
      : (e.specialization ?? e.specialty ?? null),
    hourlyRate: e.hourlyRate ?? null,
  });

  // Food/restaurant → culinary/food specialist
  if (t.includes("restaurant") || t.includes("cafe") || t.includes("food") || t.includes("eat") ||
      t.includes("dining") || t.includes("ramen") || t.includes("sushi") || t.includes("kitchen")) {
    const match = experts.find(e => {
      const spec = String(e.specializations ?? e.specialization ?? "").toLowerCase();
      return spec.includes("food") || spec.includes("culinary") || spec.includes("dining");
    });
    if (match) return toInfo(match);
  }

  // Photo spots → photography specialist
  if (t.includes("photo") || t.includes("viewpoint") || t.includes("scenic")) {
    const match = experts.find(e => {
      const spec = String(e.specializations ?? e.specialization ?? "").toLowerCase();
      return spec.includes("photo") || spec.includes("photography");
    });
    if (match) return toInfo(match);
  }

  // Attractions, museums, temples → guide/cultural specialist
  if (t.includes("attraction") || t.includes("museum") || t.includes("temple") ||
      t.includes("shrine") || t.includes("castle") || t.includes("tour")) {
    const match = experts.find(e => {
      const spec = String(e.specializations ?? e.specialization ?? "").toLowerCase();
      return spec.includes("cultural") || spec.includes("history") || spec.includes("guide") || spec.includes("heritage");
    });
    if (match) return toInfo(match);
    // Fallback to first expert for high-value attractions
    return toInfo(experts[0]);
  }

  return null;
}

/** Format a raw DB price decimal as a locale-aware currency string. */
function formatServicePrice(
  price: string | null | undefined,
  priceType?: string | null,
): string | null {
  if (!price) return null;
  const raw = String(price).trim();
  // Already has a currency symbol — respect it but still normalize decimals
  const hasSymbol = /^[€$£¥₹]/.test(raw) || /[€$£¥₹]$/.test(raw);
  if (hasSymbol) {
    return priceType === "variable" ? `From ${raw}` : raw;
  }
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  const formatted = new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: num % 1 === 0 ? 0 : 2,
  }).format(num);
  return priceType === "variable" ? `From ${formatted}` : formatted;
}

function detectBadge(bookingUrl: string | null | undefined): {
  badgeText: string; badgeClass: string; bookLabel: string; isPartner: boolean; partnerName: string;
} {
  if (!bookingUrl) {
    return { badgeText: "NOT BOOKABLE", badgeClass: "bg-muted text-muted-foreground border-border", bookLabel: "", isPartner: false, partnerName: "" };
  }
  let hostname = "";
  try { hostname = new URL(bookingUrl).hostname.toLowerCase(); } catch { hostname = ""; }
  let partnerName = "";
  if (hostname.includes("viator")) partnerName = "Viator";
  else if (hostname.includes("tiqets")) partnerName = "Tiqets";
  else if (hostname.includes("klook")) partnerName = "Klook";
  else if (hostname.includes("getyourguide")) partnerName = "GetYourGuide";
  else if (hostname.includes("booking.com")) partnerName = "Booking.com";
  else if (hostname.includes("airbnb")) partnerName = "Airbnb";
  else if (hostname.includes("12go")) partnerName = "12Go";
  const partner = !!partnerName;
  if (partner) {
    return { badgeText: "VIA EXPERT", badgeClass: "bg-violet-50 text-violet-700 border-violet-200", bookLabel: "Request booking", isPartner: true, partnerName };
  }
  return { badgeText: "BOOK ON TRAVELOURE", badgeClass: "bg-green-50 text-green-700 border-green-200", bookLabel: "Book now", isPartner: false, partnerName: "" };
}

function ActivityRow({
  item, idx, onAdd, testPrefix, forceTraveloure, onRequestBooking, cityName, neighborhood, expertMatch,
}: {
  item: {
    id?: string; placeName?: string; title?: string; name?: string;
    placeType?: string | null; type?: string | null;
    bookingUrl?: string | null; price?: string | null; priceType?: string | null;
    description?: string | null; whyHidden?: string | null; whyLocalsLoveIt?: string | null;
    imageUrl?: string | null; media?: any[];
    bookingsCount?: number | null;
  };
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
  /** Force "BOOK ON TRAVELOURE" badge regardless of URL (for platform services). */
  forceTraveloure?: boolean;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
  cityName?: string;
  neighborhood?: string | null;
  expertMatch?: ExpertMatchInfo | null;
}) {
  const [, navigate] = useLocation();
  const displayName = item.placeName ?? item.title ?? item.name ?? "Unnamed";
  const image = item.imageUrl ?? item.media?.[0]?.url ?? null;
  const description = item.whyHidden ?? item.whyLocalsLoveIt ?? item.description ?? null;
  const rawType = (item.placeType ?? item.type ?? "").trim();
  const typeLabel = rawType.toLowerCase();
  const isPhotoSpot = typeLabel.includes("photo") || typeLabel.includes("viewpoint") || typeLabel.includes("scenic");
  // Normalized display type: capitalize first letter, truncate at 24 chars for layout
  const displayType = rawType.length > 0
    ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase().replace(/_/g, " ").slice(0, 23)
    : null;

  const badge = forceTraveloure
    ? { badgeText: "BOOK ON TRAVELOURE", badgeClass: "bg-green-50 text-green-700 border-green-200", bookLabel: "Book now", isPartner: false }
    : detectBadge(item.bookingUrl);

  // Locale-aware price — for platform services use priceType to decide "From" prefix
  const priceDisplay = forceTraveloure
    ? formatServicePrice(item.price, item.priceType)
    : (item.price
      ? (String(item.price).startsWith("€") || String(item.price).startsWith("$") || String(item.price).startsWith("£")
        ? item.price : `€${item.price}`)
      : null);

  // Is this an internal Traveloure service URL we can navigate to directly?
  const isInternalService = item.bookingUrl?.startsWith("/services/");

  /** For internal service rows: navigate on row click, but let child buttons handle their own events. */
  const handleRowClick = isInternalService && item.bookingUrl
    ? () => navigate(item.bookingUrl!)
    : undefined;

  /** Stops the row-level navigation click from firing when a child button is clicked. */
  const stopNav = isInternalService
    ? (e: React.MouseEvent) => e.stopPropagation()
    : undefined;

  return (
    <div
      className={`flex items-start gap-3 py-3 border-b last:border-b-0${isInternalService ? " cursor-pointer hover:bg-muted/40 rounded-lg px-1 -mx-1 transition-colors" : ""}`}
      data-testid={`${testPrefix}-${idx}`}
      onClick={handleRowClick}
      role={isInternalService ? "link" : undefined}
    >
      {image && (
        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
          <img src={image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-sm font-semibold leading-snug" data-testid={`${testPrefix}-name-${idx}`}>
            {displayName}
            {displayType && <span className="font-normal text-muted-foreground"> · {displayType}</span>}
          </p>
          <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${badge.badgeClass}`}>
            {badge.badgeText}
          </span>
          {priceDisplay && (
            <span
              className="text-[10px] font-semibold border rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-200"
              data-testid={`${testPrefix}-price-${idx}`}
            >
              {priceDisplay}
            </span>
          )}
          {(item.bookingsCount ?? 0) > 0 && (
            <span
              className="text-[10px] font-semibold border rounded px-1.5 py-0.5 bg-sky-50 text-sky-700 border-sky-200 flex items-center gap-0.5"
              data-testid={`${testPrefix}-bookings-${idx}`}
            >
              <Users className="w-2.5 h-2.5" />{item.bookingsCount} booked
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {badge.bookLabel && (item.bookingUrl || forceTraveloure) && !isInternalService && (
            badge.isPartner ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5 border-violet-300 text-violet-700 hover:bg-violet-50"
                data-testid={`${testPrefix}-book-${idx}`}
                onClick={() => onRequestBooking?.({
                  itemName: displayName,
                  partnerName: badge.partnerName || "Partner",
                  affiliateUrl: item.bookingUrl!,
                  partnerCategory: item.placeType ?? item.type ?? "activity",
                  itemDescription: description ?? undefined,
                })}
              >
                {badge.bookLabel}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="default"
                className="text-xs h-7 px-2.5"
                data-testid={`${testPrefix}-book-${idx}`}
                asChild={!!item.bookingUrl}
              >
                {item.bookingUrl ? (
                  <a href={item.bookingUrl} rel="noopener noreferrer">{badge.bookLabel}</a>
                ) : (
                  <span>{badge.bookLabel}</span>
                )}
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              onAdd({ name: displayName, type: item.placeType ?? item.type ?? "activity", imageUrl: image ?? undefined, description: description ?? undefined });
            }}
            data-testid={`${testPrefix}-add-${idx}`}
          >
            Add to experience
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/chat?about=${encodeURIComponent(displayName)}`); }}
            data-testid={`${testPrefix}-ask-${idx}`}
          >
            <UserCheck className="h-3 w-3 mr-1" />Ask expert
          </Button>
          <WishlistButton
            contentId={(item as any).id ?? displayName}
            contentName={displayName}
            contentType={item.placeType ?? item.type ?? "activity"}
            contentImage={image}
            className="border border-border h-7 w-7 flex-shrink-0"
          />
          {isPhotoSpot && (
            <span className="text-xs text-muted-foreground self-center" onClick={stopNav}>
              · photographer available → <button className="underline text-primary">Book shoot</button>
            </span>
          )}
        </div>

        {/* Expert attribution */}
        {expertMatch && (
          <ExpertPickAttribution
            expert={expertMatch}
            contentName={displayName}
            variant="pick"
          />
        )}

        {/* Cross-sell strip */}
        <CrossSellStrip
          placeType={item.placeType ?? item.type ?? "activity"}
          neighborhood={neighborhood}
          cityName={cityName}
          sourceContentId={(item as any).id ?? displayName}
          sourceContentType={item.placeType ?? item.type ?? "activity"}
        />
      </div>
    </div>
  );
}

// ─── HotelRow — full-width with small thumbnail + "Book both" ─────────────────

function HotelRow({
  item, idx, onAdd, testPrefix, onRequestBooking,
}: {
  item: {
    id?: string; name?: string; title?: string; placeName?: string;
    placeType?: string | null; type?: string | null;
    imageUrl?: string | null; media?: any[];
    price?: string | null; address?: string | null;
    bookingUrl?: string | null; starRating?: number | null;
  };
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
}) {
  const displayName = item.name ?? item.title ?? item.placeName ?? "Hotel";
  const image = item.imageUrl ?? item.media?.[0]?.url ?? null;
  const hasBooking = !!item.bookingUrl;

  return (
    <div
      className="flex items-center gap-3 py-3 border-b last:border-b-0"
      data-testid={`${testPrefix}-${idx}`}
    >
      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
        {image ? (
          <img src={image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Hotel className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">
          MARQUEE STAY
        </span>
        <p className="text-sm font-semibold mt-0.5 leading-snug" data-testid={`${testPrefix}-name-${idx}`}>
          {displayName}
          {item.price && <span className="font-normal text-muted-foreground"> · {item.price}</span>}
        </p>
        {item.address && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.address}</p>
        )}
      </div>

      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
        {hasBooking ? (() => {
          const bd = detectBadge(item.bookingUrl);
          if (bd.isPartner) {
            return (
              <Button size="sm" variant="outline" className="text-xs h-7 px-3 whitespace-nowrap border-violet-300 text-violet-700 hover:bg-violet-50"
                data-testid={`${testPrefix}-book-${idx}`}
                onClick={() => onRequestBooking?.({ itemName: displayName, partnerName: bd.partnerName || "Booking.com", affiliateUrl: item.bookingUrl!, partnerCategory: "hotel" })}>
                Request booking
              </Button>
            );
          }
          return (
            <Button size="sm" className="text-xs h-7 px-3 whitespace-nowrap" asChild>
              <a href={item.bookingUrl!} rel="noopener noreferrer" data-testid={`${testPrefix}-book-${idx}`}>Book both</a>
            </Button>
          );
        })() : (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-3 whitespace-nowrap"
            onClick={() => onAdd({ name: displayName, type: "hotel", description: item.address ?? undefined })}
            data-testid={`${testPrefix}-add-${idx}`}
          >
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── HotelMiniCard — full-width row card (span-2) for marquee stays ──────────
// Always renders as a horizontal row so it occupies the full bento width.
// Caller must add "col-span-2" to the grid wrapper or place it in its own row.

function HotelMiniCard({
  item, idx, onAdd, testPrefix, onRequestBooking, cityName,
}: {
  item: {
    id?: string; name?: string; title?: string; placeName?: string;
    placeType?: string | null; type?: string | null;
    imageUrl?: string | null; media?: any[];
    price?: string | null; address?: string | null;
    bookingUrl?: string | null; starRating?: number | null;
    neighborhood?: string | null;
  };
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
  cityName?: string;
}) {
  const [, navigate] = useLocation();
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleTransport, setBundleTransport] = useState<BundleItem | null>(null);
  const displayName = item.name ?? item.title ?? item.placeName ?? "Hotel";
  const image = item.imageUrl ?? item.media?.[0]?.url ?? null;
  const bd = detectBadge(item.bookingUrl);

  // Fetch transport cross-sell match for the bundle chip
  const matchParams = new URLSearchParams({ type: "hotel", limit: "1" });
  if (item.neighborhood) matchParams.set("neighborhood", item.neighborhood);
  if (cityName) matchParams.set("city", cityName);
  const { data: bundleData } = useQuery<{ providers: CrossSellProvider[] }>({
    queryKey: ["/api/content-match", "hotel-bundle", item.neighborhood ?? "", cityName ?? ""],
    queryFn: () => fetch(`/api/content-match?${matchParams.toString()}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    retry: false,
    select: (d) => ({ providers: (d?.providers ?? []).filter((p) => isTransportService(p.serviceType)) }),
  });

  const topTransport = bundleData?.providers?.[0] ?? null;

  const hotelPrice = parseFloat(String(item.price ?? 0)) || 0;
  const transportPrice = topTransport ? (parseFloat(String(topTransport.price ?? 0)) || 0) : 0;
  const bundleTotalDisplay = topTransport && (hotelPrice + transportPrice) > 0
    ? `from €${(hotelPrice + transportPrice).toFixed(0)} total`
    : null;

  return (
    <>
    <div
      className="col-span-2 rounded-xl border bg-card overflow-hidden flex flex-row"
      data-testid={`${testPrefix}-mini-${idx}`}
    >
      {/* Left image strip — 96px wide */}
      <div className="w-24 flex-shrink-0 bg-blue-50 flex items-center justify-center self-stretch relative">
        {image ? (
          <img src={image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Hotel className="h-8 w-8 text-blue-300" />
        )}
        <WishlistButton
          contentId={item.id ?? displayName}
          contentName={displayName}
          contentType="hotel"
          contentImage={image}
          className="absolute top-1.5 left-1.5"
        />
      </div>

      <div className="p-3 flex flex-col flex-1 gap-1.5 min-w-0">
        <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 self-start bg-blue-50 text-blue-700 border-blue-200">
          MARQUEE STAY
        </span>
        <p className="font-semibold text-sm leading-snug line-clamp-1" data-testid={`${testPrefix}-name-${idx}`}>
          {displayName}
        </p>

        {/* Price + booking badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.price && <span className="text-sm font-bold">{item.price}</span>}
          <span className={`text-[9px] font-semibold border rounded px-1.5 py-0.5 ${bd.badgeClass}`}>
            {bd.badgeText}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-1 pt-0.5">
          {item.bookingUrl ? (
            bd.isPartner ? (
              <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 border-violet-300 text-violet-700 hover:bg-violet-50"
                data-testid={`${testPrefix}-book-both-${idx}`}
                onClick={() => onRequestBooking?.({ itemName: displayName, partnerName: bd.partnerName || "Booking.com", affiliateUrl: item.bookingUrl!, partnerCategory: "hotel" })}>
                Request booking
              </Button>
            ) : (
              <Button size="sm" className="text-[10px] h-6 px-2" asChild data-testid={`${testPrefix}-book-both-${idx}`}>
                <a href={item.bookingUrl} rel="noopener noreferrer">Book</a>
              </Button>
            )
          ) : null}
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
            onClick={() => onAdd({ name: displayName, type: "hotel", description: item.address ?? undefined })}
            data-testid={`${testPrefix}-add-${idx}`}>
            + Add
          </Button>
          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
            onClick={() => navigate(`/chat?about=${encodeURIComponent(displayName)}`)}
            data-testid={`${testPrefix}-ask-${idx}`}>
            💬 Ask expert
          </Button>
        </div>

        {/* Bundle chip — "Hotel + Private transfer" when a transport match exists */}
        {topTransport && (
          <div className="border-t border-dashed border-violet-200 pt-1.5 mt-0.5 flex items-center gap-1.5">
            <Package className="h-3 w-3 text-violet-500 flex-shrink-0" />
            <span className="text-[10px] text-violet-700 font-medium flex-1 min-w-0 truncate">
              Hotel + {topTransport.serviceName}
              {bundleTotalDisplay && <span className="font-semibold"> — {bundleTotalDisplay}</span>}
            </span>
            <Button
              size="sm"
              className="text-[9px] h-5 px-2 rounded-full bg-violet-600 hover:bg-violet-700 flex-shrink-0"
              data-testid={`${testPrefix}-bundle-${idx}`}
              onClick={() => {
                setBundleTransport({
                  serviceId: topTransport.serviceId,
                  name: topTransport.serviceName,
                  price: topTransport.price,
                  priceType: topTransport.priceType,
                  type: "transport",
                });
                setBundleOpen(true);
              }}
            >
              Bundle
            </Button>
          </div>
        )}

        {/* Cross-sell strip — auto-labels "Getting there" when matched services are transport types */}
        <CrossSellStrip
          placeType="hotel"
          neighborhood={item.neighborhood}
          cityName={cityName}
          sourceContentId={item.id ?? displayName}
          sourceContentType="hotel"
        />
      </div>
    </div>

    {/* Bundle booking modal */}
    {bundleTransport && (
      <BundleBookingModal
        hotel={{
          serviceId: item.id ?? displayName,
          name: displayName,
          price: item.price ?? null,
          priceType: null,
          type: "hotel",
        }}
        transport={bundleTransport}
        open={bundleOpen}
        onOpenChange={(v) => {
          setBundleOpen(v);
          if (!v) setBundleTransport(null);
        }}
      />
    )}
    </>
  );
}

// ─── ServiceMiniCard — half-width card for 2-col grid inside neighborhood ─────

function ServiceMiniCard({
  svc, idx, onAdd, testPrefix,
}: {
  svc: PlatformService;
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
}) {
  const displayName = svc.serviceName;
  const image = svc.serviceImage ?? null;
  const description = svc.shortDescription ?? svc.description ?? null;

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden flex flex-col"
      data-testid={`${testPrefix}-mini-${idx}`}
    >
      <div className="relative aspect-[4/3] bg-muted flex-shrink-0 w-full">
        {image ? (
          <img src={image} alt={displayName} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
            <Package className="h-10 w-10 text-emerald-300" />
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1 gap-2">
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-green-50 text-green-700 border-green-200">
            BOOK ON TRAVELOURE
          </span>
          <p className="font-semibold text-sm leading-snug line-clamp-1 mt-1" data-testid={`${testPrefix}-name-${idx}`}>
            {displayName}{svc.price && <span className="font-normal text-muted-foreground"> · {svc.price}</span>}
          </p>
          {description && <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>}
        </div>
        {/* Trust signals: rating + bookings demand */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {svc.averageRating && (
            <span className="text-[10px] font-semibold border rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-0.5" data-testid={`${testPrefix}-rating-${idx}`}>
              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
              {typeof svc.averageRating === "number" ? Number(svc.averageRating).toFixed(1) : svc.averageRating}
              {(svc.reviewCount ?? 0) > 0 && <span className="opacity-80"> · {svc.reviewCount} reviews</span>}
            </span>
          )}
          {(svc.bookingsCount ?? 0) > 0 && (
            <span className="text-[10px] font-semibold border rounded px-1.5 py-0.5 bg-sky-50 text-sky-700 border-sky-200 flex items-center gap-0.5" data-testid={`${testPrefix}-bookings-${idx}`}>
              <Users className="w-2.5 h-2.5" />Booked {svc.bookingsCount} times
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          <Button size="sm" className="text-xs h-7 px-2.5" asChild data-testid={`${testPrefix}-book-${idx}`}>
            <a href={`/services/${svc.id}`}>Book now</a>
          </Button>
          <Button
            size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => onAdd({ name: displayName, type: svc.serviceType ?? "service", description: description ?? undefined })}
            data-testid={`${testPrefix}-add-${idx}`}
          >
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ExpertFeedCard — "Plan it for me" CTA row ───────────────────────────────

function ExpertFeedCard({ expert, cityName }: { expert?: any; cityName: string }) {
  const [, navigate] = useLocation();
  const initials = expert?.name
    ? expert.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "LC";
  const expertName = expert?.name ?? `Local ${cityName} Expert`;
  const rating = expert?.rating ?? expert?.averageRating ?? null;
  const reviewCount = expert?.reviewCount ?? null;
  const price = expert?.hourlyRate ? `from €${expert.hourlyRate}/hr` : null;

  // Specialisation tags: prefer array, fall back to single string split by comma
  const rawSpec = expert?.specializations ?? expert?.specialization ?? null;
  const specializationTags: string[] = Array.isArray(rawSpec)
    ? rawSpec.slice(0, 3)
    : rawSpec
      ? String(rawSpec).split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 3)
      : ["Itinerary planning"];

  const expertId = expert?.id ?? null;

  return (
    <div
      className="flex items-start gap-3 py-3 px-4 rounded-xl border border-primary/20 bg-primary/[0.03] mt-1"
      data-testid="expert-feed-card"
    >
      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary mt-0.5">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">PLAN IT FOR ME</span>
        <p className="text-sm font-semibold leading-snug line-clamp-1">
          {expertName} turns your picks into a day-by-day plan
        </p>
        {/* Specialisation tags */}
        <div className="flex items-center gap-1 flex-wrap mt-1">
          {specializationTags.map((tag, i) => (
            <span
              key={i}
              className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-primary/5 text-primary border-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
          {rating && (
            <span className="flex items-center gap-0.5" data-testid="expert-rating">
              <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
              {typeof rating === "number" ? rating.toFixed(1) : rating}
              {(reviewCount ?? 0) > 0 && <span className="opacity-70">({reviewCount} reviews)</span>}
            </span>
          )}
          {price && <span className="font-medium text-foreground/80">{price}</span>}
          {expertId && (
            <button
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              onClick={() => navigate(`/experts/${expertId}`)}
              data-testid="link-expert-profile"
            >
              View profile →
            </button>
          )}
        </p>
      </div>
      <Button
        size="sm"
        className="text-xs h-8 px-3 flex-shrink-0 whitespace-nowrap"
        data-testid={`button-plan-with-expert-${expert?.id ?? "unknown"}`}
        onClick={() => navigate(expert?.id ? `/chat?expertId=${expert.id}` : "/chat")}
      >
        Plan with {expert?.name?.split(" ")[0] ?? "expert"}
      </Button>
    </div>
  );
}

// ─── NeighborhoodContainer — nested-container redesign ───────────────────────

function isPhotoSpotGem(placeType: string | null | undefined): boolean {
  const t = (placeType ?? "").toLowerCase();
  return t.includes("photo") || t.includes("viewpoint") || t.includes("scenic") || t.includes("vista");
}

function NeighborhoodContainer({
  neighborhood, gems, hotels, activities, services, cityName, onAdd, hueIdx, onRequestBooking, experts,
}: {
  neighborhood: Neighborhood;
  gems: HiddenGem[];
  hotels: any[];
  activities: any[];
  services: PlatformService[];
  cityName: string;
  onAdd: (t: AddDialogTarget) => void;
  hueIdx: number;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
  experts?: any[];
}) {
  const [, navigate] = useLocation();
  const total = gems.length + hotels.length + activities.length + services.length;
  if (total === 0) return null;

  const hue = NEIGHBORHOOD_HUES[hueIdx % NEIGHBORHOOD_HUES.length];

  const eatCount = gems.filter(g => {
    const t = (g.placeType ?? "").toLowerCase();
    return t.includes("eat") || t.includes("restaurant") || t.includes("cafe") || t.includes("food");
  }).length;
  const doCount = gems.length - eatCount + activities.length;
  const stayCount = hotels.length;
  const svcCount = services.length;

  const statParts = [
    doCount > 0 && `${doCount} to do`,
    eatCount > 0 && `${eatCount} to eat`,
    stayCount > 0 && `${stayCount} stay${stayCount !== 1 ? "s" : ""}`,
    svcCount > 0 && `${svcCount} bookable`,
  ].filter(Boolean) as string[];

  // Split activities: card-worthy (has image/booking/price) go in 2-col grid;
  // pure text suggestions stay as ActivityRow rows below.
  const isCardWorthy = (a: any) => !!(a.imageUrl ?? a.media?.[0]?.url) || !!a.bookingUrl || !!a.price;
  const cardActivities = activities.filter(isCardWorthy);
  const textActivities = activities.filter(a => !isCardWorthy(a));

  const hasGridContent = gems.length > 0 || hotels.length > 0 || services.length > 0 || cardActivities.length > 0;

  return (
    <div
      className="rounded-2xl border bg-card overflow-hidden"
      data-testid={`neighborhood-container-${neighborhood.slug}`}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex gap-4 items-start">
          {/* 64px hued icon square */}
          <div className={`w-16 h-16 rounded-xl ${hue.bg} flex items-center justify-center flex-shrink-0`}>
            <MapPin className={`h-7 w-7 ${hue.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold leading-tight" data-testid={`neighborhood-name-${neighborhood.slug}`}>
                {neighborhood.name}
              </h3>
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground border border-border rounded px-1.5 py-0.5">
                NEIGHBORHOOD
              </span>
            </div>
            {/* Green vibe line */}
            {neighborhood.description && (
              <p className="text-xs text-emerald-600 font-medium mt-1 line-clamp-1">
                {neighborhood.isFeatured ? "trending · " : ""}{neighborhood.description}
              </p>
            )}
            {/* Stats with expert attribution woven in */}
            {statParts.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">{statParts.join(" · ")}</p>
            )}
            {/* CTA buttons below text block */}
            <div className="flex gap-2 flex-wrap mt-3">
              <Button
                size="sm"
                className="text-xs h-8 px-3"
                data-testid={`btn-explore-${neighborhood.slug}`}
                onClick={() => navigate(`/discover/location/${encodeURIComponent(cityName)}?neighborhood=${neighborhood.slug}`)}
              >
                <Compass className="h-3 w-3 mr-1" />Explore {neighborhood.name}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 px-3"
                onClick={() => onAdd({ name: `${neighborhood.name} Day`, type: "neighborhood-day", description: `A day exploring ${neighborhood.name} in ${cityName}` })}
                data-testid={`btn-add-day-${neighborhood.slug}`}
              >
                <Plus className="h-3 w-3 mr-1" />Add a {neighborhood.name.split(" ")[0]} day
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content section — gray enclosed with "IN [NAME]" label */}
      <div className="border-t bg-muted/40 px-4 pb-4 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          IN {neighborhood.name.toUpperCase()}
        </p>

        {/* Unified 2-col grid: gems + card-worthy activities + hotel mini cards + service mini cards */}
        {hasGridContent && (
          <div className="grid grid-cols-2 gap-3">
            {gems.map((gem, idx) => {
              const expertM = experts ? matchExpertToContent(experts, gem.placeType) : null;
              const curatedE = gem.curatedByExpertId && experts
                ? (() => { const e = experts.find((ex: any) => ex.id === gem.curatedByExpertId); return e ? { name: e.name ?? [e.firstName, e.lastName].filter(Boolean).join(" "), id: e.id, specializations: e.specializations ?? null } : null; })()
                : null;
              return (
                <GemCard
                  key={gem.id ?? idx}
                  item={gem}
                  idx={idx}
                  onAdd={onAdd}
                  testPrefix={`gem-${neighborhood.slug}`}
                  onRequestBooking={onRequestBooking}
                  cityName={cityName}
                  expertMatch={expertM}
                  curatedByExpert={curatedE}
                />
              );
            })}
            {cardActivities.map((act, idx) => {
              const expertM = experts ? matchExpertToContent(experts, act.placeType ?? act.type) : null;
              return (
                <GemCard
                  key={act.id ?? `ca-${idx}`}
                  item={act}
                  idx={idx}
                  onAdd={onAdd}
                  testPrefix={`act-card-${neighborhood.slug}`}
                  onRequestBooking={onRequestBooking}
                  cityName={cityName}
                  expertMatch={expertM}
                />
              );
            })}
            {hotels.map((hotel, idx) => (
              <HotelMiniCard
                key={hotel.id ?? idx}
                item={hotel}
                idx={idx}
                onAdd={onAdd}
                testPrefix={`hotel-${neighborhood.slug}`}
                onRequestBooking={onRequestBooking}
                cityName={cityName}
              />
            ))}
            {services.map((svc, idx) => (
              <ServiceMiniCard
                key={svc.id ?? idx}
                svc={svc}
                idx={idx}
                onAdd={onAdd}
                testPrefix={`service-${neighborhood.slug}`}
              />
            ))}
          </div>
        )}

        {/* Pure text-only AI activities — below the grid (no image, no booking URL, no price) */}
        {textActivities.length > 0 && (
          <div className={`rounded-xl border bg-card px-4 py-2${hasGridContent ? " mt-3" : ""}`}>
            {textActivities.map((act, idx) => {
              const expertM = experts ? matchExpertToContent(experts, act.placeType ?? act.type) : null;
              return (
                <ActivityRow
                  key={act.id ?? idx}
                  item={act}
                  idx={idx}
                  onAdd={onAdd}
                  testPrefix={`activity-${neighborhood.slug}`}
                  onRequestBooking={onRequestBooking}
                  cityName={cityName}
                  neighborhood={neighborhood.slug}
                  expertMatch={expertM}
                />
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function matchesFilter(item: any, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  const t = (item.placeType ?? item.type ?? "").toLowerCase();
  if (filter === "eat")
    return t.includes("restaurant") || t.includes("cafe") || t.includes("food") ||
           t.includes("eat") || t.includes("dining") || t.includes("ramen") || t.includes("sushi") ||
           t.includes("culinary") || t.includes("cooking") || t.includes("bar") ||
           t.includes("izakaya") || t.includes("yakitori") || t.includes("noodle") ||
           t.includes("bento") || t.includes("street food") || t.includes("kitchen") ||
           t.includes("bistro") || t.includes("tavern") || t.includes("teahouse") ||
           t.includes("bakery") || t.includes("patisserie") || t.includes("market food");
  if (filter === "do")
    return t.includes("attraction") || t.includes("museum") || t.includes("temple") ||
           t.includes("shrine") || t.includes("park") || t.includes("garden") ||
           t.includes("castle") || t.includes("activity") || t.includes("tour") || t.includes("experience") ||
           t.includes("wellness") || t.includes("spa") || t.includes("onsen") ||
           t.includes("nature") || t.includes("walk") || t.includes("hike") || t.includes("forest") ||
           t.includes("art") || t.includes("gallery") || t.includes("nightlife") ||
           t.includes("market") || t.includes("craft") || t.includes("workshop") ||
           t.includes("planning") || t.includes("consultation") ||
           t.includes("concierge") || t.includes("specialty");
  if (filter === "stay")
    return t.includes("hotel") || t.includes("lodging") || t.includes("accommodation") ||
           t.includes("ryokan") || t.includes("hostel") || t.includes("villa") ||
           t.includes("apartment") || t.includes("inn") || t.includes("guesthouse") ||
           (t.includes("stay") && !t.includes("restaurant"));
  if (filter === "events")
    return t.includes("event") || t.includes("festival") || t.includes("concert") ||
           t.includes("show") || t.includes("performance") || t.includes("ceremony") ||
           t.includes("matsuri");
  if (filter === "photo-spots")
    return isPhotoSpotGem(t) || t.includes("photography") ||
           (t.includes("spot") && !t.includes("hot spot") && !t.includes("sweet spot")) ||
           t.includes("landmark") || t.includes("overlook");
  return false;
}

function matchesServiceFilter(svc: PlatformService, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  const t = (svc.serviceType ?? "").toLowerCase();
  if (filter === "eat")
    return t.includes("dining") || t.includes("food") || t.includes("culinary") ||
           t.includes("restaurant") || t.includes("cooking") || t.includes("cafe") ||
           t.includes("bar") || t.includes("kitchen") || t.includes("catering") ||
           t.includes("bakery") || t.includes("beverage");
  if (filter === "do")
    return t.includes("experience") || t.includes("tour") || t.includes("activity") ||
           t.includes("planning") || t.includes("consultation") ||
           t.includes("concierge") || t.includes("specialty") || t.includes("wellness") ||
           t.includes("spa") || t.includes("fitness") || t.includes("workshop") ||
           t.includes("art") || t.includes("entertainment") || t.includes("adventure") ||
           t.includes("nightlife") || t.includes("sightseeing");
  if (filter === "stay")
    return t.includes("accommodation") || t.includes("hotel") || t.includes("lodging") ||
           t.includes("rental") || t.includes("villa") || t.includes("stay") ||
           t.includes("guesthouse") || t.includes("hostel");
  if (filter === "events")
    return t.includes("event") || t.includes("festival") || t.includes("entertainment") ||
           t.includes("show") || t.includes("ticket");
  if (filter === "photo-spots")
    return t.includes("photo") || t.includes("photography") || t.includes("videography") ||
           t.includes("shoot");
  return false;
}

// ─── Expert Recruit Card ──────────────────────────────────────────────────────

const SUPPLY_ROLES = ["expert", "local_expert", "travel_expert", "event_planner", "service_provider"];

function buildCityParams(cityName: string, countryName?: string | null): string {
  const params = new URLSearchParams({ city: cityName });
  if (countryName) params.set("country", countryName);
  return params.toString();
}

function ExpertRecruitCard({
  cityName, countryName, userRole,
}: {
  cityName: string;
  countryName?: string | null;
  userRole?: string | null;
}) {
  const isSupply = SUPPLY_ROLES.includes(userRole ?? "");
  const qs = buildCityParams(cityName, countryName);

  if (isSupply) {
    return (
      <div
        className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center space-y-3"
        data-testid="expert-promote-card"
      >
        <div className="flex justify-center">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Zap className="w-6 h-6 text-primary" />
          </span>
        </div>
        <p className="font-semibold text-base">Promote your {cityName} services</p>
        <p className="text-sm text-muted-foreground">
          Get discovered by travellers actively planning a trip here.
        </p>
        <Button size="sm" asChild data-testid="btn-promote-services">
          <a href={`/expert/apply?${qs}&type=local_expert`}>Promote services →</a>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-dashed border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-6 text-center space-y-3"
      data-testid="expert-recruit-card"
    >
      <div className="flex justify-center">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40">
          <UserCheck className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </span>
      </div>
      <p className="font-semibold text-base">Become a local expert for {cityName}</p>
      <p className="text-sm text-muted-foreground">
        Share your local knowledge, earn from itinerary planning, and help travellers discover the city like a local.
      </p>
      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white border-none" asChild data-testid="btn-apply-expert">
        <a href={`/expert/apply?${qs}&type=local_expert`}>Apply to join →</a>
      </Button>
    </div>
  );
}

// ─── Provider Recruit Banner ──────────────────────────────────────────────────

function ProviderRecruitBanner({
  cityName, countryName, serviceCount, userRole,
}: {
  cityName: string;
  countryName?: string | null;
  serviceCount: number;
  userRole?: string | null;
}) {
  if (serviceCount >= 3) return null;

  const isSupply = SUPPLY_ROLES.includes(userRole ?? "");
  const qs = buildCityParams(cityName, countryName);

  if (isSupply) {
    return (
      <div
        className="mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
        data-testid="provider-promote-banner"
      >
        <Package className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm flex-1">
          <span className="font-medium">Promote your {cityName} services</span>
          {" — "}get discovered by travellers planning here.
        </p>
        <Button size="sm" variant="outline" className="flex-shrink-0 text-xs h-7 px-3" asChild data-testid="btn-promote-provider">
          <a href={`/provider/new-service?${qs}&prefill=true`}>Promote →</a>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-3"
      data-testid="provider-recruit-banner"
    >
      <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <p className="text-sm flex-1 text-muted-foreground">
        Are you a guide, driver, or photographer in <span className="font-medium text-foreground">{cityName}</span>?{" "}
        <span className="font-medium text-foreground">List your service free.</span>
      </p>
      <Button size="sm" variant="outline" className="flex-shrink-0 text-xs h-7 px-3" asChild data-testid="btn-list-service">
        <a href={`/provider/new-service?${qs}&prefill=true`}>Get listed →</a>
      </Button>
    </div>
  );
}

// ─── All Gems Feed ────────────────────────────────────────────────────────────

function AllGemsFeed({
  neighborhoods, gems, hotels, activities, experts, platformServices, events, cityName, countryName, activeFilter, onAdd, onRequestBooking,
}: {
  neighborhoods: Neighborhood[];
  gems: HiddenGem[];
  hotels: any[];
  activities: any[];
  experts: any[];
  platformServices: PlatformService[];
  events: any[];
  cityName: string;
  countryName?: string | null;
  activeFilter: FeedFilter;
  onAdd: (t: AddDialogTarget) => void;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const userRole = user?.role ?? null;

  // ── Flat filter mode ──────────────────────────────────────────────────────
  if (activeFilter !== "all") {
    if (activeFilter === "experts") {
      if (experts.length === 0) {
        return (
          <div className="py-8" data-testid="feed-empty-experts">
            <ExpertRecruitCard cityName={cityName} countryName={countryName} userRole={userRole} />
          </div>
        );
      }
      return (
        <div className="space-y-3" data-testid="feed-experts">
          {experts.map((exp, idx) => (
            <ExpertFeedCard key={exp.id ?? idx} expert={exp} cityName={cityName} />
          ))}
        </div>
      );
    }

    if (activeFilter === "events") {
      if (events.length === 0) {
        return (
          <div className="py-12 text-center text-sm text-muted-foreground" data-testid="feed-empty">
            <p>No upcoming events found in {cityName} right now.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              asChild
              data-testid="button-browse-events"
            >
              <a href={`/discover?tab=events&city=${encodeURIComponent(cityName)}`}>Browse all events</a>
            </Button>
          </div>
        );
      }
      return (
        <div className="rounded-xl border bg-card px-4 py-2" data-testid="feed-events">
          {events.map((ev: any, idx: number) => {
            const title = ev.title ?? ev.name ?? "Event";
            const venue = ev.venue ?? ev.venueName ?? ev.location ?? null;
            const rawDate = ev.startDate ?? ev.date ?? ev.startTime ?? null;
            const dateStr = rawDate
              ? (() => { try { return new Date(rawDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return null; } })()
              : null;
            const [day, month] = dateStr ? dateStr.split(" ") : [null, null];
            const ticketUrl = ev.url ?? ev.ticketUrl ?? ev.bookingUrl ?? null;
            const badge = detectBadge(ticketUrl);
            return (
              <div
                key={ev.id ?? idx}
                className="flex items-start gap-3 py-3 border-b last:border-b-0"
                data-testid={`event-row-${idx}`}
              >
                {dateStr ? (
                  <div className="flex-shrink-0 w-10 text-center rounded-lg bg-primary/10 px-1 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-primary leading-none">{month}</p>
                    <p className="text-base font-bold leading-none text-primary mt-0.5">{day}</p>
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-10 h-12 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold leading-snug" data-testid={`event-title-${idx}`}>{title}</p>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${badge.badgeClass}`}>
                      {badge.badgeText}
                    </span>
                  </div>
                  {venue && <p className="text-xs text-muted-foreground">{venue}</p>}
                </div>
                {badge.bookLabel && ticketUrl && (
                  badge.isPartner ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2.5 flex-shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50"
                      data-testid={`event-ticket-${idx}`}
                      onClick={() => onRequestBooking?.({
                        itemName: title,
                        partnerName: badge.partnerName || "Partner",
                        affiliateUrl: ticketUrl,
                        partnerCategory: "event",
                        itemDescription: venue ?? undefined,
                      })}
                    >
                      {badge.bookLabel}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs h-7 px-2.5 flex-shrink-0"
                      asChild
                      data-testid={`event-ticket-${idx}`}
                    >
                      <a href={ticketUrl} target="_blank" rel="noopener noreferrer">
                        <Ticket className="h-3 w-3 mr-1" />{badge.bookLabel}
                      </a>
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      );
    }

    const isStayFilter = activeFilter === "stay";
    const isPhotoFilter = activeFilter === "photo-spots";
    const isEatFilter = activeFilter === "eat";

    const flatGems = gems.filter(g => matchesFilter(g, activeFilter));
    const flatHotels = isStayFilter ? hotels : [];
    const flatActivities = !isStayFilter && !isPhotoFilter ? activities.filter(a => matchesFilter(a, activeFilter)) : [];

    // For stay filter: accommodation services render via HotelRow;
    // for all other filters: non-stay services render via ActivityRow.
    const flatServicesRaw = activeFilter !== "events" && activeFilter !== "experts"
      ? platformServices.filter(s => matchesServiceFilter(s, activeFilter))
      : [];
    const accommodationServiceTypes = ["accommodation", "hotel", "stay", "villa", "apartment", "hostel"];
    const isAccomSvc = (s: PlatformService) =>
      accommodationServiceTypes.some(t => (s.serviceType ?? "").toLowerCase().includes(t));
    const flatAccomServices = isStayFilter ? flatServicesRaw.filter(isAccomSvc) : [];
    const flatRowServices = isStayFilter
      ? flatServicesRaw.filter(s => !isAccomSvc(s))
      : flatServicesRaw;

    const hasAny = flatGems.length > 0 || flatHotels.length > 0 || flatActivities.length > 0 ||
      flatAccomServices.length > 0 || flatRowServices.length > 0;
    if (!hasAny) {
      return (
        <div className="py-12 text-center text-sm text-muted-foreground" data-testid="feed-empty">
          No {activeFilter} spots found in {cityName} yet.
        </div>
      );
    }

    // ── Editorial cross-link: find food-tour service for "eat" filter ──────────
    const foodTourService = isEatFilter
      ? platformServices.find(s => {
          const t = (s.serviceType ?? s.serviceName ?? s.shortDescription ?? "").toLowerCase();
          return t.includes("food tour") || t.includes("culinary tour") || t.includes("tasting") ||
                 t.includes("food walk") || t.includes("street food") || t.includes("cooking class");
        }) ?? null
      : null;
    const foodTourExpert = foodTourService ? experts[0] ?? null : null;

    return (
      <div data-testid="feed-flat" className="space-y-4">
        {/* Editorial row: food tours for "eat" filter */}
        {isEatFilter && foodTourService && (
          <ExpertTourRow
            service={foodTourService}
            expert={foodTourExpert ? {
              name: foodTourExpert.name ?? [foodTourExpert.firstName, foodTourExpert.lastName].filter(Boolean).join(" "),
              id: foodTourExpert.id,
            } : undefined}
            cityName={cityName}
          />
        )}

        {/* All DB hidden gems → GemCard bento grid */}
        {flatGems.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {flatGems.map((item, idx) => {
              const expertM = matchExpertToContent(experts, item.placeType);
              const curatedE = item.curatedByExpertId
                ? (() => { const e = experts.find((ex: any) => ex.id === item.curatedByExpertId); return e ? { name: e.name ?? [e.firstName, e.lastName].filter(Boolean).join(" "), id: e.id, specializations: e.specializations ?? null } : null; })()
                : null;
              return (
                <GemCard
                  key={item.id ?? idx}
                  item={item}
                  idx={idx}
                  onAdd={onAdd}
                  testPrefix={`flat-${activeFilter}-gem`}
                  onRequestBooking={onRequestBooking}
                  expertMatch={expertM}
                  curatedByExpert={curatedE}
                />
              );
            })}
          </div>
        )}
        {(flatActivities.length > 0 || flatRowServices.length > 0) && (
          <div className="rounded-xl border bg-card px-4 py-2">
            {flatActivities.map((item, idx) => {
              const expertM = matchExpertToContent(experts, item.placeType ?? item.type);
              return (
                <ActivityRow
                  key={(item as any).id ?? idx}
                  item={item}
                  idx={idx}
                  onAdd={onAdd}
                  testPrefix={`flat-${activeFilter}-act`}
                  onRequestBooking={onRequestBooking}
                  expertMatch={expertM}
                />
              );
            })}
            {flatRowServices.map((svc, idx) => (
              <ActivityRow
                key={svc.id ?? idx}
                item={{
                  placeName: svc.serviceName,
                  placeType: svc.serviceType ?? "service",
                  price: svc.price ?? null,
                  priceType: svc.priceType ?? null,
                  description: svc.shortDescription ?? svc.description,
                  imageUrl: svc.serviceImage,
                  bookingUrl: `/services/${svc.id}`,
                  bookingsCount: svc.bookingsCount ?? null,
                }}
                idx={idx}
                onAdd={onAdd}
                testPrefix={`flat-${activeFilter}-svc`}
                forceTraveloure
              />
            ))}
          </div>
        )}
        {/* Stay filter: AI hotels + accommodation platform services both via HotelRow */}
        {(flatHotels.length > 0 || flatAccomServices.length > 0) && (
          <div className="rounded-xl border bg-card px-4 py-2">
            {flatHotels.map((item, idx) => (
              <HotelRow key={item.id ?? idx} item={item} idx={idx} onAdd={onAdd} testPrefix={`flat-${activeFilter}-hotel`} onRequestBooking={onRequestBooking} />
            ))}
            {flatAccomServices.map((svc, idx) => (
              <HotelRow
                key={svc.id ?? idx}
                item={{
                  id: svc.id,
                  name: svc.serviceName,
                  address: svc.location ?? cityName,
                  starRating: null,
                  price: svc.price ?? null,
                  bookingUrl: `/services/${svc.id}`,
                  media: svc.serviceImage ? [{ url: svc.serviceImage }] : [],
                }}
                idx={idx}
                onAdd={onAdd}
                testPrefix={`flat-${activeFilter}-accom-svc`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Grouped mode — neighborhood containers ────────────────────────────────
  const neighborhoodSlugs = new Set(neighborhoods.map(n => n.slug));

  // Gems → group by neighborhood slug when set, else distribute proportionally (most DB gems have no slug)
  const gemsBySlug = new Map<string, HiddenGem[]>();
  const unassignedGems: HiddenGem[] = [];
  for (const gem of gems) {
    const slug = gem.neighborhood;
    if (slug && neighborhoodSlugs.has(slug)) {
      if (!gemsBySlug.has(slug)) gemsBySlug.set(slug, []);
      gemsBySlug.get(slug)!.push(gem);
    } else {
      unassignedGems.push(gem);
    }
  }
  // Spread unassigned gems proportionally across neighborhoods (cap at 6 per neighborhood for density)
  const gemsPerNeighborhood = neighborhoods.length > 0
    ? Math.min(6, Math.ceil(unassignedGems.length / neighborhoods.length))
    : 0;
  let gemOffset = 0;
  for (const n of neighborhoods) {
    const slice = unassignedGems.slice(gemOffset, gemOffset + gemsPerNeighborhood);
    if (slice.length > 0) {
      const existing = gemsBySlug.get(n.slug) ?? [];
      gemsBySlug.set(n.slug, [...existing, ...slice]);
    }
    gemOffset += gemsPerNeighborhood;
  }
  const elsewhereGems = unassignedGems.slice(gemOffset);

  // Platform services → group by neighborhood slug
  const servicesBySlug = new Map<string, PlatformService[]>();
  const elsewhereServices: PlatformService[] = [];
  for (const svc of platformServices) {
    const slug = svc.neighborhood;
    if (slug && neighborhoodSlugs.has(slug)) {
      if (!servicesBySlug.has(slug)) servicesBySlug.set(slug, []);
      servicesBySlug.get(slug)!.push(svc);
    } else {
      elsewhereServices.push(svc);
    }
  }

  // Distribute activities across neighborhoods proportionally; overflow → elsewhere
  const activitiesPerNeighborhood = neighborhoods.length > 0
    ? Math.ceil(activities.length / neighborhoods.length)
    : 0;
  const activitiesBySlug = new Map<string, any[]>();
  let activityOffset = 0;
  for (const n of neighborhoods) {
    const slice = activities.slice(activityOffset, activityOffset + activitiesPerNeighborhood);
    if (slice.length > 0) activitiesBySlug.set(n.slug, slice);
    activityOffset += activitiesPerNeighborhood;
  }
  const elsewhereActivities = activities.slice(activityOffset);

  // Hotels → round-robin across neighborhoods; remainder → elsewhere
  const hotelsPerNeighborhood = neighborhoods.length > 0 ? Math.ceil(hotels.length / neighborhoods.length) : 0;
  const hotelsBySlug = new Map<string, any[]>();
  let hotelOffset = 0;
  for (const n of neighborhoods) {
    const slice = hotels.slice(hotelOffset, hotelOffset + hotelsPerNeighborhood);
    if (slice.length > 0) hotelsBySlug.set(n.slug, slice);
    hotelOffset += hotelsPerNeighborhood;
  }
  const elsewhereHotels = hotels.slice(hotelOffset);

  const ordered = [
    ...neighborhoods.filter(n => n.isFeatured),
    ...neighborhoods.filter(n => !n.isFeatured),
  ];

  const hasNeighborhoodContent = ordered.some(n =>
    (gemsBySlug.get(n.slug)?.length ?? 0) > 0 ||
    (activitiesBySlug.get(n.slug)?.length ?? 0) > 0 ||
    (hotelsBySlug.get(n.slug)?.length ?? 0) > 0 ||
    (servicesBySlug.get(n.slug)?.length ?? 0) > 0
  );
  const hasElsewhere = elsewhereGems.length > 0 || elsewhereHotels.length > 0 ||
    elsewhereActivities.length > 0 || elsewhereServices.length > 0;

  if (!hasNeighborhoodContent && !hasElsewhere) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground" data-testid="feed-empty">
        Content for {cityName} is being gathered — check back soon.
      </div>
    );
  }

  // Separate platform services used for "Complete Your Trip" strip
  // (logistics-type: transport, insurance, connectivity, kimono, luggage)
  const tripComplements = platformServices.filter(s => {
    const t = (s.serviceType ?? s.serviceName ?? "").toLowerCase();
    return t.includes("transfer") || t.includes("transport") || t.includes("insurance") ||
           t.includes("esim") || t.includes("sim") || t.includes("luggage") || t.includes("storage") ||
           t.includes("kimono") || t.includes("rental") || t.includes("connectivity");
  });

  return (
    <div className="space-y-6" data-testid="feed-grouped">
      {/* Neighborhood containers with expert cards injected between them */}
      {ordered.map((n, nIdx) => (
        <div key={n.id}>
          <NeighborhoodContainer
            neighborhood={n}
            gems={gemsBySlug.get(n.slug) ?? []}
            hotels={hotelsBySlug.get(n.slug) ?? []}
            activities={activitiesBySlug.get(n.slug) ?? []}
            services={servicesBySlug.get(n.slug) ?? []}
            cityName={cityName}
            onAdd={onAdd}
            hueIdx={nIdx}
            onRequestBooking={onRequestBooking}
            experts={experts}
          />
          {/* Expert card between every other neighborhood container */}
          {experts.length > 0 && nIdx % 2 === 0 && nIdx < ordered.length - 1 && (
            <div className="mt-6">
              <ExpertFeedCard expert={experts[(nIdx / 2) % experts.length]} cityName={cityName} />
            </div>
          )}
        </div>
      ))}

      {/* "ACROSS {city}" section — gems not tied to any neighborhood */}
      {hasElsewhere && (() => {
        const elsewhereCardActs = elsewhereActivities.filter(a => !!(a.imageUrl ?? a.media?.[0]?.url) || !!a.bookingUrl || !!a.price);
        const elsewhereTextActs = elsewhereActivities.filter(a => !(a.imageUrl ?? a.media?.[0]?.url) && !a.bookingUrl && !a.price);
        const hasElsewhereGrid = elsewhereGems.length > 0 || elsewhereHotels.length > 0 || elsewhereCardActs.length > 0;
        return (
          <div data-testid="elsewhere-section">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                ACROSS {cityName.toUpperCase()} · not tied to one neighborhood
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {hasElsewhereGrid && (
              <div className="grid grid-cols-2 gap-3">
                {elsewhereGems.map((gem, idx) => {
                  const curatedE = gem.curatedByExpertId
                    ? (() => { const e = experts.find((ex: any) => ex.id === gem.curatedByExpertId); return e ? { name: e.name ?? [e.firstName, e.lastName].filter(Boolean).join(" "), id: e.id, specializations: e.specializations ?? null } : null; })()
                    : null;
                  return (
                    <GemCard key={gem.id ?? idx} item={gem} idx={idx} onAdd={onAdd} testPrefix="across-gem"
                      onRequestBooking={onRequestBooking}
                      expertMatch={matchExpertToContent(experts, gem.placeType)}
                      curatedByExpert={curatedE}
                    />
                  );
                })}
                {elsewhereCardActs.map((act, idx) => (
                  <GemCard key={act.id ?? `eca-${idx}`} item={act} idx={idx} onAdd={onAdd} testPrefix="across-act"
                    onRequestBooking={onRequestBooking}
                    expertMatch={matchExpertToContent(experts, act.placeType ?? act.type)}
                  />
                ))}
                {elsewhereHotels.map((hotel, idx) => (
                  <HotelMiniCard key={hotel.id ?? idx} item={hotel} idx={idx} onAdd={onAdd} testPrefix="across-hotel" onRequestBooking={onRequestBooking} cityName={cityName} />
                ))}
              </div>
            )}

            {elsewhereTextActs.length > 0 && (
              <div className={`rounded-xl border bg-card px-4 py-2${hasElsewhereGrid ? " mt-3" : ""}`}>
                {elsewhereTextActs.map((act, idx) => (
                  <ActivityRow key={act.id ?? idx} item={act} idx={idx} onAdd={onAdd} testPrefix="across-act-row"
                    onRequestBooking={onRequestBooking}
                    expertMatch={matchExpertToContent(experts, act.placeType ?? act.type)}
                  />
                ))}
              </div>
            )}

            {/* Expert card at the bottom of the "Across" section */}
            {experts.length > 0 && ordered.length % 2 === 0 && (
              <div className="mt-3">
                <ExpertFeedCard expert={experts[0]} cityName={cityName} />
              </div>
            )}
          </div>
        );
      })()}

      {/* "COMPLETE YOUR TRIP" — compact horizontal logistics strip */}
      {tripComplements.length > 0 && (
        <div data-testid="complete-trip-section">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              COMPLETE YOUR {cityName.toUpperCase()} TRIP · complements any itinerary
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="flex gap-3 flex-wrap">
            {tripComplements.map((svc, idx) => {
              const price = formatServicePrice(svc.price, svc.priceType);
              return (
                <div
                  key={svc.id ?? idx}
                  className="flex-1 min-w-[168px] max-w-[220px] rounded-xl border bg-card p-3"
                  data-testid={`complement-card-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] flex-shrink-0">
                      {(svc.serviceType ?? "").toLowerCase().includes("transfer") ? "🚖"
                        : (svc.serviceType ?? "").toLowerCase().includes("insurance") ? "🛡️"
                        : (svc.serviceType ?? "").toLowerCase().includes("esim") || (svc.serviceType ?? "").toLowerCase().includes("sim") ? "📶"
                        : (svc.serviceType ?? "").toLowerCase().includes("kimono") ? "👘"
                        : (svc.serviceType ?? "").toLowerCase().includes("luggage") ? "🧳"
                        : "✈️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug line-clamp-1">{svc.serviceName}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{svc.serviceType ?? "Service"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {price && <span className="text-sm font-bold">{price}</span>}
                    <Button size="sm" className="text-[10px] h-6 px-2 ml-auto" asChild data-testid={`complement-book-${idx}`}>
                      <a href={`/services/${svc.id}`}>Book</a>
                    </Button>
                    <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
                      onClick={() => onAdd({ name: svc.serviceName, type: svc.serviceType ?? "service" })}
                      data-testid={`complement-add-${idx}`}>
                      + Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider recruitment banner — shown when city has fewer than 3 platform services */}
      <ProviderRecruitBanner cityName={cityName} countryName={countryName} serviceCount={platformServices.length} userRole={userRole} />
    </div>
  );
}

// ─── Location Feed Map ────────────────────────────────────────────────────────

type ViewMode = "list" | "map";

interface MapItem {
  id: string;
  name: string;
  category: "gem" | "hotel" | "activity" | "service";
  placeType?: string | null;
  lat: number;
  lng: number;
  price?: string | null;
  imageUrl?: string | null;
  bookingUrl?: string | null;
}

function extractLatLng(item: any): { lat: number; lng: number } | null {
  if (typeof item.lat === "number" && typeof item.lng === "number") return { lat: item.lat, lng: item.lng };
  if (item.geoCode?.latitude != null && item.geoCode?.longitude != null)
    return { lat: Number(item.geoCode.latitude), lng: Number(item.geoCode.longitude) };
  if (typeof item.latitude === "number" && typeof item.longitude === "number")
    return { lat: item.latitude, lng: item.longitude };
  return null;
}

const PIN_COLORS: Record<MapItem["category"], string> = {
  gem: "#22C55E",
  hotel: "#3B82F6",
  activity: "#F59E0B",
  service: "#8B5CF6",
};

function makePinSvg(color: string): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="white"/></svg>`
    )
  );
}

function LocationFeedMapContent({
  items,
  cityCenter,
  onAdd,
  onRequestBooking,
}: {
  items: MapItem[];
  cityCenter: { lat: number; lng: number };
  onAdd: (t: AddDialogTarget) => void;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
}) {
  const [selected, setSelected] = useState<MapItem | null>(null);

  return (
    <GMap
      defaultCenter={cityCenter}
      defaultZoom={13}
      gestureHandling="greedy"
      disableDefaultUI={false}
      zoomControl={true}
      fullscreenControl={true}
      mapTypeControl={false}
      streetViewControl={false}
      className="w-full h-full"
      style={{ width: "100%", height: "100%" }}
    >
      {items.map((item) => (
        <Marker
          key={`${item.category}-${item.id}`}
          position={{ lat: item.lat, lng: item.lng }}
          onClick={() => setSelected(item)}
          icon={{ url: makePinSvg(PIN_COLORS[item.category]) } as any}
        />
      ))}

      {selected && (
        <InfoWindow
          position={{ lat: selected.lat, lng: selected.lng }}
          onCloseClick={() => setSelected(null)}
        >
          <div className="p-1 max-w-[220px] font-sans">
            <div className="flex items-start gap-1.5 mb-1.5">
              <span className="font-semibold text-[13px] leading-tight flex-1">{selected.name}</span>
              <span
                className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 flex-shrink-0 text-white"
                style={{ backgroundColor: PIN_COLORS[selected.category] }}
              >
                {selected.category === "gem" ? "GEM" :
                 selected.category === "hotel" ? "STAY" :
                 selected.category === "activity" ? "DO" : "SERVICE"}
              </span>
            </div>
            {selected.placeType && (
              <p className="text-[11px] text-gray-500 mb-1 capitalize">{selected.placeType.replace(/_/g, " ")}</p>
            )}
            {selected.price && (
              <p className="text-[11px] font-medium text-gray-700 mb-2">{selected.price}</p>
            )}
            <div className="flex gap-1.5 flex-wrap">
              <button
                className="text-[11px] font-medium px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors"
                onClick={() => {
                  setSelected(null);
                  onAdd({ name: selected.name, type: selected.placeType ?? selected.category, imageUrl: selected.imageUrl ?? undefined });
                }}
                data-testid={`map-pin-add-${selected.id}`}
              >
                + Add to trip
              </button>
              {selected.bookingUrl && onRequestBooking && (
                <button
                  className="text-[11px] font-medium px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setSelected(null);
                    onRequestBooking({ name: selected.name, type: selected.placeType ?? selected.category, bookingUrl: selected.bookingUrl! });
                  }}
                  data-testid={`map-pin-book-${selected.id}`}
                >
                  Book
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </GMap>
  );
}

function LocationFeedMap({
  gems,
  hotels,
  activities,
  platformServices,
  cityName,
  activeFilter,
  onAdd,
  onRequestBooking,
}: {
  gems: HiddenGem[];
  hotels: any[];
  activities: any[];
  platformServices: PlatformService[];
  cityName: string;
  activeFilter: FeedFilter;
  onAdd: (t: AddDialogTarget) => void;
  onRequestBooking?: (target: AffiliateBookingTarget) => void;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [neighborhoodCoords, setNeighborhoodCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [cityCenter, setCityCenter] = useState<{ lat: number; lng: number } | null>(null);

  const uniqueNeighborhoods = useMemo(() => {
    const slugs = new Set<string>();
    gems.forEach(g => { if (g.neighborhood) slugs.add(g.neighborhood); });
    platformServices.forEach(s => { if (s.neighborhood) slugs.add(s.neighborhood); });
    return Array.from(slugs);
  }, [gems, platformServices]);

  useEffect(() => {
    if (!apiKey || !cityName) return;
    fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityName)}&key=${apiKey}`
    )
      .then(r => r.json())
      .then(json => {
        const loc = json.results?.[0]?.geometry?.location;
        if (loc) setCityCenter({ lat: loc.lat, lng: loc.lng });
      })
      .catch(() => {});
  }, [cityName, apiKey]);

  useEffect(() => {
    if (!apiKey || uniqueNeighborhoods.length === 0) return;
    const unresolved = uniqueNeighborhoods.filter(n => !neighborhoodCoords.has(n));
    if (unresolved.length === 0) return;
    Promise.all(
      unresolved.map(async (neighborhood) => {
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(neighborhood + ", " + cityName)}&key=${apiKey}`
          );
          const json = await res.json();
          const loc = json.results?.[0]?.geometry?.location;
          if (loc) return { neighborhood, lat: loc.lat as number, lng: loc.lng as number };
        } catch {}
        return null;
      })
    ).then(results => {
      setNeighborhoodCoords(prev => {
        const next = new Map(prev);
        results.forEach(r => { if (r) next.set(r.neighborhood, { lat: r.lat, lng: r.lng }); });
        return next;
      });
    });
  }, [uniqueNeighborhoods.join(","), cityName, apiKey]);

  const mapItems = useMemo((): MapItem[] => {
    const items: MapItem[] = [];

    const filteredGems = activeFilter === "all" ? gems : gems.filter(g => matchesFilter(g, activeFilter));
    for (const gem of filteredGems) {
      const coords = gem.neighborhood ? neighborhoodCoords.get(gem.neighborhood) : null;
      if (coords) {
        const jitter = (Math.random() - 0.5) * 0.003;
        items.push({
          id: gem.id,
          name: gem.placeName,
          category: "gem",
          placeType: gem.placeType,
          lat: coords.lat + jitter,
          lng: coords.lng + jitter,
          price: gem.priceRange ?? null,
          imageUrl: gem.imageUrl ?? null,
        });
      }
    }

    const showHotels = activeFilter === "all" || activeFilter === "stay";
    if (showHotels) {
      for (const hotel of hotels) {
        const coords = extractLatLng(hotel);
        if (coords) {
          items.push({
            id: hotel.id ?? hotel.hotelId ?? String(Math.random()),
            name: hotel.name ?? hotel.placeName ?? "Hotel",
            category: "hotel",
            placeType: "hotel",
            lat: coords.lat,
            lng: coords.lng,
            price: hotel.price ?? (hotel.offers?.[0]?.price?.total ? `$${hotel.offers[0].price.total}` : null),
            imageUrl: hotel.media?.[0]?.url ?? null,
            bookingUrl: hotel.bookingUrl ?? null,
          });
        }
      }
    }

    const filteredActivities = activeFilter === "all" ? activities : activities.filter(a => matchesFilter(a, activeFilter));
    for (const act of filteredActivities) {
      const coords = extractLatLng(act);
      if (coords) {
        items.push({
          id: act.id ?? String(Math.random()),
          name: act.placeName ?? act.name ?? act.title ?? "Activity",
          category: "activity",
          placeType: act.placeType ?? act.type ?? null,
          lat: coords.lat,
          lng: coords.lng,
          price: act.price ?? null,
          imageUrl: act.imageUrl ?? act.media?.[0]?.url ?? null,
          bookingUrl: act.bookingUrl ?? null,
        });
      }
    }

    if (activeFilter === "all" || activeFilter !== "experts") {
      const filteredServices = platformServices.filter(s => matchesServiceFilter(s, activeFilter));
      for (const svc of filteredServices) {
        const coords = svc.neighborhood ? neighborhoodCoords.get(svc.neighborhood) : null;
        if (coords) {
          const jitter = (Math.random() - 0.5) * 0.003;
          items.push({
            id: svc.id,
            name: svc.serviceName,
            category: "service",
            placeType: svc.serviceType ?? null,
            lat: coords.lat + jitter,
            lng: coords.lng + jitter,
            price: svc.price ?? null,
            imageUrl: svc.serviceImage ?? null,
            bookingUrl: `/services/${svc.id}`,
          });
        }
      }
    }

    return items;
  }, [gems, hotels, activities, platformServices, activeFilter, neighborhoodCoords]);

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center bg-muted rounded-xl h-[60vh]">
        <div className="text-center p-6">
          <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Map unavailable</p>
          <p className="text-sm text-muted-foreground">Google Maps API key not configured</p>
        </div>
      </div>
    );
  }

  const center = cityCenter ?? { lat: 35.6762, lng: 139.6503 };

  return (
    <div className="relative rounded-xl overflow-hidden border h-[60vh] md:h-[calc(100vh-180px)]" data-testid="location-feed-map">
      <APIProvider apiKey={apiKey}>
        <LocationFeedMapContent
          items={mapItems}
          cityCenter={center}
          onAdd={onAdd}
          onRequestBooking={onRequestBooking}
        />
      </APIProvider>
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-lg shadow px-2.5 py-1.5 text-xs font-medium flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          {mapItems.length} place{mapItems.length !== 1 ? "s" : ""}
        </div>
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-lg shadow px-2 py-1.5 flex flex-wrap gap-1.5">
          {(["gem", "hotel", "activity", "service"] as MapItem["category"][]).map(cat => {
            const count = mapItems.filter(i => i.category === cat).length;
            if (count === 0) return null;
            return (
              <span key={cat} className="text-[10px] font-semibold flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: PIN_COLORS[cat] }} />
                {count} {cat === "gem" ? "gems" : cat === "hotel" ? "stays" : cat === "activity" ? "activities" : "services"}
              </span>
            );
          })}
        </div>
      </div>
      {!cityCenter && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur rounded-lg shadow px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading map…
        </div>
      )}
    </div>
  );
}

// ─── Active Explore Spine ─────────────────────────────────────────────────────

const SPINE_FILTERS: {
  label: string;
  value: FeedFilter;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { label: "All gems", value: "all", Icon: Sparkles },
  { label: "Eat", value: "eat", Icon: Utensils },
  { label: "Do", value: "do", Icon: Compass },
  { label: "Stay", value: "stay", Icon: Hotel },
  { label: "Experts", value: "experts", Icon: UserCheck },
  { label: "Events", value: "events", Icon: Ticket },
  { label: "Photo spots", value: "photo-spots", Icon: Camera },
];

function ExploreSpine({
  active, onChange, counts, viewMode, onViewModeChange,
}: {
  active: FeedFilter;
  onChange: (f: FeedFilter) => void;
  counts?: Partial<Record<FeedFilter, number>>;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}) {
  return (
    <nav
      className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b"
      data-testid="explore-spine"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 min-w-0">
          {SPINE_FILTERS.map(({ label, value, Icon }) => {
            const count = value !== "all" ? (counts?.[value] ?? 0) : null;
            const isActive = active === value;
            return (
              <button
                key={value}
                onClick={() => onChange(value)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border
                  ${isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                data-testid={`spine-chip-${value}`}
              >
                <Icon className="h-3 w-3" />
                {label}
                {count !== null && count > 0 && (
                  <span
                    className={`text-[10px] font-semibold rounded-full px-1.5 min-w-[16px] text-center leading-4 ${
                      isActive ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`spine-count-${value}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-shrink-0 flex items-center gap-0 rounded-full border overflow-hidden bg-background ml-1">
          <button
            onClick={() => onViewModeChange("list")}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "list"
                ? "bg-primary text-white"
                : "text-foreground hover:bg-muted"
            }`}
            data-testid="toggle-view-list"
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
          <button
            onClick={() => onViewModeChange("map")}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "map"
                ? "bg-primary text-white"
                : "text-foreground hover:bg-muted"
            }`}
            data-testid="toggle-view-map"
            aria-label="Map view"
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Map</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

// ─── §7 Media Gallery — preserved verbatim from CityDetailView ────────────────

function MediaGallery({ cityName, mediaData }: { cityName: string; mediaData?: CityMediaResponse }) {
  if (!mediaData || (mediaData.gallery.length === 0 && mediaData.videos.length === 0)) {
    return (
      <Card className="p-8 text-center" data-testid="card-no-media">
        <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No media available yet for {cityName}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Photos and videos will appear when AI intelligence is refreshed
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {mediaData.videos.length > 0 && (
        <div data-testid="videos-section">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />Destination Videos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mediaData.videos.map((video, idx) => (
              <Card key={video.id} className="overflow-hidden" data-testid={`video-card-${idx}`}>
                <div className="relative aspect-video bg-muted">
                  <video
                    src={video.url}
                    poster={video.thumbnailUrl ?? video.previewUrl ?? undefined}
                    controls
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>by {video.photographerName}</span>
                    <a
                      href={video.sourceUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {video.sourceName}<ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {mediaData.gallery.length > 0 && (
        <div data-testid="gallery-section">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />Photo Gallery
            {mediaData.gallery.some(m => m.source === "google_places") && (
              <span className="text-xs text-muted-foreground ml-auto">Powered by Google</span>
            )}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {mediaData.gallery.map((photo, idx) => (
              <Card key={photo.id} className="overflow-hidden group" data-testid={`photo-card-${idx}`}>
                <div className="relative aspect-[4/3] bg-muted">
                  <img
                    src={photo.thumbnailUrl ?? photo.url}
                    alt={photo.attractionName ?? `${cityName} photo`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {photo.isPrimary && (
                    <Badge className="absolute top-2 left-2 bg-primary/90 text-white text-[10px]">
                      <Star className="h-2.5 w-2.5 mr-0.5" />Featured
                    </Badge>
                  )}
                  {photo.source === "google_places" && (
                    <Badge className="absolute top-2 right-2 bg-white/90 text-gray-700 text-[10px]">
                      Google
                    </Badge>
                  )}
                  {photo.attractionName && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-xs text-white truncate">{photo.attractionName}</p>
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{photo.photographerName}</span>
                    <a
                      href={photo.sourceUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5 flex-shrink-0"
                    >
                      {photo.sourceName}<ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  {photo.source === "google_places" && photo.htmlAttributions?.length && (
                    <div
                      className="text-[10px] text-muted-foreground truncate mt-0.5"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(photo.htmlAttributions.join(" "), {
                          ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href"],
                        }),
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {Object.keys(mediaData.byAttraction).length > 0 && (
        <div data-testid="attractions-media-section">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />Photos by Attraction
            <span className="text-xs text-muted-foreground ml-auto">Powered by Google</span>
          </h3>
          <div className="space-y-4">
            {Object.entries(mediaData.byAttraction).map(([attractionName, photos]) => (
              <div key={attractionName}>
                <h4 className="text-sm font-medium mb-2">{attractionName}</h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo, idx) => (
                    <div key={photo.id} className="flex-shrink-0" data-testid={`attraction-photo-${attractionName}-${idx}`}>
                      <div className="w-40 aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                        <img
                          src={photo.thumbnailUrl ?? photo.url}
                          alt={attractionName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {photo.htmlAttributions?.length && (
                        <div
                          className="text-[10px] text-muted-foreground mt-1 max-w-40 truncate"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(photo.htmlAttributions.join(" "), {
                              ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href"],
                            }),
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-2">
        Photos and videos provided by Unsplash, Pexels, and Google Places.
      </p>
    </div>
  );
}

// ─── §8 AI Insights — all 9 subcards preserved verbatim ──────────────────────

function InsightsSection({ city }: { city: any }) {
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const ratingColors: Record<string, string> = {
    excellent: "bg-green-100 dark:bg-green-900/30 border-green-300",
    good: "bg-blue-100 dark:bg-blue-900/30 border-blue-300",
    average: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300",
    poor: "bg-red-100 dark:bg-red-900/30 border-red-300",
  };

  if (!city || (!city.aiGeneratedAt && !city.aiBestTimeToVisit)) {
    return (
      <Card className="p-8 text-center">
        <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          AI insights are being generated{city?.cityName ? ` for ${city.cityName}` : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Check back soon for personalised travel intelligence
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card data-testid="card-best-time">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />Best Time to Visit
            </CardTitle>
            {city.aiGeneratedAt && (
              <p className="text-xs text-muted-foreground">
                Updated {formatDistanceToNow(new Date(city.aiGeneratedAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{city.aiBestTimeToVisit ?? "Year-round destination"}</p>
        </CardContent>
      </Card>

      {city.aiOptimalDuration && (
        <Card data-testid="card-optimal-duration">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Compass className="h-4 w-4" />Recommended Duration
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm">{city.aiOptimalDuration}</p></CardContent>
        </Card>
      )}

      {city.aiBudgetEstimate && (
        <Card data-testid="card-budget-estimate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4" />Daily Budget Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {city.aiBudgetEstimate.budget ?? "–"}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Mid-Range</p>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {city.aiBudgetEstimate.midRange ?? "–"}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Luxury</p>
                <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  {city.aiBudgetEstimate.luxury ?? "–"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {city.aiMustSeeAttractions?.length > 0 && (
        <Card data-testid="card-must-see">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4" />Must-See Attractions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {city.aiMustSeeAttractions.map((a: string, i: number) => (
                <Badge key={i} variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
                  <MapPin className="h-3 w-3 mr-1" />{a}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {city.aiTravelTips?.length > 0 && (
        <Card data-testid="card-travel-tips">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />Local Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {city.aiTravelTips.map((tip: string, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-0.5">–</span>{tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {city.aiLocalInsights && (
        <Card data-testid="card-local-insights">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4" />Cultural Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{city.aiLocalInsights}</p>
          </CardContent>
        </Card>
      )}

      {city.aiSafetyNotes && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20" data-testid="card-safety-notes">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />Safety Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{city.aiSafetyNotes}</p>
          </CardContent>
        </Card>
      )}

      {city.aiSeasonalHighlights?.length > 0 && (
        <Card data-testid="card-seasonal-guide">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sun className="h-4 w-4" />Seasonal Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {city.aiSeasonalHighlights.map((month: any, idx: number) => {
                  const names = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
                  const monthNum =
                    typeof month.month === "number"
                      ? month.month
                      : (names.findIndex((n: string) => String(month.month).toLowerCase().startsWith(n)) + 1) || 1;
                  const r = month.rating;
                  const rating =
                    typeof r === "string" ? r : r >= 9 ? "excellent" : r >= 7 ? "good" : r >= 5 ? "average" : "poor";
                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg border ${ratingColors[rating] ?? "bg-muted"}`}
                      data-testid={`month-${monthNum}`}
                    >
                      <p className="text-xs font-medium">{monthNames[monthNum - 1]}</p>
                      <p className="text-xs text-muted-foreground truncate" title={month.highlight}>
                        {month.highlight}
                      </p>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {city.aiAvoidDates?.length > 0 && (
        <Card className="bg-red-50 dark:bg-red-900/20" data-testid="card-avoid-dates">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarX className="h-4 w-4 text-red-600" />Dates to Avoid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {city.aiAvoidDates.map((avoid: any, idx: number) => (
                <li key={idx} className="text-sm" data-testid={`avoid-date-${idx}`}>
                  <span className="font-medium text-red-600 dark:text-red-400">{avoid.dateRange}</span>
                  <span className="text-muted-foreground"> — {avoid.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── AddItemDialog (Phase C — preserved) ─────────────────────────────────────

function AddItemDialog({
  target, open, onOpenChange,
}: {
  target: AddDialogTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: trips, isLoading: tripsLoading } = useQuery<any[]>({
    queryKey: ["/api/my-trips"],
    enabled: open && !!user,
  });
  const { data: experiences, isLoading: expLoading } = useQuery<any[]>({
    queryKey: ["/api/user-experiences"],
    enabled: open && !!user,
  });

  const addToTripMutation = useMutation({
    mutationFn: async (tripId: string) =>
      apiRequest(`/api/trips/${tripId}/itinerary-items`, {
        method: "POST",
        body: JSON.stringify({
          title: target?.name,
          type: target?.type || "activity",
          description: target?.description,
          imageUrl: target?.imageUrl,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Added to trip", description: `${target?.name} added.` });
      queryClient.invalidateQueries({ queryKey: ["/api/my-trips"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Could not add to trip", variant: "destructive" }),
  });

  const addToExpMutation = useMutation({
    mutationFn: async (expId: string) =>
      apiRequest(`/api/user-experiences/${expId}/items`, {
        method: "POST",
        body: JSON.stringify({
          title: target?.name,
          itemType: target?.type || "activity",
          description: target?.description,
          imageUrl: target?.imageUrl,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Added to experience", description: `${target?.name} added.` });
      queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Could not add to experience", variant: "destructive" }),
  });

  if (!user) return null;

  const activeTrips = trips?.filter((t: any) =>
    ["planning", "draft", "confirmed"].includes(t.status)
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-item">
        <DialogHeader>
          <DialogTitle>Add to a Trip or Experience</DialogTitle>
          <DialogDescription>
            Choose where to add <strong>{target?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              My Trips
            </p>
            {tripsLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : !activeTrips.length ? (
              <p className="text-sm text-muted-foreground">
                No active trips.{" "}
                <button
                  className="text-primary underline"
                  onClick={() => { onOpenChange(false); navigate("/create-trip"); }}
                >
                  Create one
                </button>
              </p>
            ) : (
              <div className="space-y-2">
                {activeTrips.map((trip: any) => (
                  <button
                    key={trip.id}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                    onClick={() => addToTripMutation.mutate(trip.id)}
                    disabled={addToTripMutation.isPending}
                    data-testid={`button-add-to-trip-${trip.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{trip.title}</p>
                      <p className="text-xs text-muted-foreground">{trip.destination}</p>
                    </div>
                    {addToTripMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Plus className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              My Experiences
            </p>
            {expLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : !experiences?.length ? (
              <p className="text-sm text-muted-foreground">No experience templates yet.</p>
            ) : (
              <div className="space-y-2">
                {experiences.map((exp: any) => (
                  <button
                    key={exp.id}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors text-left"
                    onClick={() => addToExpMutation.mutate(exp.id)}
                    disabled={addToExpMutation.isPending}
                    data-testid={`button-add-to-exp-${exp.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{exp.title || exp.name || "Experience"}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {exp.experienceType || exp.type || "Experience template"}
                      </p>
                    </div>
                    {addToExpMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Package className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── PlanningSticky ───────────────────────────────────────────────────────────
// Appears after 300px scroll; hidden once user has a trip for this city.

function PlanningSticky({ city, userTrips }: { city: string; userTrips: any[] | null | undefined }) {
  const [visible, setVisible] = useState(false);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const ACTIVE_STATUSES = ["draft", "planning", "confirmed", "active", "in_progress"];
  const hasCityTrip = (userTrips ?? []).some(
    (t: any) =>
      ACTIVE_STATUSES.includes(t.status) &&
      (t.destination ?? "").toLowerCase().includes(city.toLowerCase()),
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() + 14);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const res = await apiRequest("POST", "/api/trips", {
        destination: city,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        title: `My trip to ${city}`,
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      navigate(`/trip/${data.id}`);
    },
    onError: () => {
      toast({ title: "Sign in required", description: "Please sign in to start planning.", variant: "destructive" });
    },
  });

  if (!visible || hasCityTrip) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center gap-3 bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-full px-5 py-3 max-w-sm w-full"
        data-testid="planning-sticky-bar"
      >
        <p className="flex-1 text-sm font-medium truncate text-gray-700">
          Inspired by {city}?
        </p>
        <Button
          size="sm"
          className="flex-shrink-0 rounded-full text-white text-xs px-4"
          style={{ background: "#FF385C" }}
          onClick={() => {
            if (!user) {
              toast({ title: "Sign in to plan", description: "Create an account to start your trip." });
              return;
            }
            createMutation.mutate();
          }}
          disabled={createMutation.isPending}
          data-testid="button-plan-my-trip"
        >
          {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Plan my trip to {city}
        </Button>
      </div>
    </div>
  );
}

export default function DiscoverLocationPage() {
  const rawParams = useParams<{ city: string }>();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const country = urlParams.get("country");
  const neighborhoodSlug = urlParams.get("neighborhood");
  const city = decodeURIComponent(rawParams?.city ?? "");

  const { user } = useAuth();

  const [addDialog, setAddDialog] = useState<AddDialogTarget | null>(null);
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [requestingItem, setRequestingItem] = useState<AffiliateBookingTarget | null>(null);
  const [addToExperienceOpen, setAddToExperienceOpen] = useState(false);
  const [addToExperienceItem, setAddToExperienceItem] = useState<any>(null);
  const trackedRef = useRef<Set<string>>(new Set());
  const listScrollRef = useRef<number>(0);

  // Saved items (wishlist) — scoped to the logged-in user
  const { data: savedItemsData } = useQuery<any[]>({
    queryKey: ["/api/saved-items"],
    enabled: !!user,
  });

  const savedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of savedItemsData ?? []) {
      map.set(item.contentId, item.id);
    }
    return map;
  }, [savedItemsData]);

  const saveItemMutation = useMutation({
    mutationFn: async (item: { contentId: string; contentName: string; contentType: string; contentImage?: string | null; city?: string }) => {
      const res = await apiRequest("POST", "/api/saved-items", { ...item, city: item.city ?? city });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/saved-items"] }),
  });

  const unsaveItemMutation = useMutation({
    mutationFn: async (savedItemId: string) => {
      await apiRequest("DELETE", `/api/saved-items/${savedItemId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/saved-items"] }),
  });

  const savedItemsCtxValue = useMemo(() => ({
    savedMap,
    onSave: (item: any) => saveItemMutation.mutate(item),
    onUnsave: (id: string) => unsaveItemMutation.mutate(id),
    isAuth: !!user,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [savedMap, user]);

  // User trips — for sticky bar city-match check
  const { data: userTripsData } = useQuery<any[]>({
    queryKey: ["/api/trips"],
    enabled: !!user,
  });

  // Main orchestrator query — 20s client-side timeout so the skeleton never hangs forever
  const { data, isLoading, error } = useQuery<LocationViewPayload>({
    queryKey: ["/api/discover/location", city, country],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const combined = signal
        ? (() => { signal.addEventListener("abort", () => controller.abort()); return controller.signal; })()
        : controller.signal;
      try {
        const res = await fetch(
          `/api/discover/location/${encodeURIComponent(city)}${qs.toString() ? `?${qs}` : ""}`,
          { signal: combined },
        );
        if (!res.ok) throw new Error(`Location view: ${res.status}`);
        return res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !!city,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Media fires in parallel — country from URL search params, no wait on hero
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", city, country],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      const res = await fetch(`/api/travelpulse/media/${encodeURIComponent(city)}?${qs}`);
      if (!res.ok) throw new Error("Media fetch failed");
      return res.json();
    },
    enabled: !!city,
    staleTime: 10 * 60 * 1000,
  });

  // Scroll to neighborhood container when ?neighborhood=<slug> is in the URL
  useEffect(() => {
    if (!neighborhoodSlug || isLoading) return;
    const el = document.querySelector(`[data-testid="neighborhood-container-${neighborhoodSlug}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [neighborhoodSlug, isLoading]);

  // Unsplash download tracking (API compliance)
  useEffect(() => {
    if (!mediaData) return;
    const unsplash = [
      ...(mediaData.hero?.source === "unsplash" && mediaData.hero.downloadLocationUrl
        ? [mediaData.hero]
        : []),
      ...mediaData.gallery.filter(m => m.source === "unsplash" && m.downloadLocationUrl),
    ];
    unsplash.forEach(m => {
      if (m.downloadLocationUrl && !trackedRef.current.has(m.downloadLocationUrl)) {
        trackedRef.current.add(m.downloadLocationUrl);
        fetch("/api/travelpulse/media/track-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadLocationUrl: m.downloadLocationUrl }),
        }).catch(() => {});
      }
    });
  }, [mediaData]);

  const hero = data?.hero?.data;
  const cityData = hero?.city;
  const happeningNow: any[] = hero?.happeningNow ?? [];
  // DB-sourced gems — all categories, all neighborhoods; hero.hiddenGems intentionally not used
  const hiddenGems: HiddenGem[] = data?.gems?.data ?? [];
  const platformServices: PlatformService[] = data?.services?.data ?? [];
  const neighborhoods: Neighborhood[] = data?.neighborhoods?.data ?? [];
  const hotels: any[] = data?.recommendations?.data?.hotels ?? [];
  const activities: any[] = data?.recommendations?.data?.activities ?? [];
  const experts: any[] = data?.recommendations?.data?.experts ?? [];
  const events: any[] = data?.events?.data?.events ?? [];

  // Per-filter counts for ExploreSpine badges
  const filterCounts = useMemo((): Partial<Record<FeedFilter, number>> => {
    const allItems = [...hiddenGems, ...activities];
    const nonAllFilters: FeedFilter[] = ["eat", "do", "stay", "events", "photo-spots"];
    const counts: Partial<Record<FeedFilter, number>> = {};
    for (const f of nonAllFilters) {
      const itemCount = allItems.filter(i => matchesFilter(i, f)).length;
      const svcCount = f !== "events"
        ? platformServices.filter(s => matchesServiceFilter(s, f)).length
        : 0;
      const hotelCount = f === "stay" ? hotels.length : 0;
      counts[f] = itemCount + svcCount + hotelCount;
    }
    counts.events = (counts.events ?? 0) + events.length;
    counts.experts = experts.length;
    return counts;
  }, [hiddenGems, activities, hotels, experts, platformServices, events]);

  const openAdd = (t: AddDialogTarget) => setAddDialog(t);
  const openRequestBooking = (target: AffiliateBookingTarget) => setRequestingItem(target);

  if (!city) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>No city specified.</AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <SavedItemsContext.Provider value={savedItemsCtxValue}>
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <header data-testid="location-view-header">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <MapPin className="w-3.5 h-3.5" />
            <span>{country ?? data?.country ?? "—"}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-city-name">
            {city}
          </h1>
        </header>

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-[340px]" />)}
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {data && (
          <>
            {/* ── §1 HERO ──────────────────────────────────────────────────── */}
            <section id="hero" data-testid="section-hero">
              {cityData?.imageUrl && (
                <div className="relative rounded-xl overflow-hidden mb-5 aspect-[21/8]">
                  <img
                    src={cityData.imageUrl}
                    alt={city}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                    <div>
                      {cityData.highlightEmoji && cityData.currentHighlight && (
                        <p className="text-white text-sm font-medium drop-shadow">
                          {cityData.highlightEmoji} {cityData.currentHighlight}
                        </p>
                      )}
                    </div>
                    {cityData.pulseScore && (
                      <Badge className="bg-primary/90 text-white text-sm px-3 py-1" data-testid="pulse-score">
                        <Zap className="h-3 w-3 mr-1" />Pulse {cityData.pulseScore}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {cityData?.activeTravelers && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-travelers">
                    <Users className="h-3 w-3 mr-1" />
                    {cityData.activeTravelers.toLocaleString()} travelers here now
                  </Badge>
                )}
                {cityData?.crowdLevel && (
                  <Badge variant="outline" className="text-xs capitalize" data-testid="badge-crowd">
                    {cityData.crowdLevel} crowds
                  </Badge>
                )}
                {(hotels.length + activities.length) > 0 && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-supply">
                    {hotels.length + activities.length} services available
                  </Badge>
                )}
                {neighborhoods.length > 0 && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-neighborhoods">
                    {neighborhoods.length} neighborhoods
                  </Badge>
                )}
              </div>

              {/* Happening-now strip — stays in hero */}
              {happeningNow.length > 0 && (
                <div className="space-y-2" data-testid="happening-now">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-primary" />
                    Happening Now
                    <Badge variant="secondary" className="text-[10px] px-1.5">LIVE</Badge>
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {happeningNow.slice(0, 6).map((h: any, idx: number) => (
                      <Card
                        key={idx}
                        className="flex-shrink-0 p-3 min-w-[180px] max-w-[220px]"
                        data-testid={`happening-now-${idx}`}
                      >
                        <p className="text-xs font-medium line-clamp-1">
                          {h.title || h.venueName || h.placeName}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {h.venue || h.description || ""}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── §2 EXPLORE SPINE (active filter) ─────────────────────────── */}
            <ExploreSpine
              active={activeFilter}
              onChange={setActiveFilter}
              counts={filterCounts}
              viewMode={viewMode}
              onViewModeChange={(m) => {
                if (m === "map") {
                  listScrollRef.current = window.scrollY;
                } else {
                  requestAnimationFrame(() => window.scrollTo({ top: listScrollRef.current, behavior: "instant" }));
                }
                setViewMode(m);
              }}
            />

            {/* ── §3 ALL GEMS FEED / MAP ───────────────────────────────────── */}
            <section id="gems-feed" data-testid="section-gems-feed">
              {viewMode === "map" ? (
                <LocationFeedMap
                  gems={hiddenGems}
                  hotels={hotels}
                  activities={activities}
                  platformServices={platformServices}
                  cityName={city}
                  activeFilter={activeFilter}
                  onAdd={openAdd}
                  onRequestBooking={openRequestBooking}
                />
              ) : (
                <AllGemsFeed
                  neighborhoods={neighborhoods}
                  gems={hiddenGems}
                  hotels={hotels}
                  activities={activities}
                  platformServices={platformServices}
                  events={events}
                  cityName={city}
                  countryName={country}
                  activeFilter={activeFilter}
                  experts={experts}
                  onAdd={openAdd}
                  onRequestBooking={openRequestBooking}
                />
              )}
            </section>

            {/* ── §5 "About {city}" collapsed accordion ────────────────────── */}
            <section id="about" data-testid="section-about">
              <Collapsible open={aboutOpen} onOpenChange={setAboutOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                    data-testid="btn-about-toggle"
                  >
                    <span className="font-semibold text-sm">About {city}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Photos · AI Insights</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${aboutOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-4 space-y-10">
                    <div id="media" data-testid="section-media">
                      <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                        <ImageIcon className="h-5 w-5 text-primary" />Photos &amp; Videos
                      </h2>
                      <MediaGallery cityName={city} mediaData={mediaData} />
                    </div>

                    <div id="insights" data-testid="section-insights">
                      <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                        <Brain className="h-5 w-5 text-primary" />AI Insights
                        <span className="text-xs font-normal text-muted-foreground">
                          Personalised travel intelligence
                        </span>
                      </h2>
                      <InsightsSection city={cityData} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>

            {/* ── §6 FOOTER EVENTS CTA ─────────────────────────────────────── */}
            <section id="events" data-testid="section-events">
              <Card className="bg-muted/50" data-testid="footer-events-cta">
                <CardContent className="p-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">What's on in {city} this week?</p>
                    <p className="text-sm text-muted-foreground">
                      {events.length > 0
                        ? `${events.length} event${events.length !== 1 ? "s" : ""} found this month`
                        : "Browse upcoming events and experiences"}
                    </p>
                  </div>
                  <Button variant="outline" asChild data-testid="button-view-events">
                    <a href={`/discover?tab=events&city=${encodeURIComponent(city)}`}>
                      View Events <ChevronRight className="h-4 w-4 ml-1" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {/* Phase C: Add-to-experience dialog */}
        <AddToExperienceDialog
          item={addToExperienceItem}
          open={addToExperienceOpen}
          onOpenChange={setAddToExperienceOpen}
        />
      </div>

      {/* Phase C: Add to trip / experience dialog */}
      <AddItemDialog
        target={addDialog}
        open={!!addDialog}
        onOpenChange={v => { if (!v) setAddDialog(null); }}
      />

      {/* Affiliate booking modal — routes partner bookings through experts */}
      <AffiliateBookingModal
        item={requestingItem}
        open={!!requestingItem}
        onOpenChange={v => { if (!v) setRequestingItem(null); }}
      />

      {/* Sticky planning bar — appears after scrolling past the hero */}
      <PlanningSticky city={city} userTrips={userTripsData} />
    </Layout>
    </SavedItemsContext.Provider>
  );
}
