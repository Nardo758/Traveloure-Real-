/**
 * travelpulse-calendar-shaping.ts — PURE row-shaping / recurrence-expansion / dedupe logic for
 * calendar-event ingestion. NO database, NO network imports, so it is unit-testable in any
 * environment. The DB/network side lives in travelpulse-calendar-ingest.service.ts, which imports
 * from here.
 *
 * NO LLM-generated events, ever — these functions only reshape real, dated, attributed inputs
 * (the committed festival registry and Nager.Date holidays). A row is NEVER emitted with an
 * invented date, and surge metrics (crowdImpact/priceImpact/%) are deliberately omitted (§13).
 */

import festivalCalendar from "../data/festival-calendar.json";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FestivalRule {
  key: string;
  eventName: string;
  eventType: string;
  city: string;
  country: string;
  source: string;
  description?: string;
  fixedDate?: { month: number; day: number; durationDays?: number };
  dateRange?: { startMonth: number; startDay: number; endMonth: number; endDay: number };
  dates?: string[];
  durationDays?: number;
}

/** A row shaped for insert into travel_pulse_calendar_events. Metrics deliberately omitted (§13). */
export interface ShapedCalendarEvent {
  id: string;
  eventName: string;
  eventType: string | null;
  city: string;
  country: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD, null for single-day
  description: string | null;
  source: string;
}

/** Minimal shape of a Nager.Date public-holiday record. */
export interface NagerHoliday {
  date: string; // YYYY-MM-DD
  localName?: string;
  name?: string;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** ISO calendar-day string for a Y/M/D triple, month is 1-based. UTC-noon anchored, DST-safe. */
export function isoFromYmd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

/** Add `days` calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Deterministic id so a re-ingest is idempotent without a UNIQUE constraint.
 * Stable across runs for the same (source, city, startDate, key) tuple.
 */
export function deterministicEventId(source: string, city: string, startDate: string, key: string): string {
  return `cal:${source}:${city.toLowerCase()}:${startDate}:${key}`;
}

// ── Expansion / shaping / dedupe ─────────────────────────────────────────────

/**
 * Expand festival recurrence rules into concrete dated rows whose START falls inside
 * [windowStartIso, windowEndIso] (inclusive). Years spanned are derived from the window, so a
 * fixed-date matsuri yields one row per year in range. NEVER invents a date — a rule with no
 * recognised recurrence shape is skipped.
 */
export function expandFestivalRules(
  rules: FestivalRule[],
  windowStartIso: string,
  windowEndIso: string,
): ShapedCalendarEvent[] {
  const startYear = Number(windowStartIso.slice(0, 4));
  const endYear = Number(windowEndIso.slice(0, 4));
  const out: ShapedCalendarEvent[] = [];

  const push = (rule: FestivalRule, start: string, end: string | null) => {
    if (start < windowStartIso || start > windowEndIso) return;
    out.push({
      id: deterministicEventId(rule.source, rule.city, start, rule.key),
      eventName: rule.eventName,
      eventType: rule.eventType ?? null,
      city: rule.city.toLowerCase(),
      country: rule.country ?? null,
      startDate: start,
      endDate: end,
      description: rule.description ?? null,
      source: rule.source,
    });
  };

  for (const rule of rules) {
    if (rule.fixedDate) {
      const { month, day, durationDays } = rule.fixedDate;
      for (let y = startYear; y <= endYear; y++) {
        const start = isoFromYmd(y, month, day);
        const end = durationDays && durationDays > 0 ? addDaysIso(start, durationDays) : null;
        push(rule, start, end);
      }
    } else if (rule.dateRange) {
      const { startMonth, startDay, endMonth, endDay } = rule.dateRange;
      for (let y = startYear; y <= endYear; y++) {
        const start = isoFromYmd(y, startMonth, startDay);
        // A window whose end month/day precedes its start wraps into the next year.
        const endYearForRange =
          endMonth < startMonth || (endMonth === startMonth && endDay < startDay) ? y + 1 : y;
        const end = isoFromYmd(endYearForRange, endMonth, endDay);
        push(rule, start, end);
      }
    } else if (rule.dates && rule.dates.length > 0) {
      for (const start of rule.dates) {
        const end = rule.durationDays && rule.durationDays > 0 ? addDaysIso(start, rule.durationDays) : null;
        push(rule, start, end);
      }
    }
    // else: unrecognised rule shape — skipped, never guessed.
  }

  return out;
}

/**
 * Shape Nager.Date public holidays into calendar-event rows for a market. Holidays are national;
 * they are attached to the market's `city` because the R33 consumers key on city and the anchor
 * registry intends holidays as spotlight substrate. A record with no usable date is dropped.
 */
export function shapeHolidayEvents(
  holidays: NagerHoliday[],
  city: string,
  country: string,
): ShapedCalendarEvent[] {
  const out: ShapedCalendarEvent[] = [];
  for (const h of holidays) {
    if (!h || typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
    const name = (h.localName || h.name || "").trim();
    if (!name) continue;
    const key =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "holiday";
    out.push({
      id: deterministicEventId("nager_date", city, h.date, key),
      eventName: name,
      eventType: "holiday",
      city: city.toLowerCase(),
      country,
      startDate: h.date,
      endDate: null,
      description: null,
      source: "nager_date",
    });
  }
  return out;
}

/** De-duplicate shaped rows by deterministic id (first occurrence wins). */
export function dedupeEvents(events: ShapedCalendarEvent[]): ShapedCalendarEvent[] {
  const seen = new Set<string>();
  const out: ShapedCalendarEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/** Load the committed festival rules (drops the leading `_meta` block). */
export function loadFestivalRules(): FestivalRule[] {
  return ((festivalCalendar as any).festivals ?? []) as FestivalRule[];
}
