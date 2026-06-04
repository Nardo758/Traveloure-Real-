import { useRef, useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Layout } from "@/components/layout";
import { AddToExperienceDialog } from "@/components/add-to-experience-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, MapPin, Zap, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CityFeedCardGem, CityFeedCardEvent, CityFeedCardSupply, CityFeedCardVendorService } from "@/components/city-feed-card";
import { CityFeedCardExpert } from "@/components/city-feed-card-expert";
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
  { id: "services", label: "Services" },
  { id: "experts", label: "Experts" },
  { id: "events", label: "Events" },
  { id: "photo_spots", label: "Photo Spots" },
  { id: "vibe", label: "Vibe" },
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

// ─── Hero section ─────────────────────────────────────────────────────────────

function HeroSection({
  city,
  country,
  heroData,
  heroPhoto,
}: {
  city: string;
  country: string | null;
  heroData: any;
  heroPhoto?: string | null;
}) {
  const cityIntel = heroData?.city;

  return (
    <section data-testid="section-hero" className="space-y-4">
      {/* Hero photo — 21:9 wide cinematic crop */}
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

    </section>
  );
}

/** Render a single filler card (non-neighborhood) within a shared grid row. */
function FillerCard({
  item,
  city,
  scheduledDate,
  onAdd,
}: {
  item: FeedItem;
  city: string;
  scheduledDate: string | null;
  onAdd: (item: any) => void;
}) {
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
    case "expert":
      return <CityFeedCardExpert key={item.id} expert={item.data} city={city} />;
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
    case "vendor-service":
      return (
        <CityFeedCardVendorService
          key={item.id}
          service={item.data}
          city={city}
        />
      );
    default:
      return null;
  }
}

/**
 * Blended feed — groups consecutive filler items into shared bento grids so
 * the continuous rhythm is [bento] [neighborhood] [bento] [neighborhood] …
 * rather than one card per row.
 */
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
        No items to show yet for {city}. Check back soon!
      </p>
    );
  }

  // Bucket items into alternating sections.
  // Neighborhood containers break the current card group into their own full-width block.
  // Everything else is grouped into 3-col bento grids.
  type Section =
    | { type: "neighborhood"; item: FeedItem }
    | { type: "group"; items: FeedItem[] };

  const sections: Section[] = [];
  let currentGroup: FeedItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      sections.push({ type: "group", items: [...currentGroup] });
      currentGroup = [];
    }
  };

  for (const item of items) {
    if (item.kind === "neighborhood") {
      flushGroup();
      sections.push({ type: "neighborhood", item });
    } else if (item.kind === "city-separator") {
      flushGroup();
      sections.push({ type: "city-separator" as any, item });
    } else {
      currentGroup.push(item);
    }
  }
  flushGroup();

  return (
    <div className="space-y-6" data-testid="city-feed">
      {sections.map((section, si) => {
        if (section.type === "neighborhood") {
          return (
            <NeighborhoodContainer
              key={section.item.id}
              neighborhood={section.item.data}
              city={city}
              scheduledDate={scheduledDate}
              onAdd={onAdd}
            />
          );
        }
        if ((section as any).type === "city-separator") {
          const sep = (section as any).item as FeedItem;
          return (
            <div
              key={sep.id}
              className="flex items-center gap-3 py-2"
              data-testid={`separator-${sep.id}`}
            >
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap px-2">
                More in {sep.data.cityName}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          );
        }
        return (
          <div
            key={`group-${si}`}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          >
            {section.items.map((item) => (
              <FillerCard
                key={item.id}
                item={item}
                city={city}
                scheduledDate={scheduledDate}
                onAdd={onAdd}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Flat filtered feed (dissolves neighborhoods) ────────────────────────────

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
          case "expert":
            return (
              <CityFeedCardExpert
                key={item.id}
                expert={item.data}
                city={city}
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
          case "vendor-service":
            return (
              <CityFeedCardVendorService
                key={item.id}
                service={item.data}
                city={city}
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
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(searchString);
  const country = searchParams.get("country");
  const cityRaw = params?.city ?? "";
  const city = decodeURIComponent(cityRaw);

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

  const heroCountry = country ?? data?.country ?? null;

  // Media — separate query for hero photo
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

  // Experts for this city
  const { data: expertsData } = useQuery<any[]>({
    queryKey: ["/api/experts", { location: city }],
    queryFn: async () => {
      const res = await fetch(`/api/experts?location=${encodeURIComponent(city)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!city,
    staleTime: 10 * 60 * 1000,
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
  const experts = expertsData ?? [];
  const events = data?.events?.data?.events ?? [];
  const supplyHotels = data?.recommendations?.data?.hotels ?? [];
  const supplyActivities = data?.recommendations?.data?.activities ?? [];
  const platformServices = data?.services?.data ?? [];

  const feedItems: FeedItem[] = data
    ? buildFeedStream(neighborhoods, allGems, experts, events, supplyHotels, supplyActivities, platformServices)
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
            />

            {/* ── Spine filter bar (sticky) ─────────────────────────────── */}
            <SpineFilterBar active={activeFilter} onSelect={setActiveFilter} />

            {/* ── Blended feed ──────────────────────────────────────────── */}
            {activeFilter === "all" ? (
              <FeedRenderer
                items={filteredItems}
                city={city}
                scheduledDate={null}
                onAdd={handleAdd}
              />
            ) : (
              <FlatFilteredFeed
                items={filteredItems}
                city={city}
                scheduledDate={null}
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
