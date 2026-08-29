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
 *
 * source (ledger 2026-08-29-trip-pass-provenance, migration 264) records PROVENANCE —
 * 'stripe' | 'manual' | 'beta', mirroring plan_memberships.source. grantTripPass is written
 * ONLY by the server-side grant path, and the manual/beta path is now a first-class §19a-
 * sanctioned writer alongside Stripe: it is enforced service-side (no DB CHECK — publish-trap
 * rule) that 'stripe' carries a real, non-empty source_payment_id, and 'manual'/'beta' carry
 * NO source_payment_id (null) — a manual grant must never carry a fabricated payment identity.
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

export type TripPassSource = "stripe" | "manual" | "beta";
const TRIP_PASS_SOURCES = new Set<TripPassSource>(["stripe", "manual", "beta"]);

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
 * Grants a Trip Pass. `source` defaults to 'stripe' (preserves the pre-existing behavior of
 * every caller that only ever passed a PaymentIntent id).
 *
 * Provenance enforcement (ledger 2026-08-29-trip-pass-provenance, service-layer — no DB
 * CHECK):
 *   - source must be one of 'stripe' | 'manual' | 'beta'.
 *   - source === 'stripe'  → sourcePaymentId MUST be a real, non-empty string.
 *   - source !== 'stripe'  → sourcePaymentId MUST be null/undefined. A manual/beta grant
 *     that arrives carrying a PaymentIntent-shaped string is rejected outright (§19a: a
 *     non-Stripe grant must never carry a fabricated payment identity).
 *
 * Idempotency:
 *   - stripe path: idempotent on the PaymentIntent id — a duplicate confirm/webhook finds
 *     the existing row and inserts nothing (partial unique index on source_payment_id).
 *   - manual/beta path: source_payment_id is NULL, so that index never applies; idempotency
 *     instead rests on the existing one-active-per-trip partial unique index
 *     (trip_entitlements_active_trip_uniq) — a second manual/beta grant on a trip that
 *     already has an active pass is a clean no-op, never a duplicate.
 * Both paths share one untargeted `onConflictDoNothing()`, which in Postgres catches a
 * conflict on EITHER unique index (an untargeted ON CONFLICT DO NOTHING applies to any
 * constraint violation, unlike a targeted one) — so no per-source branching is needed on
 * the insert itself, only on the pre-check and the post-conflict resolution below, both of
 * which only make sense when a source_payment_id exists.
 */
export async function grantTripPass(input: {
  tripId: string;
  sourcePaymentId?: string | null;
  allowancesSnapshot: Record<string, unknown>;
  source?: TripPassSource;
}): Promise<{ entitlement: TripEntitlement; created: boolean }> {
  const source: TripPassSource = input.source ?? "stripe";
  if (!TRIP_PASS_SOURCES.has(source)) {
    throw new Error(
      `grantTripPass: invalid source "${String(source)}" — must be 'stripe' | 'manual' | 'beta'`,
    );
  }
  if (source === "stripe") {
    if (typeof input.sourcePaymentId !== "string" || input.sourcePaymentId.trim() === "") {
      throw new Error(
        "grantTripPass: source='stripe' requires a real, non-empty sourcePaymentId (a Stripe-verified PaymentIntent id)",
      );
    }
  } else if (input.sourcePaymentId != null) {
    throw new Error(
      `grantTripPass: source='${source}' must not carry a sourcePaymentId — manual/beta grants are never payment-identified (§19a)`,
    );
  }
  const sourcePaymentId = source === "stripe" ? (input.sourcePaymentId as string) : null;

  if (sourcePaymentId) {
    const existingByPayment = await db
      .select()
      .from(tripEntitlements)
      .where(eq(tripEntitlements.sourcePaymentId, sourcePaymentId))
      .limit(1);
    if (existingByPayment[0]) return { entitlement: existingByPayment[0], created: false };
  }

  const inserted = await db
    .insert(tripEntitlements)
    .values({
      tripId: input.tripId,
      planKey: PLAN_KEYS.TRIP_PASS,
      status: "active",
      source,
      sourcePaymentId,
      allowancesSnapshot: input.allowancesSnapshot,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return { entitlement: inserted[0], created: true };

  // Conflict path: either this PI raced its own duplicate (stripe), or the trip already
  // has an active pass from a different grant (stripe PI or manual/beta). Return whatever
  // stands; never double-grant.
  if (sourcePaymentId) {
    const [byPayment] = await db
      .select()
      .from(tripEntitlements)
      .where(eq(tripEntitlements.sourcePaymentId, sourcePaymentId))
      .limit(1);
    if (byPayment) return { entitlement: byPayment, created: false };
  }
  const active = await getActiveTripPass(input.tripId);
  if (active) return { entitlement: active, created: false };
  throw new Error("trip pass grant conflicted but no standing entitlement was found");
}
