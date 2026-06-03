import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, MapPin, Sparkles, Image as ImageIcon, Brain, Compass } from "lucide-react";

/**
 * Location View — Phase 2 shell (v2 spec §3, §5; Decision #5 destination).
 *
 * Five-section IA per docs/CITY_DETAIL_VIEW_RETIREMENT_PLAN.md:
 *   1. Hero (overview + happening-now strip + live activity)
 *   2. Supply rail (featured + recommendations, sorted via featured-sort guardrail)
 *   3. By Neighborhood (gems + services rolled up by city_neighborhoods slug)
 *   4. Media (videos + photo gallery — full surface, not a hero fold)
 *   5. Insights panel (the 9 AI subcards — full surface, not a hero fold)
 *
 * Phase 2 ships the shell and wires it to the orchestrator endpoint
 * (/api/discover/location/:city, built in Phase 1b-3) with per-section
 * { data, error } envelopes. Each section currently renders a placeholder
 * showing what data it received — Phase 3 replaces the placeholders with
 * real renderers. The data plumbing is end-to-end now, so Phase 3 is purely
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
          Phase 3 will render: {phaseNote}
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
              phaseNote="hero card with city facts, live weather, top 1-3 events, and the live-activity strip."
            >
              <p className="text-sm text-muted-foreground">
                Data source: travelpulse cities endpoint. Got{" "}
                {data.hero.data ? "a payload" : "no data"}.
              </p>
            </SectionShell>

            {/* 2. Supply rail — featured + recommendations */}
            <SectionShell
              icon={Compass}
              title="Supply"
              subtitle="Featured providers and AI recommendations, ranked with the featured-sort guardrail."
              section={data.recommendations}
              phaseNote="provider cards (responsive split-row/stacked) + the 'Add to experience template' action."
            >
              <p className="text-sm text-muted-foreground">
                Data source: ai-recommendation-engine. Returned{" "}
                {Array.isArray(data.recommendations.data)
                  ? `${data.recommendations.data.length} item(s)`
                  : data.recommendations.data
                    ? "a payload"
                    : "no data"}
                .
              </p>
            </SectionShell>

            {/* 3. By Neighborhood — gems + services rolled up by neighborhood */}
            <SectionShell
              icon={MapPin}
              title="By Neighborhood"
              subtitle="The ecosystem unit: each neighborhood's gems + services + featured providers."
              section={data.neighborhoods}
              phaseNote="neighborhood card grid with rollup counts, click-through to neighborhood detail."
            >
              <p className="text-sm text-muted-foreground">
                {Array.isArray(data.neighborhoods.data)
                  ? `${data.neighborhoods.data.length} neighborhood(s) seeded for ${city}.`
                  : "No neighborhoods seeded yet for this city — Phase 4 blended fill picks up the slack here."}
              </p>
              {Array.isArray(data.neighborhoods.data) && data.neighborhoods.data.length > 0 && (
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {data.neighborhoods.data.slice(0, 8).map((n: any) => (
                    <li key={n.id}>
                      <span className="font-medium">{n.name}</span>
                      <span className="text-muted-foreground"> — {n.slug}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionShell>

            {/* 4. Media — full surface, NOT a hero fold (per retirement plan audit) */}
            <SectionShell
              icon={ImageIcon}
              title="Media"
              subtitle="Destination videos and photo gallery."
              section={data.enriched}
              phaseNote="videos grid + photo gallery, embedded inline (was CityDetailView's Media tab)."
            >
              <p className="text-sm text-muted-foreground">
                Data source: enriched content service. Will also pull from cities/{`{city}`}/media in Phase 3.
              </p>
            </SectionShell>

            {/* 5. Insights panel — full surface, the 9 AI subcards */}
            <SectionShell
              icon={Brain}
              title="Insights"
              subtitle="Best time, optimal duration, budget tiers, must-see, tips, safety, seasonal highlights."
              section={data.hero /* AI fields ride on the city intelligence payload */}
              phaseNote="9 AI insight subcards (was CityDetailView's AI Insights tab)."
            >
              <p className="text-sm text-muted-foreground">
                Sources from travelpulse cities endpoint's aiBestTimeToVisit / aiOptimalDuration /
                aiBudgetEstimate / aiMustSeeAttractions / aiTravelTips / aiLocalInsights /
                aiSafetyNotes / aiSeasonalHighlights fields.
              </p>
            </SectionShell>

            {/* Events — by-date view per §4. Sits at the bottom for now; Phase 6 may break it out. */}
            <SectionShell
              icon={Sparkles}
              title="Events (this month)"
              subtitle="By-date view (v2 spec §4). Phase 6 may extract this into its own surface."
              section={data.events}
              phaseNote="events list with date-matching that writes user_experience_items.scheduled_date."
            >
              <p className="text-sm text-muted-foreground">
                Data source: Fever events service. Got{" "}
                {data.events.data?.events
                  ? `${data.events.data.events.length} event(s) for the current month window`
                  : "no events for the window"}
                .
              </p>
            </SectionShell>
          </div>
        )}
      </div>
    </Layout>
  );
}
