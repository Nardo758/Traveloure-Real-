/**
 * Cut-list #1, slice B — the pure rules behind the ONE range calendar (`PlanDatesCalendar`).
 *
 * Days are `YYYY-MM-DD` strings and every step is calendar-day arithmetic in UTC, so no local
 * timezone or DST change can move a day (a plan's dates are wall-calendar days, Locked Decision 30).
 *
 *   validateRange  — leave ON or AFTER arrive is fine (same-day trips are allowed); leave BEFORE
 *                    arrive is the one refusal, and it is said, never silently repaired (the old
 *                    PlanEntry clamp and the slip's inverted sentence are both replaced by this).
 *   nextRange      — what one tap on a day does to the selection.
 *   initialRange   — no prefill for dates nobody chose (`datesConfirmed === false`).
 *
 * Wording approved — Leon (Nov 10, 11:47 PM ET): `LEAVE_BEFORE_ARRIVE_MESSAGE` (replaces the 11:27 AM wording).
 */

export interface DayRange {
  start: string | null;
  end: string | null;
}

export type RangeValidity = "ok" | "incomplete" | "leave_before_arrive";

export const LEAVE_BEFORE_ARRIVE_MESSAGE = "Leave date can't be before your arrive date.";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → a UTC day number; null for anything that is not a real calendar day. */
export function dayNumber(day: string | null | undefined): number | null {
  const m = DAY_RE.exec(String(day ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

/** A UTC day number → `YYYY-MM-DD`. */
export function dayFromNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** The first ten characters of an ISO day or timestamp, or "" (a Date is read as its UTC day). */
export function isoDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m && dayNumber(m[1]) != null ? m[1] : "";
}

/** Can this window be saved? Both days, leave on or after arrive. */
export function validateRange(start: string | null | undefined, end: string | null | undefined): RangeValidity {
  const a = dayNumber(start);
  const b = dayNumber(end);
  if (a == null || b == null) return "incomplete";
  return b < a ? "leave_before_arrive" : "ok";
}

/**
 * One tap on `day` (QA round 3, Leon, Nov 11, 2026 — option A; supersedes slice B's "earlier tap moves the trip"):
 *   nothing picked              → arrive = day
 *   arrive picked (leave or not) → leave = day, on, after OR BEFORE the arrive day. An earlier day makes the pair
 *                                  refused (`leave_before_arrive`): the approved sentence shows and Save is disabled —
 *                                  a tap never silently rewrites the arrive day.
 *   while the refusal is showing → a tap BEFORE the arrive day starts a new range there (arrive = day, no leave);
 *                                  a tap on/after the arrive day sets the leave day and clears the refusal.
 * A prefilled calendar (a plan's confirmed dates) follows the same rule. Moving Dec 1–4 to Nov 28–Dec 1 is three
 * taps: Nov 28 (refused, the sentence shows), Nov 28 again (a new range starts there), Dec 1 (the leave day).
 */
export function nextRange(prev: DayRange, day: string): DayRange {
  const d = dayNumber(day);
  if (d == null) return prev;
  const a = dayNumber(prev.start);
  if (a == null) return { start: day, end: null };
  if (validateRange(prev.start, prev.end) === "leave_before_arrive" && d < a) return { start: day, end: null };
  return { start: prev.start, end: day };
}

/** The selection a calendar opens on: the plan's dates when they were chosen, otherwise nothing. */
export function initialRange(input: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  datesConfirmed?: boolean | null;
}): DayRange {
  if (input.datesConfirmed === false) return { start: null, end: null };
  const start = isoDay(input.startDate) || null;
  const end = isoDay(input.endDate) || null;
  return { start, end };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function short(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
}

/**
 * The selection as the calendar's summary line, in the header chip's own format (no words):
 * "Nov 12" (one day), "Nov 12–15", "Nov 12 – Dec 3", "Nov 12 –" (arrive picked, leave not yet);
 * null when nothing is picked (the caller shows "Add dates").
 */
export function rangeSummary(range: DayRange): string | null {
  const a = dayNumber(range.start) != null ? range.start! : null;
  const b = dayNumber(range.end) != null ? range.end! : null;
  if (!a) return null;
  if (!b) return `${short(a)} –`;
  if (a === b) return short(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${short(a)}–${Number(b.slice(8, 10))}`;
  return `${short(a)} – ${short(b)}`;
}
// CI guard probe (throwaway PR - not for merge): proves the guard goes green on a code PR with no manual re-run.
