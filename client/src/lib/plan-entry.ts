/**
 * PlanEntry — the ONE way a NEW plan starts (E2, ledger `2026-10-09-e2-plan-entry`; brief "E2 + E3 —
 * one PlanEntry, two containers", decision-maker rulings 1–7, Oct 9, 2026).
 *
 *   Step 1 "Plan around…"   a place · a date · an event
 *   Step 2 occasion          the five groups as chips, the trip group pre-selected, "More specific" → all
 *   Start a plan             creates the plan and lands on it
 *
 * No When, no Who, no plan name, no build chooser and no Clear/Save before the plan exists: those are
 * chips on the plan itself (E1). Editing a plan that already exists is the edit-only `PlanModal`.
 *
 * H-10 (ledger `2026-10-24-h10-experiences-popup`): when the experiences door already holds an
 * experience (a group, or a catalog slug) AND a city, the next step asks dates and party. That
 * carry is props only — never `experienceSlug`, which open() still writes to the pen (C6 / Q15.2).
 *
 * Everything here is PURE so the decisions are pinned without a browser (`plan-entry.test.ts`). The
 * component (`components/plan/PlanEntry.tsx`) only draws these answers; the provider
 * (`contexts/PlanningContext.tsx`) mints them.
 */
import { OPERATING_MARKETS, type OperatingMarket } from "@shared/operating-markets";
import {
  OCCASION_GROUP_DEFAULT_SLUG,
  OCCASION_GROUP_ORDER,
  experienceGroupFor,
  type ExperienceGroupRow,
  type OccasionPickerGroup,
} from "@shared/experience-group";
import { cityEventPlanShape } from "@shared/city-events";
import { isShowSeries, seriesShowDates, upcomingShowDates } from "@shared/event-page";
import { clampToMarketToday, marketToday } from "@shared/market-today";
import { exactOperatingMarket, preselectedGroup, preselectedMarket } from "./experiences-entry";

export type PlanAround = "place" | "date" | "event";
export type PlanEntryStep = "around" | "occasion" | "details";

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
  /** SH-1 Launch Q14.3: the event's `city_events.source_id`, sent with the mint so the server can refuse an ended event. */
  eventSourceId?: string | null;
  /** SH-1 item 5: the row's `series_key`; PlanEntry reads its sibling shows from the upcoming list. */
  seriesKey?: string | null;
  /**
   * SH-1 item 5 / Launch Q14.1: a series of shows stored as sibling rows on one `series_key` — every show's local date
   * (`seriesShowDates`). Present only for a series of two or more shows; the night picker offers these, not a range.
   */
  showDates?: readonly string[];
}

/**
 * SH-1 Launch Q16.2: the occasion an event pick carries — the same slug every "Plan around it" door passes
 * (`CITY_EVENT_OCCASION_SLUG`). The group still follows the nights (Q16.1); "More specific" overrides.
 */
export const EVENT_OCCASION_SLUG = "show";

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
  /** A starting group (the nav's `?group=`, already an exact key) — E3 ruling 3. */
  group?: OccasionPickerGroup;
  /**
   * A catalog slug carried from the inline panel in React state (H-10). Not `experienceSlug`:
   * that field is written to the pen when the pop-up opens (C6). This one is never stored.
   */
  carriedOccasionSlug?: string;
  /**
   * The experiences door already holds an experience and a city, so the next step is dates and
   * party. An event anchor ignores it. Set only by `experiencesPopupSource`.
   */
  askDatesAndParty?: boolean;
  anchor?: { title: string; firstDate: string; lastDate: string; startTime: string | null; venue: string };
  /** SH-1 Launch Q14.3: the anchor's `city_events.source_id` (beside the anchor, which stays the event's own facts). */
  eventSourceId?: string;
  /** SH-1 item 5: the anchor's `series_key`, so PlanEntry can read its sibling shows. */
  seriesKey?: string;
  /** SH-1 Launch Q14.1: the anchor's series of shows — every show's local date, when two or more. */
  showDates?: readonly string[];
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

/** The brief's event default: multi-day → the trip group, one evening → the moment group. */
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

/** The market a city event belongs to (exact match on the event's city), or null. */
function eventMarket(e: Pick<PlanEntryEvent, "city" | "country">): OperatingMarket | null {
  return exactOperatingMarket(e.city) ?? exactOperatingMarket(e.country ? `${e.city}, ${e.country}` : e.city);
}

/** SH-1 Q14.1: a series of shows offers its shows; anything else its contiguous nights. */
function eventIsShowSeries(e: Pick<PlanEntryEvent, "showDates">): boolean {
  return !!e.showDates && isShowSeries(e.showDates);
}

