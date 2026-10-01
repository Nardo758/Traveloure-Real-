/**
 * city-events.service.ts — the ONE writer and the ONE reader of `city_events` (ledger
 * `2026-09-28-city-events`, migration 330).
 *
 * Writer: `seedCityEvents` INSERTS, keyed on (source, source_id) with ON CONFLICT DO
 * NOTHING — an existing row is never overwritten, never deleted. ONE ruled exception (decision-maker,
 * Sep 30, 2026): on an existing `source = 'manual'` row the seeder may FILL `vertical` and
 * `series_key` where the stored value is NULL — those two fields only, never a stated value
 * replaced, nothing else ever rewritten. It derives `nights` and
 * `neighbourhood_id` itself; a seed entry cannot type them. An entry is refused (logged, not
 * inserted) when its city is not an operating market, it has no venue or start, or its ticket
 * link points at a partner's domain — the registry's hosts, read by the SAME `loadPartnerHosts`
 * the blog's source admission reads (ledger `2026-09-28-landing-doors`).
 *
 * Reader: `listUpcomingCityEvents` returns renderable events starting in the next
 * CITY_EVENTS_WINDOW_DAYS, soonest first, with every display value derived here from the row
 * (countdown, local first/last date) so the page types nothing.
 */
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { cityEvents, cityNeighborhoods, type InsertCityEvent, type CityEvent } from "@shared/schema";
import {
  CITY_EVENTS_WINDOW_DAYS,
  daysUntil,
  deriveNights,
  ticketUrlRefusal,
  isRenderableCityEvent,
  localDate,
  localTime,
  nearestNeighbourhoodId,
  type CityEventCard,
  type CityEventsPayload,
  type CityEventSource,
  type NeighbourhoodCandidate,
  isCityEventVertical,
  CITY_EVENT_SERIES_KEY_RE,
} from "@shared/city-events";
import { getMarketByCityName, timezoneForMarket } from "./trend-engine/operating-markets";
import { logger } from "../infrastructure/logger";
import { loadPartnerHosts } from "./partner-hosts.service";
import { NOMINATIM_MIN_INTERVAL_MS, resolveVenueFromOsm, type VenueCoordinate, type VenueQuery } from "./venue-geocode.service";

/** What a seed entry may state. Derived columns (nights, neighbourhood) are not accepted. */
export interface CityEventSeedEntry {
  source: CityEventSource;
  sourceId: string;
  series?: string | null;
  /** Migration 335: one of CITY_EVENT_VERTICALS; omitted = not stated. */
  vertical?: string | null;
  /** Migration 335: lower-case kebab key grouping one recurring series across years and cities. */
  seriesKey?: string | null;
  title: string;
  /** An operating market's city name, e.g. "Kyoto". */
  city: string;
  venue: string;
  venueLat?: number | null;
  venueLng?: number | null;
  /**
   * Lookup-only (never stored): where the venue is, when it differs from `city` (Suzuka, Portimão).
   * With no coordinates stated, the seeder asks OpenStreetMap for "venue, locality, country".
   */
  venueLocality?: string | null;
  /**
   * ISO 8601 with offset, e.g. "2026-11-20T19:00:00+09:00". For a date-only event, local midnight of
   * the first day — and leave `startTimeKnown` unset, so no "00:00" is ever shown (migration 337).
   */
  startsAt: string;
  /** TRUE only when the organiser published the time of day. Unset = date only. */
  startTimeKnown?: boolean;
  endsAt?: string | null;
  ticketUrl?: string | null;
  billedArtists?: string | null;
  blurb?: string | null;
  imagePath?: string | null;
}

export type CityEventRefusal =
  | "unknown_city"
  | "missing_venue"
  | "bad_start"
  | "bad_end"
  | "affiliate_ticket_url"
  | "resale_ticket_url"
  | "empty_source_id"
  | "unknown_vertical"
  | "bad_series_key";

/**
 * Pure: turn a seed entry into the row to insert, or name why it is refused. The neighbourhood
 * candidates and the partner hosts are passed in so this stays testable without a database.
 */
