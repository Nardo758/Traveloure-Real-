/**
 * PLAN VOCABULARY — the ONE place that names the traveler's container.
 *
 * The problem this closes (decision-maker, 2026-09-03): travelers build **Experiences** as well
 * as **Trips** — a wedding, a proposal, an anniversary, a corporate retreat — but the add-to-plan
 * surfaces said "trip" unconditionally. "Add to Trip" on a wedding you are planning is simply the
 * wrong noun, and it is the same §13 failure the slip-convergence lane already fixed one step
 * earlier: do not name a destination the traveler will not recognise when they get there.
 *
 * THE RULE, and the line it draws:
 *
 *   - ACTION labels are UNIVERSAL. "Add to Plan" / "Added to your plan" works for a trip, a
 *     wedding and a proposal alike, and it names the surface the CTA actually navigates to —
 *     `planningRouteForTrip` resolves to `/plans/:id`, the component family is `PlanCard` /
 *     `SlipView`, and every one of these toasts ALREADY said "…is on your plan" in its own
 *     description while its title said "trip". The platform had picked its universal noun; only
 *     the titles had not caught up.
 *
 *   - OCCASION headlines stay SPECIFIC. The Trip Strip's possessive lead ("Your Kyoto wedding")
 *     names the particular occasion, which is a different job from labelling a button, and
 *     flattening it to "Your Kyoto plan" would lose real information. So `classify` lives here
 *     too — ONE classifier, not a second copy (§18 rule 1) — but it governs the lead, never the
 *     action labels.
 *
 * The trip-less / guest path keeps saying CART, because there it genuinely is the cart (the
 * sanctioned fallback until G2, ledger row 5). Naming it "plan" would be the same dishonesty in
 * the other direction.
 *
 * Nothing here touches money, ownership or routing — it is presentation vocabulary only.
 */

import { classifyOccasion, type OccasionClass } from "@shared/occasions";

/**
 * Vocabulary classes for the possessive OCCASION lead, keyed off `TripContext.experienceType`.
 *
 * The classifier itself now lives in `shared/occasions.ts` (ledger `2026-09-03-occasion-vocabulary`)
 * beside the slug→eventType map, so ONE module answers "what kind of occasion is this?" for the
 * client AND the server (§18 rule 1). This alias and the `classify` re-export below keep the name
 * every calling surface already imports.
 */
export type VocabClass = OccasionClass;

/**
 * Classify an experience type into its occasion vocabulary. DELEGATES to
 * `shared/occasions.ts#classifyOccasion`, which prefers the EXPLICIT per-slug table (every slug the
 * `experience_types` seeder writes) and falls back to the original keyword sniff — the same keyword
 * lists, the same couple-beats-event precedence, the same travel default — for anything that is not
 * a known slug. Kept exported under this name because the Trip Strip and its pinned test import it.
 */
export function classify(experienceType?: string): VocabClass {
  return classifyOccasion(experienceType);
}

/**
 * The universal container noun, capitalised for a button ("Add to Plan") and lower-cased for a
 * sentence ("Added to your plan"). One constant: if the decision-maker picks a different word,
 * this is the only line that changes.
 */
export const PLAN_NOUN = "Plan" as const;
export const PLAN_NOUN_LOWER = "plan" as const;

/** Button label for an add that lands on the plan. */
export const ADD_TO_PLAN_LABEL = `Add to ${PLAN_NOUN}`;
/** Button label for the trip-less / guest fallback, which genuinely is the cart. */
export const ADD_TO_CART_LABEL = "Add to Cart";

/** Toast title for a successful add that landed on the plan. */
export const ADDED_TO_PLAN_TITLE = `Added to your ${PLAN_NOUN_LOWER}`;
/** Toast title for the trip-less / guest fallback. */
export const ADDED_TO_CART_TITLE = "Added to cart";

/** Error title for a failed add that was aimed at the plan. */
export const ADD_TO_PLAN_FAILED_TITLE = `Couldn't add to your ${PLAN_NOUN_LOWER}`;

/**
 * Pick the add label for a surface that may or may not have resolved a target container.
 * `hasTarget` is the truthiness of `resolveTargetTripId` (client/src/lib/trip-target.ts).
 */
export function addLabel(hasTarget: boolean): string {
  return hasTarget ? ADD_TO_PLAN_LABEL : ADD_TO_CART_LABEL;
}

/** Toast title counterpart of `addLabel`. */
export function addedTitle(hasTarget: boolean): string {
  return hasTarget ? ADDED_TO_PLAN_TITLE : ADDED_TO_CART_TITLE;
}

/**
 * TRAVELERS, DE-MASKED (ledger `2026-09-03-item-event-link`; the fix restores migration 241's
 * intent on the edit panel).
 *
 * THE DEFECT THIS CLOSES. `EditTripPanel` seeded its travelers input with a literal `2` and wrote
 * `travelers` on EVERY save. Migration 241 de-masked party size precisely so an uncaptured count
 * stays NULL — an honest "not captured" the demand rollup can tell apart from a real answer (§13,
 * and the same posture `insertTripSchema`'s de-masking comment states). The panel silently put the
 * mask back one layer up: a traveler who opened the panel to fix a typo in the title left with a
 * fabricated party of two, and nothing downstream could tell it from a stated one.
 *
 * THE RULE: untouched ⇒ NOT SET. An empty input is not a party of one, not a party of two, and not
 * a zero — it is an unanswered question, and `undefined` is how this codebase says that. The panel
 * writes through `switchTripContext`, whose SWITCH_FIELDS have REPLACE semantics, so an omitted
 * `travelers` clears the field rather than re-asserting a guess.
 *
 * @param raw the raw input value (`""` while empty, a numeric string once typed, or a number when
 *            seeded from an existing context).
 * @returns a positive integer when the traveler really stated one; `undefined` for every form of
 *          "they did not" — empty, whitespace, non-numeric, zero or negative.
 */
export function travelersForSave(raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.floor(n);
  return rounded > 0 ? rounded : undefined;
}
