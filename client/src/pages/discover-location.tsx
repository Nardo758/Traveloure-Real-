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

import { useRef, useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
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
  MapPin, Sparkles, Brain, Image as ImageIcon, Play, Camera,
  ExternalLink, Star, Clock, Wallet, Lightbulb, Shield, Sun, Heart,
  CalendarX, AlertCircle, Activity, Users, Gem, ChevronRight, ChevronDown,
  Plus, Loader2, Package, Compass, Zap, Utensils, Hotel, Ticket, UserCheck,
  BookOpen,
} from "lucide-react";

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
  whyHidden?: string | null; imageUrl?: string | null; localRating?: number | null;
}
interface SectionResult<T> { data: T | null; error: string | null }
interface LocationViewPayload {
  city: string; country: string | null; generatedAt: string;
  hero: SectionResult<{ city?: any; happeningNow?: any[]; liveActivity?: any[]; hiddenGems?: HiddenGem[] }>;
  recommendations: SectionResult<{ hotels?: any[]; activities?: any[] }>;
  events: SectionResult<{ events?: any[]; total?: number }>;
  neighborhoods: SectionResult<Neighborhood[]>;
}
interface AddDialogTarget { name: string; type: string; imageUrl?: string; description?: string }

type FeedFilter = "all" | "eat" | "do" | "stay" | "experts" | "events" | "photo-spots";

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

// ─── GemCard ──────────────────────────────────────────────────────────────────

