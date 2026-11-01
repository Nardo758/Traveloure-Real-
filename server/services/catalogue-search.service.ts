/**
 * Row 305 (CS-3 brief 8, D): catalogue single-search, server half.
 *
 * Each source is a READER that returns results already shaped by `shared/catalogue-search.ts`, and
 * `assembleCatalogueResults` enforces the rules every result must keep (one allowed action, no excluded
 * partner, no duplicate). The readers reuse what main already has and restate none of it:
 *   · listings      — `storage.unifiedSearch` (the public read gate every listing surface uses);
 *                      `book` only when `listingRequiresRequest` says the listing is instantly bookable,
 *                      otherwise `add_to_plan` (there is no request action here).
 *   · checked places — `place_facts` rows named by free text in this market. A place is shown only when one of
 *                      its facts is publishable (`isPublishable`) and attributed (`publicFactAttribution`), and
 *                      live (`isFactLive`). A place whose publishable facts have all expired shows as not checked
 *                      yet, with the official site (`officialTopLevelUrl`). No source, no publish.
 *   · official sites — `content_sources` rows the admin registered: active, `official`, terms checked, in this
 *                      market. A `link_out_no_link` source (JR Central) is plain text, so `add_to_plan`.
 *   · Viator         — `searchViatorLive` (live, nothing stored), signed-in only like its own route. The
 *                      response carries the live price and its time, never a review, rating or photo.
 *   · hotels         — LiteAPI `hotel_cache` rows (static content); links only, so `add_to_plan`.
 *
 * Not searched, on purpose: GetYourGuide and Booking.com (excluded), Travelpayouts (nothing stored from it;
 * main's Klook reader is a Travelpayouts stub that invents category cards, so Klook returns nothing until a
 * real Klook source exists), Google Places (display-only data must not become an addable result), the web.
 * Nothing here writes.
 */
