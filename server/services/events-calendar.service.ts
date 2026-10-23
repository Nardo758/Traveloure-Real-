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
 *     span. A city row replaces a same-title country row for that city; a different title sits
 *     beside it. `hasWindow` is the admin `season_windows_<market>` overlap — no row means the
 *     band stays whole-month and is still returned. Dated rows are never painted on a day (E1).
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
  composeBands,
  monthLast,
  seasonGroup,
  windowMonths,
  ymKey,
  type CalendarEvent,
  type CalendarPlace,
  type EventsCalendarPayload,
  type MonthSeason,
} from "@shared/events-calendar";
import { getSeasonWindows } from "./platform-flags";
import { timezoneForMarket } from "./trend-engine/operating-markets";
import { loadOutsideCityThresholdKm, toCityEventCard } from "./city-events.service";
import { loadDatedPartnerEvents } from "./partner-calendar.service";

export type { BandRow } from "@shared/events-calendar";

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
  // SH-1 item 4: the admin's outside-the-city distance; null = unset (the venue's city decides).
  thresholdKm: number | null = null,
): CalendarEvent[] {
  const windowEnd = monthLast(months[months.length - 1]);
  const out: CalendarEvent[] = [];
  for (const row of rows) {
    if (!isRenderableCityEvent(row)) continue;
    const card = toCityEventCard(row, row.neighbourhoodId ? hoodNames.get(row.neighbourhoodId) ?? null : null, now, thresholdKm);
    // Under way counts: the exact test is the event's LOCAL last date against today IN ITS CITY.
    const today = localDate(now, timezoneForMarket(card.marketKey));
    if (card.lastDate < today || card.firstDate > windowEnd) continue;
    // Migration 356 (ledger `2026-10-05-event-real-city`): read when the column exists, else not known.
    const venueLocality = (row as CityEvent & { venueLocality?: string | null }).venueLocality ?? null;
    out.push({ ...card, vertical: isCityEventVertical(row.vertical) ? row.vertical : null, venueLocality, sourceId: row.sourceId });
  }
  return out.sort(bySoonest);
}

function bySoonest(a: CalendarEvent, b: CalendarEvent): number {
  return a.firstDate === b.firstDate ? a.startsAt.localeCompare(b.startsAt) : a.firstDate < b.firstDate ? -1 : 1;
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

  const dated = composeCalendarEvents(eventRows, hoodNames, months, now, await loadOutsideCityThresholdKm());
  // A partner-catalog failure must not take the city-events calendar down with it.
  let partner: CalendarEvent[] = [];
  try {
    partner = await loadDatedPartnerEvents(now, months);
  } catch (err) {
    console.warn("[events-calendar] partner events omitted", err);
  }
  const windowsByMarket: Record<string, Awaited<ReturnType<typeof getSeasonWindows>>> = {};
  await Promise.all(
    OPERATING_MARKETS.map(async (m) => {
      windowsByMarket[m.marketKey] = await getSeasonWindows(m.marketKey);
    }),
  );
  return {
    months,
    events: [...dated, ...partner].sort(bySoonest),
    bands: composeBands(bandRows, months, windowsByMarket),
    places: composePlaces(seasonRows, pulseRows),
  };
}

