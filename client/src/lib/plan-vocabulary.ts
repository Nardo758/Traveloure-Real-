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

/**
 * Button label for the ENTRY that starts a plan from a browse surface (ledger
 * `2026-09-04-entry-unification`). Derived from `PLAN_NOUN` like every other label here, so the
 * marketplace, experience and expert surfaces cannot drift into three different words for the same
 * action — which is the drift this lane exists to close, one level up from the code.
 */
export const START_PLAN_LABEL = `Start a ${PLAN_NOUN_LOWER}`;

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
 * THE PARTY PAIR AND ITS TOTAL NOW LIVE IN `shared/plan-vocabulary.ts`
 * (ledger `2026-09-05-slip-events-first-render`).
 *
 * `travelersForSave` and `partyTotal` were defined here and used only by the client, while the
 * SERVER carried its own inline copy of the same arithmetic on the trip-create path. That second
 * author is the drift class §18 rule 1 names, and it drifted: the occasion PATCH wrote
 * `adults`/`kids` and never the derived total, so the slip header read "1 traveler" beside a Trip
 * Strip chip that said "2 guests". The derivation moved to `shared/` — ONE implementation, both
 * sides of the wire — and is RE-EXPORTED here verbatim so every existing import keeps working.
 *
 * Do not re-declare either function in this file, in a route or in a component.
 */
export { partyTotal, travelersForSave } from "@shared/plan-vocabulary";

/**
 * THE PARTY NOUN (ledger `2026-09-03-switch-readers`; migration 276's `vocabulary` column).
 *
 * The occasion ROW says what to call the people on the plan — `experience_types.vocabulary`,
 * one of "travelers" | "guests" | "attendees". Before this lane nothing read that column: the
 * step-4 label was the literal word "Travelers" and the Trip Strip's party chip derived its
 * wording from the presentation CLASS (`classify`), which is a different question — a class
 * answers "how do we headline this occasion", the column answers "what are these people called".
 *
 * §13 — **NULL means NOT SET**, and the fallback is the PLAIN-PLAN shape: "travelers", the word
 * the surface already used before any occasion was chosen. It is a stated fallback, never this
 * occasion's own answer, so nothing here fabricates a vocabulary for a row that has none.
 */
export type PartyNoun = "travelers" | "guests" | "attendees";

const PARTY_NOUNS: readonly PartyNoun[] = ["travelers", "guests", "attendees"];

/**
 * The plural noun for the people on a plan.
 *
 * @param vocabulary  `experience_types.vocabulary` for the chosen occasion. NULL/absent/unknown ⇒
 *                    "travelers" — the plain-plan fallback (§13), not a guess at the occasion.
 * @param hasGuestList `experience_types.default_guests`. Passing an explicit `false` forces
 *                    "travelers": an occasion that has NO guest list must show no guest copy
 *                    (Locked Decision 28 — the switches are independent, and this is the one
 *                    place their combination is resolved rather than restated at each caller).
 *                    NULL/absent ⇒ not set ⇒ the vocabulary column is left to speak for itself.
 */
export function partyNoun(
  vocabulary?: string | null,
  hasGuestList?: boolean | null,
): PartyNoun {
  if (hasGuestList === false) return "travelers";
  const v = (vocabulary || "").trim().toLowerCase();
  return (PARTY_NOUNS as readonly string[]).includes(v) ? (v as PartyNoun) : "travelers";
}

/** The singular of a party noun, for a count of exactly one. */
export function partyNounSingular(noun: PartyNoun): string {
  return noun.replace(/s$/, "");
}

/**
 * "3 guests" / "1 traveler" — the count and its noun, agreeing in number. Returns "" for a count
 * the traveler never stated, so a caller cannot accidentally print "0 travelers" for an
 * unanswered question (the same honest-or-absent posture `travelersForSave` enforces on write).
 */
export function partyCountLabel(
  count: number | null | undefined,
  vocabulary?: string | null,
  hasGuestList?: boolean | null,
): string {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return "";
  const noun = partyNoun(vocabulary, hasGuestList);
  return `${count} ${count === 1 ? partyNounSingular(noun) : noun}`;
}

/**
 * "3 events" / "1 event" — the count of a plan's EVENTS and its noun, agreeing in number
 * (ledger `2026-09-04-slip-events`; migration 277's `user_experiences` rows bound by `trip_id`).
 *
 * The event noun is NOT occasion-vocabulary. Migration 276's `vocabulary` column answers "what
 * are the PEOPLE on this plan called" (travelers | guests | attendees) and says nothing about
 * the things they are attending, so `partyNoun` is deliberately not consulted here — borrowing
 * it would print "3 guests" for three ceremonies. "Event" is the ruling's own word for a
 * `user_experiences` row inside a plan (Locked Decision 29), and it lives here rather than in a
 * component so a second spelling cannot be written by accident (§18 rule 1).
 *
 * Returns "" for a count of zero or one the caller never resolved, so a chip cannot print
 * "0 events" — the same honest-or-absent posture `partyCountLabel` enforces above.
 */
export function eventCountLabel(count: number | null | undefined): string {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return "";
  return `${count} ${count === 1 ? "event" : "events"}`;
}
