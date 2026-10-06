/**
 * events-calendar.service.ts — the ONE read behind the /events calendar (ledger
 * `2026-10-06-events-calendar`, events-page brief 2a). Public, read-only.
 *
 * It returns, for the twelve months starting at the current one:
 *   - the renderable `city_events` that overlap the window, INCLUDING an event already under way
 *     (its local last date is today or later in its own city). Each card is shaped by the SAME
 *     `toCityEventCard` the landing strip uses, so local dates and the countdown are derived once.
 *     `GET /api/city-events/upcoming` and `listUpcomingCityEvents` are NOT changed: the landing
 *     strip keeps reading events that have not started yet.
 *   - the month-level seasons from `destination_events` (approved, a start month, no specific
 *     date), for the countries of the eight operating markets, expanded over every month they
 *     span. Dated `destination_events` rows are never painted on a day (ruling E1).
 *   - one row per operating market for "Where to go": its vibe tags and its season rating per
 *     month — the city's own row, else its country's, else none (ruling E6: never dropped).
 *
 * `pure` composer + a thin loader, so the shaping is testable without a database.
 */
import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  cityEvents,
  cityNeighborhoods,
  destinationEvents,
  destinationSeasons,
  travelPulseCities,
  type CityEvent,
} from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { isCityEventVertical, isRenderableCityEvent, localDate } from "@shared/city-events";
import {
  bandMonths,
  bandSpan,
  monthLast,
  seasonGroup,
  windowMonths,
  ymKey,
  type CalendarEvent,
  type CalendarPlace,
  type EventsCalendarPayload,
  type MonthSeason,
  type SeasonBand,
} from "@shared/events-calendar";
import { timezoneForMarket } from "./trend-engine/operating-markets";
import { toCityEventCard } from "./city-events.service";

export interface BandRow {
  id: string;
  title: string;
  country: string;
  city: string | null;
  startMonth: number | null;
  endMonth: number | null;
  specificDate: string | null;
  isRecurring: boolean | null;
  year: number | null;
}

export interface SeasonRow {
  country: string;
  city: string | null;
  month: number;
  rating: string;
  averageTemp: string | null;
  crowdLevel: string | null;
}

