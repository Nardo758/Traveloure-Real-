/**
 * SERVICE BOOKING COUNTERS — bookings_count & total_revenue accuracy.
 *
 * Proves, against real rows in a real database:
 *   BC-1 — bookings_count increments when a booking is created (via incrementServiceBookings).
 *   BC-2 — bookings_count decrements on the FIRST transition to cancelled/refunded, and does NOT
 *           go below zero (GREATEST guard).
 *   BC-3 — a second cancellation call (idempotent retry) does NOT decrement a second time.
 *   BC-4 — total_revenue is NOT changed when a booking is cancelled before completion.
 *   TR-1 — total_revenue increments on completion via mintCompletionEarningsForBooking.
 *   TR-2 — total_revenue is NOT changed when a SEPARATE booking is cancelled after the first
 *           booking has already completed (i.e. the completed booking's revenue stays intact).
 *
 * NO STRIPE, NO NETWORK: bookings are inserted directly without a Stripe PI.
 * DISPOSABLE DB ONLY: every row this file writes is deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/service-booking-counters.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const providerId = `sbc-${RUN}-prov`;
const travelerId = `sbc-${RUN}-trav`;
let serviceId: string;

const bookingIds: string[] = [];

/** Insert a booking directly into the DB, bypassing PS15 PI-strip logic. */
async function insertBooking(opts: {
  status: string;
  totalAmount?: string;
  platformFee?: string;
  providerEarnings?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const total = opts.totalAmount ?? "120.00";
  const fee = opts.platformFee ?? "30.00";
  const earnings = opts.providerEarnings ?? "90.00";
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, created_at)
    VALUES
      (${id}, ${serviceId}, ${travelerId}, ${providerId}, ${opts.status}, ${total}, ${fee}, ${earnings}, NOW())
  `);
  bookingIds.push(id);
  return id;
}

/** Read bookings_count and total_revenue from provider_services for our test service. */
async function readCounters(): Promise<{ bookingsCount: number; totalRevenue: number }> {
  const r = await db.execute(sql`
    SELECT COALESCE(bookings_count, 0)::int AS bc,
           COALESCE(total_revenue, 0)::numeric AS tr
    FROM provider_services WHERE id = ${serviceId}
  `);
  const row = r.rows[0] as any;
  return { bookingsCount: Number(row.bc), totalRevenue: Number(row.tr) };
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${providerId}, ${`sbc-${RUN}-prov@test.local`}, 'service_provider'),
      (${travelerId}, ${`sbc-${RUN}-trav@test.local`}, 'traveler')
  `);
  serviceId = crypto.randomUUID();
  // Insert with explicit zero counters so we have a clean baseline.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, bookings_count, total_revenue)
    VALUES (${serviceId}, ${providerId}, ${`sbc-${RUN} test service`}, 0, 0)
  `).catch(async () => {
    // Older schema may not have bookings_count / total_revenue columns — minimal insert then reset.
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name)
      VALUES (${serviceId}, ${providerId}, ${`sbc-${RUN} test service`})
    `);
    await db.execute(sql`
      UPDATE provider_services
      SET bookings_count = 0, total_revenue = 0
      WHERE id = ${serviceId}
    `);
  });
});

