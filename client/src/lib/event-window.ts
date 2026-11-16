/**
 * E8 — the event window, pure.
 *
 * An event plan's dates are the event's own days extended by two whole-day offsets. This module is the ONE
 * derivation: `eventWindowRange` turns (anchor, before, after) into the plan's `DayRange`, and both views —
 * the two number fields and `PlanDatesCalendar` — read the String range it produces. There is no field-local
 * state: a field edit recomputes here and writes the plan's own `startDate`/`endDate`.
 *
 * ANCHOR: the picked night when one is picked (`withNight`, plan-entry.ts:370-374, sets both dates to that
 * night); otherwise the event's remaining run or its default span, whichever the caller resolved.
 *
 * NOTHING IS STORED and no migration exists: the window is derived from dates the plan already holds. The
 * event itself survives the mint as a `city_event` item (`routes.ts:1562-1564`, `landRefOnNewPlan`), so a
 * later reopen can re-derive this window; variant A does not build that surface.
 *
 * WORDING: approved by the founder on #2034 — `founder comment: #2034 2026-11-16T03:08:44Z`. Every user-facing
 * string here is quoted from that approval; none is invented.
 */
import { dayFromNumber, dayNumber, validateRange, type DayRange } from "./plan-dates-range";

/** The approved strings, cited above. Do not edit without a new founder comment. */
export const EVENT_WINDOW_WORDING_APPROVAL = "founder comment: #2034 2026-11-16T03:08:44Z";

export const EVENT_WINDOW_STRINGS = {
  /** The line that explains what the two bounds do. */
  helper: "Days before or after the event",
  /** First bound. */
  before: "How many days before?",
  /** Second bound. */
  after: "How many days after?",
  /** The entry-surface anchor line. `{name}` is the event's own title. */
  anchor: "Built around {name}",
} as const;

/** One named constant: each offset is a whole number of days in 0..14. */
export const EVENT_WINDOW_MAX_DAYS = 14;

/** Whole days, clamped to 0..14. Anything unparseable is 0 — a field never widens the plan by accident. */
export function clampEventWindowDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = Math.trunc(value);
  if (n < 0) return 0;
  return n > EVENT_WINDOW_MAX_DAYS ? EVENT_WINDOW_MAX_DAYS : n;
}

export interface EventWindowAnchor {
  startDate: string;
  endDate: string;
}

/**
 * The anchor the offsets are relative to: the picked night (one day, itself), else the run/span handed in.
 * Null when the caller has neither — a plan with no event has no window.
 */
export function eventAnchorFor(input: {
  night?: string | null;
  run?: EventWindowAnchor | null;
  span?: EventWindowAnchor | null;
}): EventWindowAnchor | null {
  if (input.night) return { startDate: input.night, endDate: input.night };
  return input.run ?? input.span ?? null;
}

/**
 * The plan's dates around an event.
 *
 *   allOfIt        → exactly the anchor's own days (both offsets cleared)
 *   otherwise      → anchor.start - before … anchor.end + after
 *   min            → the start never falls earlier than this (the market's today)
 *
 * `validateRange` is called as an ASSERTION, not as a branch a user can reach: with both offsets >= 0 the
 * pair can only widen, so a non-"ok" answer means this module was changed wrongly. It throws rather than
 * letting a backwards range reach the plan.
 */
export function eventWindowRange(input: {
  anchor: EventWindowAnchor | null;
  before: number;
  after: number;
  allOfIt?: boolean;
  min?: string | null;
}): DayRange | null {
  const { anchor } = input;
  if (!anchor) return null;
  const anchorStart = dayNumber(anchor.startDate);
  const anchorEnd = dayNumber(anchor.endDate);
  if (anchorStart == null || anchorEnd == null) return null;

  const before = input.allOfIt ? 0 : clampEventWindowDays(input.before);
  const after = input.allOfIt ? 0 : clampEventWindowDays(input.after);

  let start = dayFromNumber(anchorStart - before);
  const end = dayFromNumber(anchorEnd + after);

  const min = dayNumber(input.min ?? null);
  if (min != null && (dayNumber(start) ?? 0) < min) start = dayFromNumber(min);

  const verdict = validateRange(start, end);
  if (verdict !== "ok") {
    throw new Error(`eventWindowRange produced a ${verdict} range (${start}..${end}); the window may only widen`);
  }
  return { start, end };
}
