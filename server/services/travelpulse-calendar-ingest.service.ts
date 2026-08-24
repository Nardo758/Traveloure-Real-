/**
 * travelpulse-calendar-ingest.service.ts — honest ingestion for travel_pulse_calendar_events.
 *
 * WHY THIS EXISTS (Trailhead lane B3): the R33 event spotlight (demand-onepager.service.ts) and
 * the Discover "event approaching" lens read `travel_pulse_calendar_events` DIRECTLY, filtered to
 * forward-dated rows for the market's lowercased `city`. Until now the ONLY writers of that table
 * were (a) a stale seed of grok-sourced Tokyo/Paris past events and (b) an on-demand Grok LLM
 * generator on a different consumer path — so operating markets (Kyoto, Edinburgh) had ZERO forward
 * rows and the spotlight shipped dark for lack of INGESTION. This service wires the minimal HONEST
 * source: real, dated named-festival occurrences (config, offline) plus optional Nager.Date public
 * holidays (live fetch). NO LLM-generated events, ever — dated rows from real, attributed sources.
 *
 * The recurrence-expansion, holiday-shaping and dedupe logic are PURE functions in the sibling
 * module travelpulse-calendar-shaping.ts (unit tested with no DB); this file only touches the DB
 * and the network.
 *
 * Idempotency: each shaped row carries a DETERMINISTIC id (cal:source:city:startDate:key), so a
 * re-run is a no-op via check-exists-then-insert — the same pattern seed-travelpulse.ts uses, and
 * it needs NO new UNIQUE constraint (no schema change, no publish-time push trap).
 */

import { db } from "../db";
import { travelPulseCalendarEvents } from "@shared/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  type ShapedCalendarEvent,
  type NagerHoliday,
  addDaysIso,
  dedupeEvents,
  expandFestivalRules,
  loadFestivalRules,
  shapeHolidayEvents,
} from "./travelpulse-calendar-shaping";

export type { ShapedCalendarEvent } from "./travelpulse-calendar-shaping";

export interface CalendarIngestResult {
  inserted: number;
  skipped: number;
  bySource: Record<string, number>;
}

/**
 * Idempotent insert of shaped rows: skip any id already present, insert the rest. No UNIQUE
 * constraint is required because the id is deterministic (matches seed-travelpulse.ts's posture).
 */
export async function upsertCalendarEvents(events: ShapedCalendarEvent[]): Promise<CalendarIngestResult> {
  const deduped = dedupeEvents(events);
  const result: CalendarIngestResult = { inserted: 0, skipped: 0, bySource: {} };

  for (const e of deduped) {
    const existing = await db
      .select({ id: travelPulseCalendarEvents.id })
      .from(travelPulseCalendarEvents)
      .where(eq(travelPulseCalendarEvents.id, e.id))
      .limit(1);

    if (existing.length > 0) {
      result.skipped++;
      continue;
    }

    await db.insert(travelPulseCalendarEvents).values({
      id: e.id,
      eventName: e.eventName,
      eventType: e.eventType ?? undefined,
      city: e.city,
      country: e.country ?? undefined,
      startDate: e.startDate,
      endDate: e.endDate ?? undefined,
      description: e.description ?? undefined,
      source: e.source,
    });
    result.inserted++;
    result.bySource[e.source] = (result.bySource[e.source] ?? 0) + 1;
  }

  return result;
}

const NAGER_BASE = "https://date.nager.at/api/v3/PublicHolidays";

/** Markets whose national holidays feed the spotlight, mapped to the consumer's `city` key. */
const HOLIDAY_MARKETS: Array<{ city: string; country: string; countryCode: string }> = [
  { city: "kyoto", country: "Japan", countryCode: "JP" },
  { city: "edinburgh", country: "United Kingdom", countryCode: "GB" },
];

/**
 * ⚑ LIVE FETCH (network egress) — pull Nager.Date public holidays for the given years and shape
 * them. Isolated so the offline festival path never depends on network. Returns [] on any failure
 * (honest: no fabricated fallback holidays).
 */
export async function fetchNagerHolidayEvents(years: number[]): Promise<ShapedCalendarEvent[]> {
  const out: ShapedCalendarEvent[] = [];
  for (const market of HOLIDAY_MARKETS) {
    for (const year of years) {
      try {
        const res = await fetch(`${NAGER_BASE}/${year}/${market.countryCode}`, {
          headers: { "User-Agent": "Traveloure-CalendarIngest/1.0" },
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.trim()) continue;
        const data = JSON.parse(text) as NagerHoliday[];
        out.push(...shapeHolidayEvents(data, market.city, market.country));
      } catch {
        // network / parse failure — skip this market/year, never fabricate.
      }
    }
  }
  return out;
}

export interface RunCalendarIngestOptions {
  /** Forward window in days for festival expansion (default 400 to cover the next full year cycle). */
  windowDays?: number;
  /** Include the ⚑ live Nager.Date holiday fetch (requires network egress). Default false. */
  includeHolidays?: boolean;
  now?: Date;
}

/**
 * Orchestrate a full ingest: offline festivals always; live holidays when explicitly enabled.
 * Both funnel through the same idempotent upsert.
 */
export async function runCalendarIngest(opts: RunCalendarIngestOptions = {}): Promise<CalendarIngestResult> {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 400;
  const windowStartIso = now.toISOString().slice(0, 10);
  const windowEndIso = addDaysIso(windowStartIso, windowDays);

  const festivalEvents = expandFestivalRules(loadFestivalRules(), windowStartIso, windowEndIso);

  let holidayEvents: ShapedCalendarEvent[] = [];
  if (opts.includeHolidays) {
    const years = Array.from(
      new Set([Number(windowStartIso.slice(0, 4)), Number(windowEndIso.slice(0, 4))]),
    );
    holidayEvents = await fetchNagerHolidayEvents(years);
    // keep only holidays whose start falls inside the forward window
    holidayEvents = holidayEvents.filter((e) => e.startDate >= windowStartIso && e.startDate <= windowEndIso);
  }

  return upsertCalendarEvents([...festivalEvents, ...holidayEvents]);
}

/**
 * ⚑ Replit GATE — count forward-dated rows for a market inside the next `days` days, matching the
 * EXACT predicate the R33 spotlight consumer uses (lowercased city, start in [today, today+days]).
 * Proves the spotlight is no longer dark for lack of ingestion. Run against the target DB.
 */
export async function countForwardEvents(
  city: string,
  days = 90,
  now: Date = new Date(),
): Promise<number> {
  const todayIso = now.toISOString().slice(0, 10);
  const horizonIso = addDaysIso(todayIso, days);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(travelPulseCalendarEvents)
    .where(
      and(
        eq(sql`lower(${travelPulseCalendarEvents.city})`, city.toLowerCase()),
        gte(travelPulseCalendarEvents.startDate, todayIso),
        lte(travelPulseCalendarEvents.startDate, horizonIso),
      ),
    );
  return Number(row?.n ?? 0);
}
