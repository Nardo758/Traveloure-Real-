/**
 * #876 — refund retry can't leave Stripe and DB out of sync.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY] \
 *   npx tsx --test server/__tests__/refund-retry-convergence.test.ts
 *
 * Covers all three MONEY_MAP §1c refund sites. For each: stub `stripe.refunds.create` to THROW
 * on the first call then succeed on the second, call the refund path twice (simulating a client
 * retry after the first request 500/502'd), and assert:
 *   - exactly ONE real Stripe refund call succeeds (no double-refund)
 *   - the DB converges to the correct terminal state
 *   - no ledger/earnings/revenue row is double-written
 *
 * Site 1 — stripe-payment.service.ts `refundServiceBooking` (service_bookings): CLAIM-THEN-REVERT.
 *   An atomic status claim runs FIRST; if Stripe throws, the claim is explicitly reverted
 *   (~stripe-payment.service.ts:804) so a retry's claim succeeds cleanly. Already the documented
 *   reference pattern — this test proves it converges.
 *
 * Site 2 — ready-made-purchase.service.ts `refundReadyMadePurchaseLedger` +
 *   ready-made.routes.ts's inline Stripe call (LEDGER-FIRST, STRIPE-SECOND, the dispute-uphold
 *   posture): the ledger claim/reversal is atomic + idempotent (a second call short-circuits via
 *   `alreadyRefunded`), so a Stripe-throw retry re-runs ONLY the (idempotency-keyed) Stripe leg.
 *   The route handler is inline in ready-made.routes.ts, so this test drives the same two calls
 *   the route makes, in the same order, against the real service function.
 *
 * Site 3 — routes.ts coordination-fee refund (STRIPE-FIRST, LEDGER-SECOND): Stripe is called
 *   BEFORE any DB write, so a Stripe throw leaves the DB untouched (nothing to revert); a retry
 *   re-attempts Stripe (idempotency-keyed) and, once it succeeds, runs the (idempotent) DB
 *   transaction. Reproduced here verbatim since the handler is inline in the routes.ts monolith
 *   (same pattern used for the #874 test in this branch).
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "[REDACTED_STRIPE_TEST_KEY]";

// Patch the shared Stripe Refunds resource prototype (shared across every `new Stripe()`
// instance in the process, since stripe-node defines resource methods on the prototype —
// see the #846 test in this branch for the same technique against paymentIntents.retrieve).
const probe = new Stripe("[REDACTED_STRIPE_TEST_KEY]");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const originalCreate = refundsProto.create;

/** Stub `refunds.create` to throw once, then delegate to a fresh success stub. Returns a
 *  call counter so each test can assert exactly how many Stripe attempts were made. */
function stubThrowOnceThenSucceed() {
  let calls = 0;
  refundsProto.create = async (...args: any[]) => {
    calls++;
    if (calls === 1) throw new Error("simulated network failure");
    return { id: `re_test_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: args?.[0]?.amount ?? 0 };
  };
  return () => calls;
}

afterEach(() => {
  refundsProto.create = originalCreate;
});

const { db, pool } = await import("../db");
const { sql, eq, and, ne } = await import("drizzle-orm");
const {
  users, serviceBookings, refunds: refundsTable,
  coordinationStates, coordinationFeeCredits, platformRevenue,
  readyMadeTrips, readyMadePurchases, trips, expertEarnings,
} = await import("../../shared/schema");

after(async () => {
  await pool.end().catch(() => {});
});

async function createUser(role = "traveler"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@t.test`, role } as any);
  return id;
}

// ───────────────────────────── Site 1: service_bookings refund ─────────────────────────────

