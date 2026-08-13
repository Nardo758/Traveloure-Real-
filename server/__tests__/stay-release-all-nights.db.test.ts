/**
 * RELEASE-ALL-NIGHTS HOTFIX — behavioural proof (§18b-class inventory-leak defect).
 *
 * THE BUG (found by the S11 design lane, confirmed here against real rows):
 * `POST /api/checkout` claims a multi-night room stay by calling `storage.bookSlot` ONCE PER
 * NIGHT date (all-or-nothing, `payments.routes.ts`'s C3 claim loop), but historically persisted
 * only the FIRST night's slot id onto the booking (`slotId` — "one representative id", the
 * comment literally said). Every downstream release path then released just that one slot:
 *
 *   1. `voidClaim`                    (checkout-claim.service.ts — the §15b TTL sweep)
 *   2. `refundServiceBooking`         (stripe-payment.service.ts)
 *   3. `updateServiceBookingStatus`'s release path (storage.ts — the owner-cancel / QA-2 rail)
 *
 * Nights 2..N leaked `vendor_availability_slots.booked_count` permanently — no code path in the
 * repo returned it.
 *
 * THE FIX: the claim spine now ALSO writes the COMPLETE per-night slot-id list onto
 * `bookingDetails.claimedSlotIds` at claim time. `slotId` is UNCHANGED (still the first night —
 * every other consumer keyed on it keeps working). All three release paths now derive their
 * release set through the ONE shared `deriveClaimedSlotIds` helper:
 * `bookingDetails.claimedSlotIds ?? (slotId ? [slotId] : [])` — so a PRE-FIX row (no
 * `claimedSlotIds` in its `bookingDetails`) releases EXACTLY as it always did, and a POST-FIX row
 * releases every night.
 *
 *   N1  a 3-night stay claim voided by the sweep returns booked_count on ALL 3 night slots
 *       (pre-fix, this assertion would fail: `voidClaim` released only the first night — proven
 *       by N2 below, which pins the OLD single-slot behaviour for a row with no claimedSlotIds).
 *   N2  a pre-fix-shaped row (no `claimedSlotIds` in `bookingDetails`) voids EXACTLY as before —
 *       first night released once, no error, no over-release onto slots the row never claimed.
 *   N3  double-void releases capacity exactly once (idempotency — the claimed-rows==0 guard is
 *       unchanged; it just now guards a wider release).
 *   P   `refundServiceBooking` and `updateServiceBookingStatus`'s cancel path release all nights
 *       the same way, through the same shared derivation.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 * No live Stripe network: `stripe.refunds.create` is stubbed on the shared resource prototype,
 * the same technique `refund-retry-convergence.test.ts` uses.
 *
 * Run solo: npx tsx --test server/__tests__/stay-release-all-nights.db.test.ts
 */
// refundServiceBooking's module graph constructs a real Stripe client at import time and throws
// without a key. A dummy test-mode key satisfies the constructor; nothing here makes a network
// call (refunds.create is stubbed below). Same technique as checkout-payment-promotion.db.test.ts.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_release_all_nights_suite";

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  CLAIM_EXPIRED_STATUS,
  STRIPE_ATTEMPT_AT_KEY,
  sweepExpiredCheckoutClaims,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `ran-${RUN}-user`,
  service: `ran-${RUN}-svc`,
  trip: `ran-${RUN}-trip`,
};
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (identical posture to checkout-claim-sweep.db.test.ts) ─────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[stay-release-all-nights] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`ran-${RUN}@t.test`}, 'Release', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, pricing_unit)
    VALUES (${ids.service}, ${ids.user}, 'Release-all-nights fixture room', '100.00', 'per_night')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Release fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 40)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of createdSlotIds) {
    await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** A claimed night: capacity 1, already booked by the claim under test — exactly the state C3's
 *  per-night `storage.bookSlot` loop leaves each night in. */
async function makeClaimedNight(dayOffset: number): Promise<string> {
  const id = `ran-${RUN}-slot-${createdSlotIds.length}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES (${id}, ${ids.service}, ${ids.user}, CURRENT_DATE + ${dayOffset}::int, 1, 1, 'fully_booked')
  `);
  createdSlotIds.push(id);
  return id;
}

