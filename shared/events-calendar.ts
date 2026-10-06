/**
 * events-calendar.ts — the pure rules behind the /events calendar (ledger
 * `2026-10-06-events-calendar`, events-page brief 2a; boards `Main`, `Mobile`).
 *
 * Three tables, three places on the page, never joined (brief, "The model the boards draw"):
 *   - a DATED event (`city_events`) marks the days it covers and lists in "What's on";
 *   - a MONTH-LEVEL season (`destination_events`, months and no date) shows in the month's
 *     "All month" band and never on a day;
 *   - how good a month is for a city (`destination_seasons`) feeds "Where to go".
 *
 * Every derivation the page draws is here, so the marks on the grid and the rows in "What's on"
 * read the SAME list through the SAME range test and cannot disagree (§18 rule 1). The server
 * derives each event's local first/last date in its own city (`toCityEventCard`); nothing here
 * reads the viewer's time zone except the "today" mark the client passes in.
 *
 * §13: an event with no stated vertical is listed under "All" only, never guessed into one; a
 * city with no season row for the month is "Not rated yet", never given a rating; the "outside the
 * city" line is drawn only where a locality is STORED and differs from the market city.
 */
import type { CityEventCard, CityEventVertical } from "./city-events";

/**
 * One dated event as the calendar read sends it: the landing card plus the two fields the
 * calendar filters and labels on. `venueLocality` is null until migration 356 lands and for
 * every row that states none (NULL = not known, never "same as the market").
 */
export interface CalendarEvent extends CityEventCard {
  vertical: CityEventVertical | null;
  venueLocality: string | null;
}

/** One month-level season row, expanded over the window months it covers. */
export interface SeasonBand {
  id: string;
  title: string;
  /** What the row names: the country, or the market city when the row itself names one. */
  place: string;
  country: string;
  /** Market keys this band applies to (the markets in its country, or its own city). */
  marketKeys: string[];
  /** The window months it shows in, YYYY-MM. */
  months: string[];
  /** "October and November", "July", "March to May". */
  span: string;
}

export const SEASON_GROUPS = ["best", "good", "average", "off", "unrated"] as const;
export type SeasonGroup = (typeof SEASON_GROUPS)[number];

export interface MonthSeason {
  group: Exclude<SeasonGroup, "unrated">;
  averageTemp: string | null;
  crowdLevel: string | null;
  /** Whether the rating is the city's own row or its country's. */
  scope: "city" | "country";
}

/** One operating market for "Where to go": its vibe tags and a season per month number (1–12). */
export interface CalendarPlace {
  marketKey: string;
  city: string;
  country: string;
  vibeTags: string[];
  /** Keyed "1".."12"; a missing key = no season row for that month (not rated). */
  seasons: Partial<Record<string, MonthSeason>>;
}

export interface EventsCalendarPayload {
  /** The twelve months shown, YYYY-MM, starting at the current month. */
  months: string[];
  events: CalendarEvent[];
  bands: SeasonBand[];
  places: CalendarPlace[];
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A run longer than this many days is drawn as an underline, not counted (board legend). */
export const LONG_RUN_MIN_DAYS = 11;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const ymKey = (y: number, m: number) => `${y}-${pad(m)}`;

function utc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d || 1);
}
function keyOfUtc(t: number): string {
  const d = new Date(t);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function addDays(key: string, n: number): string {
  return keyOfUtc(utc(key) + n * 86_400_000);
}

/** Twelve months starting at the month of `firstMonth` (YYYY-MM), each with its real year. */
export function windowMonths(firstMonth: string): string[] {
  const [y, m] = firstMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = m - 1 + i;
    out.push(ymKey(y + Math.floor(idx / 12), (idx % 12) + 1));
  }
  return out;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthFirst = (ym: string) => `${ym}-01`;
export const monthLast = (ym: string) => `${ym}-${pad(daysInMonth(ym))}`;

/** Monday-start column (0 = Monday … 6 = Sunday) of a date. */
export function mondayColumn(key: string): number {
  return (new Date(utc(key)).getUTCDay() + 6) % 7;
}
/** The Monday that starts the week a date is in. */
export function weekStartOf(key: string): string {
  return addDays(key, -mondayColumn(key));
}

/** THE range test: an event is in a period when its days overlap it. Marks and rows both call this. */
export function overlaps(e: Pick<CalendarEvent, "firstDate" | "lastDate">, from: string, to: string): boolean {
  return e.firstDate <= to && e.lastDate >= from;
}

export function isLongRun(e: Pick<CalendarEvent, "nights">): boolean {
  return e.nights >= LONG_RUN_MIN_DAYS;
}

/** The "What" filter. `season` shows the bands only; a vertical never matches a NULL vertical. */
export type KindFilter = "all" | CityEventVertical | "season";

export function matchesKind(e: Pick<CalendarEvent, "vertical">, kind: KindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "season") return false;
  return e.vertical === kind;
}
export function matchesCity(e: Pick<CalendarEvent, "marketKey">, city: string): boolean {
  return city === "all" || e.marketKey === city;
}
export function bandMatches(b: SeasonBand, kind: KindFilter, city: string): boolean {
  return (kind === "all" || kind === "season") && (city === "all" || b.marketKeys.includes(city));
}