test("#876 site 1 — refundServiceBooking: Stripe throw-then-succeed converges to exactly one refund", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");

  const travelerId = await createUser("traveler");
  const providerId = await createUser("provider");
  const bookingId = crypto.randomUUID();
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(serviceBookings).values({
    id: bookingId,
    travelerId,
    providerId,
    totalAmount: "100.00",
    status: "confirmed",
    stripePaymentIntentId: piId,
  } as any);

  const getCalls = stubThrowOnceThenSucceed();
  try {
    // First attempt: Stripe throws. The service should revert its optimistic claim.
    await assert.rejects(() => stripePaymentService.refundServiceBooking(bookingId), /Refund failed/);
    const [afterFail] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId));
    assert.equal(afterFail.status, "confirmed", "a failed Stripe call must leave the booking status reverted, not stuck at 'refunded'");

    // Retry: Stripe succeeds this time.
    const result = await stripePaymentService.refundServiceBooking(bookingId);
    assert.equal((result as any).alreadyRefunded, undefined);
    assert.equal((result as any).status, "succeeded");

    const [afterSuccess] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId));
    assert.equal(afterSuccess.status, "refunded");

    // Exactly one refund row recorded (not two).
    const refundRows = await db.select().from(refundsTable).where(eq(refundsTable.bookingId, bookingId));
    assert.equal(refundRows.length, 1, "exactly one refund ledger row after throw-then-succeed retry");

    assert.equal(getCalls(), 2, "Stripe should have been called twice (fail, then succeed)");

    // A THIRD call (idempotent duplicate confirm) must be a no-op, not a second refund.
    const dup = await stripePaymentService.refundServiceBooking(bookingId);
    assert.equal((dup as any).alreadyRefunded, true);
    const refundRowsAfterDup = await db.select().from(refundsTable).where(eq(refundsTable.bookingId, bookingId));
    assert.equal(refundRowsAfterDup.length, 1, "a duplicate refund call after success must not insert a second refund row");
  } finally {
    await db.delete(refundsTable).where(eq(refundsTable.bookingId, bookingId)).catch(() => {});
    await db.delete(serviceBookings).where(eq(serviceBookings.id, bookingId)).catch(() => {});
    await db.delete(users).where(eq(users.id, travelerId)).catch(() => {});
    await db.delete(users).where(eq(users.id, providerId)).catch(() => {});
  }
});

// ───────────────────────── Site 2: ready-made purchase refund ─────────────────────────

/** Mirrors the exact two calls ready-made.routes.ts's POST …/refund handler makes, in order. */
async function driveReadyMadeRefund(purchaseId: string, buyerId: string) {
  const { refundReadyMadePurchaseLedger } = await import("../services/ready-made-purchase.service");
  const ledger = await refundReadyMadePurchaseLedger(purchaseId, buyerId);
  if (!ledger.ok) return { ok: false as const, ledger };
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-12-18.acacia" as any });
  try {
    const refund = await stripeClient.refunds.create(
      { payment_intent: (ledger.purchase as any).stripePaymentIntentId },
      { idempotencyKey: `rm-refund-${(ledger.purchase as any).id}` },
    );
    return { ok: true as const, ledger, refund };
  } catch (e: any) {
    return { ok: false as const, ledger, stripeError: e.message };
  }
}