/**
 * Pure. SH-1 Launch Q14.1/Q14.2: the nights the picker offers, clamped to the market's today (`clampToMarketToday`'s
 * rule): a series of shows offers its shows still to come (`upcomingShowDates`); a contiguous run its nights from
 * today on. No market ⇒ no picker (null). A run that offers fewer than two nights asks nothing (null).
 */
export function nightPickerOptions(state: Pick<PlanEntryState, "event" | "market">, now: Date = new Date()): string[] | null {
  const e = state.event;
  if (!e || !state.market) return null;
  const today = marketToday(state.market.marketKey, now);
  if (eventIsShowSeries(e)) {
    const shows = upcomingShowDates(e.showDates!, today);
    return shows.length >= 2 ? shows : null;
  }
  if (!asksWhichNight(e)) return null;
  const nights = eventNightDates(e).filter((d) => d >= today);
  return nights.length >= 2 ? nights : null;
}

/**
 * Pure. SH-1 Q14.1: give the chosen event its series' show dates, read from sibling rows on its `series_key`
 * (`seriesShowDates`). Unchanged when it has no key, already has them, or the key names fewer than two shows.
 */
export function withSeriesShows(state: PlanEntryState, rows: readonly { seriesKey?: string | null; firstDate: string }[]): PlanEntryState {
  const e = state.event;
  if (!e?.seriesKey || e.showDates) return state;
  const shows = seriesShowDates(rows, e.seriesKey);
  if (!isShowSeries(shows)) return state;
  // The show the traveler picked stays the chosen night (its own date); the picker now offers the series' others.
  return { ...state, event: { ...e, showDates: shows }, night: state.night ?? (shows.includes(e.firstDate) ? e.firstDate : null) };
}

/** The whole run as the event row states it; a series spans its first to last show. Clamped only at mint (Q15.3). */
function wholeRun(e: PlanEntryEvent): { startDate: string; endDate: string } {
  if (eventIsShowSeries(e)) {
    const shows = Array.from(new Set(e.showDates!)).sort();
    return { startDate: shows[0], endDate: shows[shows.length - 1] };
  }
  return { startDate: e.firstDate, endDate: e.lastDate };
}

/**
 * Pure. SH-1 Launch Q14.2/Q15.3: the dates a plan is minted with — the chosen dates, the start moved to the later of
 * itself and the market's today (`clampToMarketToday`; UTC today with no market). The server applies the same clamp.
 */
export function planEntryMintDates(state: Pick<PlanEntryState, "startDate" | "endDate" | "market">, now: Date = new Date()): { startDate: string; endDate: string } | null {
  if (!state.startDate || !state.endDate) return null;
  const startDate = clampToMarketToday(state.startDate, state.market?.marketKey ?? null, now);
  return { startDate, endDate: state.endDate < startDate ? startDate : state.endDate };
}

/**
 * Apply an event pick: its city, its run from the market's today on, its row. The group follows its length (Q16.1);
 * the occasion is the slug the door or the pop-up passed (Q16.2 — "show"), kept until "More specific" replaces it.
 */
export function withEvent(state: PlanEntryState, e: PlanEntryEvent, occasionSlug: string | null = null, now: Date = new Date()): PlanEntryState {
  const market = eventMarket(e);
  const group = groupForEvent(e);
  const run = wholeRun(e);
  const options = nightPickerOptions({ event: e, market }, now);
  // A one-night show in a series is one night (the brief). That night is the show the traveler
  // opened when it is still to come; otherwise the first show still to come. The trips group keeps the whole run.
  const pickedNight =
    options && group === "moments" ? (options.includes(e.firstDate) ? e.firstDate : options[0]) : null;
  return {
    ...state,
    around: state.around ?? "event",
    market,
    event: e,
    ...run,
    night: pickedNight,
    ...(pickedNight ? { startDate: pickedNight, endDate: pickedNight } : {}),
    group,
    occasionSlug: occasionSlug?.trim() || null,
  };
}

/** Choose (or clear) one night of a long event; the plan's dates follow it. */
export function withNight(state: PlanEntryState, night: string | null): PlanEntryState {
  if (!state.event) return state;
  return night
    ? { ...state, night, startDate: night, endDate: night }
    : { ...state, night: null, ...wholeRun(state.event) };
}

/** What the inline /experiences panel reports upward. React state only — never storage. */
export interface ExperiencesPick {
  city: string | null;
  country: string | null;
  /** A group the URL or a chip chose. Null while the panel is still on the untouched default. */
  group: OccasionPickerGroup | null;
  /** "More specific" or a route slug. Never the group's default slug. */
  occasionSlug: string | null;
}

/**
 * The Start a plan pop-up's source while the traveler is on /experiences (H-10).
 * Pure. The city and the experience ride as props into `open()`; `experienceSlug` is
 * omitted so that open writes nothing (Q15.2 — C6 is the only pen write on open).
 */
