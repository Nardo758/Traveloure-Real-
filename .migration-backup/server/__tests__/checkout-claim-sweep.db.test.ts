/**
 * CHECKOUT CLAIM TTL SWEEP — behavioural proof (DECISIONS.md ruling 38).
 *
 * The sweep reclaims checkout claims that never reached an authorization. It is the mechanism
 * that replaces compensating rollback (explicitly rejected: rollback code runs in exactly the
 * conditions that broke the operation), so its three safety properties are not optional and are
 * each proven here against real rows in a real database:
 *
 *   A. IDEMPOTENT       — a second pass over the same rows changes nothing and, critically,
 *                         cannot release the same slot's capacity twice.
 *   B. RACE-SAFE        — a promote and a void can never BOTH win. Proven in both directions:
 *                         authorization-first ⇒ the sweep skips the row; void-first ⇒
 *                         `stampAuthorization` refuses (so the handler returns a retry error
 *                         instead of a clientSecret for a voided booking).
 *   C. NEVER VOIDS A PAID BOOKING — the dangerous window is "Stripe created the PaymentIntent,
 *                         then the server died before stamping it". All three Layer-2 branches
 *                         are proven: PI found ⇒ PROMOTED (never voided); Stripe unreachable ⇒
 *                         QUARANTINED (never voided); Stripe answers "none" ⇒ voided.
 *                         Layer 1 (the pre-flight `stripeAttemptAt` marker) is proven too: an
 *                         unmarked row is voided with NO Stripe consultation at all, which is
 *                         what makes the common failure path correct with no network.
 *
 *   D. AUDITABLE        — every void writes its `checkout_claim_expired` diary row in the SAME
 *                         transaction (rulings 12/16/18), so reclaimed inventory is traceable
 *                         rather than silently reappearing.
 *
 * The Stripe half is injected (`stripeIntentLookup`), so all three of C's branches are exercised
 * deterministically with no network and no Stripe key — the sweep's decision logic IS the thing
 * under test, and a test that could only run with live Stripe would not be permanent.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/checkout-claim-sweep.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CLAIM_EXPIRED_STATUS,
  STRIPE_ATTEMPT_AT_KEY,
  stampAuthorization,
  sweepExpiredCheckoutClaims,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `sweep-${RUN}-user`,
  service: `sweep-${RUN}-svc`,
  trip: `sweep-${RUN}-trip`,
};
const createdSlotIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors the journey suite's; never defaults open) ───────────────────
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
      `[checkout-claim-sweep] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

/** Minimal fixture chain: user → provider_service → trip → availability slot. */
before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`sweep-${RUN}@t.test`}, 'Sweep', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Sweep fixture service', '100.00')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Sweep fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  // Fixtures cascade from the user delete (provider_services, slots, trips, bookings all
  // reference it), but the explicit deletes keep the intent obvious and survive FK changes.
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

