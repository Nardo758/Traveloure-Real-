/**
 * AP-1 — save, then say what we checked (decision-maker, Oct 13, 2026; ledger `2026-10-13-ap1-save-then-warn`).
 *
 * A stop a traveler adds on the slip is SAVED first, always; the checks follow and never block the save. This
 * module holds the pure half: the shape the check read returns and the ONE decision of what to say about the
 * way INTO the new stop. Wording that already has a home (the hours lines, the Getting around gap line, the
 * routed leg line) is read from there, never restated here (§18 rule 1).
 *
 * §13: a check that could not run says so. "Hours not checked for this stop" is the answer when no hours fact
 * covers the stop; an unlocated end keeps the gap wording; "no route found" is said only when BOTH ends are on
 * the map and the engine answered nothing.
 */
import type { LegMode } from "./travel-speeds";
import type { PlanFix } from "./plan-check";

/** How long after a save the checks may still be arriving (the 2 s leg debounce plus one lookup). */
export const ADD_CHECKS_WINDOW_MS = 30_000;
/** The client asks again this often, at most this many times, then shows whatever is final (§13). */
export const ADD_CHECKS_POLL_MS = 2_000;
export const ADD_CHECKS_POLL_MAX = 5;

export const HOURS_NOT_CHECKED_LINE = "Hours not checked for this stop";

export type StopHoursCheck =
  /** Hours (or a last entry) cover the stop at its time; `lines` are the findings' own lines, empty = no conflict. */
  | {
      status: "checked";
      lines: string[];
      caveat?: string;
      /** Row 124: the plan check's own fix for each line (e.g. `move_day` for a closed date); absent ⇒ none. */
      fixes?: PlanFix[];
    }
  /** No hours fact covers the stop and none is coming. */
  | { status: "not_checked" }
  /** The stop has no start time, so there is nothing to check its hours against. */
  | { status: "no_time" }
  /** The lookup for this stop has not reported yet. */
  | { status: "pending" };

export type StopReachCheck =
  /** A routed (engine) leg into the stop; `line` is `routedLegLine`'s own words. */
  | { kind: "routed"; from: string; line: string }
  /** A shown leg whose minutes came from no routing source. */
  | { kind: "est"; from: string; minutes: number; mode: LegMode | null }
  /** A free plan: the straight line between the two stops, est. */
  | { kind: "straight"; from: string; minutes: number; mode: LegMode }
  /** One end is not on the map: the Getting around gap line names it. */
  | { kind: "unlocated"; stop: string }
  /** Both ends on the map, the engine ran, and it found no route. */
  | { kind: "no_route"; from: string }
  /** The engine is off, or the dates are not chosen — the Getting around header says which. */
  | { kind: "engine_off" }
  | { kind: "dates_not_confirmed" }
  /** The leg is still being worked out (inside the debounce window). */
  | { kind: "pending"; from: string };

export interface StopChecks {
  itemId: string;
  hours: StopHoursCheck;
  /** The way into the stop from the one before it that day; null = the day's first stop (nothing to reach from). */
  reach: StopReachCheck | null;
  /** A free plan's reach is a straight line — the footer says so under it. */
  routedPlan: boolean;
  /** Something is still arriving; the client asks again. */
  pending: boolean;
}

export interface ReachInput {
  routedPlan: boolean;
  /** The engine's skip reason for this plan (null = it runs). Only read on a routed plan. */
  skip: "engine_off" | "free_plan" | "no_trip" | "dates_not_confirmed" | null;
  prev: { title: string; located: boolean } | null;
  self: { title: string; located: boolean };
  /** The shown leg from `prev` to this stop, if any. */
  leg: { routedLine: string | null; minutes: number; mode: LegMode | null } | null;
  /** The straight-line estimate between the two stops (both located). */
  straight: { minutes: number; mode: LegMode } | null;
  /** The save is recent enough that a leg may still be coming. */
  withinWindow: boolean;
}

/** Pure. What to say about the way into the new stop. */
export function stopReach(input: ReachInput): StopReachCheck | null {
  const { prev, self } = input;
  if (!prev) return null;
  if (!self.located) return { kind: "unlocated", stop: self.title };
  if (!prev.located) return { kind: "unlocated", stop: prev.title };
  if (input.leg) {
    return input.leg.routedLine
      ? { kind: "routed", from: prev.title, line: input.leg.routedLine }
      : { kind: "est", from: prev.title, minutes: input.leg.minutes, mode: input.leg.mode };
  }
  if (!input.routedPlan) return input.straight ? { kind: "straight", from: prev.title, ...input.straight } : null;
  if (input.skip === "engine_off") return { kind: "engine_off" };
  if (input.skip === "dates_not_confirmed") return { kind: "dates_not_confirmed" };
  if (input.withinWindow) return { kind: "pending", from: prev.title };
  return { kind: "no_route", from: prev.title };
}

/** Pure. Is anything still arriving? */
export function stopChecksPending(c: Pick<StopChecks, "hours" | "reach">): boolean {
  return c.hours.status === "pending" || c.reach?.kind === "pending";
}
