/**
 * THE PAYMENT PROMOTION — behavioural proof of the restored money-path redundancy
 * (legacy-reconciliation lane, tasks #212/#213; DECISIONS.md ruling 38 §15b, CLAUDE.md §15).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * `POST /api/checkout` leaves an AUTHORIZED claim (`service_bookings.status='payment_pending'`
 * with the PaymentIntent id stamped). Something then has to move it to `confirmed` when the
 * traveler pays. Both documented reconciliation paths — `handlePaymentSucceeded` (the webhook)
 * and `POST /api/bookings/confirm-payment` (the client fallback) — queried the LEGACY `bookings`
 * table with `service_bookings` ids and matched NOTHING, which left the TTL sweep as the ONLY
 * recovery mechanism on the money path. Both now drive ONE shared promotion
 * (`promotePaidCheckout`), and these are its permanent assertions.
 *
 * N16 (journey-suite-negatives) guards the FAILURE side — a checkout that never obtains a
 * PaymentIntent commits nothing. These three guard the SUCCESS side.
 *
 *   N17  webhook-only recovery — the client dies after authorization; the webhook is the only
 *        surviving signal. Both variants: the PI was stamped, and the harder one where the
 *        server died mid-authorization so the PI was NEVER stamped and only Stripe's own
 *        metadata can resolve the booking. Booking ends CONFIRMED with a diary row whose
 *        actor is `webhook`. Also proven THROUGH `stripePaymentService.handlePaymentSucceeded`,
 *        so the wiring of #212 — not just the helper — is under test.
 *
 *   N18  double signal — the client confirm and the webhook both fire. EXACTLY ONE promotion
 *        and ONE diary row; the loser is an idempotent no-op, never a second flip. Proven in
 *        both orders (client-then-webhook and webhook-then-client) because a guard that only
 *        holds in one arrival order is not a guard.
 *
 *   N19  late webhook vs a VOIDED row — the TTL sweep already expired the claim. The row is
 *        NOT resurrected (void wins after TTL, ruling 38) and the signal lands in a
 *        RECONCILIATION-EXCEPTION state that is a DB FACT (`booking_details
 *        .reconciliationException` + a `checkout_reconcile_exception` diary row), never silent.
 *
 * Every assertion is a DATABASE FACT read back after the call — no mocking of the thing under
 * test. No Stripe network and no Stripe key: the promotion is pure DB logic, and the one place
 * a PaymentIntent object is needed (N17's webhook-caller proof) is a literal object shaped like
 * the delivery Stripe would sign.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/checkout-payment-promotion.db.test.ts
 */
// N17d imports the real stripe-payment.service, whose module graph constructs a Stripe client at
// load time and throws without a key. A DUMMY TEST-MODE key satisfies the constructor; nothing in
// this file makes a network call (the promotion is pure DB logic and the PaymentIntent object is
// a literal). Same technique as trip-commission-band-edit.http.test.ts. Never a live key.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_promotion_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CLAIM_EXPIRED_STATUS,
  promotePaidCheckout,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `promo-${RUN}-user`,
  service: `promo-${RUN}-svc`,
  trip: `promo-${RUN}-trip`,
};
const createdBookingIds: string[] = [];
const createdItemIds: string[] = [];

// ── Disposable-DB guard (identical posture to checkout-claim-sweep.db.test.ts) ───────────────
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
      `[checkout-payment-promotion] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`promo-${RUN}@t.test`}, 'Promo', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Promotion fixture service', '100.00')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Promotion fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdItemIds) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** A plan item routed to checkout — the state `/api/checkout` leaves it in before promotion. */
async function makeReadyItem(): Promise<string> {
  const id = `promo-${RUN}-item-${createdItemIds.length}`;
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status)
    VALUES (${id}, ${ids.trip}, 'Promotion fixture item', 1, 'ready_for_checkout')
  `);
  createdItemIds.push(id);
  return id;
}

/**
 * A booking exactly as the checkout spine leaves it. `paymentIntentId=null` reproduces the
 * server-died-mid-authorization window (claim written, Stripe called, PI never stamped).
 */
