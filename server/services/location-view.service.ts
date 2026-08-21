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
import { cityNeighborhoods, travelPulseHiddenGems, providerServices, serviceProviderForms, serviceCategories, expertNeighborhoods, expertTemplates, users, dmoRawContent, dmoExtractedPlaces, travelPulseCalendarEvents } from "@shared/schema";
import { eq, sql, and, or, isNull, ilike, inArray, asc, desc, gte } from "drizzle-orm";
import { travelPulseService } from "./travelpulse.service";
import { feverService } from "./fever.service";
import { resolveBookability } from "@shared/bookability";
import { buildTrendContext, normalizeInventoryClass, type InventoryClass } from "@shared/discover-stub";
import { sortByFeaturedAdjusted } from "./featured-sort";

/**
 * ── FP-1 / B4 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ─────────────────────────────────
 * CITY SCOPING — prefer the STRUCTURED column, keep the old behavior as the fallback.
 *
 * This read used to be a single `ilike(location, '%<city>%')` over a free-text field the console
 * does not always collect. On one real Kyoto catalog that excluded 7 of 11 listings: two because
 * the provider typed neighbourhoods ("Arashiyama, Sagano, Kinkaku-ji") instead of the city name,
 * five because their `location` is the literal column default `'Unknown'`.
 *
 * The predicate now reads:
 *   city = '<city>'                       — the structured, server-derived column (utils/service-city.ts)
 *   OR (city IS NULL AND location ILIKE …) — grandfathering: rows predating the derivation
 *
 * Two properties this shape has and the old one did not:
 *  - A row whose `city` says OSAKA can no longer be dragged onto the Kyoto page by the word
 *    "Kyoto" appearing anywhere in its prose. Structured wins where it exists.
 *  - A row with NO city and NO matching prose stays honestly ABSENT rather than being guessed
 *    into some city (§13). It becomes visible by its owner naming a neighborhood, not by us
 *    inferring one.
 */
function cityScopePredicate(cityName: string) {
  return or(
    eq(providerServices.city, cityName),
    and(isNull(providerServices.city), ilike(providerServices.location, `%${cityName}%`)),
  );
}

export interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

export interface NeighborhoodLocalExpert {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  /** Approved + published expert_templates count for this expert (public packages). */
  packagesCount: number;
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
  /** Top gems (up to 6) pre-fetched for the city feed bento grid. */
  gems: any[];
  /** One local expert covering this neighborhood (expert_neighborhoods, deterministic pick), or null. */
  localExpert: NeighborhoodLocalExpert | null;
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
  /**
   * Operation Trailhead T4.3 — PUBLISHED scraped/DMO stubs for this market.
   * External inventory (facts-and-links, NEVER a bookable platform service): the client
   * renders these with a DISTINCT card treatment so a traveler can never mistake one for a
   * bookable listing. `trendContext` is the T4.4 render-time headline (never stored on a row).
   */
  externalStubs: SectionResult<ExternalStubsSection>;
}

/** One published external stub (a DMO guide) + its located child places. */
export interface ExternalStub {
  id: string;
  inventoryClass: InventoryClass;   // 'external' — carried so the client card treatment is honest
  name: string;
  city: string;
  country: string;
  neighborhood: string | null;
  contentType: string;              // the stub's category grain
  shortDescription: string | null;  // facts only — never scraped prose as editorial voice
  primaryImageUrl: string | null;
  /** The source link the click-out CTA rides (tracked via the affiliate_clicks rail). */
  sourceUrl: string;
  sourcePageTitle: string | null;
  license: string | null;           // ODbL/attribution obligation travels with the card
  /** Located child places only (unlocated stay honestly off the map). */
  places: Array<{ id: string; name: string; position: number; latitude: string | null; longitude: string | null }>;
  placeCount: number;
}

export interface ExternalStubsSection {
  /** Honest ceiling copy: "‹Market› is trending · ‹Event› approaching", or null. Render-time only. */
  trendContext: string | null;
  stubs: ExternalStub[];
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
    // v4: payload shape change — neighborhoods now carry localExpert (Feed v2 F8).
    // v5: payload shape change — adds externalStubs (Trailhead T4.3 published scraped stubs).
    const cacheKey = `v5|${cityName}:${country ?? ""}`;
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
              // FP-1 / B4: same structured-first scoping as the services query below.
              cityScopePredicate(cityName),
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

