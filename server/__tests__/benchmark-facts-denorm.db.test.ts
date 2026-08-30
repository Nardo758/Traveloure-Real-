/**
 * BENCHMARK FACTS — revenue is a REAL service_bookings SUM, never the banned denorm.
 *
 * Lane B5 (Trailhead sweep). getBenchmarkFacts (server/routes/demand.routes.ts) previously read
 * `provider_services.total_revenue` / `bookings_count` — the denormalized columns Locked-Decision-3
 * / §14 forbid trusting on a money-facing surface. This proves, against real rows in a real DB:
 *
 *   BF-1 — totalRevenue / totalBookings are the SUM / COUNT over the provider's own
 *          `service_bookings` (money-realized statuses only), and are NOT the poisoned denorm.
 *   BF-2 — a provider whose bookings are ALL non-realized (payment_pending / cancelled) reports
 *          0 honestly (§13), never the stale denorm figure.
 *
 * NO STRIPE, NO NETWORK. DISPOSABLE DB ONLY: every row is deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/benchmark-facts-denorm.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getBenchmarkFacts } from "../routes/demand.routes";

const RUN = crypto.randomUUID().slice(0, 8);
// Provider A: has realized bookings — the denorm is deliberately poisoned to a wildly wrong value.
const provA = `bf-${RUN}-provA`;
// Provider B: only NON-realized bookings — the denorm is likewise poisoned.
const provB = `bf-${RUN}-provB`;
const travelerId = `bf-${RUN}-trav`;
let svcA: string;
let svcB: string;
const bookingIds: string[] = [];

// Poisoned denorm values — if the fixed code ever reads them, the assertions below fail loudly.
const POISON_REVENUE = "99999.00";
const POISON_COUNT = 999;

async function insertService(id: string, userId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, bookings_count, total_revenue)
    VALUES (${id}, ${userId}, ${`bf-${RUN} svc`}, ${POISON_COUNT}, ${POISON_REVENUE})
  `);
}

async function insertBooking(providerId: string, serviceId: string, status: string, total: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, created_at)
    VALUES
      (${id}, ${serviceId}, ${travelerId}, ${providerId}, ${status}, ${total}, '0', '0', NOW())
  `);
  bookingIds.push(id);
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${provA}, ${`bf-${RUN}-provA@test.local`}, 'service_provider'),
      (${provB}, ${`bf-${RUN}-provB@test.local`}, 'service_provider'),
      (${travelerId}, ${`bf-${RUN}-trav@test.local`}, 'traveler')
  `);
  svcA = crypto.randomUUID();
  svcB = crypto.randomUUID();
  await insertService(svcA, provA);
  await insertService(svcB, provB);

  // Provider A — three money-realized bookings (400.00 total) plus noise that must NOT count.
  await insertBooking(provA, svcA, "confirmed", "100.00");
  await insertBooking(provA, svcA, "completed", "250.00");
  await insertBooking(provA, svcA, "delivered", "50.00");
  await insertBooking(provA, svcA, "payment_pending", "9999.00"); // unauthorized claim — excluded
  await insertBooking(provA, svcA, "cancelled", "8888.00");       // not revenue — excluded

  // Provider B — bookings exist, but NONE are realized.
  await insertBooking(provB, svcB, "payment_pending", "7777.00");
  await insertBooking(provB, svcB, "cancelled", "6666.00");
});

after(async () => {
  if (bookingIds.length > 0) {
    const idList = sql.join(bookingIds.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${idList})`);
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${svcA}, ${svcB})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${provA}, ${provB}, ${travelerId})`);
});

// ─── BF-1: SUM-derived revenue, not the denorm ────────────────────────────────
test("BF-1: totalRevenue/totalBookings are the realized service_bookings SUM, not the denorm", async () => {
  const facts = await getBenchmarkFacts(provA);

  assert.equal(facts.totalRevenue, 400, "totalRevenue must be the SUM of the three realized bookings (100+250+50)");
  assert.equal(facts.totalBookings, 3, "totalBookings must count only the three realized bookings");
  assert.equal(facts.avgBookingValue, 400 / 3, "avgBookingValue = SUM / realized count");

  // The denorm is 99999.00 / 999 — prove the fixed path does NOT read it.
  assert.notEqual(facts.totalRevenue, Number(POISON_REVENUE), "must NOT return the banned total_revenue denorm");
  assert.notEqual(facts.totalBookings, POISON_COUNT, "must NOT return the banned bookings_count denorm");
});

// ─── BF-2: no realized bookings ⇒ honest 0, not the denorm ─────────────────────
test("BF-2: a provider with only non-realized bookings reports 0, never the stale denorm", async () => {
  const facts = await getBenchmarkFacts(provB);

  assert.equal(facts.totalRevenue, 0, "unrealized-only provider must report 0 revenue (§13), not the denorm");
  assert.equal(facts.totalBookings, 0, "unrealized-only provider must report 0 bookings");
  assert.equal(facts.avgBookingValue, 0, "avgBookingValue is 0 when there are no realized bookings");
});