test("#876 site 2 — ready-made refund: Stripe throw-then-succeed converges, no double earnings reversal", async () => {
  const buyerId = await createUser("traveler");
  const authorId = await createUser("expert");
  const tripId = crypto.randomUUID();
  await db.insert(trips).values({
    id: tripId, userId: authorId, startDate: "2026-01-01", endDate: "2026-01-05", destination: "Kyoto",
  } as any);
  const rmTripId = crypto.randomUUID();
  await db.insert(readyMadeTrips).values({
    id: rmTripId, authorId, sourceTripId: tripId, market: "Kyoto", title: "Test trip",
    durationDays: 4, priceCents: 5000, status: "approved",
  } as any);
  const purchaseId = crypto.randomUUID();
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(readyMadePurchases).values({
    id: purchaseId, buyerId, readyMadeTripId: rmTripId, pricePaidCents: 5000,
    stripePaymentIntentId: piId, status: "paid",
    purchasedAt: new Date(), // fresh — inside the refund window
  } as any);
  // A held earning for the author, so we can prove it's reversed exactly once.
  const earningId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, currency, reference_id, status, created_at)
    VALUES (${earningId}, ${authorId}, 'ready_made_sale', '50.00', 'USD', ${purchaseId}, 'held', NOW())
  `);

  const getCalls = stubThrowOnceThenSucceed();
  try {
    // First attempt: ledger commits, Stripe throws → 502-equivalent.
    const first = await driveReadyMadeRefund(purchaseId, buyerId);
    assert.equal(first.ok, false);
    assert.match(first.stripeError ?? "", /simulated network failure/);

    const [afterFirst] = await db.select().from(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseId));
    assert.equal(afterFirst.status, "refunded", "ledger-first: the purchase row is already refunded even though Stripe failed");

    const [earningAfterFirst] = await db.execute(sql`SELECT status FROM expert_earnings WHERE id = ${earningId}`).then(r => r.rows as any[]);
    assert.equal(earningAfterFirst.status, "reversed", "the author's earning must be reversed on the ledger pass");

    // Retry: ledger short-circuits (alreadyRefunded), Stripe succeeds this time.
    const second = await driveReadyMadeRefund(purchaseId, buyerId);
    assert.equal(second.ok, true);
    assert.equal((second.ledger as any).alreadyRefunded, true, "retry must short-circuit the ledger, not re-reverse anything");
    assert.ok((second as any).refund?.id);

    assert.equal(getCalls(), 2, "Stripe should have been called twice (fail, then succeed)");

    // Earning must still show 'reversed' exactly once (no double-reversal, no corruption).
    const [earningAfterSecond] = await db.execute(sql`SELECT status FROM expert_earnings WHERE id = ${earningId}`).then(r => r.rows as any[]);
    assert.equal(earningAfterSecond.status, "reversed");
  } finally {
    await db.execute(sql`DELETE FROM expert_earnings WHERE id = ${earningId}`).catch(() => {});
    await db.delete(readyMadePurchases).where(eq(readyMadePurchases.id, purchaseId)).catch(() => {});
    await db.delete(readyMadeTrips).where(eq(readyMadeTrips.id, rmTripId)).catch(() => {});
    await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    await db.delete(users).where(eq(users.id, buyerId)).catch(() => {});
    await db.delete(users).where(eq(users.id, authorId)).catch(() => {});
  }
});

// ───────────────────────── Site 3: coordination-fee refund ─────────────────────────

/** Reproduces routes.ts's coordination-fee refund handler verbatim (Stripe-first, ledger-second),
 *  since it's inline in the routes.ts monolith and not independently importable — same technique
 *  used for the #874 tests in this branch. */
async function driveCoordinationRefund(coordinationId: string, paymentIntentId: string, feeCents: number) {
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-12-18.acacia" as any });
  let stripeRefundId: string | null = null;
  try {
    const r = await stripeClient.refunds.create(
      { payment_intent: paymentIntentId, amount: feeCents },
      { idempotencyKey: `coord-refund-${coordinationId}` },
    );
    stripeRefundId = r.id;
  } catch (e: any) {
    return { ok: false as const, error: e.message };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(coordinationFeeCredits)
      .set({ consumedByCoordinationId: null, consumedAt: null })
      .where(eq(coordinationFeeCredits.consumedByCoordinationId, coordinationId));
    await tx
      .update(platformRevenue)
      .set({ status: "reversed" } as any)
      .where(and(eq(platformRevenue.sourceId, paymentIntentId), ne(platformRevenue.status, "reversed")));
    await tx
      .update(coordinationStates)
      .set({ feePaymentStatus: "refunded" })
      .where(eq(coordinationStates.id, coordinationId));
  });

  return { ok: true as const, stripeRefundId };
}

test("#876 site 3 — coordination refund: Stripe throw-then-succeed leaves DB untouched until Stripe succeeds", async () => {
  const userId = await createUser("traveler");
  const stateId = crypto.randomUUID();
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(coordinationStates).values({
    id: stateId, userId, experienceType: "wedding",
    feePaymentStatus: "paid", feePaymentIntentId: piId, feeAmountCents: 49900,
  } as any);
  // A platform_revenue row to prove it's reversed exactly once, once Stripe actually succeeds.
  await db.insert(platformRevenue).values({
    sourceType: "coordination_fee", sourceId: piId,
    grossAmount: "499.00", platformFee: "499.00", netAmount: "499.00", status: "recorded",
  } as any);

  const getCalls = stubThrowOnceThenSucceed();
  try {
    // First attempt: Stripe throws. No DB claim happened before the Stripe call, so nothing to revert.
    const first = await driveCoordinationRefund(stateId, piId, 49900);
    assert.equal(first.ok, false);

    const [afterFirst] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(afterFirst.feePaymentStatus, "paid", "a failed Stripe call must leave the coordination state untouched (still 'paid')");
    const [revAfterFirst] = await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, piId));
    assert.equal(revAfterFirst.status, "recorded", "revenue must not be reversed until Stripe actually succeeds");

    // Retry: Stripe succeeds this time, DB transaction runs.
    const second = await driveCoordinationRefund(stateId, piId, 49900);
    assert.equal(second.ok, true);
    assert.ok(second.stripeRefundId);

    const [afterSecond] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(afterSecond.feePaymentStatus, "refunded");
    const [revAfterSecond] = await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, piId));
    assert.equal(revAfterSecond.status, "reversed");

    assert.equal(getCalls(), 2, "Stripe should have been called twice (fail, then succeed) — exactly one real refund");
  } finally {
    await db.delete(platformRevenue).where(eq(platformRevenue.sourceId, piId)).catch(() => {});
    await db.delete(coordinationStates).where(eq(coordinationStates.id, stateId)).catch(() => {});
    await db.delete(users).where(eq(users.id, userId)).catch(() => {});
  }
});