      // Local expert per neighborhood (Feed v2 F8): one deterministic pick from
      // expert_neighborhoods (lead first, then earliest created), enriched with a
      // packagesCount from expert_templates — approved + published only (the same
      // gate as the public /api/expert-templates feed; §10 read-gate). One row
      // query + one grouped count query for the whole neighborhood set — no N+1.
      const neighborhoodIds = neighborhoods.map((n) => n.id);
      const localExpertByNeighborhood = new Map<string, { expertId: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null }>();
      const packagesCountByExpert = new Map<string, number>();
      if (neighborhoodIds.length > 0) {
        const expertRows = await db
          .select({
            neighborhoodId: expertNeighborhoods.neighborhoodId,
            expertId: expertNeighborhoods.expertId,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(expertNeighborhoods)
          .innerJoin(users, eq(users.id, expertNeighborhoods.expertId))
          .where(inArray(expertNeighborhoods.neighborhoodId, neighborhoodIds))
          .orderBy(sql`${expertNeighborhoods.isLead} DESC`, asc(expertNeighborhoods.createdAt), asc(expertNeighborhoods.id));
        for (const row of expertRows) {
          if (!localExpertByNeighborhood.has(row.neighborhoodId)) {
            localExpertByNeighborhood.set(row.neighborhoodId, row);
          }
        }
        const pickedExpertIds = Array.from(new Set(Array.from(localExpertByNeighborhood.values()).map((r) => r.expertId)));
        if (pickedExpertIds.length > 0) {
          const countRows = await db
            .select({
              expertId: expertTemplates.expertId,
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(expertTemplates)
            .where(
              and(
                inArray(expertTemplates.expertId, pickedExpertIds),
                eq(expertTemplates.approvalStatus, "approved"),
                eq(expertTemplates.isPublished, true),
              ),
            )
            .groupBy(expertTemplates.expertId);
          for (const row of countRows) {
            packagesCountByExpert.set(row.expertId, row.count);
          }
        }
      }

      return neighborhoods.map((n) => {
        const expertRow = localExpertByNeighborhood.get(n.id) ?? null;
        return {
          ...n,
          gemCount: gemCountMap.get(n.slug) ?? 0,
          serviceCount: svcCountMap.get(n.slug) ?? 0,
          // bookability is DERIVED (never stored) via the single shared resolver.
          gems: (gemsBySlug.get(n.slug) ?? [])
            .slice(0, 6)
            .map((gem) => ({ ...gem, bookability: resolveBookability(gem) })),
          localExpert: expertRow
            ? {
                id: expertRow.expertId,
                firstName: expertRow.firstName,
                lastName: expertRow.lastName,
                profileImageUrl: expertRow.profileImageUrl,
                packagesCount: packagesCountByExpert.get(expertRow.expertId) ?? 0,
              }
            : null,
        };
      });
    })();

    // DB hidden gems for the city — all placeTypes, all neighborhoods
    const gemsPromise = db
      .select()
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.city, cityName))
      .orderBy(travelPulseHiddenGems.gemScore)
      // bookability is DERIVED (never stored) via the single shared resolver.
      .then((rows) => rows.map((gem) => ({ ...gem, bookability: resolveBookability(gem) })));

