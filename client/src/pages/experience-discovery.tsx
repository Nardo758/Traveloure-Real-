import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo-head";
import {
  Search,
  MapPin,
  Zap,
  Building2,
  Calendar,
  Plane,
  Utensils,
  LayoutGrid,
} from "lucide-react";
import { UnifiedResultGrid } from "@/components/unified-result-card";
import type { UnifiedResult } from "@/components/unified-result-card";

// ─── Type filter config ───────────────────────────────────────────────────────

type ExperienceType = "all" | "activity" | "hotel" | "event" | "flight" | "restaurant";

const typeIcons: Record<ExperienceType, React.ElementType> = {
  all: LayoutGrid,
  activity: Zap,
  hotel: Building2,
  event: Calendar,
  flight: Plane,
  restaurant: Utensils,
};

const typeColors: Record<ExperienceType, string> = {
  all: "",
  activity: "text-emerald-600",
  hotel: "text-blue-600",
  event: "text-violet-600",
  flight: "text-sky-600",
  restaurant: "text-orange-600",
};

const typeLabels: Record<ExperienceType, string> = {
  all: "All",
  activity: "Activities",
  hotel: "Hotels",
  event: "Events",
  flight: "Flights",
  restaurant: "Restaurants",
};

const ALL_TYPES: ExperienceType[] = ["all", "activity", "hotel", "event", "flight", "restaurant"];

// When "all" is selected we query all meaningful discoverable types (not flights — those need
// origin/dest pairs) and when a specific type is selected we pass it directly.
const NON_FLIGHT_TYPES: ExperienceType[] = ["activity", "hotel", "event", "restaurant"];

// ─── Catalog item → UnifiedResult mapper ─────────────────────────────────────

function catalogItemToUnifiedResult(item: any): UnifiedResult {
  return {
    id: String(item.id),
    name: item.title,
    rating: item.rating ?? null,
    reviewCount: item.reviewCount ?? null,
    priceLevel: item.priceLevel ?? null,
    address: item.destination ?? null,
    description: item.description ?? null,
    imageUrl: item.imageUrl ?? null,
    source: item.provider === "opentable"
      ? "opentable"
      : item.provider === "booking_com" || item.provider === "booking"
        ? "booking_com"
        : item.provider === "viator"
          ? "viator"
          : item.provider === "fever"
            ? "fever"
            : item.type === "restaurant"
              ? "opentable"
              : "serp",
    isPartner: true,
    category: item.categories?.[0] ?? item.type ?? null,
    bookingToken: item.bookingToken ?? null,
    cuisine: item.cuisine ?? (item.type === "restaurant" ? (item.categories?.[0] ?? null) : null),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExperienceDiscoveryPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);

  const [destination, setDestination] = useState(urlParams.get("destination") ?? "");
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<ExperienceType>("all");

  // Resolve the `type` query param list to send to the API
  const typeParam =
    selectedType === "all"
      ? NON_FLIGHT_TYPES.join(",")
      : selectedType;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/catalog/search", destination, query, typeParam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (destination) params.set("destination", destination);
      if (query) params.set("query", query);
      params.set("type", typeParam);
      params.set("limit", "24");
      const res = await fetch(`/api/catalog/search?${params}`);
      if (!res.ok) throw new Error("Failed to load experiences");
      return res.json();
    },
    enabled: !!destination || !!query,
  });

  const results: UnifiedResult[] = (data?.items ?? []).map(catalogItemToUnifiedResult);

  return (
    <Layout>
      <SEOHead
        title="Discover Experiences"
        description="Browse activities, hotels, restaurants, events and more — all in one place."
      />

      {/* Hero search band */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border py-10">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h1 className="text-3xl font-bold mb-2">Discover Experiences</h1>
          <p className="text-muted-foreground mb-6">
            Activities, hotels, restaurants, events and more — filtered by what you love.
          </p>

          <div className="flex gap-2 flex-col sm:flex-row">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Destination (e.g. Paris, Tokyo)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="pl-9"
                data-testid="input-destination"
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or keyword"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                data-testid="input-query"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div
            className="flex gap-2 py-3 overflow-x-auto scrollbar-none"
            data-testid="type-filter-row"
          >
            {ALL_TYPES.map((type) => {
              const Icon = typeIcons[type];
              const active = selectedType === type;
              return (
                <Button
                  key={type}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={`flex-shrink-0 gap-1.5 ${!active ? typeColors[type] : ""}`}
                  onClick={() => setSelectedType(type)}
                  data-testid={`chip-type-${type}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {typeLabels[type]}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 max-w-7xl py-8">
        {!destination && !query ? (
          <div className="text-center py-20 text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Enter a destination to get started</p>
            <p className="text-sm mt-1">
              Try "Paris", "Tokyo", or "New York"
            </p>
          </div>
        ) : (
          <>
            {!isLoading && results.length > 0 && (
              <p className="text-sm text-muted-foreground mb-4">
                {results.length} result{results.length !== 1 ? "s" : ""}{" "}
                {destination ? `in ${destination}` : ""}{" "}
                {selectedType !== "all" ? `· ${typeLabels[selectedType]}` : ""}
              </p>
            )}
            <UnifiedResultGrid
              results={results}
              destination={destination}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
