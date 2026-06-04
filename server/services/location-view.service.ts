/**
 * Location View aggregation orchestrator (v2 spec §3, §5, §10 — Phase 1b-3).
 *
 * Fans out, in parallel, to the three endpoints that already exist:
 *   - travelpulse/cities/:cityName            (hero + gems + happening-now)
 *   - travelpulse/ai-recommendations/...      (hotels + activities)
 *   - travelpulse/fever-events/:cityName      (events)
 *
 * Calls services directly (not via HTTP) to avoid serialization round-trips.
 * Each section returns a `{ data, error }` envelope so one failing source
 * never blanks the whole location view — the failure mode the spec exists
 * to avoid is the beautiful-empty-page.
 *
 * Also surfaces the seeded neighborhoods for the page (`city_neighborhoods`),
 * since the Phase 3 ecosystem-unit needs them alongside the rest.
 *
 * Phase 262: also returns DB-sourced hidden gems and active platform services.
 */

import { db } from "../db";
import { cityNeighborhoods, travelPulseHiddenGems, providerServices } from "@shared/schema";
import { eq, sql, and, ilike } from "drizzle-orm";
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
  events: SectionResult<any>;
  neighborhoods: SectionResult<Neighborhood[]>;
  /** All hidden gems for the city from the DB (all placeTypes, all neighborhoods). */
  gems: SectionResult<any[]>;
  /** Active provider services for the city from the DB. */
  services: SectionResult<any[]>;
}

export interface LocationViewOptions {
  /** ISO month 1-12; defaults to current month for the events window. */
  month?: number;
  /** ISO year; defaults to current year. */
  year?: number;
  /** Cap on recommendations + events lists. */
  limit?: number;
  /** ISO date string (YYYY-MM-DD) for date-aware planning mode. Passed through to payload; no behavior change yet. */
  date?: string;
}

const SECTION_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[location-view] ${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function settle<T>(
  label: string,
  promise: Promise<T>,
): Promise<SectionResult<T>> {
  try {
    const data = await withTimeout(promise, SECTION_TIMEOUT_MS, label);
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

interface CacheEntry {
  payload: LocationViewPayload;
  expiresAt: number;
}

const locationViewCache = new Map<string, CacheEntry>();

class LocationViewService {
  async getLocationView(
    cityName: string,
    country: string | null,
    opts: LocationViewOptions = {},
  ): Promise<LocationViewPayload> {
    const cacheKey = `v2|${cityName}:${country ?? ""}`;
    const cached = locationViewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }

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
      const { aiRecommendationEngineService } = await import("./recommendation.service");
      return aiRecommendationEngineService.getAIEnhancedRecommendations(
        { cityName, country: countryForCall },
        limit,
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

    // Neighborhoods for this city — annotated with gem + service counts + top gems[]
    // Uses aggregate queries + one bulk gem fetch instead of N+1 round-trips.
    const neighborhoodsPromise = (async () => {
      const neighborhoods = await db
        .select()
        .from(cityNeighborhoods)
        .where(eq(cityNeighborhoods.city, cityName))
        .orderBy(cityNeighborhoods.name);

      const [gemRows, svcRows, allCityGems] = await Promise.all([
        db
          .select({
            neighborhood: travelPulseHiddenGems.neighborhood,
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(travelPulseHiddenGems)
          .where(eq(travelPulseHiddenGems.city, cityName))
          .groupBy(travelPulseHiddenGems.neighborhood),
        db
          .select({
            neighborhood: providerServices.neighborhood,
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(providerServices)
          .where(
            and(
              eq(providerServices.status, "active"),
              ilike(providerServices.location, `%${cityName}%`),
            ),
          )
          .groupBy(providerServices.neighborhood),
        // Fetch all gems for this city in one query — used to populate gems[] per neighborhood
        db
          .select()
          .from(travelPulseHiddenGems)
          .where(eq(travelPulseHiddenGems.city, cityName))
          .orderBy(travelPulseHiddenGems.gemScore),
      ]);

      const gemCountMap = new Map<string, number>();
      for (const row of gemRows) {
        if (row.neighborhood) gemCountMap.set(row.neighborhood, row.count);
      }

      const svcCountMap = new Map<string, number>();
      for (const row of svcRows) {
        if (row.neighborhood) svcCountMap.set(row.neighborhood, row.count);
      }

      // Group gems by neighborhood slug for the gems[] embed
      const gemsBySlug = new Map<string, any[]>();
      for (const gem of allCityGems) {
        if (gem.neighborhood) {
          if (!gemsBySlug.has(gem.neighborhood)) gemsBySlug.set(gem.neighborhood, []);
          gemsBySlug.get(gem.neighborhood)!.push(gem);
        }
      }

      return neighborhoods.map((n) => ({
        ...n,
        gemCount: gemCountMap.get(n.slug) ?? 0,
        serviceCount: svcCountMap.get(n.slug) ?? 0,
        gems: (gemsBySlug.get(n.slug) ?? []).slice(0, 6),
      }));
    })();

    // DB hidden gems for the city — all placeTypes, all neighborhoods
    const gemsPromise = db
      .select()
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.city, cityName))
      .orderBy(travelPulseHiddenGems.gemScore);

    // Active platform services for this city — location field ILIKE city name
    const servicesPromise = db
      .select()
      .from(providerServices)
      .where(
        and(
          eq(providerServices.status, "active"),
          ilike(providerServices.location, `%${cityName}%`),
        ),
      );

    const [hero, recommendations, events, neighborhoods, gems, services] = await Promise.all([
      settle("hero", heroPromise),
      settle("recommendations", recommendationsPromise),
      settle("events", eventsPromise),
      settle("neighborhoods", neighborhoodsPromise),
      settle("gems", gemsPromise),
      settle("services", servicesPromise),
    ]);

    const payload: LocationViewPayload = {
      city: cityName,
      country: country ?? (hero.data as any)?.country ?? null,
      generatedAt: new Date().toISOString(),
      hero,
      recommendations,
      events,
      neighborhoods,
      gems,
      services,
    };

    locationViewCache.set(cacheKey, { payload, expiresAt: Date.now() + 5 * 60 * 1000 });

    return payload;
  }
}

export const locationViewService = new LocationViewService();
