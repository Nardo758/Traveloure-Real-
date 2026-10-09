/**
 * PlanEntry — the ONE way a NEW plan starts (E2, ledger `2026-10-09-e2-plan-entry`; brief "E2 + E3 —
 * one PlanEntry, two containers", decision-maker rulings 1–7, Oct 9, 2026).
 *
 *   Step 1 "Plan around…"   a place · a date · an event
 *   Step 2 occasion          the five groups as chips, "A trip" pre-selected, "More specific" → all
 *   Start a plan             creates the plan and lands on it
 *
 * No When, no Who, no plan name, no build chooser and no Clear/Save before the plan exists: those are
 * chips on the plan itself (E1). Editing a plan that already exists is the edit-only `PlanModal`.
 *
 * Everything here is PURE so the decisions are pinned without a browser (`plan-entry.test.ts`). The
 * component (`components/plan/PlanEntry.tsx`) only draws these answers; the provider
 * (`contexts/PlanningContext.tsx`) mints them.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import {
  OCCASION_GROUP_DEFAULT_SLUG,
  experienceGroupFor,
  type ExperienceGroupRow,
  type OccasionPickerGroup,
} from "@shared/experience-group";
import { cityEventPlanShape } from "@shared/city-events";
import { exactOperatingMarket } from "./experiences-entry";

export type PlanAround = "place" | "date" | "event";
export type PlanEntryStep = "around" | "occasion";

/** The event a plan is built around — the event row's own facts, nothing invented. */
export interface PlanEntryEvent {
  title: string;
  city: string;
  country: string | null;
  venue: string;
  /** Local calendar dates in the event's city, YYYY-MM-DD; lastDate = firstDate for one night. */
  firstDate: string;
  lastDate: string;
  /** Local "HH:MM", or null when the organiser published only the date. */
  startTime: string | null;
}

export interface PlanEntryState {
  around: PlanAround | null;
  market: OperatingMarket | null;
  /** Real dates the traveler chose (a date pick or an event); null = not asked, never invented. */
  startDate: string | null;
  endDate: string | null;
  event: PlanEntryEvent | null;
  /** For an event longer than THREE nights: the one night chosen, or null for the whole run. */
  night: string | null;
  group: OccasionPickerGroup;
  /** "More specific" — a catalog slug that overrides the group's default. */
  occasionSlug: string | null;
}

/** What a door can hand PlanEntry (a subset of `PlanningSource`, kept structural so this stays pure). */
export interface PlanEntrySource {
  city?: string;
  country?: string;
  destination?: string;
  experienceSlug?: string;
  anchor?: { title: string; firstDate: string; lastDate: string; startTime: string | null; venue: string };
}

export const DEFAULT_GROUP: OccasionPickerGroup = "trips";

/** An event longer than this many nights asks "which night?". */
export const WHICH_NIGHT_AFTER_NIGHTS = 3;

export function emptyPlanEntry(): PlanEntryState {
  return { around: null, market: null, startDate: null, endDate: null, event: null, night: null, group: DEFAULT_GROUP, occasionSlug: null };
}