/** Events in a period, soonest first — the "What's on" list. */
export function eventsInPeriod(events: readonly CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events
    .filter((e) => overlaps(e, from, to))
    .sort((a, b) => (a.firstDate === b.firstDate ? a.startsAt.localeCompare(b.startsAt) : a.firstDate < b.firstDate ? -1 : 1));
}

export interface DayMark {
  date: string;
  /** Events covering this day that are not long runs. */
  count: number;
  /** A long run covers this day (drawn as an underline, not counted). */
  longRun: boolean;
}

/** One mark per day of a month, from the same range test the list uses. */
export function dayMarks(events: readonly CalendarEvent[], ym: string): DayMark[] {
  const inMonth = events.filter((e) => overlaps(e, monthFirst(ym), monthLast(ym)));
  const out: DayMark[] = [];
  for (let d = 1; d <= daysInMonth(ym); d++) {
    const date = `${ym}-${pad(d)}`;
    let count = 0;
    let longRun = false;
    for (const e of inMonth) {
      if (!overlaps(e, date, date)) continue;
      if (isLongRun(e)) longRun = true;
      else count++;
    }
    out.push({ date, count, longRun });
  }
  return out;
}

/** The month a band shows in and the bands for a period. */
export function bandsInPeriod(bands: readonly SeasonBand[], from: string, to: string): SeasonBand[] {
  const a = from.slice(0, 7);
  const b = to.slice(0, 7);
  return bands.filter((x) => x.months.some((m) => m >= a && m <= b));
}

/**
 * Expand one month-level row over the window. `startMonth`..`endMonth` wraps over the new year
 * (Dec–Feb). A non-recurring row with a `year` shows only in the run that starts in that year;
 * a row with no year states none, so it recurs.
 */
export function bandMonths(
  row: { startMonth: number; endMonth: number | null; isRecurring: boolean | null; year: number | null },
  window: readonly string[],
): string[] {
  const start = row.startMonth;
  const end = row.endMonth ?? start;
  const len = ((end - start + 12) % 12) + 1;
  const out: string[] = [];
  for (const ym of window) {
    const [y, m] = ym.split("-").map(Number);
    const k = (m - start + 12) % 12;
    if (k >= len) continue;
    const startYear = m >= start ? y : y - 1;
    if (row.isRecurring === false && row.year != null && startYear !== row.year) continue;
    out.push(ym);
  }
  return out;
}

export function bandSpan(startMonth: number, endMonth: number | null): string {
  const s = MONTH_NAMES[startMonth - 1];
  const end = endMonth ?? startMonth;
  if (end === startMonth) return s;
  const len = ((end - startMonth + 12) % 12) + 1;
  return len === 2 ? `${s} and ${MONTH_NAMES[end - 1]}` : `${s} to ${MONTH_NAMES[end - 1]}`;
}

/** A season row's rating, read into the four groups the board draws; anything else is unrated. */
export function seasonGroup(rating: string | null | undefined): MonthSeason["group"] | null {
  switch ((rating ?? "").toLowerCase()) {
    case "best":
    case "excellent":
      return "best";
    case "good":
      return "good";
    case "average":
      return "average";
    case "avoid":
    case "poor":
      return "off";
    default:
      return null;
  }
}

export const SEASON_GROUP_LABELS: Record<SeasonGroup, string> = {
  best: "Best time",
  good: "Good time",
  average: "Average",
  off: "Off season",
  unrated: "Not rated yet",
};

export interface WhereToGoRow {
  place: CalendarPlace;
  group: SeasonGroup;
  season: MonthSeason | null;
  /** Dated events in this city in the month. */
  eventCount: number;
  /** "16-22°C · High crowds" — rated months only, and only the parts the row states. */
  facts: string | null;
}

const GROUP_RANK: Record<SeasonGroup, number> = { best: 0, good: 1, average: 2, unrated: 3, off: 4 };

/**
 * "Where to go" for one month: every operating market, best first. A market with no season row
 * for the month is "Not rated yet" and is never dropped (ruling E6). The vibe filter narrows
 * destinations only; it never filters events.
 */
