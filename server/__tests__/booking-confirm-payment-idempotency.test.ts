/**
 * #846 — provider earnings must not double-count on a retried booking confirmation.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   STRIPE_SECRET_KEY=sk_test_dummy \
 *   npx tsx --test server/__tests__/booking-confirm-payment-idempotency.test.ts
 *
 * `bookingService.confirmBookingPayment` (server/services/booking.service.ts) is the fallback/
 * polling confirmation path behind POST /api/bookings/confirm-payment (the authoritative path is
 * the Stripe webhook; this fallback exists for when the browser closes before the webhook fires,
 * or in local dev where webhooks aren't delivered). It writes provider_earnings + platform_revenue
 * inside a single db.transaction, gated by an ATOMIC conditional UPDATE
 * (`UPDATE bookings SET status='confirmed' ... WHERE status='pending_payment'`) — the §15 pattern:
 * a concurrent/duplicate caller's UPDATE matches 0 rows and the whole transaction throws before any
 * earnings/revenue row is written.
 *
 * This test proves that pattern holds, both sequentially and under real concurrency (Promise.all):
 * calling confirmBookingPayment twice for the same booking must produce exactly ONE
 * provider_earnings row and exactly ONE platform_revenue row — never two.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";

// Patch the shared PaymentIntentsResource prototype so any `new Stripe()` instance (including the
// one booking.service.ts constructs internally) resolves paymentIntents.retrieve() as 'succeeded'
// without hitting the network — same technique as the #874/#876 tests in this branch.
const probe = new Stripe("sk_test_dummy");
const piProto = Object.getPrototypeOf(probe.paymentIntents);
piProto.retrieve = async (id: string) => ({ id, status: "succeeded" });

const { db, pool } = await import("../db");
const { sql, eq } = await import("drizzle-orm");
const { users, bookings, providerEarnings, platformRevenue, providerAvailability } = await import("../../shared/schema");
const { bookingService } = await import("../services/booking.service");

after(async () => {
  await pool.end().catch(() => {});
});

async function createUser(role: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@t.test`, role } as any);
  return id;
}

async function createPendingBooking(travelerId: string, providerId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(bookings).values({
    id, userId: travelerId, providerId, status: "pending_payment", title: "Test tour",
    travelers: 2, serviceAmount: "100.00", platformFee: "20.00", totalAmount: "120.00",
    providerPayout: "80.00", paymentStatus: "pending",
  } as any);
  return id;
}

async function cleanup(bookingId: string, travelerId: string, providerId: string) {
  await db.delete(providerEarnings).where(eq(providerEarnings.sourceId, bookingId)).catch(() => {});
  await db.delete(platformRevenue).where(eq(platformRevenue.sourceId, bookingId)).catch(() => {});
  await db.delete(providerAvailability).where(eq(providerAvailability.providerId, providerId)).catch(() => {});
  await db.delete(bookings).where(eq(bookings.id, bookingId)).catch(() => {});
  await db.delete(users).where(eq(users.id, travelerId)).catch(() => {});
  await db.delete(users).where(eq(users.id, providerId)).catch(() => {});
}

test("#846 — sequential double-confirm writes earnings/revenue exactly once", async () => {
  const travelerId = await createUser("traveler");
  const providerId = await createUser("provider");
  const bookingId = await createPendingBooking(travelerId, providerId);
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;

  try {
    await bookingService.confirmBookingPayment(bookingId, piId, travelerId);

    await assert.rejects(
      () => bookingService.confirmBookingPayment(bookingId, piId, travelerId),
      (err: any) => err.code === "BOOKING_ALREADY_CONFIRMED",
      "a second sequential confirm must be rejected as already-confirmed",
    );

    const earnRows = await db.select().from(providerEarnings).where(eq(providerEarnings.sourceId, bookingId));
    const revRows = await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, bookingId));
    assert.equal(earnRows.length, 1, "exactly one provider_earnings row after sequential double-confirm");
    assert.equal(revRows.length, 1, "exactly one platform_revenue row after sequential double-confirm");
  } finally {
    await cleanup(bookingId, travelerId, providerId);
  }
});

test("#846 — concurrent double-confirm (Promise.all) writes earnings/revenue exactly once", async () => {
  const travelerId = await createUser("traveler");
  const providerId = await createUser("provider");
  const bookingId = await createPendingBooking(travelerId, providerId);
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const results = await Promise.allSettled([
      bookingService.confirmBookingPayment(bookingId, piId, travelerId),
      bookingService.confirmBookingPayment(bookingId, piId, travelerId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent confirm call must win");
    assert.equal(rejected.length, 1, "exactly one concurrent confirm call must lose (atomic claim)");
    assert.equal((rejected[0] as PromiseRejectedResult).reason?.code, "BOOKING_ALREADY_CONFIRMED");

    const earnRows = await db.select().from(providerEarnings).where(eq(providerEarnings.sourceId, bookingId));
    const revRows = await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, bookingId));
    assert.equal(earnRows.length, 1, "exactly one provider_earnings row after concurrent double-confirm");
    assert.equal(revRows.length, 1, "exactly one platform_revenue row after concurrent double-confirm");
  } finally {
    await cleanup(bookingId, travelerId, providerId);
  }
});