async function slotBookedCount(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${id}`);
  return Number((r.rows[0] as any)?.booked_count ?? -1);
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, cancellation_reason, booking_details
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

/**
 * A room-stay booking row, shaped exactly as `payments.routes.ts`'s claim loop leaves it.
 *
 * `postFix: true`  → `bookingDetails.claimedSlotIds` carries the FULL per-night list (the fix).
 * `postFix: false` → `bookingDetails` carries NO `claimedSlotIds` at all — the PRE-FIX shape,
 *                     which every release path must still handle byte-identically to before.
 * `slotId` is always the FIRST night, exactly as `firstNightSlotId` has always been stamped.
 */
async function makeStayBooking(opts: {
  nightSlotIds: string[];
  postFix: boolean;
  status: string;
  stripePaymentIntentId?: string | null;
  marked?: boolean;
  ageMinutes?: number;
}): Promise<string> {
  const id = `ran-${RUN}-bk-${createdBookingIds.length}`;
  const details: Record<string, unknown> = {};
  if (opts.marked) details[STRIPE_ATTEMPT_AT_KEY] = new Date().toISOString();
  if (opts.postFix) details.claimedSlotIds = opts.nightSlotIds;
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount,
       platform_fee, provider_earnings, status, slot_id, stripe_payment_intent_id, idempotency_key, created_at)
    VALUES
      (${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip},
       ${JSON.stringify(details)}::jsonb, '300.00', '75.00', '225.00',
       ${opts.status}, ${opts.nightSlotIds[0]}, ${opts.stripePaymentIntentId ?? null}, ${`key-${id}`},
       NOW() - (${String(opts.ageMinutes ?? 60)} || ' minutes')::interval)
  `);
  createdBookingIds.push(id);
  return id;
}

const lookupMustNotBeCalled = async (): Promise<string | null> => {
  throw new Error("STRIPE_LOOKUP_WAS_CALLED");
};

// ═════════════════════════════════════════════════════════════════════════════════════════════
// N1 — the sweep's voidClaim releases EVERY night of a multi-night stay
// ═════════════════════════════════════════════════════════════════════════════════════════════
test("N1: a 3-night stay claim voided by the sweep returns booked_count on ALL 3 night slots", async () => {
  const nights = [await makeClaimedNight(20), await makeClaimedNight(21), await makeClaimedNight(22)];
  const bookingId = await makeStayBooking({ nightSlotIds: nights, postFix: true, status: "payment_pending" });

  for (const n of nights) assert.equal(await slotBookedCount(n), 1, "precondition: every night is held");

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });

  assert.ok(res.voidedUnreached >= 1, "the unmarked, aged claim must be voided");
  assert.equal(res.slotsReleased, 3, "the sweep must report all 3 released slots, not 1");
  for (const n of nights) {
    assert.equal(await slotBookedCount(n), 0, `night ${n} must be released — pre-fix this stayed at 1 for nights 2 and 3`);
  }
  const row = await bookingRow(bookingId);
  assert.equal(row.status, CLAIM_EXPIRED_STATUS);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// N2 — a pre-fix-shaped row voids EXACTLY as it always did (backward compatibility)