/** Calendar nights between two YYYY-MM-DD dates, plus one (a one-night event is 1). */
export function eventNights(firstDate: string, lastDate: string): number {
  const a = Date.parse(`${firstDate}T00:00:00Z`);
  const b = Date.parse(`${lastDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The brief's event default: multi-day → "A trip", one evening → "A moment". */
export function groupForEvent(e: Pick<PlanEntryEvent, "firstDate" | "lastDate">): OccasionPickerGroup {
  return cityEventPlanShape(eventNights(e.firstDate, e.lastDate)) === "trip" ? "trips" : "moments";
}

export function asksWhichNight(e: Pick<PlanEntryEvent, "firstDate" | "lastDate"> | null): boolean {
  return !!e && eventNights(e.firstDate, e.lastDate) > WHICH_NIGHT_AFTER_NIGHTS;
}

/** Every night of an event's run, in order (for the "which night?" chips). */
export function eventNightDates(e: Pick<PlanEntryEvent, "firstDate" | "lastDate">): string[] {
  const n = eventNights(e.firstDate, e.lastDate);
  const start = Date.parse(`${e.firstDate}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** Apply an event pick: its city, its full date range, its row. The group follows its length. */
export function withEvent(state: PlanEntryState, e: PlanEntryEvent): PlanEntryState {
  const market = exactOperatingMarket(e.city) ?? exactOperatingMarket(e.country ? `${e.city}, ${e.country}` : e.city);
  const group = groupForEvent(e);
  return {
    ...state,
    around: state.around ?? "event",
    market,
    event: e,
    startDate: e.firstDate,
    endDate: e.lastDate,
    // A Moment around a long run defaults to ONE night (the brief); a trip keeps the whole run.
    night: asksWhichNight(e) && group === "moments" ? e.firstDate : null,
    group,
    occasionSlug: null,
  };
}

/** Choose (or clear) one night of a long event; the plan's dates follow it. */
export function withNight(state: PlanEntryState, night: string | null): PlanEntryState {
  if (!state.event) return state;
  return night
    ? { ...state, night, startDate: night, endDate: night }
    : { ...state, night: null, startDate: state.event.firstDate, endDate: state.event.lastDate };
}

/** Where a door lands PlanEntry, and with what already answered. */
export function initialPlanEntry(source: PlanEntrySource | null | undefined): { state: PlanEntryState; step: PlanEntryStep } {
  const state = emptyPlanEntry();
  if (!source) return { state, step: "around" };
  if (source.anchor && source.city) {
    const next = withEvent(state, {
      title: source.anchor.title,
      city: source.city,
      country: source.country ?? null,
      venue: source.anchor.venue,
      firstDate: source.anchor.firstDate,
      lastDate: source.anchor.lastDate,
      startTime: source.anchor.startTime,
    });
    return { state: { ...next, around: "event" }, step: "occasion" };
  }
  const named = source.city
    ? exactOperatingMarket(source.country ? `${source.city}, ${source.country}` : source.city) ?? exactOperatingMarket(source.city)
    : exactOperatingMarket(source.destination);
  const occasionSlug = source.experienceSlug?.trim() || null;
  const withAnswers: PlanEntryState = { ...state, market: named, around: named ? "place" : null, occasionSlug };
  return { state: withAnswers, step: named ? "occasion" : "around" };
}

/**
 * A door that already named the city AND an occasion the catalog carries goes straight to the plan
 * (photo tile, Moments story, the AI draft panel). The occasion must RESOLVE — a slug the catalog
 * does not carry is asked, never trusted (§13).
 */
export function startsStraightAway(state: PlanEntryState, catalogSlugs: readonly string[]): boolean {
  return !!state.market && !state.event && !!state.occasionSlug && catalogSlugs.includes(state.occasionSlug);
}

/** The occasion the plan is minted with: "More specific" if chosen, else the group's default. */
export function chosenOccasionSlug(state: PlanEntryState): string {
  return state.occasionSlug || OCCASION_GROUP_DEFAULT_SLUG[state.group];
}

/** Start a plan needs a city; nothing else (dates are optional — E1 placeholder window). */
export function canStartPlan(state: PlanEntryState): boolean {
  return !!state.market;
}

/**
 * Where the plan opens. Trip, group travel, a multi-day event → the map; a moment, a celebration, a
 * hosted event → the list. The group is the CHOSEN occasion's own (a "More specific" pick moves it).
 */
export function planEntryView(
  state: PlanEntryState,
  occasionRow: ExperienceGroupRow | null | undefined,
): "map" | "list" {
  const group = occasionRow ? experienceGroupFor(occasionRow) : state.group;
  if (group === "trips" || group === "group_travel") return "map";
  if (state.event && state.startDate && state.endDate && state.startDate !== state.endDate) return "map";
  return "list";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "This weekend": the coming Saturday–Sunday (today, if it is already the weekend). Local dates. */
export function thisWeekend(today: Date): { startDate: string; endDate: string } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = d.getDay(); // 0 Sun … 6 Sat
  if (dow === 0) return { startDate: ymd(d), endDate: ymd(d) };
  const sat = new Date(d);
  sat.setDate(d.getDate() + (6 - dow));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { startDate: ymd(sat), endDate: ymd(sun) };
}

/** "Next month": the whole of next calendar month. */
export function nextMonth(today: Date): { startDate: string; endDate: string } {
  const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  return { startDate: ymd(first), endDate: ymd(last) };
}

/** Events whose run overlaps [start, end] (inclusive), in date order. */
export function eventsOverlapping<T extends { firstDate: string; lastDate: string }>(
  events: readonly T[],
  startDate: string,
  endDate: string,
): T[] {
  return events
    .filter((e) => e.firstDate <= endDate && e.lastDate >= startDate)
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

/** Events grouped by the month they start in ("2026-10"), months in order. */
export function eventsByMonth<T extends { firstDate: string }>(events: readonly T[]): Array<{ month: string; events: T[] }> {
  const by = new Map<string, T[]>();
  for (const e of [...events].sort((a, b) => a.firstDate.localeCompare(b.firstDate))) {
    const m = e.firstDate.slice(0, 7);
    by.set(m, [...(by.get(m) ?? []), e]);
  }
  return Array.from(by.entries()).map(([month, evs]) => ({ month, events: evs }));
}

/**
 * A typed city we do not plan in yet ("Paris"). No geocoder exists, so "nearest" is ruled as the
 * markets in the same COUNTRY first, otherwise all eight (decision-maker ruling 5). The country is
 * read only from what was typed — never guessed from the city name.
 */
export function suggestedMarketsFor(typed: string): OperatingMarket[] {
  const text = typed.trim().toLowerCase();
  if (!text) return [...OPERATING_MARKETS];
  const sameCountry = OPERATING_MARKETS.filter((m) => {
    const c = m.country.toLowerCase();
    return text === c || text.endsWith(`, ${c}`) || text.split(/[,\s]+/).includes(c);
  });
  return sameCountry.length > 0 ? sameCountry : [...OPERATING_MARKETS];
}

/** The typed-city check: an exact operating market, or "not yet" with suggestions. */
export function typedCity(typed: string): { market: OperatingMarket } | { notYet: string; suggestions: OperatingMarket[] } | null {
  const t = typed.trim();
  if (!t) return null;
  const market = exactOperatingMarket(t);
  if (market) return { market };
  return { notYet: t.split(",")[0].trim(), suggestions: suggestedMarketsFor(t) };
}

/** The plan's destination, spelled as every other mint spells it ("Kyoto, Japan"). */
export function planEntryDestination(m: Pick<OperatingMarket, "cityName" | "country">): string {
  return `${m.cityName}, ${m.country}`;
}

/** The event row the plan is created with — on its chosen night, else its first day. */
export function planEntryEventRow(state: PlanEntryState): { title: string; eventDate: string; startTime: string | null; location: string } | null {
  if (!state.event) return null;
  return {
    title: state.event.title,
    eventDate: state.night ?? state.event.firstDate,
    startTime: state.event.startTime,
    location: state.event.venue,
  };
}
