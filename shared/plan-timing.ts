/**
 * plan-timing.ts — WHEN a plan starts, as an instant, and the ONE 48-hour handover window.
 * Ledger `2026-09-07-home-time-axis` (lane L10); CLAUDE.md Locked Decisions 30 and 45 (8), §13,
 * §18 rule 1. Pure: no drizzle, no fetch, no clock of its own (`now` is always passed in).
 *
 * WHY THIS FILE EXISTS. Two lanes built in parallel — Home's time axis (L10) and the Trip Card's
 * one page (L9) — both need "the moment the Trip Card takes over", and a second derivation of that
 * moment is the drift class §18 rule 1 names. The window ITSELF already had one home before either
 * lane: `TRIP_CARD_HANDOVER_WINDOW_MS` in `shared/trip-primary-surface.ts` (Console Realign R-F),
 * read by the client's `tripCardIsPrimary` and by the server's T-48h nudge scheduler. This module
 * does NOT restate it — it imports that constant and adds the one thing neither reader had: a
 * ZONE-AWARE start instant, now that a plan can carry `trips.timezone` (Locked Decision 30).
 *
 * THE NULL-TIMEZONE POSTURE (Locked Decision 30, §13). `trips.start_date` is a DATE column — a
 * calendar day, not an instant. With a usable IANA zone the day's midnight in THAT zone is the
 * start instant. With NULL the platform does not know where that day is, so the instant is the
 * day's UTC midnight — EXACTLY the parse `tripCardIsPrimary` has always applied to the same string
 * — and the caller must treat the result as a CALENDAR-DATE comparison with no zone claimed
 * (`planStartInstant` says which case it is through `zoned`). Never the server's zone, never the
 * viewer's, never a nearest market: a wrong zone looks authoritative and is worse than none.
 */
import { TRIP_CARD_HANDOVER_WINDOW_MS } from "./trip-primary-surface";

/** The ONE handover window (48 hours), re-exported so a reader here never spells the number. */
export const HANDOVER_WINDOW_MS = TRIP_CARD_HANDOVER_WINDOW_MS;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Is this string an IANA zone THIS runtime can resolve? The column carries no DB CHECK (publish-trap
 * posture), so a stored value can be one this Node build's ICU data does not know, and the honest
 * response to that is NULL's: fall back to the zone-free reading, never to a substitute zone.
 * (Moved here from `server/services/trip-timezone.ts`, which re-exports it — one implementation.)
 */