import { and, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { contentSources, hotelCache, placeFacts } from "@shared/schema";
import {
  assembleCatalogueResults,
  catalogueMatches,
  CATALOGUE_PER_SOURCE_LIMIT,
  CATALOGUE_QUERY_MIN,
  normalizeCatalogueQuery,
  type CatalogueResult,
  type CatalogueSearchResponse,
} from "@shared/catalogue-search";
import { isFactLive, isPublishable, publicFactAttribution, type FactLike } from "@shared/content-facts";
import { officialTopLevelUrl } from "@shared/fact-review";
import { listingRequiresRequest } from "./buy-action-payload";
import { searchViatorLive } from "./viator-live.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

export interface CatalogueSearchInput {
  city: string;
  query: string;
  signedIn: boolean;
  now?: Date;
}

export interface CatalogueReaders {
  listings(city: string, query: string): Promise<CatalogueResult[]>;
  checkedPlaces(market: string, query: string, now: Date): Promise<CatalogueResult[]>;
  officialSites(market: string, query: string): Promise<CatalogueResult[]>;
  viator(city: string, query: string): Promise<CatalogueResult[]>;
  hotels(city: string, query: string): Promise<CatalogueResult[]>;
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** A listing result: `book` only for an instantly bookable listing of ours; otherwise addable only. */
export function listingResult(row: {
  id: string;
  serviceName: string | null;
  priceType?: string | null;
  bookingMode?: string | null;
  location?: string | null;
}): CatalogueResult | null {
  const title = (row.serviceName ?? "").trim();
  if (!title) return null;
  const bookable = listingRequiresRequest({ priceType: row.priceType ?? null, bookingMode: row.bookingMode ?? null }, null) == null;
  return {
    id: `listing:${row.id}`,
    kind: "listing",
    title,
    action: bookable ? { type: "book", href: `/services/${row.id}` } : { type: "add_to_plan" },
    addToPlan: { title, providerServiceId: row.id, ...(row.location ? { locationName: row.location } : {}) },
  };
}

type FactRow = FactLike & {
  placeRef: string;
  supersededBy?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceHomepage?: string | null;
  sourceTermsClass?: string | null;
};

/**
 * One result per named place. The place appears only through a publishable fact: its newest live, attributed
 * fact gives the checked line; if every publishable fact has expired it shows as not checked yet.
 */
export function checkedPlaceResults(rows: readonly FactRow[], query: string, now: Date): CatalogueResult[] {
  const byPlace = new Map<string, FactRow[]>();
  for (const r of rows) {
    const name = (r.placeRef ?? "").trim();
    if (!name || !catalogueMatches(name, query)) continue;
    if (!isPublishable(r)) continue;
    const list = byPlace.get(name) ?? [];
    list.push(r);
    byPlace.set(name, list);
  }
  const out: CatalogueResult[] = [];
  for (const [name, facts] of Array.from(byPlace.entries())) {
    const sorted = [...facts].sort((a, b) => Date.parse(String(b.fetchedAt ?? 0)) - Date.parse(String(a.fetchedAt ?? 0)));
    const base = { id: `place:${name.toLowerCase()}`, kind: "checked_place" as const, title: name, action: { type: "add_to_plan" as const }, addToPlan: { title: name, locationName: name } };
    const live = sorted.find((f) => isFactLive(f, now) && publicFactAttribution(f));
    if (live) {
      const a = publicFactAttribution(live)!;
      out.push({ ...base, checked: { sourceName: a.sourceName, sourceUrl: a.sourceUrl, checked: a.checked } });
      continue;
    }
    if (sorted.every((f) => !isFactLive(f, now))) {
      const newest = sorted[0];
      out.push({ ...base, notChecked: { officialUrl: officialTopLevelUrl({ homepage: newest.sourceHomepage, termsClass: newest.sourceTermsClass }) } });
    }
  }
  return out;
}

export function officialSiteResult(row: { id: string; name: string; homepage: string | null; termsClass: string | null }): CatalogueResult {
  const url = officialTopLevelUrl({ homepage: row.homepage, termsClass: row.termsClass });
  return {
    id: `official:${row.id}`,
    kind: "official_site",
    title: row.name,
    action: url ? { type: "book_on_site", site: row.name, href: url } : { type: "add_to_plan" },
    addToPlan: { title: row.name },
  };
}

export const defaultCatalogueReaders: CatalogueReaders = {
  async listings(city, query) {
    const { services } = await storage.unifiedSearch({ query, location: city, limit: CATALOGUE_PER_SOURCE_LIMIT });
    return services.map((s: any) => listingResult(s)).filter((r): r is CatalogueResult => r != null);
  },
  async checkedPlaces(market, query, now) {
    const rows = await db
      .select({
        placeRef: placeFacts.placeRef,
        origin: placeFacts.origin,
        license: placeFacts.license,
        factType: placeFacts.factType,
        verifiedAt: placeFacts.verifiedAt,
        expiresAt: placeFacts.expiresAt,
        fetchedAt: placeFacts.fetchedAt,
        supersededBy: placeFacts.supersededBy,
        sourceUrl: placeFacts.sourceUrl,
        sourceName: contentSources.name,
        sourceLicenseClass: contentSources.licenseClass,
        sourcePublicOk: contentSources.publicOk,
        sourceHomepage: contentSources.homepage,
        sourceTermsClass: contentSources.termsClass,
      })
      .from(placeFacts)
      .leftJoin(contentSources, eq(placeFacts.sourceId, contentSources.id))
      .where(
        and(
          eq(placeFacts.placeRefKind, "free_text"),
          eq(placeFacts.market, market),
          sql`${placeFacts.supersededBy} IS NULL`,
          ilike(placeFacts.placeRef, like(query)),
        ),
      )
      .orderBy(desc(placeFacts.fetchedAt))
      .limit(200);
    return checkedPlaceResults(rows as FactRow[], query, now);
  },
  async officialSites(market, query) {
    const rows = await db
      .select({ id: contentSources.id, name: contentSources.name, homepage: contentSources.homepage, termsClass: contentSources.termsClass })
      .from(contentSources)
      .where(
        and(
          eq(contentSources.active, true),
          eq(contentSources.licenseClass, "official"),
          isNotNull(contentSources.termsCheckedAt),
          eq(contentSources.market, market),
          ilike(contentSources.name, like(query)),
        ),
      )
      .limit(CATALOGUE_PER_SOURCE_LIMIT);
    return rows.map(officialSiteResult);
  },
  async viator(city, query) {
    const live = await searchViatorLive({ city, surface: "browse" });
    if (live.status !== "ok" || !live.asOf) return [];
    return live.items
      .filter((i) => catalogueMatches(i.title, query) && i.productUrl)
      .map((i) => ({
        id: `viator:${i.productCode}`,
        kind: "partner_viator" as const,
        title: i.title,
        attribution: "Viator",
        action: { type: "book_on_site" as const, site: "Viator", href: i.productUrl! },
        addToPlan: { title: i.title, viatorProductCode: i.productCode },
        ...(i.price != null && i.currency ? { livePrice: { amount: i.price, currency: i.currency, asOf: live.asOf! } } : {}),
      }));
  },
  async hotels(city, query) {
    const rows = await db
      .select({ id: hotelCache.id, name: hotelCache.name })
      .from(hotelCache)
      .where(and(eq(hotelCache.provider, "liteapi"), ilike(hotelCache.city, city), ilike(hotelCache.name, like(query))))
      .limit(CATALOGUE_PER_SOURCE_LIMIT);
    return rows
      .filter((h) => (h.name ?? "").trim())
      .map((h) => ({
        id: `hotel:${h.id}`,
        kind: "hotel" as const,
        title: h.name!.trim(),
        action: { type: "add_to_plan" as const },
        addToPlan: { title: h.name!.trim(), locationName: city },
      }));
  },
};

/** A source that fails returns nothing; the others still answer. */
async function safely(read: () => Promise<CatalogueResult[]>, label: string): Promise<CatalogueResult[]> {
  try {
    return await read();
  } catch (err) {
    console.warn(`[catalogue-search] ${label} failed: ${(err as any)?.code ?? (err as any)?.name ?? "error"}`);
    return [];
  }
}

export async function searchCatalogue(input: CatalogueSearchInput, readers: CatalogueReaders = defaultCatalogueReaders): Promise<CatalogueSearchResponse> {
  const query = normalizeCatalogueQuery(input.query);
  const city = (input.city ?? "").trim();
  const market = resolveMarketSlug(city);
  if (!market || query.length < CATALOGUE_QUERY_MIN) return { city: market ? city : null, query, results: [] };
  const now = input.now ?? new Date();
  const groups = await Promise.all([
    safely(() => readers.listings(city, query), "listings"),
    safely(() => readers.checkedPlaces(market, query, now), "checked places"),
    safely(() => readers.officialSites(market, query), "official sites"),
    input.signedIn ? safely(() => readers.viator(city, query), "viator") : Promise.resolve([]),
    safely(() => readers.hotels(city, query), "hotels"),
  ]);
  return { city, query, results: assembleCatalogueResults(groups) };
}