export function whereToGo(
  places: readonly CalendarPlace[],
  ym: string,
  events: readonly CalendarEvent[],
  vibe: string,
): WhereToGoRow[] {
  const month = String(Number(ym.slice(5, 7)));
  const from = monthFirst(ym);
  const to = monthLast(ym);
  return places
    .filter((p) => vibe === "all" || p.vibeTags.some((t) => t.toLowerCase() === vibe.toLowerCase()))
    .map((place, i) => {
      const season = place.seasons[month] ?? null;
      const eventCount = events.filter((e) => e.marketKey === place.marketKey && overlaps(e, from, to)).length;
      const facts = season
        ? [season.averageTemp, season.crowdLevel ? `${season.crowdLevel} crowds` : null].filter(Boolean).join(" · ") || null
        : null;
      return { row: { place, group: season ? season.group : ("unrated" as SeasonGroup), season, eventCount, facts }, i };
    })
    .sort((a, b) => {
      const g = GROUP_RANK[a.row.group] - GROUP_RANK[b.row.group];
      if (g !== 0) return g;
      // Among the unrated, a city with dated events this month comes first.
      if (a.row.group === "unrated" && (a.row.eventCount > 0) !== (b.row.eventCount > 0)) return a.row.eventCount > 0 ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

export const VERTICAL_LABELS: Record<CityEventVertical, string> = {
  music: "Music",
  fashion: "Fashion",
  motorsport: "Motorsport",
  other: "Festivals & culture",
};

/** "Sat 10 Oct" from a local date key. */
export function formatDayShort(key: string): string {
  const d = new Date(utc(key));
  return `${DOW_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** The row's tag: "Music · 3 days", "Motorsport · 23-day run", "One day". No vertical, no kind. */
export function eventTag(e: Pick<CalendarEvent, "vertical" | "nights">): string {
  const length = isLongRun(e) ? `${e.nights}-day run` : e.nights > 1 ? `${e.nights} days` : "One day";
  return e.vertical ? `${VERTICAL_LABELS[e.vertical]} · ${length}` : length;
}

/** Local dates, and the start time only when the organizer published one. */
export function eventWhen(e: Pick<CalendarEvent, "firstDate" | "lastDate" | "startTime">): string {
  if (e.lastDate !== e.firstDate) return `${formatDayShort(e.firstDate)} – ${formatDayShort(e.lastDate)}`;
  return e.startTime ? `${formatDayShort(e.firstDate)} · ${e.startTime}` : formatDayShort(e.firstDate);
}

/**
 * Where it is. Only a STORED locality that differs from the market city says "outside the city"
 * (ruling A2.5); with none stored the row names the venue and the market city and claims nothing.
 */
export function eventPlace(e: Pick<CalendarEvent, "venue" | "city" | "venueLocality">): string {
  const loc = e.venueLocality?.trim();
  if (loc && loc.toLowerCase() !== e.city.trim().toLowerCase()) {
    return `${e.venue}, ${loc} · outside the city, planned from ${e.city}`;
  }
  return `${e.venue} · ${e.city}`;
}

/** The soonest event in a list — the "Next up" chip. */
export function nextUp(events: readonly CalendarEvent[]): CalendarEvent | null {
  let best: CalendarEvent | null = null;
  for (const e of events) if (!best || e.firstDate < best.firstDate || (e.firstDate === best.firstDate && e.startsAt < best.startsAt)) best = e;
  return best;
}

export type PeriodKind = "month" | "week" | "day";

/** The period a selection covers, as inclusive local date keys. */
export function periodRange(kind: PeriodKind, ym: string, day: string | null, weekStart: string | null): { from: string; to: string } {
  if (kind === "day" && day) return { from: day, to: day };
  if (kind === "week" && weekStart) return { from: weekStart, to: addDays(weekStart, 6) };
  return { from: monthFirst(ym), to: monthLast(ym) };
}

/** "Monday 12 October", "12 – 18 October", "28 Sep – 4 Oct", "October 2026". */
export function periodTitle(kind: PeriodKind, ym: string, day: string | null, weekStart: string | null): string {
  const [y, m] = ym.split("-").map(Number);
  if (kind === "day" && day) {
    const d = new Date(utc(day));
    const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  }
  if (kind === "week" && weekStart) {
    const a = new Date(utc(weekStart));
    const b = new Date(utc(addDays(weekStart, 6)));
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTH_NAMES[b.getUTCMonth()]}`
      : `${a.getUTCDate()} ${MONTH_SHORT[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTH_SHORT[b.getUTCMonth()]}`;
  }
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
