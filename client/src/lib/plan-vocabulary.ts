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

/** Vocabulary classes for the possessive OCCASION lead, keyed off `TripContext.experienceType`. */
export type VocabClass = "travel" | "event" | "couple";

const EVENT_KEYWORDS = [
  "wedding", "birthday", "corporate", "party", "reunion", "shower", "graduation",
  "retirement", "farewell", "housewarming", "achievement", "holiday", "bachelor",
  "engagement", "retreat",
];
const COUPLE_KEYWORDS = ["proposal", "date night", "date-night", "anniversar", "honeymoon"];

/**
 * Classify an experience type into its occasion vocabulary. Moved here verbatim from
 * `trip-strip.tsx` so the strip and any future occasion-aware surface read ONE list; the keyword
 * sets and the travel-is-the-default fallback are unchanged.
 */
export function classify(experienceType?: string): VocabClass {
  const t = (experienceType || "").toLowerCase();
  if (COUPLE_KEYWORDS.some((k) => t.includes(k))) return "couple";
  if (EVENT_KEYWORDS.some((k) => t.includes(k))) return "event";
  return "travel";
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