// ═════════════════════════════════════════════════════════════════════════════════════════════
test("N2: a pre-fix-shaped row (no claimedSlotIds in bookingDetails) voids exactly as today — first night released once, no error", async () => {
  // Two nights exist in the fixture data (mirroring a real multi-night stay), but this row is
  // PRE-FIX SHAPED: it carries no `claimedSlotIds`, only the single `slotId` (night 1) — exactly
  // what every row created before this hotfix looks like.
  const night1 = await makeClaimedNight(23);
  const night2 = await makeClaimedNight(24);
  const bookingId = await makeStayBooking({ nightSlotIds: [night1], postFix: false, status: "payment_pending" });

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });

  assert.ok(res.voidedUnreached >= 1);
  assert.equal(res.slotsReleased, 1, "a pre-fix row releases exactly ONE slot — the fallback is byte-identical to the old behaviour");
  assert.equal(await slotBookedCount(night1), 0, "the single tracked night is released");
  assert.equal(await slotBookedCount(night2), 1, "a slot this row never named in bookingDetails must NOT be touched");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// N3 — idempotency: a second void cannot double-release, for a multi-night stay
// ═════════════════════════════════════════════════════════════════════════════════════════════
test("N3: double-void releases capacity exactly once for a multi-night stay", async () => {
  const nights = [await makeClaimedNight(25), await makeClaimedNight(26), await makeClaimedNight(27)];
  const bookingId = await makeStayBooking({ nightSlotIds: nights, postFix: true, status: "payment_pending" });

  const first = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.equal(first.slotsReleased, 3, "first pass releases all 3 nights");
  for (const n of nights) assert.equal(await slotBookedCount(n), 0);

  const second = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.equal(second.voidedUnreached, 0, "the row is no longer payment_pending — the second pass finds nothing to void");
  assert.equal(second.slotsReleased, 0, "and releases no additional capacity");
  for (const n of nights) assert.equal(await slotBookedCount(n), 0, "booked_count must not go negative or shift on the second pass");
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// P — refundServiceBooking releases ALL nights, the same way
// ═════════════════════════════════════════════════════════════════════════════════════════════
const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const originalRefundsCreate = refundsProto.create;

afterEach(() => {
  refundsProto.create = originalRefundsCreate;
});

test("P: refundServiceBooking releases ALL claimed nights, not just the first", async () => {
  refundsProto.create = async (...args: any[]) => ({
    id: `re_test_${crypto.randomUUID().slice(0, 8)}`,
    status: "succeeded",
    amount: args?.[0]?.amount ?? 0,
  });

  const nights = [await makeClaimedNight(28), await makeClaimedNight(29), await makeClaimedNight(30)];
  const piId = `pi_test_${crypto.randomUUID().slice(0, 8)}`;
  const bookingId = await makeStayBooking({
    nightSlotIds: nights,
    postFix: true,
    status: "confirmed",
    stripePaymentIntentId: piId,
  });

  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const result = await stripePaymentService.refundServiceBooking(bookingId, "test_refund");

  assert.equal((result as any).alreadyRefunded, undefined);
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "refunded");
  for (const n of nights) {
    assert.equal(await slotBookedCount(n), 0, `refund must release night ${n}, not just the first`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// P — updateServiceBookingStatus's owner-cancel release path releases ALL nights, the same way
// ═════════════════════════════════════════════════════════════════════════════════════════════
test("P: updateServiceBookingStatus's cancel release path releases ALL claimed nights, not just the first", async () => {
  const nights = [await makeClaimedNight(31), await makeClaimedNight(32), await makeClaimedNight(33)];
  const bookingId = await makeStayBooking({ nightSlotIds: nights, postFix: true, status: "confirmed" });

  // Mirrors the owner rail's cancel-a-confirmed-booking transition (server/routes.ts
  // OWNER_BOOKING_TRANSITIONS.cancelled includes "confirmed").
  const updated = await storage.updateServiceBookingStatus(bookingId, "cancelled", "test_cancel", ["confirmed"]);

  assert.ok(updated, "the atomic conditional must claim the row");
  assert.equal(updated!.status, "cancelled");
  for (const n of nights) {
    assert.equal(await slotBookedCount(n), 0, `owner-cancel must release night ${n}, not just the first`);
  }
});