function GemCard({
  item, idx, onAdd, testPrefix,
}: {
  item: {
    id?: string; placeName?: string; title?: string; name?: string;
    placeType?: string | null; type?: string | null; imageUrl?: string | null;
    media?: any[]; whyHidden?: string | null; description?: string | null;
    localRating?: number | null; starRating?: number | null;
    bookingUrl?: string | null; price?: string | null;
    neighborhood?: string | null; address?: string | null;
  };
  idx: number;
  onAdd: (t: AddDialogTarget) => void;
  testPrefix: string;
}) {
  const displayName = item.placeName ?? item.title ?? item.name ?? "Unnamed";
  const image = item.imageUrl ?? item.media?.[0]?.url ?? null;
  const description = item.whyHidden ?? item.description ?? null;
  const rating = item.localRating ?? item.starRating ?? null;
  const match = resolveMatch(item);

  return (
    <Card
      className="overflow-hidden flex flex-col w-full max-w-[360px]"
      data-testid={`${testPrefix}-${idx}`}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-muted flex-shrink-0">
        {image ? (
          <img src={image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gem className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        {(item.placeType ?? item.type) && (
          <Badge className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0 backdrop-blur-sm">
            {item.placeType ?? item.type}
          </Badge>
        )}
        {rating && (
          <Badge className="absolute top-2 right-2 bg-amber-50 text-amber-800 border-amber-200 text-[10px]">
            <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-500 text-amber-500" />{rating}
          </Badge>
        )}
      </div>

      <CardContent className="p-3 flex flex-col flex-1 gap-2">
        <div>
          <p className="font-semibold text-sm leading-snug line-clamp-1" data-testid={`${testPrefix}-name-${idx}`}>
            {displayName}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
          )}
          {item.address && !description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.address}</p>
          )}
          {item.price && (
            <p className="text-xs font-medium text-primary mt-0.5">{item.price}</p>
          )}
        </div>

        {/* Bookability badge */}
        <Badge
          variant="outline"
          className={`self-start text-[10px] px-2 py-0.5 ${match.badgeClass}`}
        >
          {match.Icon && <match.Icon className="h-2.5 w-2.5 mr-1" />}
          {match.badgeLabel}
        </Badge>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
          {match.primaryLabel && item.bookingUrl && (
            <Button size="sm" className="text-xs h-7 px-2.5" asChild>
              <a
                href={item.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`${testPrefix}-book-${idx}`}
              >
                {match.primaryLabel}
              </a>
            </Button>
          )}
          {match.primaryLabel && !item.bookingUrl && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2.5"
              data-testid={`${testPrefix}-primary-${idx}`}
            >
              {match.primaryLabel}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            onClick={() =>
              onAdd({
                name: displayName,
                type: item.placeType ?? item.type ?? "activity",
                imageUrl: image ?? undefined,
                description: description ?? undefined,
              })
            }
            data-testid={`${testPrefix}-add-${idx}`}
          >
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2"
            data-testid={`${testPrefix}-ask-${idx}`}
          >
            <UserCheck className="h-3 w-3 mr-1" />Ask expert
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ExpertFeedCard ───────────────────────────────────────────────────────────

function ExpertFeedCard({ cityName }: { cityName: string }) {
  return (
    <Card
      className="border-primary/20 bg-primary/[0.03] w-full max-w-[360px]"
      data-testid="expert-feed-card"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">
              Turn your picks into a day-by-day plan
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A local {cityName} expert can build a personalised itinerary from your saved items
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-500 text-amber-500" />Top-rated
              </Badge>
              <span className="text-xs text-muted-foreground">itinerary planning · concierge</span>
            </div>
          </div>
        </div>
        <Button size="sm" className="w-full mt-3 text-xs" data-testid="button-plan-with-expert">
          <UserCheck className="h-3 w-3 mr-1.5" />Plan with a local expert
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── GemGrid — flex-wrap so sparse containers don't force empty columns ───────

function GemGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4">{children}</div>;
}

// ─── NeighborhoodContainer ────────────────────────────────────────────────────

function NeighborhoodContainer({
  neighborhood, gems, hotels, activities, cityName, onAdd, showExpertCard,
}: {
  neighborhood: Neighborhood;
  gems: HiddenGem[];
  hotels: any[];
  activities: any[];
  cityName: string;
  onAdd: (t: AddDialogTarget) => void;
  showExpertCard: boolean;
}) {
  const total = gems.length + hotels.length + activities.length;
  if (total === 0) return null;

  return (
    <div
      className="border-l-4 border-primary/30 pl-4 md:pl-6 py-2"
      data-testid={`neighborhood-container-${neighborhood.slug}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" />
            {neighborhood.name}
            {neighborhood.isFeatured && (
              <Badge variant="secondary" className="text-[10px] ml-1">Featured</Badge>
            )}
          </h3>
          <div className="flex gap-1.5">
            {neighborhood.gemCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <Gem className="h-2.5 w-2.5 mr-0.5" />{neighborhood.gemCount} gems
              </Badge>
            )}
            {neighborhood.serviceCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />{neighborhood.serviceCount} services
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            data-testid={`btn-explore-${neighborhood.slug}`}
          >
            <Compass className="h-3 w-3 mr-1" />Explore
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            onClick={() =>
              onAdd({
                name: `${neighborhood.name} Day`,
                type: "neighborhood-day",
                description: `A day exploring ${neighborhood.name} in ${cityName}`,
              })
            }
            data-testid={`btn-add-day-${neighborhood.slug}`}
          >
            <Plus className="h-3 w-3 mr-1" />Add a day
          </Button>
        </div>
      </div>

      {neighborhood.description && (
        <p className="text-xs text-muted-foreground mb-4 max-w-xl">{neighborhood.description}</p>
      )}

      <GemGrid>
        {gems.map((gem, idx) => (
          <GemCard
            key={gem.id ?? idx}
            item={gem}
            idx={idx}
            onAdd={onAdd}
            testPrefix={`gem-${neighborhood.slug}`}
          />
        ))}
        {hotels.map((hotel, idx) => (
          <GemCard
            key={hotel.id ?? idx}
            item={hotel}
            idx={idx}
            onAdd={onAdd}
            testPrefix={`hotel-${neighborhood.slug}`}
          />
        ))}
        {activities.map((act, idx) => (
          <GemCard
            key={act.id ?? idx}
            item={act}
            idx={idx}
            onAdd={onAdd}
            testPrefix={`activity-${neighborhood.slug}`}
          />
        ))}
        {showExpertCard && <ExpertFeedCard cityName={cityName} />}
      </GemGrid>
    </div>
  );
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function matchesFilter(item: any, filter: FeedFilter): boolean {
  if (filter === "all") return true;
  const t = (item.placeType ?? item.type ?? "").toLowerCase();
  if (filter === "eat")
    return t.includes("restaurant") || t.includes("cafe") || t.includes("food") ||
           t.includes("eat") || t.includes("dining") || t.includes("ramen") || t.includes("sushi");
  if (filter === "do")
    return t.includes("attraction") || t.includes("museum") || t.includes("temple") ||
           t.includes("shrine") || t.includes("park") || t.includes("garden") ||
           t.includes("castle") || t.includes("activity") || t.includes("tour") || t.includes("experience");
  if (filter === "stay")
    return t.includes("hotel") || t.includes("lodging") || t.includes("accommodation") || t.includes("ryokan");
  if (filter === "events")
    return t.includes("event") || t.includes("festival") || t.includes("concert");
  if (filter === "photo-spots")
    return t.includes("photo") || t.includes("spot") || t.includes("viewpoint") || t.includes("scenic");
  return true;
}

// ─── All Gems Feed ────────────────────────────────────────────────────────────

function AllGemsFeed({
  neighborhoods, gems, hotels, activities, cityName, activeFilter, onAdd,
}: {
  neighborhoods: Neighborhood[];
  gems: HiddenGem[];
  hotels: any[];
  activities: any[];
  cityName: string;
  activeFilter: FeedFilter;
  onAdd: (t: AddDialogTarget) => void;
}) {
  // ── Flat filter mode ──────────────────────────────────────────────────────
  if (activeFilter !== "all") {
    const flat = [
      ...gems.map(g => ({ ...g })),
      ...hotels.map(h => ({ ...h })),
      ...activities.map(a => ({ ...a })),
    ].filter(item => matchesFilter(item, activeFilter));

    if (flat.length === 0) {
      return (
        <div className="py-12 text-center text-sm text-muted-foreground" data-testid="feed-empty">
          No {activeFilter} spots found in {cityName} yet.
        </div>
      );
    }

    return (
      <div data-testid="feed-flat">
        <GemGrid>
          {flat.map((item, idx) => (
            <GemCard
              key={(item as any).id ?? idx}
              item={item}
              idx={idx}
              onAdd={onAdd}
              testPrefix={`flat-${activeFilter}`}
            />
          ))}
        </GemGrid>
      </div>
    );
  }

  // ── Grouped mode — neighborhood containers ────────────────────────────────
  const neighborhoodSlugs = new Set(neighborhoods.map(n => n.slug));

  const gemsBySlug = new Map<string, HiddenGem[]>();
  const elsewhereGems: HiddenGem[] = [];
  for (const gem of gems) {
    const slug = gem.neighborhood;
    if (slug && neighborhoodSlugs.has(slug)) {
      if (!gemsBySlug.has(slug)) gemsBySlug.set(slug, []);
      gemsBySlug.get(slug)!.push(gem);
    } else {
      elsewhereGems.push(gem);
    }
  }

  // Hotels and activities go into "Elsewhere" (they lack neighborhood tags currently)
  const elsewhereHotels = hotels;
  const elsewhereActivities = activities;

  const ordered = [
    ...neighborhoods.filter(n => n.isFeatured),
    ...neighborhoods.filter(n => !n.isFeatured),
  ];

  const hasNeighborhoodContent = ordered.some(n => (gemsBySlug.get(n.slug)?.length ?? 0) > 0);
  const hasElsewhere = elsewhereGems.length > 0 || elsewhereHotels.length > 0 || elsewhereActivities.length > 0;

  if (!hasNeighborhoodContent && !hasElsewhere) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground" data-testid="feed-empty">
        Content for {cityName} is being gathered — check back soon.
      </div>
    );
  }

  return (
    <div className="space-y-10" data-testid="feed-grouped">
      {ordered.map((n, nIdx) => (
        <NeighborhoodContainer
          key={n.id}
          neighborhood={n}
          gems={gemsBySlug.get(n.slug) ?? []}
          hotels={[]}
          activities={[]}
          cityName={cityName}
          onAdd={onAdd}
          showExpertCard={nIdx % 2 === 0}
        />
      ))}

      {hasElsewhere && (
        <div data-testid="elsewhere-section">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-semibold text-muted-foreground whitespace-nowrap">
              Elsewhere in {cityName}
            </h3>
            <div className="flex-1 h-px bg-border" />
          </div>
          <GemGrid>
            {elsewhereGems.map((gem, idx) => (
              <GemCard key={gem.id ?? idx} item={gem} idx={idx} onAdd={onAdd} testPrefix="elsewhere-gem" />
            ))}
            {elsewhereHotels.map((hotel, idx) => (
              <GemCard key={hotel.id ?? idx} item={hotel} idx={idx} onAdd={onAdd} testPrefix="elsewhere-hotel" />
            ))}
            {elsewhereActivities.map((act, idx) => (
              <GemCard key={act.id ?? idx} item={act} idx={idx} onAdd={onAdd} testPrefix="elsewhere-activity" />
            ))}
            <ExpertFeedCard cityName={cityName} />
          </GemGrid>
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
  active, onChange,
}: {
  active: FeedFilter;
  onChange: (f: FeedFilter) => void;
}) {
  return (
    <nav
      className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b"
      data-testid="explore-spine"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SPINE_FILTERS.map(({ label, value, Icon }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border
              ${active === value
                ? "bg-primary text-white border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            data-testid={`spine-chip-${value}`}
          >
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
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

export default function DiscoverLocationPage() {
  const rawParams = useParams<{ city: string }>();
  const searchString = useSearch();
  const country = new URLSearchParams(searchString).get("country");
  const city = decodeURIComponent(rawParams?.city ?? "");

  const [addDialog, setAddDialog] = useState<AddDialogTarget | null>(null);
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [aboutOpen, setAboutOpen] = useState(false);
  const trackedRef = useRef<Set<string>>(new Set());

  // Main orchestrator query
  const { data, isLoading, error } = useQuery<LocationViewPayload>({
    queryKey: ["/api/discover/location", city, country],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      const res = await fetch(
        `/api/discover/location/${encodeURIComponent(city)}${qs.toString() ? `?${qs}` : ""}`,
      );
      if (!res.ok) throw new Error(`Location view: ${res.status}`);
      return res.json();
    },
    enabled: !!city,
    staleTime: 5 * 60 * 1000,
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
  const hiddenGems: HiddenGem[] = hero?.hiddenGems ?? [];
  const neighborhoods: Neighborhood[] = data?.neighborhoods?.data ?? [];
  const hotels: any[] = data?.recommendations?.data?.hotels ?? [];
  const activities: any[] = data?.recommendations?.data?.activities ?? [];
  const experts: any[] = data?.recommendations?.data?.experts ?? [];
  const events: any[] = data?.events?.data?.events ?? [];

  const feedItems: FeedItem[] = [
    ...hiddenGems.map((g, idx) => ({
      id: g.id,
      name: g.placeName,
      type: "hidden-gem",
      placeType: g.placeType,
      neighborhood: g.neighborhood,
      imageUrl: g.imageUrl,
      description: g.whyHidden,
      rating: g.localRating,
      bookingUrl: null,
      source: "gem" as const,
      sourceIdx: idx,
    })),
    ...hotels.map((h: any, idx: number) => ({
      id: h.id || `hotel-${idx}`,
      name: h.name,
      type: "hotel",
      placeType: "hotel",
      neighborhood: h.neighborhood || null,
      imageUrl: h.media?.[0]?.url || null,
      description: h.address,
      rating: h.starRating,
      starRating: h.starRating,
      bookingUrl: h.bookingUrl || null,
      price: h.price,
      source: "hotel" as const,
      sourceIdx: idx,
    })),
    ...activities.map((a: any, idx: number) => ({
      id: a.id || `activity-${idx}`,
      name: a.title,
      type: "activity",
      placeType: a.type || "activity",
      neighborhood: a.neighborhood || null,
      imageUrl: a.media?.[0]?.url || null,
      description: a.description,
      rating: a.rating,
      bookingUrl: a.bookingUrl || null,
      price: a.price,
      source: "activity" as const,
      sourceIdx: idx,
    })),
    ...events.map((e: any, idx: number) => ({
      id: e.id || `event-${idx}`,
      name: e.title || e.name,
      type: "event",
      placeType: "event",
      neighborhood: e.neighborhood || null,
      imageUrl: e.imageUrl || e.media?.[0]?.url || null,
      description: e.description,
      rating: null,
      bookingUrl: e.bookingUrl || e.ticketUrl || null,
      price: e.price,
      source: "event" as const,
      sourceIdx: idx,
    })),
  ];

  const openAdd = (t: AddDialogTarget) => setAddDialog(t);

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
            <ExploreSpine active={activeFilter} onChange={setActiveFilter} />

            {/* ── §3 ALL GEMS FEED ─────────────────────────────────────────── */}
            <section id="gems-feed" data-testid="section-gems-feed">
              <AllGemsFeed
                neighborhoods={neighborhoods}
                gems={hiddenGems}
                hotels={hotels}
                activities={activities}
                cityName={city}
                activeFilter={activeFilter}
                experts={experts}
                onAdd={openAdd}
              />
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
      </div>

      {/* Phase C: Add to trip / experience dialog */}
      <AddItemDialog
        target={addDialog}
        open={!!addDialog}
        onOpenChange={v => { if (!v) setAddDialog(null); }}
      />
    </Layout>
  );
}
