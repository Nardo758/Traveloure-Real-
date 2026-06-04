import { useRef, useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, MapPin, Sparkles, X, Zap, Users, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CityFeedCardGem, CityFeedCardEvent, CityFeedCardSupply } from "@/components/city-feed-card";
import { NeighborhoodContainer } from "@/components/neighborhood-container";
import { buildFeedStream, filterFeedStream, type FeedItem } from "@/lib/feed-stream";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  enriched?: SectionResult<any>;
  events: SectionResult<any>;
  neighborhoods: SectionResult<any[]>;
  gems: SectionResult<any[]>;
  services?: SectionResult<any[]>;
}

interface CityMediaResponse {
  hero: any | null;
  gallery: any[];
  videos: any[];
  byAttraction: Record<string, any[]>;
}

// ─── Spine filter bar ─────────────────────────────────────────────────────────

const SPINE_CHIPS = [
  { id: "all", label: "All" },
  { id: "eat", label: "Eat" },
  { id: "do", label: "Do" },
  { id: "stay", label: "Stay" },
  { id: "events", label: "Events" },
  { id: "photo_spots", label: "Photo Spots" },
];

function SpineFilterBar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b py-2"
      data-testid="spine-filter-bar"
    >
      <div className="flex gap-2 overflow-x-auto pb-0.5 px-1 scrollbar-none">
        {SPINE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => onSelect(chip.id)}
            className={cn(
              "flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              active === chip.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted-foreground/20 text-foreground",
            )}
            data-testid={`spine-chip-${chip.id}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Date pill ───────────────────────────────────────────────────────────────

function PlanningDatePill({
  date,
  onDismiss,
}: {
  date: string;
  onDismiss: () => void;
}) {
  const formatted = (() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });
    } catch {
      return date;
    }
  })();

  return (
    <div
      className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-full px-3 py-1 text-sm font-medium"
      data-testid="planning-date-pill"
    >
      <Calendar className="w-3.5 h-3.5" />
      Planning {formatted}
      <button
        onClick={onDismiss}
        className="text-primary/70 hover:text-primary ml-1"
        data-testid="btn-dismiss-date-pill"
        aria-label="Clear planning date"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── On-date highlights strip ─────────────────────────────────────────────────

function OnDateHighlights({
  date,
  events,
  heroData,
}: {
  date: string;
  events: any[];
  heroData: any;
}) {
  const formatted = (() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return date;
    }
  })();

  const pinnedEvent = events?.[0];
  const seasonalPick = heroData?.city?.currentHighlight;

  if (!pinnedEvent && !seasonalPick) return null;

  return (
    <div
      className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3"
      data-testid="on-date-highlights"
    >
      <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
        <Sparkles className="w-4 h-4" />
        On {formatted}
      </p>
      {pinnedEvent && (
        <div className="flex items-start gap-3">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{pinnedEvent.title || pinnedEvent.name}</p>
            {pinnedEvent.location && (
              <p className="text-xs text-muted-foreground">{pinnedEvent.location}</p>
            )}
          </div>
        </div>
      )}
      {seasonalPick && (
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">{seasonalPick}</p>
        </div>
      )}
    </div>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────

function HeroSection({
  city,
  country,
  heroData,
  heroPhoto,
  planningDate,
  onDismissDate,
}: {
  city: string;
  country: string | null;
  heroData: any;
  heroPhoto?: string | null;
  planningDate?: string | null;
  onDismissDate?: () => void;
}) {
  const cityIntel = heroData?.city;

  return (
    <section data-testid="section-hero" className="space-y-4">
      {/* Hero photo — 16:9 / wide */}
      {heroPhoto && (
        <div className="relative rounded-xl overflow-hidden aspect-[16/6] md:aspect-[21/7]">
          <img
            src={heroPhoto}
            alt={city}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
              <MapPin className="w-4 h-4" />
              <span>{country ?? cityIntel?.country ?? ""}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white" data-testid="text-city-name">
              {city}
            </h1>
          </div>
        </div>
      )}

      {!heroPhoto && (
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <MapPin className="w-4 h-4" />
            <span>{country ?? cityIntel?.country ?? ""}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-city-name">
            {city}
          </h1>
        </div>
      )}

      {/* Pulse stats row */}
      <div className="flex flex-wrap items-center gap-3">
        {cityIntel?.pulseScore !== undefined && (
          <div className="flex items-center gap-1.5 text-sm">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">{cityIntel.pulseScore}</span>
            <span className="text-muted-foreground">Pulse</span>
          </div>
        )}
        {cityIntel?.activeTravelers !== undefined && (
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="font-semibold">{cityIntel.activeTravelers}</span>
            <span className="text-muted-foreground">active travelers</span>
          </div>
        )}
        {cityIntel?.currentHighlight && (
          <p className="text-sm text-muted-foreground">
            {cityIntel.highlightEmoji} {cityIntel.currentHighlight}
          </p>
        )}
      </div>

      {/* Planning date pill */}
      {planningDate && onDismissDate && (
        <PlanningDatePill date={planningDate} onDismiss={onDismissDate} />
      )}
    </section>
  );
}

// ─── Feed renderer ────────────────────────────────────────────────────────────

function FeedRenderer({
  items,
  city,
  scheduledDate,
  onAdd,
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid="feed-empty">
        No items match the current filter. Try selecting "All" to see everything.
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="city-feed">
      {items.map((item) => {
        switch (item.kind) {
          case "neighborhood":
            return (
              <NeighborhoodContainer
                key={item.id}
                neighborhood={item.data}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={onAdd}
              />
            );

          case "loose-gem":
            return (
              <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <CityFeedCardGem
                  gem={item.data}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={onAdd}
                />
              </div>
            );

          case "event":
            return (
              <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <CityFeedCardEvent
                  event={item.data}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={onAdd}
                />
              </div>
            );

          case "supply-hotel":
          case "supply-activity":
            return (
              <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <CityFeedCardSupply
                  item={item.data}
                  kind={item.kind}
                  city={city}
                  scheduledDate={scheduledDate}
                  onAdd={onAdd}
                />
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Flat filtered feed (when a type filter dissolves neighborhoods) ──────────

function FlatFilteredFeed({
  items,
  city,
  scheduledDate,
  onAdd,
  activeFilter,
}: {
  items: FeedItem[];
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
  activeFilter: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid="feed-empty-filtered">
        No {activeFilter.replace("_", " ")} found in {city}.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" data-testid="city-feed-flat">
      {items.map((item) => {
        switch (item.kind) {
          case "loose-gem":
            return (
              <CityFeedCardGem
                key={item.id}
                gem={item.data}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={onAdd}
              />
            );
          case "event":
            return (
              <CityFeedCardEvent
                key={item.id}
                event={item.data}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={onAdd}
              />
            );
          case "supply-hotel":
          case "supply-activity":
            return (
              <CityFeedCardSupply
                key={item.id}
                item={item.data}
                kind={item.kind}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={onAdd}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoverLocationPage() {
  const params = useParams<{ city: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const country = searchParams.get("country");
  const cityRaw = params?.city ?? "";
  const city = decodeURIComponent(cityRaw);

  // Date-awareness — from URL ?date=YYYY-MM-DD only
  const urlDate = searchParams.get("date");
  const [planningDate, setPlanningDate] = useState<string | null>(urlDate);

  // Spine filter
  const [activeFilter, setActiveFilter] = useState("all");

  // Add-to-experience dialog
  const [addToExperienceOpen, setAddToExperienceOpen] = useState(false);
  const [addToExperienceItem, setAddToExperienceItem] = useState<any>(null);

  const handleAdd = (item: any) => {
    setAddToExperienceItem(item);
    setAddToExperienceOpen(true);
  };

  // ── Data fetching ───────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<LocationViewPayload>({
    queryKey: ["/api/discover/location", city, country, planningDate],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (country) qs.set("country", country);
      if (planningDate) qs.set("date", planningDate);
      const res = await fetch(
        `/api/discover/location/${encodeURIComponent(city)}${qs.toString() ? `?${qs.toString()}` : ""}`,
      );
      if (!res.ok) throw new Error(`Location view fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!city,
  });

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

  // Unsplash download tracking (API compliance)
  const trackedDownloadsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mediaData) return;
    const unsplashMedia = [
      ...(mediaData.hero?.source === "unsplash" && mediaData.hero?.downloadLocationUrl
        ? [mediaData.hero]
        : []),
      ...mediaData.gallery.filter((m) => m.source === "unsplash" && m.downloadLocationUrl),
    ];
    unsplashMedia.forEach((media) => {
      if (media.downloadLocationUrl && !trackedDownloadsRef.current.has(media.downloadLocationUrl)) {
        trackedDownloadsRef.current.add(media.downloadLocationUrl);
        fetch("/api/travelpulse/media/track-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadLocationUrl: media.downloadLocationUrl }),
        }).catch(() => {});
      }
    });
  }, [mediaData]);

  // ── Derived feed data ───────────────────────────────────────────────────
  const neighborhoods = data?.neighborhoods?.data ?? [];
  const allGems = data?.gems?.data ?? [];
  const events = data?.events?.data?.events ?? [];
  const supplyHotels = data?.recommendations?.data?.hotels ?? [];
  const supplyActivities = data?.recommendations?.data?.activities ?? [];

  const feedItems = data
    ? buildFeedStream(neighborhoods, allGems, events, supplyHotels, supplyActivities)
    : [];

  const filteredItems =
    activeFilter === "all" ? feedItems : filterFeedStream(feedItems, activeFilter);

  const heroPhoto =
    mediaData?.hero?.url ??
    mediaData?.gallery?.[0]?.url ??
    data?.hero?.data?.city?.imageUrl ??
    null;

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
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Skeleton className="aspect-[4/3] rounded-xl" />
              <Skeleton className="aspect-[4/3] rounded-xl" />
              <Skeleton className="aspect-[4/3] rounded-xl" />
            </div>
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
          <div className="space-y-6">
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <HeroSection
              city={city}
              country={heroCountry}
              heroData={data.hero?.data}
              heroPhoto={heroPhoto}
              planningDate={planningDate}
              onDismissDate={() => setPlanningDate(null)}
            />

            {/* ── On-date highlights (only when ?date= is active) ───────── */}
            {planningDate && (
              <OnDateHighlights
                date={planningDate}
                events={events}
                heroData={data.hero?.data}
              />
            )}

            {/* ── Spine filter bar (sticky) ─────────────────────────────── */}
            <SpineFilterBar active={activeFilter} onSelect={setActiveFilter} />

            {/* ── Blended feed ──────────────────────────────────────────── */}
            {activeFilter === "all" ? (
              <FeedRenderer
                items={filteredItems}
                city={city}
                scheduledDate={planningDate}
                onAdd={handleAdd}
              />
            ) : (
              <FlatFilteredFeed
                items={filteredItems}
                city={city}
                scheduledDate={planningDate}
                onAdd={handleAdd}
                activeFilter={activeFilter}
              />
            )}
          </div>
        )}

        {/* Add-to-experience dialog */}
        <AddToExperienceDialog
          item={addToExperienceItem}
          open={addToExperienceOpen}
          onOpenChange={setAddToExperienceOpen}
        />
      </div>
    </Layout>
  );
}
