/**
 * plan-timing — WHEN a plan starts, read in the plan's own zone, and the two questions every
 * traveler surface asks about that instant: "are we inside the 48-hour handover window?" and
 * "is the plan underway?".
 *
 * Ledger `2026-09-07-trip-card-one-page` (Console & AI Concierge brief lane L9); shared with lane
 * L10 (Home time axis), which needs the SAME window. CLAUDE.md Locked Decision 30 (a plan's
 * timezone), §13, §18 rule 1.
 *
 * WHY ONE MODULE. `shared/trip-primary-surface.ts` already carried a 48-hour window arm and an
 * underway arm, both computed off `new Date(startDate)` — a bare "YYYY-MM-DD" parsed as UTC
 * midnight, which is neither the plan's zone nor the viewer's. Lane L9 (the Trip Card's "Back to
 * planning" suppression and its countdown) and lane L10 (Home's dated rows) both need the same
 * window, and a second derivation beside the first is the drift class §18 rule 1 names. So the
 * derivation lives HERE, once, and `tripCardIsPrimary` delegates to it.
 *
 * THE NULL-TIMEZONE POSTURE, stated once so every reader inherits it (Locked Decision 30):
 *   `trips.timezone` is NULL when the plan's zone was NEVER CAPTURED (a destination outside the
 *   launch markets). With no zone, a wall-clock date has NO instant we can honestly claim — not
 *   UTC, not the server's zone, not the viewer's device zone presented as the plan's. So:
 *   · `planStartInstant` / `zonedWallClockToInstant` return NULL — there is no instant to give.
 *   · the window and underway predicates COMPARE ON THE DATE ALONE: the viewer's local calendar
 *     date against the plan's calendar dates, whole days, no hour-of-day claim. This is the
 *     coarse answer that stays true in every zone rather than a precise one that is true in
 *     exactly one — and a caller that needs an instant (a countdown) gets NULL and renders none.
 *
 * PURE: no drizzle, no fetch, no clock of its own (`now` is always an argument). `Intl` with an
 * IANA `timeZone` is the only zone arithmetic used — no library, no offset table of our own.
 */

/** The T-48h handover window (Console Realign ruling R-F), in hours. The ONE statement of it. */
export const HANDOVER_WINDOW_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

/**
 * Read the calendar date out of a "YYYY-MM-DD" string, a longer ISO string (its leading date is
 * taken AS WRITTEN — no zone conversion, because a trip date column is a wall-clock date), or a
 * `Date` (its LOCAL calendar date). NULL for anything else — never a guessed date.
 */
export function parseCalendarDateParts(value: string | Date | null | undefined): CalendarDate | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  // Reject an impossible date (Feb 30) rather than letting Date.UTC roll it into March.
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() !== parts.month - 1 ||
    probe.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