/** A claimed slot: capacity 1, already booked by the claim under test. */
async function makeClaimedSlot(): Promise<string> {
  const id = `sweep-${RUN}-slot-${createdSlotIds.length}`;
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES (${id}, ${ids.service}, ${ids.user}, CURRENT_DATE + 20, 1, 1, 'fully_booked')
  `);
  createdSlotIds.push(id);
  return id;
}

/**
 * A provisional claim exactly as `POST /api/checkout` step 1 leaves it: payment_pending, NO
 * PaymentIntent id, aged past the TTL. `marked` controls the Layer-1 pre-flight marker.
 */
async function makeProvisionalClaim(opts: {
  marked: boolean;
  slotId?: string | null;
  ageMinutes?: number;
  withTrip?: boolean;
}): Promise<string> {
  const id = `sweep-${RUN}-bk-${createdBookingIds.length}`;
  const details: Record<string, unknown> = {};
  if (opts.marked) details[STRIPE_ATTEMPT_AT_KEY] = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount,
       platform_fee, provider_earnings, status, slot_id, idempotency_key, created_at)
    VALUES
      (${id}, ${ids.service}, ${ids.user}, ${ids.user},
       ${opts.withTrip === false ? null : ids.trip},
       ${JSON.stringify(details)}::jsonb, '100.00', '25.00', '75.00',
       'payment_pending', ${opts.slotId ?? null}, ${`key-${id}`},
       NOW() - (${String(opts.ageMinutes ?? 60)} || ' minutes')::interval)
  `);
  createdBookingIds.push(id);
  return id;
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, cancellation_reason FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function slotBookedCount(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${id}`);
  return Number((r.rows[0] as any)?.booked_count ?? -1);
}

/** Lookup that must never be consulted — asserts the Layer-1 no-network path. */
const lookupMustNotBeCalled = async (): Promise<string | null> => {
  throw new Error("STRIPE_LOOKUP_WAS_CALLED");
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("A + D: an unmarked claim past TTL is voided with NO Stripe call, its slot is released, and the void writes exactly one diary row", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: false, slotId });
  assert.equal(await slotBookedCount(slotId), 1, "precondition: the claim holds the slot");
  // Diary rows are trip-scoped and this file shares one fixture trip across its tests; start
  // from a known-empty diary so "exactly one" below is a real assertion, not an ordering accident.
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`);

  let called = false;
  const res = await sweepExpiredCheckoutClaims({
    onlyBookingIds: [bookingId],
    stripeIntentLookup: async () => {
      called = true;
      return null;
    },
  });

  assert.equal(called, false, "LAYER 1: an unmarked claim provably never reached Stripe — the sweep must not consult Stripe at all");
  assert.ok(res.voidedUnreached >= 1, "the unmarked claim must be voided");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, CLAIM_EXPIRED_STATUS, "the claim is expired");
  assert.equal(row.stripe_payment_intent_id, null, "an expired claim never gains a PaymentIntent");
  assert.equal(row.cancellation_reason, "checkout_claim_expired:never_attempted");
  assert.equal(await slotBookedCount(slotId), 0, "slot capacity is handed back");

  // D: auditable — exactly one diary row for this void (rulings 12/16/18).
  const diary = await db.execute(sql`
    SELECT event_type, item_id, from_status, to_status, actor_type
    FROM item_transition_log WHERE trip_id = ${ids.trip} AND event_type = 'checkout_claim_expired'
  `);
  assert.equal(diary.rows.length, 1, "the void must write exactly one checkout_claim_expired diary row");
  const d = diary.rows[0] as any;
  assert.equal(d.actor_type, "system");
  assert.equal(d.from_status, null, "no routing_status moved — the purchased flip lives after authorization");
  assert.equal(d.to_status, null);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("A: the sweep is IDEMPOTENT — a second pass voids nothing more and cannot double-release the slot", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: false, slotId });

  const first = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.ok(first.voidedUnreached >= 1);
  assert.equal(await slotBookedCount(slotId), 0, "first pass releases the slot");

  const second = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.equal(second.voidedUnreached, 0, "a second pass finds nothing to void (status is no longer payment_pending)");
  assert.equal(second.slotsReleased, 0, "and releases no capacity");
  assert.equal(await slotBookedCount(slotId), 0, "booked_count must NOT go negative or shift on the second pass");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("B: RACE — a late authorization that stamps FIRST makes the void a no-op (the sweep cannot void an authorized row)", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: false, slotId });

  // The authorization wins the race.
  const stamped = await stampAuthorization([bookingId], "pi_race_winner");
  assert.equal(stamped, true, "the authorization claims the provisional row");

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.equal(res.voidedUnreached, 0, "the row is no longer provisional — the sweep's conditional WHERE matches 0 rows");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "the authorized booking is untouched");
  assert.equal(row.stripe_payment_intent_id, "pi_race_winner");
  assert.equal(await slotBookedCount(slotId), 1, "an authorized booking KEEPS its slot capacity");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("B: RACE — a void that lands FIRST makes the authorization stamp refuse (no clientSecret for a voided booking)", async () => {
  const bookingId = await makeProvisionalClaim({ marked: false });

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.ok(res.voidedUnreached >= 1);
  assert.equal((await bookingRow(bookingId)).status, CLAIM_EXPIRED_STATUS);

  // The handler's AUTHORIZE→PROMOTE gate must now refuse — this is what turns the race into a
  // truthful 409 instead of a payment sheet against a booking that no longer exists.
  const stamped = await stampAuthorization([bookingId], "pi_race_loser");
  assert.equal(stamped, false, "stampAuthorization must refuse a row the sweep already voided");
  const row = await bookingRow(bookingId);
  assert.equal(row.stripe_payment_intent_id, null, "and must leave NO PaymentIntent stamped on the voided row");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("B: the authorization stamp is ALL-OR-NOTHING across a multi-item checkout", async () => {
  const okId = await makeProvisionalClaim({ marked: false });
  const voidedId = await makeProvisionalClaim({ marked: false });
  // Void only the second row, simulating a partially-reclaimed multi-item claim.
  await db.execute(sql`
    UPDATE service_bookings SET status = ${CLAIM_EXPIRED_STATUS} WHERE id = ${voidedId}
  `);

  const stamped = await stampAuthorization([okId, voidedId], "pi_partial");
  assert.equal(stamped, false, "a partial claim must fail the whole stamp");
  assert.equal(
    (await bookingRow(okId)).stripe_payment_intent_id,
    null,
    "the transaction must roll back — no row may be left half-stamped",
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("C: PAID-PI PROTECTION — a marked claim whose PaymentIntent Stripe HOLDS is PROMOTED, never voided", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: true, slotId });

  // The dangerous window: Stripe created the PI, the server died before stamping it.
  const res = await sweepExpiredCheckoutClaims({
    onlyBookingIds: [bookingId],
    stripeIntentLookup: async () => "pi_really_exists",
  });

  assert.equal(res.promoted, 1, "the claim must be promoted");
  assert.equal(res.voidedReconciled, 0, "and MUST NOT be voided");
  assert.equal(res.voidedUnreached, 0);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "a recovered booking stays payable, not expired");
  assert.equal(row.stripe_payment_intent_id, "pi_really_exists", "the PI id is stamped so the webhook can confirm it");
  assert.equal(await slotBookedCount(slotId), 1, "a paid booking KEEPS its slot");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("C: PAID-PI PROTECTION — a marked claim is QUARANTINED (never voided) when Stripe cannot be consulted", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: true, slotId });

  const res = await sweepExpiredCheckoutClaims({
    onlyBookingIds: [bookingId],
    stripeIntentLookup: async () => {
      throw new Error("Stripe unreachable");
    },
  });

  assert.equal(res.quarantined, 1, "an unknown must quarantine");
  assert.equal(res.voidedReconciled + res.voidedUnreached, 0, "an unknown must NEVER void");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "the row is left exactly as found");
  assert.equal(row.stripe_payment_intent_id, null);
  assert.equal(await slotBookedCount(slotId), 1, "and keeps its slot until the question is answered");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("C: a marked claim Stripe answers 'no such PaymentIntent' for IS voided (reconciled, not guessed)", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: true, slotId });

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: async () => null });

  assert.equal(res.voidedReconciled, 1, "a definitive 'none' from Stripe permits the void");
  const row = await bookingRow(bookingId);
  assert.equal(row.status, CLAIM_EXPIRED_STATUS);
  assert.equal(row.cancellation_reason, "checkout_claim_expired:stripe_has_no_intent");
  assert.equal(await slotBookedCount(slotId), 0, "capacity is reclaimed");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test("TTL: a claim younger than the TTL is not a candidate at all", async () => {
  const slotId = await makeClaimedSlot();
  const bookingId = await makeProvisionalClaim({ marked: false, slotId, ageMinutes: 1 });

  const res = await sweepExpiredCheckoutClaims({ onlyBookingIds: [bookingId], stripeIntentLookup: lookupMustNotBeCalled });
  assert.equal(res.voidedUnreached, 0, "a 1-minute-old claim is inside the 30-minute TTL");
  assert.equal((await bookingRow(bookingId)).status, "payment_pending");
  assert.equal(await slotBookedCount(slotId), 1, "an in-flight checkout keeps its slot");
});