    // Active platform services for this city — joined with vendor form + category
    // so the frontend card can show website link and category label without extra queries.
    const servicesPromise = db
      .select({
        id: providerServices.id,
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        shortDescription: providerServices.shortDescription,
        description: providerServices.description,
        serviceType: providerServices.serviceType,
        categoryId: providerServices.categoryId,
        price: providerServices.price,
        priceType: providerServices.priceType,
        deliveryMethod: providerServices.deliveryMethod,
        // FP-1 / B4b: `productShape` is what lets the city feed route an accommodation listing
        // into the STAY spine (a 2-room machiya with 60 published nights used to sit in this very
        // payload while the Stay tab reported "No stay found in Kyoto"); `city` is the structured
        // value the scoping above now prefers, exposed so a client can tell derived from
        // grandfathered.
        productShape: providerServices.productShape,
        city: providerServices.city,
        neighborhood: providerServices.neighborhood,
        serviceImage: providerServices.serviceImage,
        location: providerServices.location,
        isFeatured: providerServices.isFeatured,
        contentAffinityTags: providerServices.contentAffinityTags,
        approvalStatus: providerServices.approvalStatus,
        averageRating: providerServices.averageRating,
        reviewCount: providerServices.reviewCount,
        bookingsCount: providerServices.bookingsCount,
        whatIncluded: providerServices.whatIncluded,
        // Vendor identity fields from joined tables
        vendorWebsite: serviceProviderForms.website,
        vendorBookingLink: serviceProviderForms.bookingLink,
        vendorBusinessName: serviceProviderForms.businessName,
        vendorPhoto: serviceProviderForms.photo1,
        categoryName: serviceCategories.name,
        categorySlug: serviceCategories.slug,
      })
      .from(providerServices)
      .leftJoin(serviceProviderForms, eq(serviceProviderForms.userId, providerServices.userId))
      .leftJoin(serviceCategories, eq(serviceCategories.id, providerServices.categoryId))
      .where(
        and(
          eq(providerServices.status, "active"),
          // F2 READ-GATE (CLAUDE.md §1 / D1a). GET /api/discover/location/:city is a
          // PUBLIC, unauthenticated, `Cache-Control: public` route, so it is exactly the
          // kind of surface the F2 sweep gated: offerings are born `submitted`, and
          // without this predicate a listing that no admin has approved surfaced on the
          // public city page. `status='active'` is the OWNER's on/off switch — it is NOT
          // an approval, and was never a substitute for one.
          eq(providerServices.approvalStatus, "approved"),
          // FP-1 / B4: structured `city` first, free-text `location` only as the grandfathering
          // fallback for rows that predate the server-side derivation (see cityScopePredicate).
          cityScopePredicate(cityName),
        ),
      )
      // CURATION ORDER. This replaced `.orderBy(providerServices.isFeatured)`, which was
      // an INVERTED sort: Postgres orders booleans ASC by default and false < true, so
      // every admin-featured service sank to the BOTTOM of the city page — the exact
      // opposite of the intent.
      //
      // The fix is not `desc(isFeatured)` either. That is the naive ranking the
      // featured-sort guardrail exists to prevent ("never bury a better native result"):
      // it would let a mediocre featured listing outrank a genuinely well-reviewed one.
      // Instead featuring is a BOUNDED BOOST over a real quality score.
      //
      // Quality is honest or absent (§13): it is derived only from real aggregates
      // (averageRating over reviewCount, both real columns maintained from real reviews),
      // and a service with NO reviews scores `null` = UNMEASURED, never a stand-in number.
      // Unmeasured items still take the featured boost — see featuredAdjustedScore, where
      // the quality FLOOR deliberately does not apply to them.
      .then((rows) =>
        sortByFeaturedAdjusted(
          [...rows],
          (r) => {
            const count = Number(r.reviewCount ?? 0);
            if (count <= 0) return null; // unmeasured — no reviews, so no quality claim
            const rating = Number(r.averageRating ?? 0);
            if (!Number.isFinite(rating) || rating <= 0) return null;
            return (rating / 5) * 100; // 0–5 stars → 0–100, the primitive's scale
          },
        ),
      );