async function makeBooking(opts: {
  paymentIntentId: string | null;
  status?: string;
  itemId?: string | null;
  /** The per-row checkout claim key: bare on the first row, `#1`, `#2` … on the rest. */
  idempotencyKey?: string;
  /** Use a real UUID, as `POST /api/checkout` does. Needed wherever the LEGACY `bookings` rail
   *  (a uuid `id` column) also sees the id — a non-UUID would be a type error there, not a
   *  realistic no-op. */
  uuidId?: boolean;
}): Promise<string> {
  const id = opts.uuidId ? crypto.randomUUID() : `promo-${RUN}-bk-${createdBookingIds.length}`;
  const details = JSON.stringify(opts.itemId ? { itineraryItemId: opts.itemId } : {});
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, booking_details, idempotency_key, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${opts.status ?? "payment_pending"},
      '100.00', '25.00', ${opts.paymentIntentId}, ${details}::jsonb, ${opts.idempotencyKey ?? null}, NOW()
    )
  `);
  createdBookingIds.push(id);
  return id;
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, confirmed_at,
           booking_details->'reconciliationException' AS exception
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function diaryRows(eventType: string, itemId?: string | null): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT event_type, actor_type, actor_id, from_status, to_status, item_id
    FROM item_transition_log
    WHERE trip_id = ${ids.trip}
      AND event_type = ${eventType}
      ${itemId ? sql`AND item_id = ${itemId}` : sql``}
    ORDER BY created_at ASC
  `);
  return r.rows as any[];
}

async function itemStatus(itemId: string): Promise<{ routing_status: string; booking_id: string | null }> {
  const r = await db.execute(sql`
    SELECT routing_status, booking_id FROM itinerary_items WHERE id = ${itemId}
  `);
  return r.rows[0] as any;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N17 — WEBHOOK-ONLY RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N17a: client dies after authorization — the webhook alone promotes the booking to confirmed, diary actor=webhook", async () => {
  const pi = `pi_${RUN}_n17a`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: pi, itemId });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });

  assert.deepEqual(result.promoted, [bookingId], "the webhook must promote the abandoned claim");
  assert.equal(result.alreadyConfirmed.length, 0);
  assert.equal(result.exceptions.length, 0);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "DB FACT: the booking is purchasable, not stuck payment_pending");
  assert.equal(row.stripe_payment_intent_id, pi, "the PI stays stamped — a confirmed booking always has one");
  assert.ok(row.confirmed_at, "confirmed_at is stamped by the promotion");

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary.length, 1, "exactly one diary row for this promotion (rulings 12/16/18)");
  assert.equal(diary[0].actor_type, "webhook", "DB FACT: the actor is recorded as the webhook");
  assert.equal(diary[0].from_status, "payment_pending");
  assert.equal(diary[0].to_status, "confirmed");
});

test("N17b: server died MID-AUTHORIZATION (PI never stamped) — the webhook resolves the booking from Stripe's own metadata, stamps and promotes it", async () => {
  // The dangerous window: Stripe created the PaymentIntent and the server died before
  // stampAuthorization. The row carries NO PI id, so nothing keyed on stripe_payment_intent_id
  // can find it — only the PaymentIntent's own bookingIds metadata can, and only the webhook may
  // use it (a signature-verified delivery is Stripe's word, not a client's).
  const pi = `pi_${RUN}_n17b`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: null, itemId });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });

  assert.deepEqual(result.lateAuthorized, [bookingId], "the webhook stamped the never-stamped PI");
  assert.deepEqual(result.promoted, [bookingId]);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed");
  assert.equal(row.stripe_payment_intent_id, pi, "the PI is now stamped — the invariant 'no paid booking without a PI' holds");

  // The plan-side catch-up: this booking's item was never flipped (the authorization promote
  // never ran), and the promotion re-runs the idempotent flip so the trip tells the truth.
  const item = await itemStatus(itemId);
  assert.equal(item.routing_status, "purchased", "DB FACT: the plan item caught up to the purchase");
  assert.equal(item.booking_id, bookingId);
});

