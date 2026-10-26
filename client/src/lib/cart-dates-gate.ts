/**
 * Audit A3, cart (architect dispatch CB-K; ledger `2026-10-25-cart-dates-gate`): the cart's paid Optimize
 * taps do not start while the plan's dates are unconfirmed. Pure.
 *
 * Fails closed: no trip, no expected trip id, or another trip's row means we do not know the fact, so the
 * traveler is asked for the dates. This differs from `datesGateBlocks(undefined)` on purpose: the cart's
 * resolved trip is the whole row, so a missing field means we have no trip.
 */
import { planDatesAreConfirmed } from "@shared/plan-dates";

export function cartOptimizeDatesConfirmed(
  trip: { id: string; datesConfirmedAt?: string | Date | boolean | null } | null | undefined,
  expectedTripId: string | undefined,
): boolean {
  if (!trip || !expectedTripId || trip.id !== expectedTripId) return false;
  return planDatesAreConfirmed(trip.datesConfirmedAt);
}