after(async () => {
  if (bookingIds.length > 0) {
    const idList = sql.join(bookingIds.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`DELETE FROM provider_earnings   WHERE source_id     IN (${idList})`);
    await db.execute(sql`DELETE FROM expert_earnings     WHERE reference_id  IN (${idList})`);
    await db.execute(sql`DELETE FROM platform_revenue    WHERE source_id     IN (${idList})`);
    await db.execute(sql`DELETE FROM content_registry    WHERE content_id    IN (${idList})`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings    WHERE id            IN (${idList})`);
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${providerId}, ${travelerId})`);
});

// ─── BC-1: bookings_count increments ──────────────────────────────────────────

test("BC-1: incrementServiceBookings raises bookings_count by 1", async () => {
  const before = await readCounters();

  await storage.incrementServiceBookings(serviceId, 1);

  const after = await readCounters();
  assert.equal(
    after.bookingsCount,
    before.bookingsCount + 1,
    "bookings_count must be exactly 1 higher after incrementServiceBookings",
  );
  // total_revenue must be untouched by a bare increment
  assert.equal(after.totalRevenue, before.totalRevenue, "total_revenue must not change on increment");
});

// ─── BC-2 / BC-4: cancel decrements count, total_revenue unchanged ─────────────

test("BC-2 & BC-4: cancelling a booking decrements bookings_count and leaves total_revenue unchanged", async () => {
  // Start with a known baseline.
  const baseline = await readCounters();

  // Simulate the booking lifecycle: increment on creation, then cancel.
  await storage.incrementServiceBookings(serviceId, 1);
  const afterIncrement = await readCounters();
  assert.equal(afterIncrement.bookingsCount, baseline.bookingsCount + 1, "count must rise after increment");

  // Create a booking row in 'confirmed' state.
  const bookingId = await insertBooking({ status: "confirmed" });

  // Cancel it — this should decrement bookings_count.
  const cancelled = await storage.updateServiceBookingStatus(bookingId, "cancelled", "test cancellation");
  assert.ok(cancelled, "updateServiceBookingStatus must return the updated booking");
  assert.equal(cancelled!.status, "cancelled");

  const afterCancel = await readCounters();
  assert.equal(
    afterCancel.bookingsCount,
    baseline.bookingsCount,
    "bookings_count must return to the baseline value after cancellation",
  );
  // BC-4: total_revenue must not have moved — no completion happened.
  assert.equal(
    afterCancel.totalRevenue,
    baseline.totalRevenue,
    "total_revenue must be unchanged when a booking is cancelled before completion",
  );
});

// ─── BC-3: second cancellation is idempotent ──────────────────────────────────

test("BC-3: a second status transition to cancelled does NOT decrement bookings_count a second time", async () => {
  // Prime the counter so we have a positive value to work from.
  await storage.incrementServiceBookings(serviceId, 1);
  await storage.incrementServiceBookings(serviceId, 1); // +2 total

  const beforeFirstCancel = await readCounters();

  const bookingId = await insertBooking({ status: "confirmed" });

  // First cancellation.
  await storage.updateServiceBookingStatus(bookingId, "cancelled", "first cancel");
  const afterFirstCancel = await readCounters();
  assert.equal(
    afterFirstCancel.bookingsCount,
    beforeFirstCancel.bookingsCount - 1,
    "first cancellation must decrement by exactly 1",
  );

  // Second call: row is already 'cancelled', so priorStatus === 'cancelled';
  // isFirstCancellation is false and the decrement must NOT fire again.
  await storage.updateServiceBookingStatus(bookingId, "cancelled", "duplicate cancel");
  const afterSecondCancel = await readCounters();
  assert.equal(
    afterSecondCancel.bookingsCount,
    afterFirstCancel.bookingsCount,
    "a repeated cancellation must not decrement bookings_count a second time",
  );
});

// ─── BC-3b: GREATEST guard prevents negative bookings_count ──────────────────

test("BC-3b: bookings_count never goes below zero even if decremented from zero", async () => {
  // Force the counter to 0 directly.
  await db.execute(sql`
    UPDATE provider_services SET bookings_count = 0 WHERE id = ${serviceId}
  `);

  const bookingId = await insertBooking({ status: "confirmed" });
  // Cancel without a prior increment — simulates a counter that drifted to 0.
  await storage.updateServiceBookingStatus(bookingId, "cancelled", "underflow guard test");

  const after = await readCounters();
  assert.ok(after.bookingsCount >= 0, "bookings_count must never be negative (GREATEST guard)");
});

// ─── TR-1: completion increments total_revenue ────────────────────────────────

test("TR-1: completing a booking increments total_revenue by the provider earnings amount", async () => {
  const before = await readCounters();

  const bookingId = await insertBooking({
    status: "confirmed",
    totalAmount: "200.00",
    platformFee: "50.00",
    providerEarnings: "150.00",
  });

  const completed = await storage.updateServiceBookingStatus(bookingId, "completed", undefined, ["confirmed"]);
  assert.ok(completed, "completion must succeed");
  assert.equal(completed!.status, "completed");

  const after = await readCounters();
  assert.equal(
    after.totalRevenue,
    before.totalRevenue + 150,
    "total_revenue must increase by the provider earnings amount (150.00) on completion",
  );
});

// ─── TR-2: cancelling a SEPARATE booking does not disturb completed revenue ───

test("TR-2: cancelling a separate booking does not change total_revenue from a prior completion", async () => {
  // Complete a booking to put revenue on the service counter.
  const completedId = await insertBooking({
    status: "confirmed",
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
  });
  await storage.updateServiceBookingStatus(completedId, "completed", undefined, ["confirmed"]);

  const afterCompletion = await readCounters();

  // Now create and cancel a second, unrelated booking.
  await storage.incrementServiceBookings(serviceId, 1); // simulate the booking being counted
  const cancelledId = await insertBooking({ status: "confirmed" });
  await storage.updateServiceBookingStatus(cancelledId, "cancelled", "separate cancellation");

  const afterCancellation = await readCounters();

  assert.equal(
    afterCancellation.totalRevenue,
    afterCompletion.totalRevenue,
    "total_revenue from the completed booking must not be affected by a later, unrelated cancellation",
  );
});
