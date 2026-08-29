/**
 * trip-entitlement.service.ts — the Trip Pass spine (ruling 2026-08-29-trip-pass).
 *
 * Per-trip entitlement reads/writes over `trip_entitlements` (migration 262). The pass
 * SUPPRESSES charges at server-side charge points — it never changes what the fee
 * resolvers return for uncovered trips, and it never touches commissions.
 *
 * Coverage semantics (ruling): an ACTIVE pass on a trip grants
 *   - optimizer_run          unlimited (no per-run charge)
 *   - ai_task                unlimited (NO-OP TODAY: no charge surface exists — the
 *                            concierge:ai_task band is display-only on /api/pricing;
 *                            this key is the hook for when that surface is built)
 *   - traveler_service_fee   waived via the EXISTING rails-waiver mechanism
 *                            (resolveTravelerServiceFee({waived:true}), basis 'trip_pass')
 *   - expert_revision        ONE, recorded in allowances_snapshot.revisionsRemaining and
 *                            claimable via consumeRevision — UNENFORCED today (Phase 0.3:
 *                            no generalized revision action exists; filed for the
 *                            expert-flow lane). consumeRevision is the future hook.
 *
 * allowances_snapshot is FROZEN at purchase (plans-row allowances + revisionsRemaining).
 * source_payment_id is payment identity (§19a): only grantTripPass writes it, only from a
 * Stripe-verified PaymentIntent id — never from a request body.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tripEntitlements, type TripEntitlement } from "@shared/schema";
import { PLAN_KEYS } from "./plans.service";

export type TripPassAction =
  | "optimizer_run"
  | "ai_task"
  | "traveler_service_fee"
  | "expert_revision";

/** The active Trip Pass row for a trip, or null. One active row max (partial unique index). */
export async function getActiveTripPass(tripId: string): Promise<TripEntitlement | null> {
  const [row] = await db
    .select()
    .from(tripEntitlements)
    .where(
      and(
        eq(tripEntitlements.tripId, tripId),
        eq(tripEntitlements.planKey, PLAN_KEYS.TRIP_PASS),
        eq(tripEntitlements.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function tripHasPass(tripId: string): Promise<boolean> {
  return (await getActiveTripPass(tripId)) !== null;
}

/**
 * Server-side coverage check for a charge point. The client never asserts coverage —
 * every charge point calls this itself. Unknown actions are NOT covered (§13: never
 * guess a benefit into existence).
 */
export async function coversAction(tripId: string, action: TripPassAction): Promise<boolean> {
  const pass = await getActiveTripPass(tripId);
  if (!pass) return false;
  switch (action) {
    case "optimizer_run":
    case "ai_task":
    case "traveler_service_fee":
      // Unconditional benefits of an active pass (ruling; unlimited, no counters).
      return true;
    case "expert_revision": {
      const snap = (pass.allowancesSnapshot ?? {}) as Record<string, unknown>;
      const remaining = Number(snap.revisionsRemaining ?? 0);
      return Number.isFinite(remaining) && remaining > 0;
    }
    default:
      return false;
  }
}

/**
 * Atomically claims one revision from the snapshot (WHERE-guarded, so a double-click
 * claims once — the ready_made_purchases.revisionStatus pattern applied to a count).
 * UNENFORCED today: no charge point calls this; it exists so the expert-flow lane has
 * the hook and the count is provably decrement-once. Returns true when a revision was
 * consumed, false when none remained (or no active pass).
 */
export async function consumeRevision(tripId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE trip_entitlements
    SET allowances_snapshot = jsonb_set(
          allowances_snapshot,
          '{revisionsRemaining}',
          to_jsonb(((allowances_snapshot->>'revisionsRemaining')::int) - 1)
        ),
        updated_at = now()
    WHERE trip_id = ${tripId}
      AND plan_key = ${PLAN_KEYS.TRIP_PASS}
      AND status = 'active'
      AND COALESCE((allowances_snapshot->>'revisionsRemaining')::int, 0) > 0
  `);
  return ((result as any).rowCount ?? 0) > 0;
}

/**
 * Grants a Trip Pass, idempotent on the PaymentIntent id: a duplicate confirm/webhook
 * finds the existing row and inserts nothing (partial unique index on source_payment_id;
 * ON CONFLICT DO NOTHING). A concurrent second grant for the SAME trip loses to the
 * one-active-per-trip index rather than double-granting.
 */
export async function grantTripPass(input: {
  tripId: string;
  sourcePaymentId: string;
  allowancesSnapshot: Record<string, unknown>;
}): Promise<{ entitlement: TripEntitlement; created: boolean }> {
  const existingByPayment = await db
    .select()
    .from(tripEntitlements)
    .where(eq(tripEntitlements.sourcePaymentId, input.sourcePaymentId))
    .limit(1);
  if (existingByPayment[0]) return { entitlement: existingByPayment[0], created: false };

  const inserted = await db
    .insert(tripEntitlements)
    .values({
      tripId: input.tripId,
      planKey: PLAN_KEYS.TRIP_PASS,
      status: "active",
      sourcePaymentId: input.sourcePaymentId,
      allowancesSnapshot: input.allowancesSnapshot,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return { entitlement: inserted[0], created: true };

  // Conflict path: either this PI raced its own duplicate, or the trip already has an
  // active pass from a different PI. Return whatever stands; never double-grant.
  const [byPayment] = await db
    .select()
    .from(tripEntitlements)
    .where(eq(tripEntitlements.sourcePaymentId, input.sourcePaymentId))
    .limit(1);
  if (byPayment) return { entitlement: byPayment, created: false };
  const active = await getActiveTripPass(input.tripId);
  if (active) return { entitlement: active, created: false };
  throw new Error("trip pass grant conflicted but no standing entitlement was found");
}