/** "HH:MM" (24h) → minutes since midnight, or NULL for anything that is not that shape. */
export function parseWallClockMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** True when `Intl` knows this IANA zone. An unknown string is treated exactly like NULL (§13). */
export function isKnownTimezone(timezone: string | null | undefined): boolean {
  if (!timezone || typeof timezone !== "string" || timezone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The wall clock `instant` reads as in `timezone`, as UTC-encoded epoch ms (for offset math). */
function zonedWallClockAsUtcMs(instant: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // Some engines report midnight as hour 24 under h23 on older ICU; normalise.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  return Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
}

/**
 * The instant at which `date` `time` occurs in `timezone`. NULL when the zone is NULL/unknown, the
 * date is not a calendar date, or the time is not "HH:MM" (an absent time means midnight ONLY
 * when the caller says so — pass "00:00"; this function never assumes it).
 *
 * Offset resolution is the standard two-pass fixed point over `Intl` (a first guess at the UTC
 * encoding, corrected by the zone's own reading of that guess, then corrected once more so a
 * DST edge between the two passes still lands on the right side).
 */
export function zonedWallClockToInstant(
  date: string | Date | null | undefined,
  time: string | null | undefined,
  timezone: string | null | undefined,
): Date | null {
  if (!isKnownTimezone(timezone)) return null;
  const d = parseCalendarDateParts(date);
  const minutes = parseWallClockMinutes(time);
  if (!d || minutes == null) return null;
  const zone = String(timezone);
  const wallAsUtc = Date.UTC(d.year, d.month - 1, d.day, Math.floor(minutes / 60), minutes % 60, 0);
  let guess = wallAsUtc;
  for (let i = 0; i < 2; i++) {
    const offset = zonedWallClockAsUtcMs(new Date(guess), zone) - guess;
    guess = wallAsUtc - offset;
  }
  return new Date(guess);
}

/**
 * The instant the plan STARTS — midnight of `startDate` in the plan's zone. NULL when there is no
 * zone (Locked Decision 30: never UTC, never the server's, never the device's dressed as the
 * plan's) or no parseable start date.
 */
export function planStartInstant(
  startDate: string | Date | null | undefined,
  timezone: string | null | undefined,
): Date | null {
  return zonedWallClockToInstant(startDate, "00:00", timezone);
}

/**
 * The plan's zone read of the calendar date `now` falls on ("YYYY-MM-DD"). NULL without a zone:
 * a caller falling back to the device's date must say so at the call site.
 */
export function zonedTodayIso(now: Date, timezone: string | null | undefined): string | null {
  if (!isKnownTimezone(timezone)) return null;
  const utcMs = zonedWallClockAsUtcMs(now, String(timezone));
  const d = new Date(utcMs);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole calendar days from `now`'s LOCAL date to `date` (negative = already past). NULL = unparseable. */
export function calendarDaysUntil(date: string | Date | null | undefined, now: Date): number | null {
  const target = parseCalendarDateParts(date);
  if (!target) return null;
  const today = parseCalendarDateParts(now)!;
  const a = Date.UTC(today.year, today.month - 1, today.day);
  const b = Date.UTC(target.year, target.month - 1, target.day);
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Inside the handover window: `now >= start − hours`.
 *
 * With a zone: `start` is the plan's own midnight and the comparison is exact.
 * With NO zone: THE DATE ALONE — the viewer's local calendar date is within `ceil(hours/24)` days
 * of the start date (48h ⇒ from two days before, at the viewer's own midnight). No hour-of-day
 * is claimed for a plan whose zone was never captured (Locked Decision 30, §13).
 *
 * A start date that cannot be parsed is NEVER inside the window — the honest default is "not yet",
 * never a fabricated handover.
 */
export function isInsideHandoverWindow(
  now: Date,
  startDate: string | Date | null | undefined,
  timezone: string | null | undefined,
  hours: number = HANDOVER_WINDOW_HOURS,
): boolean {
  const start = planStartInstant(startDate, timezone);
  if (start) return now.getTime() >= start.getTime() - hours * MS_PER_HOUR;
  // NULL zone ⇒ compare on the date alone (see the header).
  const days = calendarDaysUntil(startDate, now);
  if (days == null) return false;
  return days <= Math.ceil(hours / 24);
}

/**
 * Underway: `start <= now <= end`, where `end` is the END of the end date (the plan is still
 * underway at 23:59 on its last day).
 *
 * With a zone: exact, in the plan's zone. With NO zone: the date alone — the viewer's local
 * calendar date lies between the two calendar dates inclusive. A missing or unparseable end date
 * is NEVER "underway" — an open-ended claim is not one the row made.
 */
export function isPlanUnderway(
  now: Date,
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  timezone: string | null | undefined,
): boolean {
  const start = planStartInstant(startDate, timezone);
  const endStart = planStartInstant(endDate, timezone);
  if (start && endStart) {
    const endExclusive = endStart.getTime() + MS_PER_DAY;
    return now.getTime() >= start.getTime() && now.getTime() < endExclusive;
  }
  // NULL zone ⇒ the date alone.
  const untilStart = calendarDaysUntil(startDate, now);
  const untilEnd = calendarDaysUntil(endDate, now);
  if (untilStart == null || untilEnd == null) return false;
  return untilStart <= 0 && untilEnd >= 0;
}

/**
 * Whether a COUNTDOWN may be rendered against this plan's times at all. Locked Decision 30: a
 * countdown is a claim about an instant, and only a captured zone makes that claim true. Without
 * one a surface shows the wall-clock time and NO countdown.
 */
export function countdownAllowed(timezone: string | null | undefined): boolean {
  return isKnownTimezone(timezone);
}
