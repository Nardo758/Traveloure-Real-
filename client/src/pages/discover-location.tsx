/**
 * LocationView — Phase 3, Decision #5 = Replace.
 *
 * 9-section scrolling city page. Replaces CityDetailView's 7 tabs.
 * §7 Media and §8 AI Insights are their OWN sections — full UI carried
 * verbatim from CityDetailView (~180 lines media + 9 subcards).
 *
 * Phase A: all 9 sections with real data.
 * Phase B: CityGrid + GlobalCalendar navigate here; /city/:slug redirects.
 * Phase C: AddItemDialog on every gem/supply card → trips + experiences.
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { NeighborhoodCard } from "@/components/neighborhood-card";
import {
  MapPin, Sparkles, Brain, Image as ImageIcon, Play, Camera,
  ExternalLink, Star, Clock, Wallet, Lightbulb, Shield, Sun, Heart,
  CalendarX, AlertCircle, Activity, Users, Gem, ChevronRight,
  Plus, Loader2, Package, Compass, Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CityMedia {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  source?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  downloadLocationUrl?: string | null;
  attractionName?: string | null;
  photographerName?: string | null;
  isPrimary?: boolean | null;
  htmlAttributions?: string[] | null;
  duration?: number | null;
}

interface CityMediaResponse {
  hero: CityMedia | null;
  gallery: CityMedia[];
  videos: CityMedia[];
  byAttraction: Record<string, CityMedia[]>;
}

interface Neighborhood {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isFeatured?: boolean | null;
  gemCount: number;
  serviceCount: number;
}

interface HiddenGem {
  id: string;
  placeName: string;
  placeType?: string | null;
  neighborhood?: string | null;
  whyHidden?: string | null;
  imageUrl?: string | null;
  localRating?: number | null;
}

interface SectionResult<T> { data: T | null; error: string | null }

interface LocationViewPayload {
  city: string;
  country: string | null;
  generatedAt: string;
  hero: SectionResult<{
    city?: any;
    happeningNow?: any[];
    liveActivity?: any[];
    hiddenGems?: HiddenGem[];
  }>;
  recommendations: SectionResult<{ hotels?: any[]; activities?: any[] }>;
  enriched: SectionResult<any>;
  events: SectionResult<{ events?: any[]; total?: number }>;
  neighborhoods: SectionResult<Neighborhood[]>;
}

interface AddDialogTarget {
  name: string;
  type: string;
  imageUrl?: string;
  description?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMonth(m: any): number {
  if (typeof m.month === "number") return m.month;
  const names = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const idx = names.findIndex((n) => String(m.month).toLowerCase().startsWith(n));
  return idx >= 0 ? idx + 1 : 1;
}

function normalizeRating(r: any): string {
  if (typeof r === "string") return r;
  if (r >= 9) return "excellent";
  if (r >= 7) return "good";
  if (r >= 5) return "average";
  return "poor";
}

// ─── AddItemDialog (Phase C) ──────────────────────────────────────────────────

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
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
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

// ─── §2 Explore Spine ─────────────────────────────────────────────────────────

function ExploreSpine() {
  const chips = [
    { label: "Neighborhoods", href: "#neighborhoods" },
    { label: "Hidden Gems", href: "#gems" },
    { label: "Stay & Do", href: "#supply" },
    { label: "Live Feed", href: "#live-feed" },
    { label: "Media", href: "#media" },
    { label: "Insights", href: "#insights" },
    { label: "Events", href: "#events" },
  ];
  return (
    <nav
      id="explore-spine"
      className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b"
      data-testid="explore-spine"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <a
            key={chip.href}
            href={chip.href}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-primary hover:text-white hover:border-primary transition-colors whitespace-nowrap"
            data-testid={`spine-chip-${chip.href.slice(1)}`}
          >
            {chip.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ─── §7 Media Gallery — carried verbatim from CityDetailView ─────────────────

function MediaGallery({ cityName, mediaData }: { cityName: string; mediaData?: CityMediaResponse }) {
  if (!mediaData || (mediaData.gallery.length === 0 && mediaData.videos.length === 0)) {
    return (
      <Card className="p-8 text-center" data-testid="card-no-media">
        <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No media available yet for {cityName}</p>
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
              <Card key={photo.id} className="overflow-hidden group" data-testid={`photo-card-${idx}`}>
                <div className="relative aspect-[4/3] bg-muted">
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={photo.attractionName || `${cityName} photo`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {photo.isPrimary && (
                    <Badge className="absolute top-2 left-2 bg-primary/90 text-white">
                      <Star className="h-3 w-3 mr-1" />Featured
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
                    {photo.source === "google_places" &&
                      photo.htmlAttributions &&
                      photo.htmlAttributions.length > 0 && (
                        <div
                          className="text-[10px] text-muted-foreground truncate"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              photo.htmlAttributions.join(" "),
                              { ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href"] },
                            ),
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
                      {photo.htmlAttributions && photo.htmlAttributions.length > 0 && (
                        <div
                          className="text-[10px] text-muted-foreground mt-1 max-w-40 truncate"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              photo.htmlAttributions.join(" "),
                              { ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href"] },
                            ),
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

      {/* Attribution */}
      <div className="text-center mt-4 space-y-1">
        <p className="text-xs text-muted-foreground">
          Photos and videos provided by Unsplash, Pexels, and Google Places.
        </p>
        {(mediaData.gallery.some((m) => m.source === "google_places") ||
          Object.values(mediaData.byAttraction).flat().some((m) => m.source === "google_places")) && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <span>Attraction photos</span>
            <span className="font-medium">Powered by Google</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── §8 Insights — all 9 subcards verbatim from CityDetailView ────────────────

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
              <Clock className="h-4 w-4 text-primary" />Best Time to Visit
            </CardTitle>
            {city.aiGeneratedAt && (
              <p className="text-xs text-muted-foreground" data-testid="text-ai-updated">
                Updated {formatDistanceToNow(new Date(city.aiGeneratedAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium" data-testid="text-best-time">
            {city.aiBestTimeToVisit || "Year-round destination"}
          </p>
        </CardContent>
      </Card>

      {/* 2. Recommended Duration */}
      {city.aiOptimalDuration && (
        <Card data-testid="card-optimal-duration">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Compass className="h-4 w-4" />Recommended Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-optimal-duration">{city.aiOptimalDuration}</p>
          </CardContent>
        </Card>
      )}

      {/* 3. Budget Estimate */}
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

      {/* 4. Must-See Attractions */}
      {city.aiMustSeeAttractions?.length > 0 && (
        <Card data-testid="card-must-see">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4" />Must-See Attractions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {city.aiMustSeeAttractions.map((attraction: string, idx: number) => (
                <Badge key={idx} variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20">
                  <MapPin className="h-3 w-3 mr-1" />{attraction}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Local Tips */}
      {city.aiTravelTips?.length > 0 && (
        <Card data-testid="card-travel-tips">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />Local Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {city.aiTravelTips.map((tip: string, idx: number) => (
                <li key={idx} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-0.5">–</span>{tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 6. Cultural Insights */}
      {city.aiLocalInsights && (
        <Card data-testid="card-local-insights">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4" />Cultural Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-local-insights">
              {city.aiLocalInsights}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 7. Safety Notes — yellow card */}
      {city.aiSafetyNotes && (
        <Card className="bg-yellow-50 dark:bg-yellow-900/20" data-testid="card-safety-notes">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />Safety Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-safety-notes">
              {city.aiSafetyNotes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 8. Seasonal Guide — 12-month colour grid */}
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
                  const monthNum = normalizeMonth(month);
                  const rating = normalizeRating(month.rating);
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

      {/* 9. Dates to Avoid — red card */}
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

// ─── Shared section header ────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />{title}
      </h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DiscoverLocationPage() {
  const rawParams = useParams<{ city: string }>();
  const searchString = useSearch();
  const country = new URLSearchParams(searchString).get("country");
  const city = decodeURIComponent(rawParams?.city ?? "");

  const [addDialog, setAddDialog] = useState<AddDialogTarget | null>(null);
  const trackedRef = useRef<Set<string>>(new Set());

  // §1–§6 §9 — main orchestrator
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

  // §7 — media separate query (mirrors CityDetailView)
  const { data: mediaData } = useQuery<CityMediaResponse>({
    queryKey: ["/api/travelpulse/media", city, data?.hero?.data?.city?.country ?? country],
    queryFn: async () => {
      const qs = new URLSearchParams();
      const c = data?.hero?.data?.city?.country ?? country;
      if (c) qs.set("country", c);
      const res = await fetch(`/api/travelpulse/media/${encodeURIComponent(city)}?${qs}`);
      if (!res.ok) throw new Error("Media fetch failed");
      return res.json();
    },
    enabled: !!city && !!data,
    staleTime: 10 * 60 * 1000,
  });

  // Unsplash download tracking (API compliance, mirrors CityDetailView)
  useEffect(() => {
    if (!mediaData) return;
    const unsplash = [
      ...(mediaData.hero?.source === "unsplash" && mediaData.hero.downloadLocationUrl
        ? [mediaData.hero]
        : []),
      ...mediaData.gallery.filter((m) => m.source === "unsplash" && m.downloadLocationUrl),
    ];
    unsplash.forEach((m) => {
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
  const liveActivity: any[] = hero?.liveActivity ?? [];
  const hiddenGems: HiddenGem[] = hero?.hiddenGems ?? [];
  const neighborhoods: Neighborhood[] = data?.neighborhoods?.data ?? [];
  const hotels: any[] = data?.recommendations?.data?.hotels ?? [];
  const activities: any[] = data?.recommendations?.data?.activities ?? [];
  const events: any[] = data?.events?.data?.events ?? [];

  const openAdd = (t: AddDialogTarget) => setAddDialog(t);

  if (!city) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-12">
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
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-10">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <header data-testid="location-view-header">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <MapPin className="w-3.5 h-3.5" />
            <span>{country ?? data?.country ?? "—"}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-city-name">
            {city}
          </h1>
        </header>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {data && (
          <>
            {/* ── §1 HERO ────────────────────────────────────────────────── */}
            <section id="hero" data-testid="section-hero">
              {cityData?.imageUrl && (
                <div className="relative rounded-xl overflow-hidden mb-5 aspect-[21/8]">
                  <img src={cityData.imageUrl} alt={city} className="w-full h-full object-cover" />
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

              <div className="flex flex-wrap gap-3 mb-5">
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
              </div>

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

            {/* ── §2 EXPLORE SPINE ───────────────────────────────────────── */}
            <ExploreSpine />

            {/* ── §3 BY-NEIGHBORHOOD ─────────────────────────────────────── */}
            {neighborhoods.length > 0 && (
              <section id="neighborhoods" data-testid="section-neighborhoods">
                <SectionHeader
                  icon={MapPin}
                  title="By Neighborhood"
                  subtitle="Explore each area's hidden gems, services, and local vibe."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {neighborhoods.map((n) => (
                    <div key={n.id} className="space-y-2">
                      <NeighborhoodCard
                        name={n.name}
                        slug={n.slug}
                        gemCount={n.gemCount ?? 0}
                        serviceCount={n.serviceCount ?? 0}
                        description={n.description}
                        isFeatured={n.isFeatured}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() =>
                          openAdd({
                            name: `${n.name} Day`,
                            type: "neighborhood-day",
                            description: `A day exploring ${n.name} in ${city}`,
                          })
                        }
                        data-testid={`button-add-${n.slug}-day`}
                      >
                        <Plus className="h-3 w-3 mr-1" />Add a {n.name} day
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── §4 GEMS BY CATEGORY ────────────────────────────────────── */}
            {hiddenGems.length > 0 && (
              <section id="gems" data-testid="section-gems">
                <SectionHeader
                  icon={Gem}
                  title="Hidden Gems"
                  subtitle="Authentic local spots curated from real traveller intelligence."
                />
                <div className="space-y-3">
                  {hiddenGems.map((gem, idx) => (
                    <Card key={gem.id || idx} className="overflow-hidden" data-testid={`gem-card-${idx}`}>
                      {/* Responsive: split-row ≥768px, stacked <768px */}
                      <div className="flex flex-col md:flex-row">
                        <div className="md:w-48 flex-shrink-0 bg-muted">
                          {gem.imageUrl ? (
                            <img
                              src={gem.imageUrl}
                              alt={gem.placeName}
                              className="w-full h-36 md:h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-36 md:h-full flex items-center justify-center">
                              <Gem className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <CardContent className="flex-1 p-4">
                          <div className="flex items-start gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold line-clamp-1" data-testid={`gem-name-${idx}`}>
                                {gem.placeName}
                              </p>
                              {gem.placeType && (
                                <Badge variant="outline" className="text-[10px] mt-0.5">
                                  {gem.placeType}
                                </Badge>
                              )}
                            </div>
                            {gem.localRating && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs flex-shrink-0">
                                <Star className="h-3 w-3 mr-0.5 fill-amber-500" />
                                {gem.localRating}
                              </Badge>
                            )}
                          </div>
                          {gem.whyHidden && (
                            <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`gem-why-${idx}`}>
                              {gem.whyHidden}
                            </p>
                          )}
                          {gem.neighborhood && (
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{gem.neighborhood}
                            </p>
                          )}
                        </CardContent>

                        <div className="flex md:flex-col gap-2 p-4 md:border-l items-center md:justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() =>
                              openAdd({
                                name: gem.placeName,
                                type: "hidden-gem",
                                imageUrl: gem.imageUrl ?? undefined,
                                description: gem.whyHidden ?? undefined,
                              })
                            }
                            data-testid={`button-add-gem-${idx}`}
                          >
                            <Plus className="h-3 w-3 mr-1" />Add
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs" data-testid={`button-expert-gem-${idx}`}>
                            <Users className="h-3 w-3 mr-1" />Expert
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* ── §5 SUPPLY (woven) ──────────────────────────────────────── */}
            {(hotels.length > 0 || activities.length > 0) && (
              <section id="supply" data-testid="section-supply">
                <SectionHeader
                  icon={Sparkles}
                  title="Stay & Do"
                  subtitle="AI-curated accommodations, experiences, and local experts."
                />

                {hotels.length > 0 && (
                  <div className="mb-7">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-amber-500" />Accommodations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {hotels.slice(0, 6).map((hotel: any, idx: number) => (
                        <Card key={hotel.id || idx} data-testid={`hotel-card-${idx}`}>
                          {hotel.media?.[0]?.url && (
                            <div className="aspect-[16/9] overflow-hidden rounded-t-lg">
                              <img src={hotel.media[0].url} alt={hotel.name}
                                className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          )}
                          <CardContent className="p-3">
                            <p className="font-medium text-sm line-clamp-1">{hotel.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{hotel.address}</p>
                            {hotel.starRating && (
                              <div className="flex items-center gap-0.5 mt-1">
                                {Array.from({ length: Math.min(5, hotel.starRating) }).map((_, i) => (
                                  <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" className="text-xs flex-1"
                                onClick={() => openAdd({ name: hotel.name, type: "hotel", imageUrl: hotel.media?.[0]?.url, description: hotel.address })}
                                data-testid={`button-add-hotel-${idx}`}>
                                <Plus className="h-3 w-3 mr-1" />Add
                              </Button>
                              {hotel.bookingUrl && (
                                <Button size="sm" variant="outline" className="text-xs" asChild>
                                  <a href={hotel.bookingUrl} target="_blank" rel="noopener noreferrer"
                                    data-testid={`button-book-hotel-${idx}`}>Book</a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {activities.length > 0 && (
                  <div className="mb-7">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary" />Experiences & Activities
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activities.slice(0, 6).map((act: any, idx: number) => (
                        <Card key={act.id || idx} data-testid={`activity-card-${idx}`}>
                          {act.media?.[0]?.url && (
                            <div className="aspect-[16/9] overflow-hidden rounded-t-lg">
                              <img src={act.media[0].url} alt={act.title}
                                className="w-full h-full object-cover" loading="lazy" />
                            </div>
                          )}
                          <CardContent className="p-3">
                            <p className="font-medium text-sm line-clamp-1">{act.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{act.description}</p>
                            {act.price && <p className="text-xs font-medium mt-1">{act.price}</p>}
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" className="text-xs flex-1"
                                onClick={() => openAdd({ name: act.title, type: "activity", imageUrl: act.media?.[0]?.url, description: act.description })}
                                data-testid={`button-add-activity-${idx}`}>
                                <Plus className="h-3 w-3 mr-1" />Add
                              </Button>
                              {act.bookingUrl && (
                                <Button size="sm" variant="outline" className="text-xs" asChild>
                                  <a href={act.bookingUrl} target="_blank" rel="noopener noreferrer"
                                    data-testid={`button-book-activity-${idx}`}>Book</a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <Card className="bg-primary/5 border-primary/20" data-testid="expert-cta">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">Plan with a local expert</p>
                      <p className="text-xs text-muted-foreground">
                        Personalised advice from someone who knows {city} inside out
                      </p>
                    </div>
                    <Button size="sm" data-testid="button-find-expert">
                      <Users className="h-3 w-3 mr-1" />Find Expert
                    </Button>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* ── §6 LIVE FEED ───────────────────────────────────────────── */}
            {liveActivity.length > 0 && (
              <section id="live-feed" data-testid="section-live-feed">
                <SectionHeader
                  icon={Activity}
                  title="Live Feed"
                  subtitle="What travellers are doing right now."
                />
                <ScrollArea className="h-80">
                  <div className="space-y-3 pr-4">
                    {liveActivity.map((item: any, idx: number) => (
                      <Card key={idx} className="p-3" data-testid={`live-feed-item-${idx}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {item.userName || item.userDisplayName || "Traveller"}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {item.activityText || item.description}
                            </p>
                            {item.placeName && (
                              <p className="text-xs text-primary flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />{item.placeName}
                              </p>
                            )}
                          </div>
                          {item.occurredAt && (
                            <p className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDistanceToNow(new Date(item.occurredAt), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </section>
            )}

            {/* ── §7 MEDIA GALLERY ───────────────────────────────────────── */}
            <section id="media" data-testid="section-media">
              <SectionHeader
                icon={ImageIcon}
                title="Photos & Videos"
                subtitle="Destination media from Unsplash, Pexels, and Google."
              />
              <MediaGallery cityName={city} mediaData={mediaData} />
            </section>

            {/* ── §8 AI INSIGHTS ─────────────────────────────────────────── */}
            <section id="insights" data-testid="section-insights">
              <SectionHeader
                icon={Brain}
                title="AI Insights"
                subtitle="Personalised travel intelligence powered by Traveloure AI."
              />
              <InsightsSection city={cityData} />
            </section>

            {/* ── §9 FOOTER HANDOFF ──────────────────────────────────────── */}
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
        onOpenChange={(v) => { if (!v) setAddDialog(null); }}
      />
    </Layout>
  );
}