export function isUsableTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" (or a timestamp whose date part is that) → [y, m, d], or null when unparseable. */
export function calendarParts(value: string | Date | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const raw = value instanceof Date ? (isNaN(value.getTime()) ? "" : value.toISOString()) : String(value).trim();
  const m = raw.match(DATE_ONLY_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Reject Feb 30 and friends: round-trip through UTC and compare.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Wall-clock parts of an instant in a zone, read off Intl — no offset table of our own. */
function wallClockInZone(instant: Date, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { y: pick("year"), mo: pick("month"), d: pick("day"), h: pick("hour"), mi: pick("minute") };
}

/**
 * The instant of LOCAL MIDNIGHT of a calendar day in an IANA zone. Two Intl round-trips: guess UTC
 * midnight, read the zone's wall clock at that guess, shift by the difference, and read once more
 * for the DST-transition edge (a day whose midnight does not exist resolves to the first instant
 * of that day, which is what a calendar renders for it).
 */
export function zonedMidnight(y: number, mo: number, d: number, timeZone: string): Date {
  // The wall clock we want to read at the answer is exactly the day's UTC-midnight tuple.
  const target = Date.UTC(y, mo - 1, d);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wallClockInZone(new Date(guess), timeZone);
    const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
    // How far the zone's wall clock at `guess` is from the wall clock we want — measured against
    // the fixed target, never against the moving guess (that doubles the offset).
    const diff = asUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export interface PlanStartInstant {
  /** The start instant. */
  instant: Date;
  /**
   * true  ⇒ `instant` is local midnight in the plan's own zone (a real instant).
   * false ⇒ the plan carries no usable zone; `instant` is the day's UTC midnight — a CALENDAR
   *         DATE stand-in with no zone claimed (Locked Decision 30). Readers compare days, not
   *         clocks, and render no zone.
   */
  zoned: boolean;
  /** The calendar day the instant belongs to, "YYYY-MM-DD" — the same in both cases. */
  day: string;
}

/**
 * When does this plan start? `startDate` is `trips.start_date` (a calendar day); `timezone` is
 * `trips.timezone` (nullable). Returns null only when the day itself cannot be parsed — an absent
 * or unparseable start is NOT a plan that starts "now", it is one with no start to report (§13).
 */
export function planStartInstant(
  startDate: string | Date | null | undefined,
  timezone: string | null | undefined,
): PlanStartInstant | null {
  const parts = calendarParts(startDate);
  if (!parts) return null;
  const [y, mo, d] = parts;
  const day = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (isUsableTimeZone(timezone)) {
    return { instant: zonedMidnight(y, mo, d, timezone), zoned: true, day };
  }
  // NULL / unusable zone: UTC midnight of the calendar day — the parse `tripCardIsPrimary` has
  // always used for this string. No zone is claimed; `zoned: false` says so to the caller.
  return { instant: new Date(Date.UTC(y, mo - 1, d)), zoned: false, day };
}

/**
 * The instant the handover window OPENS: `start − window`. Same posture as `planStartInstant`
 * (a `zoned: false` result is a calendar-date stand-in). Null when the start cannot be parsed.
 */
export function handoverInstant(
  startDate: string | Date | null | undefined,
  timezone: string | null | undefined,
  windowMs: number = HANDOVER_WINDOW_MS,
): PlanStartInstant | null {
  const start = planStartInstant(startDate, timezone);
  if (!start) return null;
  const instant = new Date(start.instant.getTime() - windowMs);
  return { instant, zoned: start.zoned, day: instant.toISOString().slice(0, 10) };
}

/**
 * Is `now` inside the handover window — at or after `start − window`? (Whether the plan is ALSO
 * underway or finished is not this predicate's question; `tripCardIsPrimary` OR's those arms.)
 *
 * With a NULL zone the comparison is against the day's UTC midnight, i.e. a calendar-date
 * comparison with no zone claimed — the same answer `tripCardIsPrimary` gives today, so the two
 * readers can never disagree about a plan that carries no zone. An unparseable start is `false`:
 * nothing real to derive from ⇒ the window is not claimed to be open (§13).
 */
export function isInsideHandoverWindow(
  now: Date,
  startDate: string | Date | null | undefined,
  timezone: string | null | undefined,
  windowMs: number = HANDOVER_WINDOW_MS,
): boolean {
  const opens = handoverInstant(startDate, timezone, windowMs);
  if (!opens) return false;
  return now.getTime() >= opens.instant.getTime();
}

/** Calendar-day arithmetic in UTC, "YYYY-MM-DD" in → "YYYY-MM-DD" out. Null on an unparseable day. */
export function addCalendarDays(day: string | null | undefined, days: number): string | null {
  const parts = calendarParts(day);
  if (!parts) return null;
  const [y, mo, d] = parts;
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The UTC calendar day of an instant, "YYYY-MM-DD". */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * "What day is it" for a plan: the wall-clock day of `instant` in the plan's zone when it has a
 * usable one, else the UTC day (the NULL posture above — a calendar-date reading, no zone claimed).
 */
export function calendarDayOf(instant: Date, timezone: string | null | undefined): string {
  if (!isUsableTimeZone(timezone)) return utcDay(instant);
  const w = wallClockInZone(instant, timezone);
  return `${String(w.y).padStart(4, "0")}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}
