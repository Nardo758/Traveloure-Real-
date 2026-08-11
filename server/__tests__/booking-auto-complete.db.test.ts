/**
 * BOOKING AUTO-COMPLETE + COMPLETION MINT — behavioural proof (task 1091 review).
 *
 * Proves, against real rows in a real database:
 *   HB-1 — a backlog of stale UNPAID confirmed bookings (> one page) cannot head-of-line block a
 *          paid booking behind them: one pass paginates past them, completes the paid booking,
 *          and STAMPS the unpaid ones so the next pass doesn't re-scan them.
 *   RC-1 — a booking left `completed` with NO ledger rows (crash between the guarded status
 *          UPDATE and the mint) is healed by the reconciliation half of the pass.
 *   IM-1 — mintCompletionEarningsForBooking is idempotent: a second invocation (dispute-reject
 *          re-completion, reconcile-after-partial-crash) creates no duplicate ledger rows.
 *
 * NO STRIPE, NO NETWORK: the PI verifier is injected. DISPOSABLE DB ONLY: every row this file
 * writes is created here and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/booking-auto-complete.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);
import { db } from "../db";
import { storage } from "../storage";
import { bookingAutoCompleteScheduler } from "../services/booking-auto-complete.service";

const RUN = crypto.randomUUID().slice(0, 8);
const providerId = `bac-${RUN}-prov`;
const travelerId = `bac-${RUN}-trav`;
let serviceId: string;
const bookingIds: string[] = [];

const PAID_PI = `pi_bac_${RUN}_paid`;

async function insertBooking(opts: { status: string; pi: string | null; confirmedDaysAgo: number; completedAt?: Date }): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings, stripe_payment_intent_id, confirmed_at, completed_at, created_at)
    VALUES (${id}, ${serviceId}, ${travelerId}, ${providerId}, ${opts.status}, '120.00', '30.00', '90.00', ${opts.pi},
            NOW() - (${opts.confirmedDaysAgo} || ' days')::interval,
            ${opts.completedAt ? opts.completedAt.toISOString() : null},
            NOW() - (${opts.confirmedDaysAgo + 1} || ' days')::interval)
  `);
  bookingIds.push(id);
  return id;
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${providerId}, ${`bac-${RUN}-prov@test.local`}, 'service_provider'),
      (${travelerId}, ${`bac-${RUN}-trav@test.local`}, 'traveler')
  `);
  serviceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, total_amount)
    VALUES (${serviceId}, ${providerId}, ${`bac-${RUN} test service`}, '120.00')
  `).catch(async () => {
    // total_amount may not exist on provider_services — fall back to minimal columns
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name)
      VALUES (${serviceId}, ${providerId}, ${`bac-${RUN} test service`})
    `);
  });
});

after(async () => {
  for (const id of bookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`);
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`);
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`);
  }
  await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${idList(bookingIds)})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${providerId}, ${travelerId})`);
});

test("HB-1: >50 stale unpaid bookings do not block a paid booking behind them", async () => {
  // 60 unpaid (older confirmed_at → sorted first) + 1 paid (newest) — more than one page.
  for (let i = 0; i < 60; i++) {
    await insertBooking({ status: "confirmed", pi: `pi_bac_${RUN}_unpaid_${i}`, confirmedDaysAgo: 30 + i });
  }
  const paidBookingId = await insertBooking({ status: "confirmed", pi: PAID_PI, confirmedDaysAgo: 10 });

  const verifier = async (piId: string) => piId === PAID_PI;
  const stats = await bookingAutoCompleteScheduler.runPass(new Date(), verifier);

  // Only bookings from this test run are guaranteed states; other rows may exist in a dev DB, so
  // assert on OUR rows, not on aggregate counters alone.
  const paid = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${paidBookingId}`);
  assert.equal((paid.rows[0] as any).status, "completed", "paid booking must complete despite 60 unpaid rows ahead of it");
  assert.ok(stats.completed >= 1);

  // Earnings minted for the paid booking
  const pe = await db.execute(sql`SELECT status FROM provider_earnings WHERE source_id = ${paidBookingId}`);
  assert.equal(pe.rows.length, 1);
  assert.equal((pe.rows[0] as any).status, "held");

  // Every unpaid row is stamped for recheck and still 'confirmed'
  const unpaid = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings
    WHERE id IN (${idList(bookingIds.slice(0, 60))})
      AND status = 'confirmed'
      AND booking_metadata->>'autoCompleteUnpaidRecheckAt' IS NOT NULL
  `);
  assert.equal((unpaid.rows[0] as any).n, 60, "all unpaid candidates must be stamped and unmodified");

  // Second pass: stamped rows are excluded — the verifier must never be called for them.
  const seen: string[] = [];
  await bookingAutoCompleteScheduler.runPass(new Date(), async (piId) => { seen.push(piId); return false; });
  assert.ok(!seen.some((p) => p.startsWith(`pi_bac_${RUN}_unpaid_`)), "stamped unpaid rows must not be re-verified within the recheck window");
});

test("RC-1: a completed booking missing ledger rows is reconciled", async () => {
  const id = await insertBooking({ status: "completed", pi: PAID_PI, confirmedDaysAgo: 5, completedAt: new Date() });
  const before = await db.execute(sql`SELECT count(*)::int AS n FROM provider_earnings WHERE source_id = ${id}`);
  assert.equal((before.rows[0] as any).n, 0);

  const healed = await bookingAutoCompleteScheduler.reconcileMissingLedgerRows(new Date());
  assert.ok(healed >= 1);

  const pe = await db.execute(sql`SELECT amount, status FROM provider_earnings WHERE source_id = ${id}`);
  const ee = await db.execute(sql`SELECT amount FROM expert_earnings WHERE reference_id = ${id}`);
  const pr = await db.execute(sql`SELECT id FROM platform_revenue WHERE source_type = 'booking_commission' AND source_id = ${id}`);
  assert.equal(pe.rows.length, 1);
  assert.equal((pe.rows[0] as any).status, "held");
  assert.equal(ee.rows.length, 1);
  assert.equal(pr.rows.length, 1);
});

test("IM-1: mintCompletionEarningsForBooking never double-mints", async () => {
  const id = await insertBooking({ status: "completed", pi: PAID_PI, confirmedDaysAgo: 5, completedAt: new Date() });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  const first = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(first, true);
  const second = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(second, false, "second mint must be a no-op");

  const pe = await db.execute(sql`SELECT count(*)::int AS n FROM provider_earnings WHERE source_id = ${id}`);
  const ee = await db.execute(sql`SELECT count(*)::int AS n FROM expert_earnings WHERE reference_id = ${id}`);
  const pr = await db.execute(sql`SELECT count(*)::int AS n FROM platform_revenue WHERE source_id = ${id}`);
  assert.equal((pe.rows[0] as any).n, 1);
  assert.equal((ee.rows[0] as any).n, 1);
  assert.equal((pr.rows[0] as any).n, 1);
});
