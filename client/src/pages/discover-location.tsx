import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
 * Five-section IA per docs/CITY_DETAIL_VIEW_RETIREMENT_PLAN.md:
 *   1. Hero (overview + happening-now strip + live activity)
 *   2. Supply rail (featured + recommendations, sorted via featured-sort guardrail)
 *   3. By Neighborhood (gems + services rolled up by city_neighborhoods slug)
 *   4. Media (videos + photo gallery — full surface, not a hero fold)
 *   5. Insights panel (the 9 AI subcards — full surface, not a hero fold)
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

function SectionShell({
  icon: Icon,
  title,
  subtitle,
  section,
  phaseNote,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  section: SectionResult<any> | null;
  phaseNote: string;
  children?: React.ReactNode;
}) {
  return (
    <Card data-testid={`section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="w-5 h-5 text-primary" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {section?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{section.error}</AlertDescription>
          </Alert>
        )}
        {children}
        <p className="text-xs text-muted-foreground italic border-t pt-3">
          {phaseNote}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DiscoverLocationPage() {
  const params = useParams<{ city: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const country = searchParams.get("country");
  const cityRaw = params?.city ?? "";
  const city = decodeURIComponent(cityRaw);

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
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <header className="space-y-1" data-testid="location-view-header">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{country ?? data?.country ?? "—"}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-city-name">
            {city}
          </h1>
          {data?.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </header>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
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
      </div>
    </Layout>
  );
}