export function buildCityEventRow(
  entry: CityEventSeedEntry,
  neighbourhoods: readonly NeighbourhoodCandidate[],
  partnerHosts: readonly string[],
): { row: InsertCityEvent } | { refused: CityEventRefusal } {
  if (!entry.sourceId || !entry.sourceId.trim()) return { refused: "empty_source_id" };
  const market = getMarketByCityName(entry.city.trim());
  if (!market) return { refused: "unknown_city" };
  if (!entry.venue || !entry.venue.trim()) return { refused: "missing_venue" };
  const startsAt = new Date(entry.startsAt);
  if (!entry.startsAt || Number.isNaN(startsAt.getTime())) return { refused: "bad_start" };
  let endsAt: Date | null = null;
  if (entry.endsAt) {
    endsAt = new Date(entry.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() < startsAt.getTime()) return { refused: "bad_end" };
  }
  const vertical = entry.vertical?.trim() || null;
  if (vertical !== null && !isCityEventVertical(vertical)) return { refused: "unknown_vertical" };
  const seriesKey = entry.seriesKey?.trim() || null;
  if (seriesKey !== null && !CITY_EVENT_SERIES_KEY_RE.test(seriesKey)) return { refused: "bad_series_key" };
  if (entry.ticketUrl) {
    // A malformed link keeps its historical reason, affiliate_ticket_url; a resale host is named.
    const why = ticketUrlRefusal(entry.ticketUrl, partnerHosts);
    if (why === "resale_ticket_url") return { refused: "resale_ticket_url" };
    if (why) return { refused: "affiliate_ticket_url" };
  }

  const tz = timezoneForMarket(market.marketKey);
  const lat = entry.venueLat ?? null;
  const lng = entry.venueLng ?? null;
  return {
    row: {
      source: entry.source,
      sourceId: entry.sourceId.trim(),
      series: entry.series?.trim() || null,
      vertical,
      seriesKey,
      startTimeKnown: entry.startTimeKnown === true ? true : null,
      title: entry.title.trim(),
      city: market.cityName,
      venue: entry.venue.trim(),
      venueLat: lat,
      venueLng: lng,
      neighbourhoodId: nearestNeighbourhoodId({ city: market.cityName, lat, lng }, neighbourhoods),
      startsAt,
      endsAt,
      nights: deriveNights(startsAt, endsAt, tz),
      ticketUrl: entry.ticketUrl?.trim() || null,
      billedArtists: entry.billedArtists?.trim() || null,
      blurb: entry.blurb?.trim() || null,
      imagePath: entry.imagePath?.trim() || null,
    },
  };
}

async function loadNeighbourhoodCandidates(): Promise<NeighbourhoodCandidate[]> {
  const rows = await db
    .select({
      id: cityNeighborhoods.id,
      city: cityNeighborhoods.city,
      lat: cityNeighborhoods.centroidLat,
      lng: cityNeighborhoods.centroidLng,
    })
    .from(cityNeighborhoods);
  return rows.map((r) => ({
    id: r.id,
    city: r.city,
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
  }));
}

/**
 * Insert-only seeder. Returns what it did; never throws for a refused entry.
 *
 * VENUE COORDINATES (ledger `2026-10-01-city-events-nine-seed`): an entry that states none is looked up
 * in OpenStreetMap — ONLY when its row does not exist yet, so a boot never re-asks for a seeded event —
 * one request per venue, spaced per Nominatim's policy. No match ⇒ the row is inserted with NULL
 * coordinates and named in `unlocated` (never a guessed point). OSM UNREACHABLE ⇒ the row is NOT
 * inserted this run and is named in `deferred`: a seeded row is never looked up again, so a network
 * blip must not become a permanent "not found". BOUNDED (decision-maker, Oct 1, 2026): at most ONE
 * lookup per entry in the list passed (the seed list), per run — a deferred row is retried by the
 * NEXT boot's single pass, never by a loop here.
 */
