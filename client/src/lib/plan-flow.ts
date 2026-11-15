/**
 * PLAN FLOW — ask only what is missing.
 *
 * The planning modal always starts at `where` (`plan-steps.ts:226-231`), so a traveler who arrived from a
 * city page is asked the city they are already looking at, and one who arrived from an event is asked a
 * date the event already carries. This module answers the ORDER for a given entry, as a pure function:
 *
 *   place root  where -> when -> who -> events
 *   date root   when -> where -> who -> events      (the date is the reason they came)
 *   event root  who -> events                       (city AND date come from the event)
 *   start       where -> when -> who -> events      (the plain "Start a plan")
 *
 * and it DROPS what is already known: a known city skips `where`, known dates skip `when`, a stated party
 * skips `who`. When nothing is left the flow is finished (`first === null`) rather than asking a question
 * whose answer is already on the plan (§13 — never ask what you have been told).
 *
 * PURE: imports only the step vocabulary. No React, no fetch, no store. Deliberately UNWIRED in this PR:
 * `PlanEntry` and the planning modal keep their current behaviour until a later PR mounts this, so the
 * order can be corrected without touching a surface.
 */
import { PLAN_STEP_ORDER, type PlanStepId } from "./plan-steps";

/** Where the traveler came in. `event` carries a city and a date of its own. */
export type PlanFlowEntry = "place" | "date" | "event" | "start";

export interface PlanFlowFacts {
  /** A city is known — the route's, the card's, or the plan's own. */
  hasCity: boolean;
  /** Confirmed or stated dates. */
  hasDates: boolean;
  /** A stated party (adults / attendees). */
  hasParty: boolean;
}

export interface PlanFlow {
  /** The steps to ask, in order. Empty when there is nothing to ask. */
  steps: PlanStepId[];
  /** The step to open on, or null when the flow is finished. */
  first: PlanStepId | null;
  /** What was dropped because the plan already knows it. */
  skipped: PlanStepId[];
}

/** The order an entry starts from, before anything is dropped. */
export function planFlowOrder(entry: PlanFlowEntry): PlanStepId[] {
  switch (entry) {
    case "date":
      return ["when", "where", "who", "events"];
    case "event":
      return ["who", "events"];
    case "place":
    case "start":
    default:
      return [...PLAN_STEP_ORDER];
  }
}

/** Pure: the order for this entry, minus every question the plan can already answer. */
export function resolvePlanFlow(entry: PlanFlowEntry, facts: PlanFlowFacts): PlanFlow {
  const known: Record<PlanStepId, boolean> = {
    where: facts.hasCity,
    when: facts.hasDates,
    who: facts.hasParty,
    // "What's happening" is never skipped: the plan may hold no events even when it holds everything else.
    events: false,
  };
  const order = planFlowOrder(entry);
  const steps = order.filter((step) => !known[step]);
  return {
    steps,
    first: steps[0] ?? null,
    skipped: order.filter((step) => known[step]),
  };
}
