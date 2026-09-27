/**
 * comparison-apply-to-cart.config.ts — the OFF-BY-DEFAULT switch for
 * `POST /api/itinerary-comparisons/:id/apply-to-cart` (decision-maker ruled Sep 26, 2026 —
 * ledger `2026-09-26-apply-to-cart-flag-off`, R131).
 *
 * WHY IT IS OFF. The rail replaces the caller's whole cart with a comparison variant's items
 * through `cartProjection.replaceUserCartWithVariantItems` — a cart write that never passes
 * through the plan's `itinerary_items`. Locked Decision 39 rules that the cart is the
 * `ready_for_checkout` PROJECTION of the plan, never a second store, and a proposal reaches
 * purchase by `apply-to-trip` and the slip (LD 39 / LD 45 (4)). So the rail is closed by default.
 * FULL RETIREMENT (deleting the handlers, the client mutation and the projection helper) stays in
 * the Trip Slip product map's step 7 — this module only stops new writes until then.
 *
 * §13 — the states. UNSET, or anything but the literal `"true"` (trimmed, case-insensitive), is
 * OFF: a missing env var must never re-open a rail the decision-maker closed. Only an explicit
 * `COMPARISON_APPLY_TO_CART_ENABLED=true` re-opens it.
 *
 * Parsed on every call, never memoised (one authority, no cached copy — §18 rule 1). Holds no
 * amount, rate or fee (§8 untouched).
 */
import type { Response } from "express";

/** The env var an operator would set to re-open the rail. */
export const COMPARISON_APPLY_TO_CART_ENV = "COMPARISON_APPLY_TO_CART_ENABLED";

/** The `code` the refusal carries (the `legacy_rail_closed` precedent, D-12). */
export const APPLY_TO_CART_DISABLED_CODE = "apply_to_cart_disabled";

/** The ONE reading of the flag. */
export function isComparisonApplyToCartEnabled(): boolean {
  return (process.env[COMPARISON_APPLY_TO_CART_ENV] ?? "").trim().toLowerCase() === "true";
}

/**
 * The ONE gate both apply-to-cart handlers call FIRST — before any read or write. Returns `true`
 * when it has answered the request (410 Gone, rail closed) and the handler must return; `false`
 * when the flag is on and the handler proceeds exactly as before.
 */
export function refuseIfComparisonApplyToCartDisabled(res: Response): boolean {
  if (isComparisonApplyToCartEnabled()) return false;
  res.status(410).json({
    code: APPLY_TO_CART_DISABLED_CODE,
    message:
      "Applying a comparison straight to the cart is turned off. Apply the plan to your trip " +
      "instead, then book from your plan.",
  });
  return true;
}