export function experiencesPopupSource(
  search: string,
  pick: ExperiencesPick | null | undefined,
): Pick<PlanEntrySource, "city" | "country" | "group" | "carriedOccasionSlug" | "askDatesAndParty"> {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const urlGroup = preselectedGroup(params);
  const urlMarket = preselectedMarket(params);
  const pickedCity = pick?.city?.trim() || null;
  const city = pickedCity ?? urlMarket?.cityName;
  const country = pickedCity ? pick?.country?.trim() || undefined : urlMarket?.country;
  const group = pick?.group ?? urlGroup ?? undefined;
  const carried = pick?.occasionSlug?.trim() || undefined;
  const ask = !!(city && (group || carried));
  return {
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    ...(group ? { group } : {}),
    ...(carried ? { carriedOccasionSlug: carried } : {}),
    ...(ask ? { askDatesAndParty: true } : {}),
  };
}

/** Where a door lands PlanEntry, and with what already answered. */
export function initialPlanEntry(source: PlanEntrySource | null | undefined): { state: PlanEntryState; step: PlanEntryStep } {
  const state = emptyPlanEntry();
  if (!source) return { state, step: "around" };
  if (source.anchor && source.city) {
    const next = withEvent(
      state,
      {
        title: source.anchor.title,
        city: source.city,
        country: source.country ?? null,
        venue: source.anchor.venue,
        firstDate: source.anchor.firstDate,
        lastDate: source.anchor.lastDate,
        startTime: source.anchor.startTime,
        ...(source.eventSourceId ? { eventSourceId: source.eventSourceId } : {}),
        ...(source.seriesKey ? { seriesKey: source.seriesKey } : {}),
        ...(source.showDates && isShowSeries(source.showDates) ? { showDates: source.showDates } : {}),
      },
      // Q16: the door's slug is kept; the group follows the nights.
      source.experienceSlug ?? null,
    );
    return { state: { ...next, around: "event" }, step: "occasion" };
  }
  const named = source.city
    ? exactOperatingMarket(source.country ? `${source.city}, ${source.country}` : source.city) ?? exactOperatingMarket(source.city)
    : exactOperatingMarket(source.destination);
  const occasionSlug = (source.experienceSlug ?? source.carriedOccasionSlug)?.trim() || null;
  const explicitGroup = source.group && (OCCASION_GROUP_ORDER as readonly string[]).includes(source.group) ? source.group : null;
  const group = explicitGroup ?? state.group;
  const withAnswers: PlanEntryState = { ...state, market: named, around: named ? "place" : null, occasionSlug, group };
  // H-10: an experience and a city are already chosen, so the next step is dates and party.
  // A catalog slug on the page (`/experiences/:slug`) stays on the occasion step — "More specific"
  // is how that door is answered. An event anchor returned above and is never sent here.
  const groupAndCity = !!named && !!explicitGroup && !source.experienceSlug && !source.carriedOccasionSlug;
  const carriedAndCity = !!named && !!source.askDatesAndParty && (!!explicitGroup || !!occasionSlug);
  if (groupAndCity || carriedAndCity) return { state: withAnswers, step: "details" };
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

/**
 * The group chip. An event door arrives with occasion `show` already in the moments group when the
 * event is one night. Choosing that same group keeps `show`. Choosing a different group clears it,
 * so that group's own default applies. "More specific" is a separate write.
 */
export function choosePlanEntryGroup(
  state: Pick<PlanEntryState, "event" | "occasionSlug" | "group">,
  group: OccasionPickerGroup,
): { group: OccasionPickerGroup; occasionSlug: string | null } {
  const keepDoorOccasion = !!state.event && state.occasionSlug === EVENT_OCCASION_SLUG && group === state.group;
  return { group, occasionSlug: keepDoorOccasion ? state.occasionSlug : null };
}

/**
 * Dates a city browse page may show from the pen. No plan (no `tripId`) contributes none. A started
 * plan whose last day is already over contributes none. A started plan that began before `today`
 * shows from `today` on. `today` is the market's calendar day (`marketToday`).
 */
export function browseDatesFromPen(
  pen: { tripId?: string | null; startDate?: string | null; endDate?: string | null },
  today: string,
): { startDate: string; endDate: string | null } | null {
  if (!pen.tripId || !pen.startDate) return null;
  const end = pen.endDate ?? pen.startDate;
  if (end < today) return null;
  const startDate = pen.startDate < today ? today : pen.startDate;
  const endDate = pen.endDate ? (pen.endDate < startDate ? startDate : pen.endDate) : null;
  return { startDate, endDate };
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
  // SH-1 Q16.1: around an event the group follows the nights; the carried "show" slug does not move the landing view.
  const eventSlug = !!state.event && state.occasionSlug === EVENT_OCCASION_SLUG;
  const group = occasionRow && !eventSlug ? experienceGroupFor(occasionRow) : state.group;
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