export async function seedCityEvents(
  entries: readonly CityEventSeedEntry[],
  deps: {
    partnerHosts?: () => Promise<string[]>;
    resolveVenue?: (q: VenueQuery) => Promise<VenueCoordinate | null | "unreachable">;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{
  inserted: number;
  skipped: number;
  filled: number;
  refused: Array<{ sourceId: string; reason: CityEventRefusal }>;
  located: Array<{ sourceId: string; matchedName: string }>;
  unlocated: string[];
  deferred: string[];
}> {
  const refused: Array<{ sourceId: string; reason: CityEventRefusal }> = [];
  const located: Array<{ sourceId: string; matchedName: string }> = [];
  const unlocated: string[] = [];
  const deferred: string[] = [];
  if (entries.length === 0) return { inserted: 0, skipped: 0, filled: 0, refused, located, unlocated, deferred };
  const candidates = await loadNeighbourhoodCandidates();
  const partnerHosts = await (deps.partnerHosts ?? loadPartnerHosts)();
  // CITY_EVENTS_VENUE_LOOKUP=0 turns the network lookup off (tests, an offline boot): rows then land
  // unlocated and are flagged, exactly as a no-match does.
  const lookupOn = process.env.CITY_EVENTS_VENUE_LOOKUP !== "0";
  const resolveVenue = deps.resolveVenue ?? (lookupOn ? (q: VenueQuery) => resolveVenueFromOsm(q) : async () => null);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lookups = 0;
  let inserted = 0;
  let skipped = 0;
  let filled = 0;
  for (const entry of entries) {
    let built = buildCityEventRow(entry, candidates, partnerHosts);
    if ("refused" in built) {
      refused.push({ sourceId: entry.sourceId, reason: built.refused });
      logger.warn({ sourceId: entry.sourceId, reason: built.refused }, "[city-events] seed entry refused");
      continue;
    }
    const exists = await db
      .select({ id: cityEvents.id })
      .from(cityEvents)
      .where(and(eq(cityEvents.source, built.row.source), eq(cityEvents.sourceId, built.row.sourceId)));
    if (exists.length === 0 && (entry.venueLat == null || entry.venueLng == null)) {
      const market = getMarketByCityName(entry.city.trim());
      if (lookups > 0) await sleep(NOMINATIM_MIN_INTERVAL_MS);
      lookups += 1;
      const hit = await resolveVenue({ venue: entry.venue.trim(), locality: entry.venueLocality?.trim() || market?.cityName || null, country: market?.country ?? null });
      if (hit === "unreachable") {
        deferred.push(entry.sourceId);
        logger.warn({ sourceId: entry.sourceId, venue: entry.venue }, "[city-events] venue lookup unreachable; row deferred to the next run");
        continue;
      }
      if (hit) {
        const rebuilt = buildCityEventRow({ ...entry, venueLat: hit.lat, venueLng: hit.lng }, candidates, partnerHosts);
        if ("row" in rebuilt) built = rebuilt;
        located.push({ sourceId: entry.sourceId, matchedName: hit.matchedName });
      } else {
        unlocated.push(entry.sourceId);
        logger.warn({ sourceId: entry.sourceId, venue: entry.venue }, "[city-events] venue not located; coordinates left empty");
      }
    }
    const result = await db.insert(cityEvents).values(built.row).onConflictDoNothing().returning({ id: cityEvents.id });
    if (result.length > 0) {
      inserted += 1;
      continue;
    }
    skipped += 1;
    if (await fillManualTypingIfNull(built.row)) filled += 1;
  }
  return { inserted, skipped, filled, refused, located, unlocated, deferred };
}

/**
 * The ONE rewrite the seeder may make (decision-maker, Sep 30, 2026): an existing MANUAL row gets
 * `vertical` / `series_key` where it stores NULL and the entry states a value. COALESCE keeps a
 * stated value, so a later seed never re-types an event; every other column is untouched. Returns
 * whether a row changed.
 */
async function fillManualTypingIfNull(row: InsertCityEvent): Promise<boolean> {
  if (row.source !== "manual") return false;
  const vertical = row.vertical ?? null;
  const seriesKey = row.seriesKey ?? null;
  if (vertical === null && seriesKey === null) return false;
  const nullFillable = [
    vertical !== null ? isNull(cityEvents.vertical) : undefined,
    seriesKey !== null ? isNull(cityEvents.seriesKey) : undefined,
  ].filter(Boolean);
  const updated = await db
    .update(cityEvents)
    .set({
      vertical: sql`COALESCE(${cityEvents.vertical}, ${vertical})`,
      seriesKey: sql`COALESCE(${cityEvents.seriesKey}, ${seriesKey})`,
    })
    .where(and(eq(cityEvents.source, "manual"), eq(cityEvents.sourceId, row.sourceId), sql`(${sql.join(nullFillable as any[], sql` OR `)})`))
    .returning({ id: cityEvents.id });
  return updated.length > 0;
}

/** Pure: shape one row into the card the page renders. */
export function toCityEventCard(row: CityEvent, neighbourhood: string | null, now: Date): CityEventCard {
  const market = getMarketByCityName(row.city);
  const tz = timezoneForMarket(market?.marketKey);
  const startsAt = new Date(row.startsAt);
  const endsAt = row.endsAt ? new Date(row.endsAt) : null;
  const firstDate = localDate(startsAt, tz);
  return {
    id: row.id,
    series: row.series,
    title: row.title,
    city: row.city,
    marketKey: market?.marketKey ?? null,
    neighbourhood,
    venue: row.venue,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    nights: row.nights,
    daysUntil: daysUntil(startsAt, now, tz),
    firstDate,
    lastDate: endsAt && row.nights > 1 ? localDate(endsAt, tz) : firstDate,
    // Migration 337: only a published time is shown; NULL/FALSE = date only, never "00:00" (§13).
    startTime: row.startTimeKnown === true ? localTime(startsAt, tz) : null,
    ticketUrl: row.ticketUrl,
    blurb: row.blurb,
    imagePath: row.imagePath,
  };
}

/** Renderable events starting from now through the window, soonest first. */
export async function listUpcomingCityEvents(now: Date = new Date(), limit = 24): Promise<CityEventsPayload> {
  const end = new Date(now.getTime() + CITY_EVENTS_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(cityEvents)
    .where(and(gte(cityEvents.startsAt, now), lte(cityEvents.startsAt, end), isNull(cityEvents.withdrawnAt)))
    .orderBy(asc(cityEvents.startsAt));
  const renderable = rows.filter((r) => isRenderableCityEvent(r));
  const hoodIds = Array.from(new Set(renderable.map((r) => r.neighbourhoodId).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (hoodIds.length > 0) {
    const hoods = await db.select({ id: cityNeighborhoods.id, name: cityNeighborhoods.name }).from(cityNeighborhoods);
    for (const h of hoods) if (hoodIds.includes(h.id)) names.set(h.id, h.name);
  }
  return {
    windowDays: CITY_EVENTS_WINDOW_DAYS,
    total: renderable.length,
    events: renderable
      .slice(0, limit)
      .map((r) => toCityEventCard(r, r.neighbourhoodId ? names.get(r.neighbourhoodId) ?? null : null, now)),
  };
}