export interface PulseRow {
  cityName: string;
  vibeTags: unknown;
}

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** The calendar's first month: the month `now` falls in (UTC). */
export function firstWindowMonth(now: Date): string {
  return ymKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

/** Pure: the dated events in the window, under-way ones included, soonest first. */
export function composeCalendarEvents(
  rows: readonly CityEvent[],
  hoodNames: ReadonlyMap<string, string>,
  months: readonly string[],
  now: Date,
): CalendarEvent[] {
  const windowEnd = monthLast(months[months.length - 1]);
  const out: CalendarEvent[] = [];
  for (const row of rows) {
    if (!isRenderableCityEvent(row)) continue;
    const card = toCityEventCard(row, row.neighbourhoodId ? hoodNames.get(row.neighbourhoodId) ?? null : null, now);
    // Under way counts: the exact test is the event's LOCAL last date against today IN ITS CITY.
    const today = localDate(now, timezoneForMarket(card.marketKey));
    if (card.lastDate < today || card.firstDate > windowEnd) continue;
    // Migration 356 (ledger `2026-10-05-event-real-city`): read when the column exists, else not known.
    const venueLocality = (row as CityEvent & { venueLocality?: string | null }).venueLocality ?? null;
    out.push({ ...card, vertical: isCityEventVertical(row.vertical) ? row.vertical : null, venueLocality, sourceId: row.sourceId });
  }
  return out.sort((a, b) => (a.firstDate === b.firstDate ? a.startsAt.localeCompare(b.startsAt) : a.firstDate < b.firstDate ? -1 : 1));
}

/** Pure: month-level season rows → bands for the markets' countries, over the window. */
export function composeBands(rows: readonly BandRow[], months: readonly string[]): SeasonBand[] {
  const out: SeasonBand[] = [];
  for (const r of rows) {
    if (r.startMonth == null || r.specificDate) continue; // a dated row is never a band (E1)
    if (r.startMonth < 1 || r.startMonth > 12 || (r.endMonth != null && (r.endMonth < 1 || r.endMonth > 12))) continue;
    const inCountry = OPERATING_MARKETS.filter((m) => lower(m.country) === lower(r.country));
    if (inCountry.length === 0) continue;
    // A row naming one of our cities applies to that city; a country row (all seeded rows) to the
    // country's markets, and the band says the COUNTRY, never a city it does not name (E5).
    const ownCity = r.city ? inCountry.find((m) => lower(m.cityName) === lower(r.city)) : undefined;
    if (r.city && !ownCity) continue;
    const bandMs = bandMonths({ startMonth: r.startMonth, endMonth: r.endMonth, isRecurring: r.isRecurring, year: r.year }, months);
    if (bandMs.length === 0) continue;
    out.push({
      id: r.id,
      title: r.title,
      place: ownCity ? ownCity.cityName : inCountry[0].country,
      country: inCountry[0].country,
      marketKeys: ownCity ? [ownCity.marketKey] : inCountry.map((m) => m.marketKey),
      months: bandMs,
      span: bandSpan(r.startMonth, r.endMonth),
    });
  }
  return out.sort((a, b) => (a.months[0] === b.months[0] ? a.title.localeCompare(b.title) : a.months[0] < b.months[0] ? -1 : 1));
}

/** Pure: the eight markets, each with its vibe tags and per-month season (city row, else country). */
export function composePlaces(seasons: readonly SeasonRow[], pulse: readonly PulseRow[]): CalendarPlace[] {
  return OPERATING_MARKETS.map((m) => {
    const tagsRow = pulse.find((p) => lower(p.cityName) === lower(m.cityName));
    const vibeTags = Array.isArray(tagsRow?.vibeTags) ? (tagsRow!.vibeTags as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const byMonth: Partial<Record<string, MonthSeason>> = {};
    for (let month = 1; month <= 12; month++) {
      const forMonth = seasons.filter((s) => s.month === month && lower(s.country) === lower(m.country));
      const own = forMonth.find((s) => s.city && lower(s.city) === lower(m.cityName));
      const country = forMonth.find((s) => !s.city);
      const row = own ?? country;
      const group = row ? seasonGroup(row.rating) : null;
      if (!row || !group) continue; // no usable rating = not rated (§13)
      byMonth[String(month)] = {
        group,
        averageTemp: row.averageTemp?.trim() || null,
        crowdLevel: row.crowdLevel?.trim() || null,
        scope: own ? "city" : "country",
      };
    }
    return { marketKey: m.marketKey, city: m.cityName, country: m.country, vibeTags, seasons: byMonth };
  });
}

/** Read the three tables and compose the payload. */
export async function loadEventsCalendar(now: Date = new Date()): Promise<EventsCalendarPayload> {
  const months = windowMonths(firstWindowMonth(now));
  // Coarse bounds; the exact under-way and window tests run in the city's own calendar above. A
  // one-night row is stored at local midnight with ends_at NULL, so a day's slack keeps tonight's show.
  const coarseFrom = new Date(now.getTime() - 2 * 86_400_000);
  const coarseTo = new Date(Date.parse(`${monthLast(months[11])}T00:00:00Z`) + 2 * 86_400_000);
  const eventRows = await db
    .select()
    .from(cityEvents)
    .where(
      and(
        isNull(cityEvents.withdrawnAt),
        gte(sql`COALESCE(${cityEvents.endsAt}, ${cityEvents.startsAt})`, coarseFrom),
        lte(cityEvents.startsAt, coarseTo),
      ),
    );
  const hoodIds = new Set(eventRows.map((r) => r.neighbourhoodId).filter((x): x is string => !!x));
  const hoodNames = new Map<string, string>();
  if (hoodIds.size > 0) {
    const hoods = await db.select({ id: cityNeighborhoods.id, name: cityNeighborhoods.name }).from(cityNeighborhoods);
    for (const h of hoods) if (hoodIds.has(h.id)) hoodNames.set(h.id, h.name);
  }

  const bandRows = await db
    .select({
      id: destinationEvents.id,
      title: destinationEvents.title,
      country: destinationEvents.country,
      city: destinationEvents.city,
      startMonth: destinationEvents.startMonth,
      endMonth: destinationEvents.endMonth,
      specificDate: destinationEvents.specificDate,
      isRecurring: destinationEvents.isRecurring,
      year: destinationEvents.year,
    })
    .from(destinationEvents)
    .where(and(eq(destinationEvents.status, "approved"), isNotNull(destinationEvents.startMonth), isNull(destinationEvents.specificDate)));

  const seasonRows = await db
    .select({
      country: destinationSeasons.country,
      city: destinationSeasons.city,
      month: destinationSeasons.month,
      rating: destinationSeasons.rating,
      averageTemp: destinationSeasons.averageTemp,
      crowdLevel: destinationSeasons.crowdLevel,
    })
    .from(destinationSeasons);

  const pulseRows = await db
    .select({ cityName: travelPulseCities.cityName, vibeTags: travelPulseCities.vibeTags })
    .from(travelPulseCities);

  return {
    months,
    events: composeCalendarEvents(eventRows, hoodNames, months, now),
    bands: composeBands(bandRows, months),
    places: composePlaces(seasonRows, pulseRows),
  };
}

