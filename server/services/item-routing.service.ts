/**
 * THE TWO MONEY-PATH ROUTING EDGES — Trip-Canon Lane 1 (Reconcile), Phase 1c (W4).
 *
 * Governing docs: docs/briefs/ROUTING_STATE_CONTRACT.md (§1 state machine incl. the reversal edge,
 * §2 contract matrix rows "Checkout / payments" and "Refund / cancellation path"),
 * docs/briefs/RECONCILE_PHASE1_SCOPE.md (§1 W4, §3 Phase 1c).
 *
 * The traveler/expert edges live in `server/routes/routing.routes.ts`; that endpoint deliberately
 * REFUSES both edges in this file (403 on `→ purchased`, 409 on `purchased → in_planning`) because
 * neither is a caller-driven transition — each one is the plan-side half of a money event:
 *
 *     ready_for_checkout ──► purchased      written ONLY by /api/checkout, with the booking write
 *     purchased ─────────► in_planning      written ONLY by the refund path, after the refund
 *
 * ── WHY THEY LIVE TOGETHER IN ONE MODULE ─────────────────────────────────────────────────────
 * They are one invariant seen from two directions ("the plan tells the truth about what was paid
 * for"), and the reversal has TWO callers (`POST /api/bookings/refund` and the admin
 * dispute-uphold terminal). A second copy in the second caller is exactly how the H1/H5 pair was
 * written — the same fix authored twice, dropped once. One helper, two call sites.
 *
 * ── THE DISCIPLINE BOTH FUNCTIONS SHARE ──────────────────────────────────────────────────────
 *  • ATOMIC CONDITIONAL UPDATE (§15 discipline applied to a non-money state machine). Each flip
 *    carries its expected `routing_status` in the WHERE clause, so a concurrent reroute is never
 *    clobbered — it simply matches 0 rows.
 *  • NEVER THROWS INTO THE MONEY PATH. The booking (and the refund) is the money truth; a derived
 *    plan flag must never fail, roll back, or 500 a real transaction. Every failure is logged and
 *    swallowed, and both flips are re-runnable.
 *  • 0 rows matched is a NORMAL outcome, not an error: a cart row with no projected item, a
 *    historical booking that predates migration 159, an item already reverted. Reported, not raised.
 *  • NO AMOUNTS, NO IDENTITIES. This module reads and writes routing state only — it never touches
 *    a price, a payment intent, an idempotency key or a slot claim (§14).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { logger } from "../infrastructure/logger";

/**
 * FORWARD EDGE — `ready_for_checkout → purchased`, stamping the booking that bought the item.
 * Called by `/api/checkout` once THAT item's booking row exists (contract §2: checkout is the
 * sole writer of this edge).
 *
 * `WHERE routing_status = 'ready_for_checkout'` is the guard: `ready_for_checkout` is the only
 * state a projected cart row can legally be in, so 0 rows means the traveler rerouted the item
 * between the cart read and the booking insert (or the row is not a projection at all). The
 * booking still stands — it is the money truth — so the caller logs and continues.
 */
export async function markItemPurchased(
  itemId: string,
  bookingId: string,
): Promise<{ flipped: boolean }> {
  try {
    const updated = await db
      .update(itineraryItems)
      .set({ routingStatus: "purchased", bookingId, updatedAt: new Date() })
      .where(
        and(
          eq(itineraryItems.id, itemId),
          eq(itineraryItems.routingStatus, "ready_for_checkout"),
        ),
      )
      .returning({ id: itineraryItems.id });

    if (updated.length === 0) {
      logger.warn(
        { itemId, bookingId },
        "routing: item not flipped to purchased (not in ready_for_checkout, or no such item) — booking stands",
      );
      return { flipped: false };
    }
    return { flipped: true };
  } catch (err) {
    // Never fail a checkout over a plan flag. Re-runnable: the booking carries the tripId, so a
    // reconciliation pass can always find the item again.
    logger.error({ err, itemId, bookingId }, "routing: markItemPurchased failed (booking unaffected)");
    return { flipped: false };
  }
}

/**
 * REVERSAL EDGE — `purchased → in_planning` for every item bought through this booking
 * (contract §1: "Without it, the Trip Card shows purchases the traveler was refunded for").
 * Called by BOTH refund callers AFTER the refund succeeds, leaving the ledger-first/Stripe-second
 * ordering untouched.
 *
 * `booking_id` is deliberately KEPT on the row. Migration 159 made it `ON DELETE SET NULL` for
 * booking DELETION only; a refunded booking still exists and is still the honest record of what
 * happened to this item (§13). Only the routing state moves — the item returns to the plan, where
 * the traveler can route it to checkout again.
 *
 * 0 rows is fine and expected: the booking may predate migration 159, may have been made from a
 * non-projected cart row, or may already have been reverted by an earlier refund attempt (which is
 * what makes this idempotent).
 */
export async function revertPurchasedItemsForBooking(
  bookingId: string,
): Promise<{ reverted: number }> {
  try {
    const updated = await db
      .update(itineraryItems)
      .set({ routingStatus: "in_planning", updatedAt: new Date() })
      .where(
        and(
          eq(itineraryItems.bookingId, bookingId),
          eq(itineraryItems.routingStatus, "purchased"),
        ),
      )
      .returning({ id: itineraryItems.id });

    return { reverted: updated.length };
  } catch (err) {
    // The refund already happened; a plan flag must never surface as a refund failure.
    logger.error({ err, bookingId }, "routing: revertPurchasedItemsForBooking failed (refund unaffected)");
    return { reverted: 0 };
  }
}