test("N17e: a multi-item checkout is recovered WHOLE even when Stripe's metadata truncated the id list", async () => {
  // Stripe caps a metadata value at 500 chars and createPaymentIntent truncates past 490, so a
  // large cart's tail is simply absent from `bookingIds`. Recovering only the head would leave a
  // PARTIALLY recovered checkout — the worst of both outcomes. The rows carry their own linkage
  // (bare key, `#1`, `#2` …), so one recovered row identifies the whole checkout.
  const pi = `pi_${RUN}_n17e`;
  const key = `promo-${RUN}-key-n17e`;
  const head = await makeBooking({ paymentIntentId: null, idempotencyKey: key });
  const tail1 = await makeBooking({ paymentIntentId: null, idempotencyKey: `${key}#1` });
  const tail2 = await makeBooking({ paymentIntentId: null, idempotencyKey: `${key}#2` });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [head], // ONLY the head survived truncation
  });

  assert.equal(result.promoted.length, 3, "all three rows of the checkout were recovered");
  for (const id of [head, tail1, tail2]) {
    const row = await bookingRow(id);
    assert.equal(row.status, "confirmed", `DB FACT: ${id} is confirmed, not left provisional`);
    assert.equal(row.stripe_payment_intent_id, pi);
  }
});

test("N17c: a CLIENT may not stamp a PaymentIntent onto an unstamped claim (webhook-only capability)", async () => {
  const pi = `pi_${RUN}_n17c`;
  const bookingId = await makeBooking({ paymentIntentId: null });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "client",
    actorId: ids.user,
    // A client's metadataBookingIds are ignored by construction; it also names the booking.
    metadataBookingIds: [bookingId],
    bookingIds: [bookingId],
  });

  assert.equal(result.promoted.length, 0, "no promotion from an unverifiable client-supplied PI");
  assert.equal(result.lateAuthorized.length, 0);
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "DB FACT: the claim is untouched");
  assert.equal(row.stripe_payment_intent_id, null, "DB FACT: no client-chosen PI was stamped");
});

test("N17d: the WIRING — stripePaymentService.handlePaymentSucceeded (task #212) drives the same promotion", async () => {
  // Proves the caller, not just the helper: this is the function ruling 38 recorded as inert for
  // cart checkout. It is invoked with a PaymentIntent object shaped exactly like the delivery
  // Stripe signs. No network: the legacy-`bookings` half of the handler simply matches nothing
  // for a service_bookings id, which is precisely the old behaviour that made it useless here.
  const pi = `pi_${RUN}_n17d`;
  const bookingId = await makeBooking({ paymentIntentId: pi, uuidId: true });

  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handlePaymentSucceeded({
    id: pi,
    object: "payment_intent",
    metadata: { userId: ids.user, bookingIds: bookingId, isDeposit: "false" },
  } as any);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "DB FACT: #212 now covers cart checkout end to end");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N18 — DOUBLE SIGNAL (exactly one promotion)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N18a: client confirm THEN webhook — exactly one promotion, one diary row, no double flip", async () => {
  const pi = `pi_${RUN}_n18a`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: pi, itemId });

  const first = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "client",
    actorId: ids.user,
    bookingIds: [bookingId],
  });
  const second = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });

  assert.deepEqual(first.promoted, [bookingId], "the client's confirmation promoted it");
  assert.deepEqual(second.promoted, [], "the webhook did NOT promote it a second time");
  assert.deepEqual(second.alreadyConfirmed, [bookingId], "the webhook reports an idempotent no-op");
  assert.equal(second.exceptions.length, 0, "an already-confirmed booking is not an exception");

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary.length, 1, "DB FACT: ONE diary row for two signals — the atomic WHERE is the guard");
  assert.equal(diary[0].actor_type, "traveler", "the winner's actor is recorded");
  assert.equal(diary[0].actor_id, ids.user);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed");
});

