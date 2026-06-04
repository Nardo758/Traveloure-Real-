import { useRef, useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, MapPin, Sparkles, Image as ImageIcon, Brain, Compass } from "lucide-react";
import { NeighborhoodCard } from "@/components/neighborhood-card";
import { ProviderCard } from "@/components/provider-card";
import { HeroCard } from "@/components/hero-card";
import { MediaCard } from "@/components/media-card";
import { InsightsCard } from "@/components/insights-card";
import { EventsCard } from "@/components/events-card";

/**
 * Location View — Phase 3 renderers (v2 spec §3, §5; Decision #5 destination).
 *
 * Replaces CityDetailView (7 tabs) with one scrolling page following the
 * wireframe in docs/PHASE3_WIREFRAME_LocationView.md. Sections:
 *
 * Phase 2 shipped the shell and wired it to the orchestrator endpoint
 * (/api/discover/location/:city, built in Phase 1b-3) with per-section
 * { data, error } envelopes. Phase 3 replaces the placeholders with
 * real renderers. The data plumbing is end-to-end; Phase 3 is purely
 * a rendering task, not a fetch task.
 */

interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

interface LocationViewPayload {
  city: string;
  country: string | null;
  generatedAt: string;
  hero: SectionResult<any>;
  recommendations: SectionResult<any>;
  enriched: SectionResult<any>;
  events: SectionResult<any>;
  neighborhoods: SectionResult<any[]>;
}

interface CityMedia {
  id: string;
  source: "unsplash" | "pexels" | "google_places";
  mediaType: "photo" | "video";
  url: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  context?: string | null;
  attractionName?: string | null;
  photographerName?: string | null;
  photographerUrl?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  isPrimary?: boolean | null;
  downloadLocationUrl?: string | null;
  htmlAttributions?: string[] | null;
}

interface CityMediaResponse {
  hero: CityMedia | null;
  gallery: CityMedia[];
  videos: CityMedia[];
  byAttraction: Record<string, CityMedia[]>;
}

