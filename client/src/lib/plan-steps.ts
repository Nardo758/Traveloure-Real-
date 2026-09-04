/**
 * PLAN STEPS — the door table of the ONE planning modal, as a pure function.
 * Ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33.
 *
 * THE RULING THIS ENCODES. There is exactly one planning modal in the product — the five ratified
 * steps Occasion → Where → When → Who → What's happening — and every door opens it through the one
 * opener `usePlanning().open(source)` (ruling `2026-08-28-single-planning-entry`, whose OPENER rule
 * is untouched). Doors differ ONLY in two things: what arrives pre-filled, and which step opens
 * first. Those two answers are decided HERE and nowhere else — a second copy of "does this door
 * skip step 1?" written inside a component is the derivation-drift class §18 rule 1 names, and it
 * is exactly the kind of rule that drifts silently because a wrong answer still renders a modal.
 *
 * THE RULES, each one testable in isolation (`client/src/lib/__tests__/plan-steps.test.ts`):
 *
 *   1. STEP 1 IS SKIPPED WHEN THE OCCASION IS ALREADY ANSWERED. A door that carries an occasion
 *      (`source.experienceSlug`, or a `source.experienceType` that resolves to a seeded row) has
 *      answered step 1, so the modal opens at step 2 with an "<Occasion> · change" pill. A plan
 *      that already HOLDS an occasion (the Trip Strip's Edit door, a returning traveler) has
 *      answered it too. Everything else — the hero, `/start/events` — opens at step 1.
 *
 *   2. THE ANSWER MUST BE RESOLVABLE, OR THE QUESTION IS ASKED (§13). The skip is keyed on the
 *      RESOLVED `experience_types` row, not on the presence of a string. A door naming a slug the
 *      catalog does not carry does NOT skip: showing step 2 under a pill for an occasion nothing
 *      could resolve would be presenting a guess with the catalog's authority. There is no mapping
 *      table here — resolution is the existing `findOccasionByKey`, the same normalized match the
 *      edit panel already used to seed its select.
 *
 *   3. STEP 5 IS THE OCCASION'S OWN ANSWER. "What's happening" is visible only when
 *      `showsSchedule(row)` is true. NULL/absent/unrecognised ⇒ false ⇒ the step is not shown, the
 *      plain-plan shape (`occasion-switches.ts` states that fallback at its definition).
 *
 *   4. STEPS 2 AND 3 ARE NEVER SKIPPED. `trips.destination`, `trips.start_date` and
 *      `trips.end_date` are NOT NULL — a plan cannot be minted without them, so no door may skip
 *      the questions that produce them. A `source.city`/`destination` PRE-FILLS step 2; it never
 *      removes it.
 *
 *   5. STEP 4 IS ALWAYS VISIBLE AND ALWAYS SKIPPABLE. Party size is de-masked (migration 241): an
 *      untouched field saves as NULL, never a fabricated 2 — so the step costs nothing to show and
 *      answers nothing on the traveler's behalf.
 *
 *   6. `source.branch` DOES NOT CHANGE THE STEPS. A deep-open only means the "how" is already
 *      decided, so the finish offers that one CTA instead of three. The questions a plan needs are
 *      the same either way.
 *
 * Pure: no React, no fetch, no DB. The caller resolves the occasion row (it owns the catalog
 * query) and hands it in.
 */
import { showsSchedule, type OccasionSwitchRow } from "./occasion-switches";

/** The five ratified steps, in flow order. `where` is step 2 — the artboard filename hides it. */
export type PlanStepId = "occasion" | "where" | "when" | "who" | "events";

/** Flow order, and the ONLY place it is written down. */
export const PLAN_STEP_ORDER: readonly PlanStepId[] = [
  "occasion",
  "where",
  "when",
  "who",
  "events",
];

/** The rail's label for each step — the artboards' own words. */
export const PLAN_STEP_LABELS: Record<PlanStepId, string> = {
  occasion: "Occasion",
  where: "Where",
  when: "When",
  who: "Who",
  events: "What's happening",
};

/**
 * The subset of `PlanningSource` this decision reads. Declared structurally rather than imported
 * so this module stays pure data + pure functions and cannot pull the provider (and its React
 * tree) into a unit test.
 */
export interface PlanStepsSource {
  /** A seeded `experience_types` slug the door already answered. */
  experienceSlug?: string;
  /** One of the five FROZEN coarse keys (ruling `2026-09-01-moment-key`). */
  experienceType?: string;
  city?: string;
  destination?: string;
  /** Deep-open: decides the FINISH, never the steps (rule 6). */
  branch?: string;
}

/** The subset of the held `TripContext` this decision reads. */
export interface PlanStepsContext {
  experienceSlug?: string;
  experienceType?: string;
}

export interface PlanSteps {
  /** The step the modal opens on. Always a member of `visibleSteps`. */
  startStep: PlanStepId;
  /** The steps the rail shows, in flow order. Never empty; always contains `where` and `when`. */
  visibleSteps: PlanStepId[];
}

/** Does this source/context NAME an occasion at all? A blank string names nothing. */
function namesOccasion(o: PlanStepsSource | PlanStepsContext | null | undefined): boolean {
  if (!o) return false;
  for (const v of [o.experienceSlug, o.experienceType]) {
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

/**
 * Which steps this door shows, and which one it opens on.
 *
 * @param source   the door's own context (`PlanningSource`), or null for a door that carries none.
 * @param occasion the RESOLVED `experience_types` row for whatever occasion the door or the held
 *                 plan names — `null` when nothing names one, or when what they name resolves to
 *                 no row (rule 2). The caller resolves it with `findOccasionByKey`.
 * @param context  the plan already held in trip context. Supplies the occasion identity when the
 *                 door carries none (the Trip Strip's Edit button, a returning traveler).
 */
export function resolvePlanSteps(
  source?: PlanStepsSource | null,
  occasion?: OccasionSwitchRow | null,
  context?: PlanStepsContext | null,
): PlanSteps {
  // Rule 3: the schedule step is the occasion's own answer; NOT SET ⇒ not shown (§13).
  const visibleSteps: PlanStepId[] = PLAN_STEP_ORDER.filter(
    (s) => s !== "events" || showsSchedule(occasion),
  );

  // Rules 1 + 2. A row alone is not enough: something must have NAMED it, or this is a row the
  // caller resolved by some other route and the traveler was never asked.
  const answered = Boolean(occasion) && (namesOccasion(source) || namesOccasion(context));

  return { startStep: answered ? "where" : "occasion", visibleSteps };
}

/** The step after `current` among `visible`, or null when `current` is the last visible step. */
export function nextPlanStep(visible: readonly PlanStepId[], current: PlanStepId): PlanStepId | null {
  const i = visible.indexOf(current);
  return i >= 0 && i < visible.length - 1 ? visible[i + 1] : null;
}

/** The step before `current` among `visible`, or null when `current` is the first visible step. */
export function previousPlanStep(
  visible: readonly PlanStepId[],
  current: PlanStepId,
): PlanStepId | null {
  const i = visible.indexOf(current);
  return i > 0 ? visible[i - 1] : null;
}