test("N18b: webhook THEN client confirm — same single-promotion outcome in the opposite order", async () => {
  const pi = `pi_${RUN}_n18b`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: pi, itemId });

  const first = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });
  const second = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "client",
    actorId: ids.user,
    bookingIds: [bookingId],
  });

  assert.deepEqual(first.promoted, [bookingId]);
  assert.deepEqual(second.promoted, []);
  assert.deepEqual(second.alreadyConfirmed, [bookingId]);

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary.length, 1, "DB FACT: still exactly ONE promotion");
  assert.equal(diary[0].actor_type, "webhook");
});

test("N18c: CONCURRENT signals — one promotion even when both race the same row", async () => {
  const pi = `pi_${RUN}_n18c`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: pi, itemId });

  const [a, b] = await Promise.all([
    promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] }),
    promotePaidCheckout({ paymentIntentId: pi, actor: "client", actorId: ids.user, bookingIds: [bookingId] }),
  ]);

  const promotions = a.promoted.length + b.promoted.length;
  assert.equal(promotions, 1, "exactly one of the two concurrent signals promoted the booking");

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary.length, 1, "DB FACT: one diary row under genuine concurrency");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N19 — LATE WEBHOOK vs a VOIDED ROW (exception, never resurrection)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N19a: a late webhook NEVER resurrects a TTL-voided claim — it lands in a reconciliation-exception state", async () => {
  const pi = `pi_${RUN}_n19a`;
  const itemId = await makeReadyItem();
  // The row as the TTL sweep leaves it: voided, with the PI it had been authorized against.
  const bookingId = await makeBooking({ paymentIntentId: pi, status: CLAIM_EXPIRED_STATUS, itemId });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });

  assert.deepEqual(result.promoted, [], "the void wins after TTL (ruling 38 §15b)");
  assert.equal(result.exceptions.length, 1, "the signal is captured as an exception, not dropped");
  assert.equal(result.exceptions[0].bookingId, bookingId);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, CLAIM_EXPIRED_STATUS, "DB FACT: the booking was NOT resurrected");
  assert.ok(row.exception, "DB FACT: the reconciliation exception is recorded on the row (ops-visible)");
  assert.equal(row.exception.paymentIntentId, pi);
  assert.equal(row.exception.actor, "webhook");
  assert.ok(row.exception.detectedAt, "the exception carries when it was detected");

  const diary = await diaryRows("checkout_reconcile_exception", itemId);
  assert.equal(diary.length, 1, "DB FACT: the exception is also in the diary — never silent");
  assert.equal(diary[0].actor_type, "webhook");

  // And the plan is not touched: an expired claim never bought anything.
  const item = await itemStatus(itemId);
  assert.equal(item.routing_status, "ready_for_checkout", "DB FACT: no purchase was claimed on the plan");
});

test("N19b: the exception surfaces in the ops query the admin endpoint runs", async () => {
  // The admin surface is GET /api/admin/bookings/reconciliation-exceptions; this asserts the
  // DB predicate it uses actually finds the row N19a produced — an exception nobody can see is
  // the same as a silent one.
  const r = await db.execute(sql`
    SELECT id FROM service_bookings
    WHERE booking_details ? 'reconciliationException'
      AND traveler_id = ${ids.user}
  `);
  assert.ok(r.rows.length >= 1, "DB FACT: the ops query returns the exception row");
});

test("N19c: a late signal for a booking stamped with a DIFFERENT PaymentIntent is an exception, not a promotion", async () => {
  const bookingId = await makeBooking({ paymentIntentId: `pi_${RUN}_n19c_real` });

  const result = await promotePaidCheckout({
    paymentIntentId: `pi_${RUN}_n19c_other`,
    actor: "webhook",
    metadataBookingIds: [bookingId],
  });

  assert.equal(result.promoted.length, 0);
  assert.equal(result.exceptions[0]?.reason, "payment_intent_mismatch");
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "DB FACT: a foreign PI cannot confirm this booking");
});