function SectionHeader({
  id,
  icon: Icon,
  title,
  subtitle,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div id={id} className="scroll-mt-20 mb-4">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Icon className="w-6 h-6 text-primary" />
        {title}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

// ─── §2 EXPLORE SPINE ──────────────────────────────────────────────────────
const EXPLORE_CHIPS = [
  { id: "by-neighborhood", label: "Neighborhoods" },
  { id: "gems", label: "Hidden Gems" },
  { id: "supply", label: "Stay · Do · Plan" },
  { id: "live-feed", label: "Live Activity" },
  { id: "media", label: "Media" },
  { id: "insights", label: "Insights" },
  { id: "events", label: "Events" },
];

function ExploreSpine() {
  return (
    <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-y py-3 z-10" data-testid="explore-spine">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {EXPLORE_CHIPS.map((chip) => (
          <a
            key={chip.id}
            href={`#${chip.id}`}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium bg-muted hover:bg-muted-foreground/20 transition-colors"
            data-testid={`spine-chip-${chip.id}`}
          >
            {chip.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── §1 HERO ───────────────────────────────────────────────────────────────
// Reads from orchestrator's hero.data which contains:
// - city: TravelPulseCity with 9 AI fields
// - hiddenGems: array of gems (used in §4)
// - happeningNow: array of happening now events
// - liveActivity: array of live activity (used in §6)
function HeroSection({
  city,
  country,
  heroData,
  recommendationsData,
  generatedAt,
  heroPhoto,
}: {
  city: string;
  country: string | null;
  heroData: any;
  recommendationsData: any;
  generatedAt?: string;
  heroPhoto?: string | null;
}) {
  const cityIntel = heroData?.city;
  const happeningNow = heroData?.happeningNow || [];
  const hotelCount = recommendationsData?.hotels?.length || 0;
  const activityCount = recommendationsData?.activities?.length || 0;

  return (
    <section data-testid="section-hero">
      {heroPhoto && (
        <div className="rounded-lg overflow-hidden mb-4 max-h-80">
          <img src={heroPhoto} alt={city} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <MapPin className="w-4 h-4" />
        <span>{country ?? cityIntel?.country ?? "—"}</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-city-name">
        {city}
      </h1>
      {cityIntel?.currentHighlight && (
        <p className="text-base text-muted-foreground mb-3">
          {cityIntel.highlightEmoji} {cityIntel.currentHighlight}
        </p>
      )}

      {/* Pulse / supply summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {cityIntel?.pulseScore !== undefined && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Pulse Score</p>
              <p className="text-xl font-bold flex items-center gap-1">
                <Zap className="w-4 h-4 text-amber-500" />
                {cityIntel.pulseScore}
              </p>
            </CardContent>
          </Card>
        )}
        {cityIntel?.activeTravelers !== undefined && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Active Travelers</p>
              <p className="text-xl font-bold flex items-center gap-1">
                <Users className="w-4 h-4 text-blue-500" />
                {cityIntel.activeTravelers}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

// ─── §3 BY-NEIGHBORHOOD ────────────────────────────────────────────────────
// Phase C: Neighborhoods are addable as a unit — "Add a Marais day"
function NeighborhoodSection({
  neighborhoods,
  city,
  onAddToExperience,
}: {
  neighborhoods: any[];
  city: string;
  onAddToExperience: (item: any) => void;
}) {
  if (!neighborhoods || neighborhoods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="neighborhoods-empty">
        No neighborhoods seeded yet for {city}.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {neighborhoods.map((n: any) => {
        const total = (n.gemCount ?? 0) + (n.serviceCount ?? 0);
        return (
          <Card key={n.id} className="hover-elevate" data-testid={`neighborhood-card-${n.slug}`}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {n.name}
              </CardTitle>
              {n.isFeatured && <Badge variant="secondary" className="w-fit">Featured</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              {n.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{n.description}</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="font-bold">{n.gemCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">things to do</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="font-bold">{n.serviceCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">bookable</p>
                  </div>
                </div>
              </div>
              {total === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Phase 5+ network fill will populate this neighborhood.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  data-testid={`btn-add-day-${n.slug}`}
                  onClick={() =>
                    onAddToExperience({
                      title: `A day in ${n.name}`,
                      description: n.description,
                      city: city,
                      type: "neighborhood",
                    })
                  }
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add a {n.name} day
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── §4 GEMS BY CATEGORY ───────────────────────────────────────────────────
// Reads from orchestrator's hero.data.hiddenGems (populated by Phase 4 network fill)
// Phase C: Gems are addable to experiences
// Inline matched-supply strip — fetches top 3 providers for a gem
function MatchedSupplyStrip({ gemId, gemName }: { gemId: string; gemName: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/content/gems/${gemId}/matched-supply`, { limit: 3, minScore: 30 }],
    queryFn: async () => {
      const res = await fetch(`/api/content/gems/${gemId}/matched-supply?limit=3&minScore=30`);
      if (!res.ok) return { matches: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data?.matches?.length) return null;

  return (
    <div className="border-t bg-muted/20 px-4 py-3" data-testid={`gem-matched-supply-${gemId}`}>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Pair "{gemName}" with:
      </p>
      <div className="flex flex-wrap gap-2">
        {data.matches.slice(0, 3).map((m: any) => (
          <button
            key={m.serviceId}
            className="flex items-center gap-2 px-2 py-1 rounded-md border bg-background hover:border-primary text-xs"
            onClick={() => (window.location.href = `/services/${m.serviceId}`)}
            data-testid={`matched-supply-${m.serviceId}`}
          >
            <span className="font-medium">{m.serviceName}</span>
            {m.averageRating > 0 && (
              <span className="text-muted-foreground">{m.averageRating.toFixed(1)}★</span>
            )}
            {m.isFeatured && <Badge variant="secondary" className="text-[10px] h-4">Featured</Badge>}
          </button>
        ))}
      </div>
    </div>
  );
}

function GemsSection({
  gems,
  city,
  onAddToExperience,
}: {
  gems: any[];
  city: string;
  onAddToExperience: (item: any) => void;
}) {
  if (!gems || gems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="gems-empty">
        No hidden gems discovered yet for {city}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {gems.map((gem: any) => (
        <Card key={gem.id} className="overflow-hidden hover-elevate" data-testid={`gem-card-${gem.id}`}>
          {/* Split-row ≥768px; stacked <768px per wireframe */}
          <div className="flex flex-col md:flex-row">
            {/* LEFT: photo + name + type + desc + why-signal */}
            <div className="flex flex-col md:flex-row flex-1">
              {gem.imageUrl && (
                <div className="w-full md:w-40 h-40 flex-shrink-0">
                  <img
                    src={gem.imageUrl}
                    alt={gem.placeName}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardContent className="flex-1 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{gem.placeName}</h3>
                    {gem.placeType && (
                      <Badge variant="outline" className="text-xs capitalize mt-1">
                        {gem.placeType}
                      </Badge>
                    )}
                  </div>
                  {gem.localRating && (
                    <div className="flex items-center gap-1 text-sm flex-shrink-0">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{gem.localRating}</span>
                    </div>
                  )}
                </div>
                {gem.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{gem.description}</p>
                )}
                {gem.whyLocalsLoveIt && (
                  <div className="flex items-start gap-2 text-sm bg-muted/50 rounded p-2">
                    <Heart className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs">{gem.whyLocalsLoveIt}</span>
                  </div>
                )}
                {gem.priceRange && (
                  <p className="text-xs text-muted-foreground">{gem.priceRange}</p>
                )}
              </CardContent>
            </div>
            {/* RIGHT: action stack — Book / Add to experience / Find expert */}
            <div className="md:w-48 flex flex-row md:flex-col gap-2 p-4 md:border-l border-t md:border-t-0 bg-muted/30">
              <Button
                size="sm"
                className="flex-1"
                onClick={() =>
                  onAddToExperience({
                    title: gem.placeName,
                    description: gem.description,
                    city: city,
                    type: "gem",
                  })
                }
                data-testid={`gem-add-${gem.id}`}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add to experience
              </Button>
              <Button size="sm" variant="outline" className="flex-1" data-testid={`gem-expert-${gem.id}`}>
                <Search className="w-3 h-3 mr-1" />
                Find a local expert
              </Button>
            </div>
          </div>
          {/* Matched supply strip (content→supply matching) */}
          <MatchedSupplyStrip gemId={gem.id} gemName={gem.placeName} />
        </Card>
      ))}
    </div>
  );
}

// ─── §5 SUPPLY (woven) ─────────────────────────────────────────────────────
// Reads from orchestrator's recommendations.data which contains:
// - hotels: array of recommended hotels (AI-enhanced)
// - activities: array of recommended activities/experiences (AI-enhanced)
// Phase C: Supply items (hotels/activities) are addable to experiences
function SupplySection({
  recommendationsData,
  city,
  onAddToExperience,
}: {
  recommendationsData: any;
  city: string;
  onAddToExperience: (item: any) => void;
}) {
  const hotels = recommendationsData?.hotels || [];
  const activities = recommendationsData?.activities || [];

  if (hotels.length === 0 && activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="supply-empty">
        No supply available yet for {city}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hotels.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Hotel className="w-4 h-4 text-primary" />
            Stay ({hotels.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hotels.slice(0, 6).map((hotel: any) => (
              <Card key={hotel.id} className="hover-elevate" data-testid={`supply-hotel-${hotel.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm line-clamp-2">{hotel.name}</h4>
                    {hotel.starRating && (
                      <div className="flex items-center gap-1 text-xs flex-shrink-0">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {hotel.starRating}
                      </div>
                    )}
                  </div>
                  {hotel.address && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{hotel.address}</p>
                  )}
                  {hotel.aiReasons && hotel.aiReasons.length > 0 && (
                    <p className="text-xs text-muted-foreground italic line-clamp-1">
                      {hotel.aiReasons[0]}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1">Book</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        onAddToExperience({
                          title: hotel.name,
                          description: hotel.address,
                          city: city,
                          type: "hotel",
                        })
                      }
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activities.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
            <Compass className="w-4 h-4 text-primary" />
            Do ({activities.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activities.slice(0, 6).map((activity: any) => (
              <Card
                key={activity.id}
                className="hover-elevate"
                data-testid={`supply-activity-${activity.id}`}
              >
                <CardContent className="p-4 space-y-2">
                  <h4 className="font-semibold text-sm line-clamp-2">{activity.title}</h4>
                  {activity.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {activity.description}
                    </p>
                  )}
                  {activity.aiReasons && activity.aiReasons.length > 0 && (
                    <p className="text-xs text-muted-foreground italic line-clamp-1">
                      {activity.aiReasons[0]}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1">Book</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        onAddToExperience({
                          title: activity.title,
                          description: activity.description,
                          city: city,
                          type: "activity",
                        })
                      }
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Expert link — Plan-with-a-local entry point */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 flex items-center gap-3">
          <UserCircle className="w-8 h-8 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Plan with a local expert</p>
            <p className="text-xs text-muted-foreground">
              Get a personalized {city} itinerary from someone who knows the city.
            </p>
          </div>
          <Button size="sm" variant="outline">
            Browse experts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── §6 LIVE FEED ──────────────────────────────────────────────────────────
function getActivityIconForType(activityType: string) {
  switch (activityType) {
    case "check_in":
      return <MapPin className="w-4 h-4 text-blue-500" />;
    case "booking":
      return <Calendar className="w-4 h-4 text-green-500" />;
    case "review":
      return <Star className="w-4 h-4 text-yellow-500" />;
    default:
      return <Activity className="w-4 h-4 text-muted-foreground" />;
  }
}

// Reads from orchestrator's hero.data.liveActivity
function LiveFeedSection({ liveActivity, city }: { liveActivity: any[]; city: string }) {
  if (!liveActivity || liveActivity.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="live-feed-empty">
        No recent activity in {city}.
      </p>
    );
  }

  return (
    <ScrollArea className="h-96">
      <div className="space-y-3">
        {liveActivity.map((activity: any) => (
          <Card
            key={activity.id}
            className="hover-elevate"
            data-testid={`activity-item-${activity.id}`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                {getActivityIconForType(activity.activityType)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{activity.userName || "Traveler"}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{activity.activityText}</p>
                  {activity.placeName && (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {activity.placeName}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}
                  </p>
                  {activity.likesCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <ThumbsUp className="w-3 h-3" />
                      {activity.likesCount}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── §7 MEDIA GALLERY ──────────────────────────────────────────────────────
// Reads from separate /api/travelpulse/media/:city/:country query (not part of orchestrator).
// Verbatim carry-over from CityDetailView's Media tab.
function MediaSection({
  mediaData,
  city,
}: {
  mediaData: CityMediaResponse | undefined;
  city: string;
}) {
  if (!mediaData || (mediaData.gallery.length === 0 && mediaData.videos.length === 0)) {
    return (
      <Card className="p-8 text-center" data-testid="card-no-media">
        <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No media available yet for {city}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Photos and videos will be added when AI intelligence is refreshed
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Videos Section */}
      {mediaData.videos.length > 0 && (
        <div data-testid="videos-section">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Destination Videos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mediaData.videos.map((video, idx) => (
              <Card key={video.id} className="overflow-hidden" data-testid={`video-card-${idx}`}>
                <div className="relative aspect-video bg-muted">
                  <video
                    src={video.url}
                    poster={video.thumbnailUrl || video.previewUrl || undefined}
                    controls
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>by {video.photographerName}</span>
                      {video.duration && (
                        <span>
                          ({Math.floor(video.duration / 60)}:
                          {(video.duration % 60).toString().padStart(2, "0")})
                        </span>
                      )}
                    </div>
                    <a
                      href={video.sourceUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {video.sourceName}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Photo Gallery Section */}
      {mediaData.gallery.length > 0 && (
        <div data-testid="gallery-section">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Photo Gallery
            {mediaData.gallery.some((m) => m.source === "google_places") && (
              <span className="text-xs text-muted-foreground ml-auto font-medium">
                Powered by Google
              </span>
            )}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {mediaData.gallery.map((photo, idx) => (
              <Card
                key={photo.id}
                className="overflow-hidden group"
                data-testid={`photo-card-${idx}`}
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={photo.attractionName || `${city} photo`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {photo.isPrimary && (
                    <Badge className="absolute top-2 left-2 bg-primary/90 text-white">
                      <Star className="h-3 w-3 mr-1" />
                      Featured
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
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{photo.photographerName}</span>
                      <a
                        href={photo.sourceUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5 flex-shrink-0"
                      >
                        {photo.sourceName}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                    {/* Google Places HTML attribution - required by API */}
                    {photo.source === "google_places" &&
                      photo.htmlAttributions &&
                      photo.htmlAttributions.length > 0 && (
                        <div
                          className="text-[10px] text-muted-foreground truncate"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(photo.htmlAttributions.join(" "), {
                              ALLOWED_TAGS: ["a"],
                              ALLOWED_ATTR: ["href"],
                            }),
                          }}
                        />
                      )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Attraction-specific photos (Google Places) */}
      {Object.keys(mediaData.byAttraction).length > 0 && (
        <div data-testid="attractions-media-section">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Photos by Attraction
            <span className="text-xs text-muted-foreground ml-auto">Powered by Google</span>
          </h3>
          <div className="space-y-4">
            {Object.entries(mediaData.byAttraction).map(([attractionName, photos]) => (
              <div key={attractionName}>
                <h4 className="text-sm font-medium mb-2">{attractionName}</h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="flex-shrink-0 relative"
                      data-testid={`attraction-photo-${attractionName}-${idx}`}
                    >
                      <div className="w-40 aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                        <img
                          src={photo.thumbnailUrl || photo.url}
                          alt={attractionName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {/* Google Places HTML attribution - required by API */}
                      {photo.htmlAttributions && photo.htmlAttributions.length > 0 && (
                        <div
                          className="text-[10px] text-muted-foreground mt-1 max-w-40 truncate"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(photo.htmlAttributions.join(" "), {
                              ALLOWED_TAGS: ["a"],
                              ALLOWED_ATTR: ["href"],
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

      {/* Attribution notice with Google branding */}
      <div className="text-center mt-4 space-y-1">
        <p className="text-xs text-muted-foreground">
          Photos and videos provided by Unsplash, Pexels, and Google Places.
        </p>
        {(mediaData.gallery.some((m) => m.source === "google_places") ||
          Object.values(mediaData.byAttraction)
            .flat()
            .some((m) => m.source === "google_places")) && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <span>Attraction photos</span>
            <span className="font-medium">Powered by Google</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── §8 INSIGHTS — all 9 AI subcards verbatim ──────────────────────────────
function InsightsSection({ cityIntel, city }: { cityIntel: any; city: string }) {
  // Check if cityIntel exists and has at least one AI field populated
  const hasAIFields = cityIntel && (
    cityIntel.aiBestTimeToVisit ||
    cityIntel.aiOptimalDuration ||
    cityIntel.aiBudgetEstimate ||
    cityIntel.aiMustSeeAttractions ||
    cityIntel.aiTravelTips ||
    cityIntel.aiLocalInsights ||
    cityIntel.aiSafetyNotes ||
    cityIntel.aiSeasonalHighlights ||
    cityIntel.aiAvoidDates
  );

  if (!hasAIFields) {
    return (
      <Card className="p-8 text-center">
        <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">AI insights are being generated for {city}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Check back soon for personalized travel intelligence
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Best Time to Visit */}
      <Card data-testid="card-best-time">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Best Time to Visit
            </CardTitle>
            <p className="text-xs text-muted-foreground" data-testid="text-ai-updated">
              Updated{" "}
              {cityIntel.aiGeneratedAt &&
                formatDistanceToNow(new Date(cityIntel.aiGeneratedAt), { addSuffix: true })}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium" data-testid="text-best-time">
            {cityIntel.aiBestTimeToVisit || "Year-round destination"}
          </p>
        </CardContent>
      </Card>

      {/* 2. Recommended Duration */}
      {cityIntel.aiOptimalDuration && (
        <Card data-testid="card-optimal-duration">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Compass className="h-4 w-4" />
              Recommended Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-optimal-duration">
              {cityIntel.aiOptimalDuration}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 3. Daily Budget Estimate */}
      {cityIntel.aiBudgetEstimate && (
        <Card data-testid="card-budget-estimate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Daily Budget Estimate (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  ${cityIntel.aiBudgetEstimate.budget || 50}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Mid-Range</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  ${cityIntel.aiBudgetEstimate.midRange || 150}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <p className="text-xs text-muted-foreground">Luxury</p>
                <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                  ${cityIntel.aiBudgetEstimate.luxury || 300}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Must-See Attractions */}
      {cityIntel.aiMustSeeAttractions && cityIntel.aiMustSeeAttractions.length > 0 && (
        <Card data-testid="card-must-see">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4" />
              Must-See Attractions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {cityIntel.aiMustSeeAttractions.map((attraction: string, idx: number) => (
                <Badge key={idx} variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
                  <MapPin className="h-3 w-3 mr-1" />
                  {attraction}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Local Tips */}
      {cityIntel.aiTravelTips && cityIntel.aiTravelTips.length > 0 && (
        <Card data-testid="card-travel-tips">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Local Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {cityIntel.aiTravelTips.map((tip: string, idx: number) => (
                <li key={idx} className="text-sm flex items-start gap-2">
                  <span className="text-primary">-</span>
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 6. Cultural Insights */}
      {cityIntel.aiLocalInsights && (
        <Card data-testid="card-local-insights">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Cultural Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-local-insights">
              {cityIntel.aiLocalInsights}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 7. Safety Notes */}
      {cityIntel.aiSafetyNotes && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20" data-testid="card-safety-notes">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />
              Safety Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-safety-notes">
              {cityIntel.aiSafetyNotes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 8. Seasonal Guide */}
      {cityIntel.aiSeasonalHighlights && cityIntel.aiSeasonalHighlights.length > 0 && (
        <Card data-testid="card-seasonal-guide">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sun className="h-4 w-4" />
              Seasonal Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {cityIntel.aiSeasonalHighlights.map((month: any) => {
                  const monthNames = [
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun",
                    "Jul",
                    "Aug",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dec",
                  ];
                  const ratingColors: Record<string, string> = {
                    excellent: "bg-green-100 dark:bg-green-900/30 border-green-300",
                    good: "bg-blue-100 dark:bg-blue-900/30 border-blue-300",
                    average: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300",
                    poor: "bg-red-100 dark:bg-red-900/30 border-red-300",
                  };
                  return (
                    <div
                      key={month.month}
                      className={cn(
                        "p-2 rounded-lg border",
                        ratingColors[month.rating] || "bg-muted",
                      )}
                      data-testid={`month-${month.month}`}
                    >
                      <p className="text-xs font-medium">{monthNames[month.month - 1]}</p>
                      <p
                        className="text-xs text-muted-foreground truncate"
                        title={month.highlight}
                      >
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

      {/* 9. Dates to Avoid */}
      {cityIntel.aiAvoidDates && cityIntel.aiAvoidDates.length > 0 && (
        <Card className="bg-red-50 dark:bg-red-900/20" data-testid="card-avoid-dates">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarX className="h-4 w-4 text-red-600" />
              Dates to Avoid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {cityIntel.aiAvoidDates.map((avoid: any, idx: number) => (
                <li key={idx} className="text-sm" data-testid={`avoid-date-${idx}`}>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {avoid.dateRange}
                  </span>
                  <span className="text-muted-foreground"> - {avoid.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── §9 FOOTER HANDOFF ─────────────────────────────────────────────────────
function FooterHandoff({
  events,
  city,
}: {
  events: any;
  city: string;
}) {
  const eventList = events?.events || [];
  const eventCount = eventList.length;

  return (
    <Card className="bg-primary/5 border-primary/30">
      <CardContent className="p-4 flex items-center gap-3">
        <Calendar className="w-8 h-8 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm" data-testid="text-events-summary">
            What's on in {city} this week
          </p>
          <p className="text-xs text-muted-foreground">
            {eventCount > 0
              ? `${eventCount} event${eventCount === 1 ? "" : "s"} this month — switch to by-date view to plan around them.`
              : "No events found for the current window."}
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href={`/discover?tab=events&city=${encodeURIComponent(city)}`}>
            View events <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function DiscoverLocationPage() {
  const params = useParams<{ city: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const country = searchParams.get("country");
  const cityRaw = params?.city ?? "";
  const city = decodeURIComponent(cityRaw);

  // Phase C: Add-to-experience dialog state
  const [addToExperienceOpen, setAddToExperienceOpen] = useState(false);
  const [addToExperienceItem, setAddToExperienceItem] = useState<any>(null);

  const { data, isLoading, error } = useQuery<LocationViewPayload>({
    queryKey: ["/api/discover/location", city, country],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      const res = await fetch(
        `/api/discover/location/${encodeURIComponent(city)}${qs.toString() ? `?${qs.toString()}` : ""}`,
      );
      if (!res.ok) throw new Error(`Location view fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!city,
  });

  // Media — separate query matching CityDetailView's pattern. Orchestrator is
  // off-limits per Phase 3 brief; this lives outside it.
  const heroCountry = country ?? data?.country ?? null;
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", city, heroCountry],
    queryFn: async () => {
      const res = await fetch(
        `/api/travelpulse/media/${encodeURIComponent(city)}/${encodeURIComponent(heroCountry ?? "")}`,
      );
      if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!city && !!heroCountry,
  });

  // Unsplash download tracking (compliance — verbatim from CityDetailView)
  const trackedDownloadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mediaData) return;
    const unsplashMedia = [
      ...(mediaData.hero &&
      mediaData.hero.source === "unsplash" &&
      mediaData.hero.downloadLocationUrl
        ? [mediaData.hero]
        : []),
      ...mediaData.gallery.filter((m) => m.source === "unsplash" && m.downloadLocationUrl),
    ];
    unsplashMedia.forEach((media) => {
      if (
        media.downloadLocationUrl &&
        !trackedDownloadsRef.current.has(media.downloadLocationUrl)
      ) {
        trackedDownloadsRef.current.add(media.downloadLocationUrl);
        fetch("/api/travelpulse/media/track-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadLocationUrl: media.downloadLocationUrl }),
        }).catch(() => {});
      }
    });
  }, [mediaData]);

  if (!city) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-3xl">
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
      {/* Contained max-width column per wireframe global rules (~900-1000px). */}
      <div className="container mx-auto px-4 py-6 max-w-5xl space-y-8">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {(error as Error).message ?? "Failed to load location view."}
            </AlertDescription>
          </Alert>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-6">
            {/* 1. Hero — overview + happening-now strip + live activity */}
            <SectionShell
              icon={Sparkles}
              title="Hero"
              subtitle="City overview, current pulse, what's happening right now."
              section={data.hero}
              phaseNote="Hero section — city intelligence and live activity."
            >
              {data.hero.data ? (
                <HeroCard
                  city={data.hero.data.city}
                  happeningNow={data.hero.data.happeningNow}
                  liveActivity={data.hero.data.liveActivity}
                  alerts={data.hero.data.alerts}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hero data available. TravelPulse cities endpoint may be unavailable.
                </p>
              )}
            </SectionShell>

            {/* 2. Supply rail — featured + recommendations */}
            <SectionShell
              icon={Compass}
              title="Supply"
              subtitle="Featured providers and AI recommendations, ranked with the featured-sort guardrail."
              section={data.recommendations}
              phaseNote="Add-to-experience template action wires up in Phase 4+."
            >
              {data.recommendations.data ? (
                <div className="space-y-6">
                  {data.recommendations.data.hotels && data.recommendations.data.hotels.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm">Accommodations</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.recommendations.data.hotels.map((hotel: any) => (
                          <ProviderCard
                            key={hotel.id}
                            id={hotel.id}
                            name={hotel.name}
                            type="hotel"
                            rating={hotel.starRating}
                            reviewCount={hotel.reviewCount}
                            price={hotel.price}
                            description={hotel.address}
                            image={hotel.media?.[0]?.url}
                            aiScore={hotel.aiScore || 0}
                            aiReasons={hotel.aiReasons || []}
                            location={[hotel.city, hotel.countryName].filter(Boolean).join(", ")}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {data.recommendations.data.activities && data.recommendations.data.activities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm">Activities</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.recommendations.data.activities.map((activity: any) => (
                          <ProviderCard
                            key={activity.id}
                            id={activity.id}
                            name={activity.title}
                            type="activity"
                            price={activity.price}
                            description={activity.description}
                            image={activity.media?.[0]?.url}
                            aiScore={activity.aiScore || 0}
                            aiReasons={activity.aiReasons || []}
                            location={activity.city}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recommendations available. This may indicate sparse local inventory or a temporary service issue.
                </p>
              )}
            </SectionShell>

            {/* 3. By Neighborhood — gems + services rolled up by neighborhood */}
            <SectionShell
              icon={MapPin}
              title="By Neighborhood"
              subtitle="The ecosystem unit: each neighborhood's gems + services + featured providers."
              section={data.neighborhoods}
              phaseNote="Click-through to neighborhood detail view ships in Phase 4+."
            >
              {Array.isArray(data.neighborhoods.data) && data.neighborhoods.data.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.neighborhoods.data.map((n: any) => (
                    <NeighborhoodCard
                      key={n.id}
                      name={n.name}
                      slug={n.slug}
                      gemCount={n.gemCount ?? 0}
                      serviceCount={n.serviceCount ?? 0}
                      description={n.description}
                      isFeatured={n.isFeatured}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No neighborhoods seeded yet for this city — Phase 4 blended fill picks up the slack here.
                </p>
              )}
            </SectionShell>

            {/* 4. Media — full surface, NOT a hero fold (per retirement plan audit) */}
            <SectionShell
              icon={ImageIcon}
              title="Media"
              subtitle="Destination videos and photo gallery."
              section={data.enriched}
              phaseNote="Full gallery via /api/cities/:city/media wires up in Phase 4."
            >
              <MediaCard
                videos={data.enriched?.data?.videos}
                photos={data.enriched?.data?.photos}
                error={data.enriched?.error}
              />
            </SectionShell>

            {/* 5. Insights panel — full surface, the 9 AI subcards */}
            <SectionShell
              icon={Brain}
              title="Insights"
              subtitle="Best time, optimal duration, budget tiers, must-see, tips, safety, seasonal highlights."
              section={data.hero}
              phaseNote="Full AI insights panel — powered by TravelPulse city intelligence."
            >
              {data.hero.data ? (
                <InsightsCard insights={data.hero.data} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI insights available. TravelPulse AI fields will populate this section.
                </p>
              )}
            </SectionShell>

            {/* Events — by-date view per §4. Sits at the bottom for now; Phase 6 may break it out. */}
            <SectionShell
              icon={Sparkles}
              title="Events (this month)"
              subtitle="By-date view (v2 spec §4). Phase 6 may extract this into its own surface."
              section={data.events}
              phaseNote="Add-to-trip integration ships in Phase 4+."
            >
              {data.events.data?.events ? (
                <EventsCard
                  events={data.events.data.events.map((e: any) => ({
                    id: e.id || e.eventId || Math.random().toString(),
                    title: e.title || e.name || "Event",
                    date: e.date || e.eventDate || new Date().toISOString().split("T")[0],
                    time: e.time || e.startTime,
                    location: e.location || e.venue,
                    description: e.description || e.shortDescription,
                    url: e.url || e.link,
                    image: e.image || e.imageUrl,
                  }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No events scheduled for this month. Check back later or adjust your travel dates.
                </p>
              )}
            </SectionShell>
          </div>
        )}

        {/* Phase C: Add-to-experience dialog */}
        <AddToExperienceDialog
          item={addToExperienceItem}
          open={addToExperienceOpen}
          onOpenChange={setAddToExperienceOpen}
        />
      </div>
    </Layout>
  );
}
