/**
 * Cart intent — is the traveler BUYING or PLANNING? (decision-maker, Sep 24, 2026 — ledger
 * `2026-09-24-cart-two-paths`).
 *
 * A traveler who presses a listing's Book button wants to buy that thing; a traveler building a
 * trip wants the planning tools. The cart used to lead every visitor with "Continue — Optimize",
 * so a one-item purchase was steered through a paid AI planning step it did not need. The intent
 * is established at the door and read here, in ONE place (§18 rule 1):
 *
 *   - `?intent=buy` (the Book button) or `?intent=plan` wins — the door said what it meant.
 *   - Otherwise a cart holding a line that belongs to a plan (`itineraryItemId` — the line is the
 *     `ready_for_checkout` projection of a plan item, LD 39) is a PLANNING cart.
 *   - Otherwise it is a BUYING cart: nothing the traveler did asked for a plan.
 *
 * Buying never hides planning — the optimize control is still offered, just not first. And the
 * purchase path checks out the WHOLE cart (option A, ruled): the payment step lists every line,
 * each removable until payment starts, so nothing is bought that the traveler did not see.
 */
export type CartIntent = "buy" | "plan";

export const CART_INTENT_PARAM = "intent";

/** Where a listing's Book button sends the traveler once the line is in the cart. */
export const BUY_NOW_CART_PATH = `/cart?${CART_INTENT_PARAM}=buy`;

export function readCartIntentParam(search: string | null | undefined): CartIntent | null {
  const v = new URLSearchParams(search ?? "").get(CART_INTENT_PARAM);
  return v === "buy" || v === "plan" ? v : null;
}

export function resolveCartIntent(input: {
  urlIntent: CartIntent | null;
  items: ReadonlyArray<{ itineraryItemId?: string | null }>;
}): CartIntent {
  if (input.urlIntent) return input.urlIntent;
  return input.items.some((i) => typeof i.itineraryItemId === "string" && i.itineraryItemId.length > 0)
    ? "plan"
    : "buy";
}

/**
 * Whether a line may still be removed on the payment step. Once checkout has created the bookings
 * (a PaymentIntent exists, or the order was snapshotted for it) the lines are bookings, and
 * removing one is a cancellation — a different rail.
 */
export function canRemoveBeforePayment(state: { paymentStarted: boolean; orderSnapshotted: boolean }): boolean {
  return !state.paymentStarted && !state.orderSnapshotted;
}