    // ── Trailhead T4.3 — PUBLISHED external stubs for this market ──────────────────────────────
    // The traveler storefront for scraped content. Reads dmo_raw_content gated on the SAME
    // published + not-rejected predicate the admin flip writes (T4.2), scoped to the city, and
    // joins its child dmo_extracted_places. The class ('external') travels with each stub so the
    // client renders a DISTINCT, non-bookable card. T4.4 trend lens is joined at RENDER only
    // (buildTrendContext) — no trend value is written to any content row.
    const externalStubsPromise = (async (): Promise<ExternalStubsSection> => {
      // Gate mirrors shared/discover-stub.ts passesDiscoverFilter: published + not rejected/quarantined.
      const stubRows = await db
        .select({
          id: dmoRawContent.id,
          inventoryClass: dmoRawContent.inventoryClass,
          name: dmoRawContent.name,
          city: dmoRawContent.city,
          country: dmoRawContent.country,
          neighborhood: dmoRawContent.neighborhood,
          contentType: dmoRawContent.contentType,
          shortDescription: dmoRawContent.shortDescription,
          primaryImageUrl: dmoRawContent.primaryImageUrl,
          sourceUrl: dmoRawContent.sourceUrl,
          sourcePageTitle: dmoRawContent.sourcePageTitle,
          license: dmoRawContent.license,
        })
        .from(dmoRawContent)
        .where(
          and(
            eq(dmoRawContent.discoverPageVisible, true),
            ilike(dmoRawContent.city, cityName),
            sql`${dmoRawContent.status} NOT IN ('rejected', 'quarantined')`,
          ),
        )
        .orderBy(dmoRawContent.contentType, dmoRawContent.name)
        .limit(24);

      // Child places for the fetched stubs — located ones only reach the map (§13: an unlocated
      // place is never guessed onto coordinates). We keep all for the count, flag located client-side.
      const placesByStub = new Map<string, ExternalStub["places"]>();
      if (stubRows.length > 0) {
        const placeRows = await db
          .select({
            id: dmoExtractedPlaces.id,
            dmoContentId: dmoExtractedPlaces.dmoContentId,
            name: dmoExtractedPlaces.name,
            position: dmoExtractedPlaces.position,
            latitude: dmoExtractedPlaces.latitude,
            longitude: dmoExtractedPlaces.longitude,
          })
          .from(dmoExtractedPlaces)
          .where(inArray(dmoExtractedPlaces.dmoContentId, stubRows.map((s) => s.id)))
          .orderBy(dmoExtractedPlaces.position);
        for (const p of placeRows) {
          if (!placesByStub.has(p.dmoContentId)) placesByStub.set(p.dmoContentId, []);
          placesByStub.get(p.dmoContentId)!.push({ id: p.id, name: p.name, position: p.position, latitude: p.latitude, longitude: p.longitude });
        }
      }

      // T4.4 trend lens — computed at render, discarded after. marketTrending = the city cleared
      // the market-grain resolver's confidence floor (present in getTrendingCities with a positive
      // trendingScore); imminentEventName = nearest forward calendar event within the window.
      let trendContext: string | null = null;
      if (stubRows.length > 0) {
        try {
          const now = new Date();
          const horizon = new Date(now);
          horizon.setDate(horizon.getDate() + 45);
          const todayIso = now.toISOString().split("T")[0];
          const horizonIso = horizon.toISOString().split("T")[0];
          const [trendingCities, calEvents] = await Promise.all([
            travelPulseService.getTrendingCities(8).catch(() => []),
            // Direct DB read (no live-API fallback on the cached render path) — nearest forward event.
            db
              .select({ eventName: travelPulseCalendarEvents.eventName, startDate: travelPulseCalendarEvents.startDate })
              .from(travelPulseCalendarEvents)
              .where(
                and(
                  eq(travelPulseCalendarEvents.city, cityName.toLowerCase()),
                  gte(travelPulseCalendarEvents.startDate, todayIso),
                  sql`${travelPulseCalendarEvents.startDate} <= ${horizonIso}`,
                ),
              )
              .orderBy(asc(travelPulseCalendarEvents.startDate))
              .limit(1)
              .catch(() => [] as Array<{ eventName: string; startDate: string }>),
          ]);
          const marketTrending = (trendingCities ?? []).some(
            (c: any) => typeof c?.cityName === "string" && c.cityName.toLowerCase() === cityName.toLowerCase() && Number(c?.trendingScore ?? 0) > 0,
          );
          const nearest = (calEvents ?? [])[0];
          trendContext = buildTrendContext({
            marketTrending,
            marketName: cityName,
            imminentEventName: nearest?.eventName ?? null,
          });
        } catch {
          trendContext = null; // trend lens is best-effort; its absence never blanks the stubs
        }
      }

      const stubs: ExternalStub[] = stubRows.map((s) => {
        const places = placesByStub.get(s.id) ?? [];
        return {
          id: s.id,
          inventoryClass: normalizeInventoryClass(s.inventoryClass),
          name: s.name,
          city: s.city,
          country: s.country,
          neighborhood: s.neighborhood,
          contentType: s.contentType,
          shortDescription: s.shortDescription,
          primaryImageUrl: s.primaryImageUrl,
          sourceUrl: s.sourceUrl,
          sourcePageTitle: s.sourcePageTitle,
          license: s.license,
          places,
          placeCount: places.length,
        };
      });

      return { trendContext, stubs };
    })();

    const [hero, recommendations, events, neighborhoods, gems, services, externalStubs] = await Promise.all([
      settle("hero", heroPromise),
      settle("recommendations", recommendationsPromise),
      settle("events", eventsPromise),
      settle("neighborhoods", neighborhoodsPromise),
      settle("gems", gemsPromise),
      settle("services", servicesPromise),
      settle("externalStubs", externalStubsPromise),
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
      externalStubs,
    };

    locationViewCache.set(cacheKey, { payload, expiresAt: Date.now() + 5 * 60 * 1000 });

    return payload;
  }
}

export const locationViewService = new LocationViewService();
