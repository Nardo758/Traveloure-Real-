/**
 * city-events.service.ts — the ONE writer and the ONE reader of `city_events` (ledger
 * `2026-09-28-city-events`, migration 330).
 *
 * Writer: `seedCityEvents` INSERTS ONLY, keyed on (source, source_id) with ON CONFLICT DO
 * NOTHING — an existing row is never overwritten, never deleted. It derives `nights` and
 * `neighbourhood_id` itself; a seed entry cannot type them. An entry is refused (logged, not
 * inserted) when its city is not an operating market, it has no venue or start, or its ticket
 * link points at an affiliate host.
 *
 * Reader: `listUpcomingCityEvents` returns renderable events starting in the next
 * CITY_EVENTS_WINDOW_DAYS, soonest first, with every display value derived here from the row
 * (countdown, local first/last date) so the page types nothing.
 */
import { and, asc, gte, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { cityEvents, cityNeighborhoods, type InsertCityEvent, type CityEvent } from "@shared/schema";
import {
  CITY_EVENTS_WINDOW_DAYS,
  daysUntil,
  deriveNights,
  isAcceptableTicketUrl,
  isRenderableCityEvent,
  localDate,
  localTime,
  nearestNeighbourhoodId,
  type CityEventCard,
  type CityEventsPayload,
  type CityEventSource,
  type NeighbourhoodCandidate,
} from "@shared/city-events";
import { getMarketByCityName, timezoneForMarket } from "./trend-engine/operating-markets";
import { logger } from "../infrastructure/logger";

/** What a seed entry may state. Derived columns (nights, neighbourhood) are not accepted. */
export interface CityEventSeedEntry {
  source: CityEventSource;
  sourceId: string;
  series?: string | null;
  title: string;
  /** An operating market's city name, e.g. "Kyoto". */
  city: string;
  venue: string;
  venueLat?: number | null;
  venueLng?: number | null;
  /** ISO 8601 with offset, e.g. "2026-11-20T19:00:00+09:00". */
  startsAt: string;
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
  | "empty_source_id";

/**
 * Pure: turn a seed entry into the row to insert, or name why it is refused. The neighbourhood
 * candidates are passed in so this stays testable without a database.
 */
export function buildCityEventRow(
  entry: CityEventSeedEntry,
  neighbourhoods: readonly NeighbourhoodCandidate[],
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
  if (entry.ticketUrl && !isAcceptableTicketUrl(entry.ticketUrl)) return { refused: "affiliate_ticket_url" };

  const tz = timezoneForMarket(market.marketKey);
  const lat = entry.venueLat ?? null;
  const lng = entry.venueLng ?? null;
  return {
    row: {
      source: entry.source,
      sourceId: entry.sourceId.trim(),
      series: entry.series?.trim() || null,
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

/** Insert-only seeder. Returns what it did; never throws for a refused entry. */
export async function seedCityEvents(
  entries: readonly CityEventSeedEntry[],
): Promise<{ inserted: number; skipped: number; refused: Array<{ sourceId: string; reason: CityEventRefusal }> }> {
  const refused: Array<{ sourceId: string; reason: CityEventRefusal }> = [];
  if (entries.length === 0) return { inserted: 0, skipped: 0, refused };
  const candidates = await loadNeighbourhoodCandidates();
  let inserted = 0;
  let skipped = 0;
  for (const entry of entries) {
    const built = buildCityEventRow(entry, candidates);
    if ("refused" in built) {
      refused.push({ sourceId: entry.sourceId, reason: built.refused });
      logger.warn({ sourceId: entry.sourceId, reason: built.refused }, "[city-events] seed entry refused");
      continue;
    }
    const result = await db.insert(cityEvents).values(built.row).onConflictDoNothing().returning({ id: cityEvents.id });
    if (result.length > 0) inserted += 1;
    else skipped += 1;
  }
  return { inserted, skipped, refused };
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
    startTime: localTime(startsAt, tz),
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
