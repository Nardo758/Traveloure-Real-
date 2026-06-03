/**
 * Location View aggregation orchestrator (v2 spec §3, §5, §10 — Phase 1b-3).
 *
 * Fans out, in parallel, to the four endpoints that already exist:
 *   - travelpulse/cities/:cityName            (hero + gems + happening-now)
 *   - travelpulse/ai-recommendations/...      (hotels + activities)
 *   - travelpulse/enriched/:cityName          (eat · do · attractions)
 *   - travelpulse/fever-events/:cityName      (events)
 *
 * Calls services directly (not via HTTP) to avoid serialization round-trips.
 * Each section returns a `{ data, error }` envelope so one failing source
 * never blanks the whole location view — the failure mode the spec exists
 * to avoid is the beautiful-empty-page.
 *
 * Also surfaces the seeded neighborhoods for the page (`city_neighborhoods`),
 * since the Phase 3 ecosystem-unit needs them alongside the rest.
 */

import { db } from "../db";
import { cityNeighborhoods, travelPulseHiddenGems, providerServices } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { travelPulseService } from "./travelpulse.service";
import { feverService } from "./fever.service";

export interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

export interface Neighborhood {
  id: string;
  city: string;
  country: string;
  name: string;
  slug: string;
  centroidLat: string;
  centroidLng: string;
  radiusKm: string | null;
  description: string | null;
  isFeatured: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  gemCount: number;
  serviceCount: number;
}

export interface LocationViewPayload {
  city: string;
  country: string | null;
  generatedAt: string;
  hero: SectionResult<any>;
  recommendations: SectionResult<any>;
  enriched: SectionResult<any>;
  events: SectionResult<any>;
  neighborhoods: SectionResult<Neighborhood[]>;
}

export interface LocationViewOptions {
  /** ISO month 1-12; defaults to current month for the events window. */
  month?: number;
  /** ISO year; defaults to current year. */
  year?: number;
  /** Cap on recommendations + events lists. */
  limit?: number;
}

async function settle<T>(
  label: string,
  promise: Promise<T>,
): Promise<SectionResult<T>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (err: any) {
    console.error(`[location-view] ${label} section failed:`, err?.message ?? err);
    return { data: null, error: err?.message ?? "Unknown error" };
  }
}

function deriveEventWindow(opts: LocationViewOptions): { startDate: string; endDate: string } {
  const now = new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

class LocationViewService {
  async getLocationView(
    cityName: string,
    country: string | null,
    opts: LocationViewOptions = {},
  ): Promise<LocationViewPayload> {
    const limit = opts.limit ?? 20;
    const { startDate, endDate } = deriveEventWindow(opts);

    // Hero / pulse / happening (drives neighborhood lookup country fallback too)
    const heroPromise = travelPulseService.getCityIntelligence(cityName);

    // AI recommendations — needs country. If caller didn't pass one, we try to
    // pull it off the hero result before firing the call. That's a small
    // sequential chain inside the otherwise-parallel fan-out.
    const recommendationsPromise = (async () => {
      let countryForCall = country;
      if (!countryForCall) {
        try {
          const hero = await heroPromise;
          countryForCall = (hero as any)?.country ?? null;
        } catch {
          // hero failure already surfaces via the hero envelope; skip recs.
        }
      }
      if (!countryForCall) {
        throw new Error("country unknown — pass ?country= to fetch AI recommendations");
      }
      const { aiRecommendationEngineService } = await import("./ai-recommendation-engine.service");
      return aiRecommendationEngineService.getAIEnhancedRecommendations(
        { cityName, country: countryForCall },
        limit,
      );
    })();

    // Enriched eat/do/attractions
    const enrichedPromise = (async () => {
      const { contentEnrichmentService } = await import("./content-enrichment.service");
      const enriched = await contentEnrichmentService.getEnrichedContentForCity(cityName);
      return (
        enriched ?? {
          cityName,
          country: country ?? "",
          lastUpdated: new Date(),
          restaurants: [],
          attractions: [],
          nightlife: [],
          hiddenGems: [],
          trendingNow: [],
        }
      );
    })();

    // Events (Fever)
    const eventsPromise = (async () => {
      const result = await feverService.searchEvents({
        city: cityName,
        startDate,
        endDate,
        limit,
        sortBy: "date",
      });
      return result ?? { events: [], total: 0, page: 1, totalPages: 0, city: null };
    })();

    // Neighborhoods for this city — annotated with gem + service counts
    const neighborhoodsPromise = (async () => {
      const neighborhoods = await db
        .select()
        .from(cityNeighborhoods)
        .where(eq(cityNeighborhoods.city, cityName))
        .orderBy(cityNeighborhoods.name);

      const annotated = await Promise.all(
        neighborhoods.map(async (n) => {
          const [gemRows, svcRows] = await Promise.all([
            db
              .select()
              .from(travelPulseHiddenGems)
              .where(and(eq(travelPulseHiddenGems.city, cityName), eq(travelPulseHiddenGems.neighborhood, n.slug))),
            db.select().from(providerServices).where(eq(providerServices.neighborhood, n.slug)),
          ]);
          return {
            ...n,
            gemCount: gemRows.length,
            serviceCount: svcRows.length,
          };
        }),
      );
      return annotated;
    })();

    const [hero, recommendations, enriched, events, neighborhoods] = await Promise.all([
      settle("hero", heroPromise),
      settle("recommendations", recommendationsPromise),
      settle("enriched", enrichedPromise),
      settle("events", eventsPromise),
      settle("neighborhoods", neighborhoodsPromise),
    ]);

    return {
      city: cityName,
      country: country ?? (hero.data as any)?.country ?? null,
      generatedAt: new Date().toISOString(),
      hero,
      recommendations,
      enriched,
      events,
      neighborhoods,
    };
  }
}

export const locationViewService = new LocationViewService();
