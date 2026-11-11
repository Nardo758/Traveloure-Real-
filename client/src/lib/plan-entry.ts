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
import { launchCityName } from "@shared/ticker";
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
import { marketToday } from "@shared/market-today";
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
   * OCC-1 (ledger `2026-11-04-occ1-occasion-entries`; Leon, Nov 3: "/experiences?group= filters the content"): the
   * occasion step shows only this group — its chip and, under "More specific", its occasions. Set only by the
   * /experiences page from its own `?group=` (an exact key; anything else sets nothing, so nothing is filtered).
   */
  onlyGroup?: OccasionPickerGroup;
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
  /**
   * PS-4 (e), ledger `2026-11-02-ps4-entry-carry-forward`: dates and party a door already holds (the assistant
   * panel's stated trip details). Dates seed only as a valid pair ("YYYY-MM-DD", end on or after start); the party
   * seeds the details step's fields. Absent = not known, never invented.
   */
  startDate?: string;
  endDate?: string;
  adults?: number;
  kids?: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A door's dates, kept only as a valid ordered pair; otherwise none. */
export function doorDates(source: Pick<PlanEntrySource, "startDate" | "endDate"> | null | undefined): { startDate: string; endDate: string } | null {
  const a = source?.startDate?.slice(0, 10) ?? "";
  const b = source?.endDate?.slice(0, 10) ?? "";
  if (!DAY_RE.test(a) || !DAY_RE.test(b) || b < a) return null;
  return { startDate: a, endDate: b };
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

const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const spanDays = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;

/** R3-14 (round 3 ruling, Nov 5, 2026): a plan around an event starts on its first day or today, whichever is later. */
export const EVENT_PLAN_DEFAULT_DAYS = 3;
/** R3-14: "All of it" is offered only when what is left of the event is this many days or fewer. */
export const EVENT_ALL_OF_IT_MAX_DAYS = 14;

/** Pure. R3-14: what is left of the event's run — from the later of its start and `today`, to its end. */
export function eventRemainingRun(e: PlanEntryEvent, today: string): { startDate: string; endDate: string } {
  const run = wholeRun(e);
  const startDate = run.startDate < today ? today : run.startDate;
  return { startDate, endDate: run.endDate < startDate ? startDate : run.endDate };
}

/**
 * Pure. R3-14: the dates "Plan around it" starts with — `EVENT_PLAN_DEFAULT_DAYS` days from the later of today and the
 * event's start, never past the event's end. A plan never starts before today; a three-day race is the race.
 */
export function eventDefaultSpan(e: PlanEntryEvent, today: string): { startDate: string; endDate: string } {
  const r = eventRemainingRun(e, today);
  const capped = addDaysIso(r.startDate, EVENT_PLAN_DEFAULT_DAYS - 1);
  return { startDate: r.startDate, endDate: capped < r.endDate ? capped : r.endDate };
}

/** Pure. R3-14: the "All of it" dates, or null when what is left of the event is longer than `EVENT_ALL_OF_IT_MAX_DAYS`. */
export function eventAllOfIt(e: PlanEntryEvent | null, today: string): { startDate: string; endDate: string } | null {
  if (!e) return null;
  const r = eventRemainingRun(e, today);
  return spanDays(r.startDate, r.endDate) <= EVENT_ALL_OF_IT_MAX_DAYS ? r : null;
}

/**
 * Pure. SH-1 Launch Q14.2/Q15.3: the dates a plan is minted with — the chosen dates, the start moved to the later of
 * itself and the market's today (`clampToMarketToday`; UTC today with no market). The server applies the same clamp.
 */
/**
 * ENTRY-1: what a PlanEntry start mints. Dates the entry carried reach the body — which is what makes
 * the server stamp `dates_confirmed_at`, so the slip's "Set your dates" panel never asks again — and
 * `datesConfirmed` names that fact. No dates ⇒ none sent and nothing confirmed (§13).
 */
export function planEntryMintBasics(start: {
  destination: string;
  startDate?: string;
  endDate?: string;
  occasionName?: string;
}): { destination: string; startDate?: string; endDate?: string; occasionName?: string; datesConfirmed: boolean } {
  const datesConfirmed = !!(start.startDate && start.endDate);
  return {
    destination: start.destination,
    ...(datesConfirmed ? { startDate: start.startDate, endDate: start.endDate } : {}),
    ...(start.occasionName ? { occasionName: start.occasionName } : {}),
    datesConfirmed,
  };
}

export function planEntryMintDates(state: Pick<PlanEntryState, "startDate" | "endDate" | "market">): { startDate: string; endDate: string } | null {
  // E-1 (round 2 ruling, Nov 4, 2026): the chosen dates carry verbatim — an event's own start and end are never moved
  // to today. Supersedes SH-1 Launch Q15.3's clamp here and at the mint.
  if (!state.startDate || !state.endDate) return null;
  return { startDate: state.startDate, endDate: state.endDate };
}

/**
 * E-1/E-5/E-8 (round 2 ruling, Nov 4, 2026): the words a plan's banner and title use for what the traveler chose —
 * the event's title when the plan is built around an event; otherwise the occasion the traveler picked under
 * "More specific" (or the door named); otherwise the chosen group's label. A group's DEFAULT occasion is data only
 * (what the mint sends) and is never displayed.
 */
export function planEntryChoiceLabel(input: {
  eventTitle?: string | null;
  specificOccasionName?: string | null;
  groupLabel: string;
}): string {
  return input.eventTitle?.trim() || input.specificOccasionName?.trim() || input.groupLabel;
}

/**
 * E-7 (ruling, Nov 5, 2026): one event appears once. Events are the same when their name, city and start agree
 * (trimmed, case-insensitive name and city; the start instant, else the first day). The first one listed is kept.
 */
export function dedupeEvents<T extends { firstDate: string; title?: string | null; city?: string | null; startsAt?: string | null }>(
  events: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    const key = [(e.title ?? "").trim().toLowerCase(), (e.city ?? "").trim().toLowerCase(), e.startsAt ?? e.firstDate].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * E-7 (ruling, Nov 5, 2026): the ONE "What's on" set, read by the date-step picker AND the landing strip. Every
 * event in the window, de-duplicated, outside-city events included (they carry their own label). The marquee
 * market's events come first as one section, by start date; then every other city's, grouped by month. The landing
 * strip draws the first cards of exactly this set (`whatsOnEvents`), so the two can never disagree.
 */
export function eventPickerGroups<T extends { firstDate: string; marketKey?: string | null; title?: string | null; city?: string | null; startsAt?: string | null }>(
  events: readonly T[],
  marquee: string | null | undefined,
): Array<{ key: string; month: string | null; city: string | null; events: T[] }> {
  const all = dedupeEvents(events);
  const first = marquee ? all.filter((e) => e.marketKey === marquee) : [];
  const rest = marquee ? all.filter((e) => e.marketKey !== marquee) : all;
  const byStart = (a: T, b: T) => a.firstDate.localeCompare(b.firstDate);
  return [
    ...(first.length ? [{ key: `marquee-${marquee}`, month: null, city: launchCityName(marquee) ?? null, events: [...first].sort(byStart) }] : []),
    ...eventsByMonth(rest).map((g) => ({ key: `other-${g.month}`, month: g.month, city: null, events: g.events })),
  ];
}

/** E-7: the "What's on" set flattened in its order — what the landing strip reads. */
export function whatsOnEvents<T extends { firstDate: string; marketKey?: string | null; title?: string | null; city?: string | null; startsAt?: string | null }>(
  events: readonly T[],
  marquee: string | null | undefined,
): T[] {
  return eventPickerGroups(events, marquee).flatMap((g) => g.events);
}

/**
 * Apply an event pick: its city, its run from the market's today on, its row. The group follows its length (Q16.1);
 * the occasion is the slug the door or the pop-up passed (Q16.2 — "show"), kept until "More specific" replaces it.
 */
export function withEvent(state: PlanEntryState, e: PlanEntryEvent, occasionSlug: string | null = null, now: Date = new Date()): PlanEntryState {
  const market = eventMarket(e);
  const group = groupForEvent(e);
  // R3-14: the default span (3 days from the later of today and the start, capped at the end), not the whole run.
  const run = eventDefaultSpan(e, marketToday(market?.marketKey, now));
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

/**
 * Choose one night of a long event, or (null) "All of it": the plan's dates follow. R3-14: "All of it" is what is left
 * of the event from today, and only where it is offered (`eventAllOfIt`); otherwise the default span.
 */
export function withNight(state: PlanEntryState, night: string | null, now: Date = new Date()): PlanEntryState {
  if (!state.event) return state;
  if (night) return { ...state, night, startDate: night, endDate: night };
  const today = marketToday(state.market?.marketKey, now);
  return { ...state, night: null, ...(eventAllOfIt(state.event, today) ?? eventDefaultSpan(state.event, today)) };
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
/**
 * ENTRY-1: a city page carries its city into a new plan. `/discover/location/:city` names one of the
 * eight cities EXACTLY (ruling 4's match), or nothing is carried — never a nearest guess (§13).
 */
export function cityPageSource(path: string): { city: string; country: string } | null {
  const m = /^\/discover\/location\/([^/?#]+)\/?$/.exec(path.split("?")[0]);
  if (!m) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const market = exactOperatingMarket(raw.replace(/[-_+]/g, " "));
  return market ? { city: market.cityName, country: market.country } : null;
}

/**
 * ENTRY-1: the new-plan pop-up has a URL — `?start=1`, plus `&step=` while it is open — so Back closes
 * it and a link opens it. Pure: the query string in, the query string out (other params kept).
 */
/** ENTRY-1: every Start-a-plan control is a real link to the pop-up's URL. */
export const PLAN_START_HREF = "/?start=1";

/**
 * R3-7 (round 3 ruling, Nov 5, 2026): where a landing moment pill goes — that occasion's own start page in the marquee
 * city (`/experiences/proposal?destination=Kyoto`), never the start pop-up. Null when the moment names no catalog slug
 * or no city is known, so the caller keeps the pop-up door for it.
 */
export function momentPillHref(slug: string | null | undefined, marqueeCity: string | null | undefined): string | null {
  const s = (slug ?? "").trim();
  const c = (marqueeCity ?? "").trim();
  if (!s || !c) return null;
  return `/experiences/${encodeURIComponent(s)}?destination=${encodeURIComponent(c)}`;
}

/**
 * The click handler a Start-a-plan link keeps: a plain click opens the pop-up in place (the door's
 * own handler, unchanged); a modified click (new tab/window) follows the href instead.
 */
export function planStartClick(handler: () => void) {
  return (e: { preventDefault(): void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number }) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    handler();
  };
}

export const PLAN_ENTRY_URL_STEPS = ["around", "occasion", "details"] as const;

export function planEntryUrlRequested(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("start") === "1";
}

export function withPlanEntryUrl(search: string, open: boolean, step?: string | null): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("start");
  params.delete("step");
  if (open) {
    params.set("start", "1");
    if (step && (PLAN_ENTRY_URL_STEPS as readonly string[]).includes(step)) params.set("step", step);
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

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
    // E-2 (round 2 ruling): the event's occasion is known, so it is never asked again — the next step is the party.
    return { state: { ...next, around: "event" }, step: "details" };
  }
  const named = source.city
    ? exactOperatingMarket(source.country ? `${source.city}, ${source.country}` : source.city) ?? exactOperatingMarket(source.city)
    : exactOperatingMarket(source.destination);
  const occasionSlug = (source.experienceSlug ?? source.carriedOccasionSlug)?.trim() || null;
  const explicitGroup = source.group && (OCCASION_GROUP_ORDER as readonly string[]).includes(source.group) ? source.group : null;
  const group = explicitGroup ?? state.group;
  const dates = doorDates(source);
  const withAnswers: PlanEntryState = { ...state, market: named, around: named ? "place" : null, occasionSlug, group, ...(dates ?? {}) };
  // H-10: an experience and a city are already chosen, so the next step is dates and party.
  // A catalog slug on the page (`/experiences/:slug`) stays on the occasion step — "More specific"
  // is how that door is answered. An event anchor returned above and is never sent here.
  // R3-6: a `?group=` filter (`onlyGroup`) is not an answer, so a city plus a filter still asks the occasion.
  const groupAndCity = !!named && !!explicitGroup && doorChoseGroup(source) && !source.experienceSlug && !source.carriedOccasionSlug;
  const carriedAndCity = !!named && !!source.askDatesAndParty && (!!explicitGroup || !!occasionSlug);
  // E-2 (round 2 ruling): a door that names an occasion (`/experiences/proposal?destination=Kyoto`) has answered it —
  // never re-asked. A slug the catalog does not carry is dropped by the panel, which then asks (§13).
  const slugAndCity = !!named && !!occasionSlug;
  if (groupAndCity || carriedAndCity || slugAndCity) return { state: withAnswers, step: "details" };
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

/**
 * The occasion the plan is minted with: "More specific" (or a door's or event's) if chosen, else the default of a group
 * the traveler (or the door) chose. A-8 (ruling, Nov 5, 2026: "no invented occasion"): nothing picked ⇒ null — the
 * plan stores no occasion and takes the neutral title.
 */
export function chosenOccasionSlug(state: Pick<PlanEntryState, "occasionSlug" | "group">, groupChosen: boolean): string | null {
  if (state.occasionSlug) return state.occasionSlug;
  return groupChosen ? OCCASION_GROUP_DEFAULT_SLUG[state.group] : null;
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

/**
 * CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): the marquee market is the default city wherever a city is
 * picked. A state that holds no city takes the marquee; a held city (a door's, or the traveler's) is kept.
 */
export function withMarqueeCity(state: PlanEntryState, marquee: string | null | undefined): PlanEntryState {
  if (state.market || !marquee) return state;
  const m = OPERATING_MARKETS.find((x) => x.marketKey === marquee);
  return m ? { ...state, market: m } : state;
}

/** Start a plan needs a city; nothing else (dates are optional — E1 placeholder window). */
/**
 * QA round 3 PR 2 (Leon, Nov 11, 2026): where Step 1's forward control goes. Pure — `PlanEntry`'s `advanceFromAround`
 * calls this and nothing else decides it. A door that carried NO occasion, group or experience (and no event) goes to
 * Step 2, the occasion — never to dates and party, never to a minted plan. A door that carried one goes to `details`:
 * E2's carried-occasion skips stand (an event, a door's occasion slug, a door-chosen group, H-10's carried experience).
 * No market yet ⇒ null (nothing to move to).
 */
export function stepAfterAround(input: {
  state: Pick<PlanEntryState, "market" | "event" | "occasionSlug">;
  groupChosen: boolean;
  askDatesAndParty?: boolean | null;
}): PlanEntryStep | null {
  if (!input.state.market) return null;
  const known = !!input.state.event || !!input.state.occasionSlug || input.groupChosen || !!input.askDatesAndParty;
  return known ? "details" : "occasion";
}

/**
 * QA round 3 PR 2: is the Start control (`button-plan-entry-start`) drawn on Step 1? In the pop-up only for a door that
 * carried an occasion — a door with none offers "Next" to Step 2 and nothing else. Inline (the /experiences page) it is
 * the page's sticky Continue (E3), whose press on Step 1 is `stepAfterAround` — it moves to the next step, never mints.
 */
export function startOfferedOnAround(input: { inline: boolean; state: Pick<PlanEntryState, "market" | "occasionSlug"> }): boolean {
  return input.inline || (!!input.state.market && !!input.state.occasionSlug);
}

export function canStartPlan(state: PlanEntryState): boolean {
  return !!state.market;
}

/**
 * SLIP-FIRST (round 5 hotfix, ledger `2026-11-07-slip-first-landing`; supersedes PLAN-1 ruling 3's map landing): a new
 * plan lands on the Trip Slip's Days view — from every door, whatever the group or the event's span. Map is one tab
 * away; the traveler's own saved view overrides only once they have set one. The arguments stay for the callers' shape.
 */
export function planEntryView(
  _state?: PlanEntryState,
  _occasionRow?: ExperienceGroupRow | null | undefined,
): "map" | "list" {
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

/**
 * R3-8 (round 3 ruling, Nov 5, 2026): "Next month" opens the date picker SCOPED to next month — the inputs' min and max —
 * and sets no dates itself. The traveler picks the days; a month nobody narrowed is never stored as the trip's dates.
 */
export function nextMonthScope(today: Date): { min: string; max: string } {
  const { startDate, endDate } = nextMonth(today);
  return { min: startDate, max: endDate };
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

/**
 * The typed-city check: an exact operating market, or "not yet" with suggestions. CITY-1: an operating market that
 * is not open (`isOpen` false) returns `{ waitlist }` — the picker links to its waitlist instead of saying "not yet".
 */
export function typedCity(
  typed: string,
  isOpen: (marketKey: string) => boolean = () => true,
): { market: OperatingMarket } | { waitlist: OperatingMarket } | { notYet: string; suggestions: OperatingMarket[] } | null {
  const t = typed.trim();
  if (!t) return null;
  const market = exactOperatingMarket(t);
  if (market) return isOpen(market.marketKey) ? { market } : { waitlist: market };
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

/**
 * OCC-1: the group chips the occasion step draws. With `onlyGroup` set to a group the catalog carries, only that
 * group; otherwise every available group (an unknown or absent filter filters nothing — today's behaviour).
 */
/**
 * R3-6 (round 3 ruling, Nov 5, 2026): did the DOOR choose the group? A door that names a group (`source.group`) chose it,
 * except `/experiences?group=`, which also sets `onlyGroup`: there the group only FILTERS the occasion step (OCC-1), so
 * the visitor still answers it — a hosted event offers the wedding instead of skipping straight to dates and party.
 */
export function doorChoseGroup(source: Pick<PlanEntrySource, "group" | "onlyGroup"> | null | undefined): boolean {
  return !!source?.group && !source?.onlyGroup;
}

/**
 * TB1.1 (round 2, Leon Nov 10, 2026): is a group chip DRAWN active? A pressed chip, or a door-chosen occasion, draws
 * the state's group active (as before). `/experiences?group=` draws its ONE filtered chip active too — the visitor sees
 * the group they arrived on selected — while R3-6 stands untouched: `groupChosen` stays false, so the step still asks
 * and `chosenOccasionSlug` still answers nothing. Pure, so every group key is proven.
 */
export function groupChipActive(input: {
  key: OccasionPickerGroup;
  stateGroup: OccasionPickerGroup;
  groupChosen: boolean;
  occasionSlug: string | null;
  moreSpecific: boolean;
  onlyGroup: OccasionPickerGroup | null | undefined;
  shownCount: number;
}): boolean {
  if (input.stateGroup !== input.key) return false;
  if (input.moreSpecific && input.occasionSlug) return false;
  const filteredToThis = input.shownCount === 1 && input.onlyGroup === input.key;
  return input.groupChosen || !!input.occasionSlug || filteredToThis;
}

export function shownOccasionGroups(
  available: readonly OccasionPickerGroup[],
  onlyGroup: OccasionPickerGroup | null | undefined,
): OccasionPickerGroup[] {
  return onlyGroup && available.includes(onlyGroup) ? [onlyGroup] : [...available];
}
