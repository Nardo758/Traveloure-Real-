/**
 * WHERE AN "ADD" LANDS WHEN THE PAGE HOLDS NO PLAN (ledger `2026-09-24-rc2-add-to-plan`, audit
 * RC-2).
 *
 * THE DEFECT. Every add surface resolves its target through `resolveTargetTripId` (URL `?tripId=`
 * first, then the pen). With neither, the Discover grid, the service page and the city-feed dialog
 * all fell through to `POST /api/cart` — a TRIP-LESS cart row — while the button still read
 * "Add to Plan". A signed-in member was told their listing was on a plan and it was on none (§13),
 * and Locked Decision 39 names the trip-less cart as a GUEST fallback only.
 *
 * THE RULING (decision-maker, Sep 24, 2026):
 *   • a signed-in member with no current plan is asked to PICK one of their active plans or to
 *     START a new one — nothing goes to a trip-less cart for a signed-in member;
 *   • a guest keeps the guest cart, and the words say so: the button reads "Add to Cart" and the
 *     confirmation says it is kept in the cart until they sign in and start a plan.
 *
 * Pure and leaf-level (no React, no fetch) so the whole decision is unit-proven and every add
 * surface reads the SAME answer (§18 rule 1).
 */
import { planRowSection } from "./plan-row-model";
import { ADD_TO_CART_LABEL, ADD_TO_PLAN_LABEL } from "./plan-vocabulary";

export type AddTarget =
  /** A plan is already in hand — add to it. */
  | "plan"
  /** Signed in, no plan in hand — ask which plan (or start one). */
  | "pick"
  /** Definitively a guest — the guest cart (LD 39's sanctioned fallback). */
  | "guest_cart"
  /** Auth has not answered yet — hold the click until it does; never guess guest or member. */
  | "wait";

export function decideAddTarget(input: {
  targetTripId?: string | null;
  signedIn: boolean;
  authLoading: boolean;
}): AddTarget {
  if (input.targetTripId) return "plan";
  // Auth unanswered is the THIRD state (§13): treating it as "guest" is how an authenticated
  // member's selection used to drop into localStorage, and treating it as "member" would open a
  // plan picker for somebody who has no plans to read.
  if (input.authLoading) return "wait";
  if (!input.signedIn) return "guest_cart";
  return "pick";
}

/**
 * The button's words for that decision. Only a GUEST's add is a cart add; a member's add always
 * ends on a plan (picked or started), and a click still waiting on auth keeps the plan wording
 * rather than flickering to "Add to Cart" for somebody who is signed in.
 */
export function addButtonLabel(target: AddTarget): string {
  return target === "guest_cart" ? ADD_TO_CART_LABEL : ADD_TO_PLAN_LABEL;
}

/** The guest confirmation — says exactly where the item is and what it takes to plan it. */
export const GUEST_CART_SAVED_NOTE =
  "It's saved in your cart until you sign in and start a plan.";

/**
 * Which of a member's plans the picker offers: every plan that is not behind them. It DELEGATES to
 * `planRowSection`, the ONE rule My plans uses to put a plan under "Past" — a second date
 * comparison here would drift from the list the member reads their plans on (§18 rule 1). An
 * undated plan is "planning", so it is offered, never hidden (§13).
 */
export function isActivePlan(
  trip: { startDate?: string | null; endDate?: string | null; finalVersion?: number | null },
  now: Date,
): boolean {
  return planRowSection(trip, now) !== "past";
}

/**
 * The ONE plan-item body a listing becomes when a surface adds it with no richer context (no
 * slot, no event). Used by the Discover grid and by "Start a new plan", so both land the same row.
 * The stored "Unknown" location default is ABSENCE, never a place (§13).
 */
export function listingPlanItemBody(svc: {
  id: string;
  serviceName?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  price?: string | number | null;
  location?: string | null;
}): Record<string, unknown> {
  const loc = svc.location?.trim();
  return {
    title: svc.serviceName || "Service",
    description: svc.description || svc.shortDescription || undefined,
    itemType: "activity",
    providerServiceId: svc.id,
    estimatedCost: svc.price ? String(svc.price) : undefined,
    locationName: loc && loc !== "Unknown" ? loc : svc.serviceName || undefined,
    dayNumber: 1,
  };
}
