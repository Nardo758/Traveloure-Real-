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
 *   N23  RULING 11 / RULING 12 (ledger `2026-09-08-rulings-11-12`, lane
 *        `2026-09-15-plan-work-one-rail`) — plan work sold as a listing GRANTS the seller write
 *        access to the plan at the AUTHORIZATION stamp, inside that stamp's own transaction, and a
 *        consult grants nothing. Every assertion is a `trip_expert_advisors` row read back from
 *        the database after `stampAuthorization`.
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
  stampAuthorization,
} from "../services/checkout-claim.service";
// N23 (ruling 11/12): the grant's own module, and the pure composer that builds the snapshot the
// grant classifies — never a hand-shaped blob, so the suite and the writer cannot drift (§18 rule 1).
import {
  isPlanWorkListing,
  PLAN_WORK_GRANT_STATUS,
} from "../services/plan-work-access.service";
import { composeOfferingContractSnapshot } from "../services/offering-contract-snapshot";
// N24/N25 (ledger `2026-09-20-plan-work-grant-concierge-exclusion`): the two named skips read
// back as DB facts, on the N23 fixture shapes — never a second harness for the same rail.
import {
  getPlatformConciergeUserId,
  invalidatePlatformConciergeCache,
} from "../services/platform-concierge.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `promo-${RUN}-user`,
  service: `promo-${RUN}-svc`,
  trip: `promo-${RUN}-trip`,
  // N23: the SELLER of the plan-work listing — a different person from the traveler, because the
  // advisor row this lane writes is exactly "this OTHER user may now write on your plan".
  expert: `promo-${RUN}-expert`,
  planWorkService: `promo-${RUN}-svc-plan`,
  consultService: `promo-${RUN}-svc-consult`,
  // N24: a REAL `booking_concierge` listing — coordination tier, so `impactClassFor` still reads
  // it as `plan_work`; the named skip is what stops the WRITE grant, not a reclassification.
  conciergeService: `promo-${RUN}-svc-concierge`,
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
  // ── N23 fixtures ───────────────────────────────────────────────────────────────────────────
  // Two REAL listings owned by a real expert, each naming a real `expert_offering_types` row:
  // `full_itinerary` is the `planning` tier ⇒ impact class `plan_work`; `ask_me_anything` is
  // `advisory` ⇒ `consult`. The classes are `impactClassFor`'s, never restated here.
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`promo-${RUN}-expert@t.test`}, 'Promo', 'Expert', 'expert')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, delivery_method, expert_offering_type_key)
    VALUES (${ids.planWorkService}, ${ids.expert}, 'Full itinerary build', '250.00', 'pdf', 'full_itinerary')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, delivery_method, expert_offering_type_key)
    VALUES (${ids.consultService}, ${ids.expert}, 'Ask me anything', '40.00', 'call', 'ask_me_anything')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, delivery_method, expert_offering_type_key)
    VALUES (${ids.conciergeService}, ${ids.expert}, 'Booking Concierge fixture', '499.00', 'in_person', 'booking_concierge')
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
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const svc of [ids.service, ids.planWorkService, ids.consultService, ids.conciergeService]) {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${svc}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.expert}`).catch(() => {});
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
  /** N23: the listing sold. Defaults to the plain fixture service (no offering key, no class). */
  serviceId?: string;
  /** N23: the SELLER, i.e. who a plan-work grant would name. Defaults to the traveler fixture. */
  providerId?: string;
  /** N23: `null` reproduces a booking that names no plan — ruling 11's precondition failing. */
  tripId?: string | null;
  /** N23: the committed `offering_contract_snapshot`. Absent ⇒ NULL = never snapshotted (§13). */
  snapshot?: unknown;
}): Promise<string> {
  const id = opts.uuidId ? crypto.randomUUID() : `promo-${RUN}-bk-${createdBookingIds.length}`;
  const details = JSON.stringify(opts.itemId ? { itineraryItemId: opts.itemId } : {});
  const tripId = opts.tripId === undefined ? ids.trip : opts.tripId;
  const snapshot = opts.snapshot === undefined ? null : JSON.stringify(opts.snapshot);
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, booking_details, idempotency_key, created_at,
      offering_contract_snapshot
    ) VALUES (
      ${id}, ${opts.serviceId ?? ids.service}, ${ids.user}, ${opts.providerId ?? ids.user}, ${tripId},
      ${opts.status ?? "payment_pending"},
      '100.00', '25.00', ${opts.paymentIntentId}, ${details}::jsonb, ${opts.idempotencyKey ?? null}, NOW(),
      ${snapshot}::jsonb
    )
  `);
  createdBookingIds.push(id);
  return id;
}

/**
 * The snapshot a checkout would have committed for one of the N23 fixture listings, built by the
 * PRODUCTION composer over the same listing facts `loadOfferingListingInput` reads off the row.
 * Hand-shaping the blob here would be a second statement of the snapshot's shape (§18 rule 1).
 */
function fixtureSnapshot(offeringTypeKey: string, deliveryMethod: string) {
  return composeOfferingContractSnapshot({
    listing: {
      kind: "listing",
      sellerClass: "expert",
      deliveryMethod,
      offeringTypeKey,
      categoryKey: null,
      bookingMode: "instant",
      ownerInstantBooking: true,
      priceType: null,
      productShape: null,
      depositEnabled: null,
      hasMeetingPoint: false,
    },
    cancellationPolicyType: null,
  });
}

/** Every advisor row on the fixture trip for one expert. The DB FACT every N23 assertion reads. */
async function advisorRows(expertUserId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, status, message FROM trip_expert_advisors
    WHERE trip_id = ${ids.trip} AND local_expert_id = ${expertUserId}
  `);
  return r.rows as any[];
}

/** Advisor rows for ANY expert on the fixture trip — used to prove a consult grants NOBODY. */
async function allAdvisorRows(): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT local_expert_id, status FROM trip_expert_advisors WHERE trip_id = ${ids.trip}
  `);
  return r.rows as any[];
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N23 — RULING 11 (plan work grants access at checkout) and RULING 12 (a consult
// grants nothing). Ledger `2026-09-08-rulings-11-12`; lane `2026-09-15-plan-work-one-rail`.
//
// The write lives at the AUTHORIZATION stamp, inside that stamp's own transaction, and goes
// through the ONE author of `trip_expert_advisors` (`upsertTripAdvisorRow`, LD 32). These
// assertions are all DB facts read back from that table — never the return value of the grant.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Fixture hygiene: N23 shares one trip, so "exactly one row" must mean "this call made it". */
async function clearAdvisorRows(): Promise<void> {
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
}

test("N23a: RULING 11 — a plan-work booking, authorized, grants its seller WRITE access on the plan (exactly one row)", async () => {
  await clearAdvisorRows();
  const pi = `pi_${RUN}_n23a`;
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(await stampAuthorization([bookingId], pi), true, "the claim must be stampable");

  const rows = await advisorRows(ids.expert);
  assert.equal(rows.length, 1, "DB FACT: exactly one advisor row, written by the authorization");
  assert.equal(
    rows[0].status,
    PLAN_WORK_GRANT_STATUS,
    "the status is the §12 WRITE-access status this rail grants — read from the module, never spelled here",
  );
  assert.ok(
    (rows[0].message ?? "").length > 0,
    "the row records WHERE the access came from, so the workspace can say so",
  );
});

test("N23b: the grant is INSIDE the authorization transaction — a lost claim leaves NO advisor row", async () => {
  await clearAdvisorRows();
  const bookingId = await makeBooking({
    paymentIntentId: null,
    status: CLAIM_EXPIRED_STATUS, // the TTL sweep got there first
    serviceId: ids.planWorkService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(
    await stampAuthorization([bookingId], `pi_${RUN}_n23b`),
    false,
    "a voided claim cannot be authorized",
  );
  assert.deepEqual(
    await advisorRows(ids.expert),
    [],
    "DB FACT: the rolled-back authorization granted nothing — access is never sold by a booking that failed",
  );
});

test("N23c: a REPLAYED authorization is still exactly one row (the one author never downgrades, equal rank is a no-op)", async () => {
  await clearAdvisorRows();
  const pi = `pi_${RUN}_n23c`;
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(await stampAuthorization([bookingId], pi), true);
  // The late-stamp path inside `promotePaidCheckout` re-drives the SAME stamp for a row a signal
  // finds unstamped; here the row is already stamped, so the second call is the replay shape.
  await stampAuthorization([bookingId], pi);
  await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] });

  const rows = await advisorRows(ids.expert);
  assert.equal(rows.length, 1, "DB FACT: a replay re-asserts the same row, it never adds a second");
  assert.equal(rows[0].status, PLAN_WORK_GRANT_STATUS);
});

test("N23d: RULING 12 — a CONSULT booking grants NOBODY write access on the plan", async () => {
  await clearAdvisorRows();
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.consultService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("ask_me_anything", "call"),
  });

  assert.equal(await stampAuthorization([bookingId], `pi_${RUN}_n23d`), true);
  assert.deepEqual(
    await allAdvisorRows(),
    [],
    "DB FACT: buying advice is not gaining write access to a plan — no advisor row, for anyone",
  );
});

test("N23e: an existing ASSIGNED advisor is never downgraded by a plan-work purchase", async () => {
  await clearAdvisorRows();
  // `assigned` and `accepted` share rank 2 on LD 32's ladder, so the stored one must survive.
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, message)
    VALUES (${`promo-${RUN}-adv`}, ${ids.trip}, ${ids.expert}, 'assigned', 'Admin-confirmed routed lead')
  `);
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(await stampAuthorization([bookingId], `pi_${RUN}_n23e`), true);
  const rows = await advisorRows(ids.expert);
  assert.equal(rows.length, 1, "still one row — the upsert conflicts, it never inserts a twin");
  assert.equal(rows[0].status, "assigned", "DB FACT: the stored status is kept; a conflict never downgrades");
  assert.equal(rows[0].message, "Admin-confirmed routed lead", "an existing note is never clobbered");
});

test("N23f: a plan-work booking that names NO plan grants nothing, and says so rather than inventing one", async () => {
  await clearAdvisorRows();
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: ids.expert,
    tripId: null,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(
    await stampAuthorization([bookingId], `pi_${RUN}_n23f`),
    true,
    "the booking still authorizes — §15b: an ancillary effect may not break the operation that authorizes it",
  );
  assert.deepEqual(await allAdvisorRows(), [], "DB FACT: no trip, no row — and no trip is invented (§13)");
});

test("N23g: an UNSNAPSHOTTED booking grants nothing — the live listing is never re-resolved to fill the gap", async () => {
  await clearAdvisorRows();
  // Same plan-work LISTING, but the row carries no snapshot (a pre-migration-291 booking). §13:
  // NULL means "never snapshotted", which is a fact about our records, not about the listing.
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: ids.expert,
  });

  assert.equal(await stampAuthorization([bookingId], `pi_${RUN}_n23g`), true);
  assert.deepEqual(await allAdvisorRows(), []);
});

test("N23h: the CLAIM-step predicate classifies the live listings the checkout refusal reads", async () => {
  // `POST /api/checkout` refuses a plan-work line that names no plan BEFORE any Stripe call, using
  // this predicate over the LIVE listing (no snapshot exists yet at the claim). Proven here rather
  // than through the route because the route's refusal is one `if` over exactly this answer.
  assert.equal(await isPlanWorkListing(ids.planWorkService), true, "a planning-tier listing is plan work");
  assert.equal(await isPlanWorkListing(ids.consultService), false, "an advisory-tier listing is a consult");
  assert.equal(await isPlanWorkListing(ids.service), false, "a listing naming no catalog key has no class (§13)");
  assert.equal(await isPlanWorkListing(null), false, "no listing, no class");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// N24/N25 — ledger `2026-09-20-plan-work-grant-concierge-exclusion` (LD 51 addendum,
// decision-maker ruling 2026-09-20). `booking_concierge` is `plan_work` by `impactClassFor` (it
// sits in the coordination tier), but its plan access is READ, granted by the hand-off/claim rail
// — never WRITE at checkout; and the platform's own reserved concierge account is never an
// advisor at all. Both are DB facts read back exactly as N23's are: no advisor row, ever.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N24: a booking_concierge purchase authorizes but grants NO write access — READ comes from hand-off/claim, not checkout", async () => {
  await clearAdvisorRows();
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.conciergeService,
    providerId: ids.expert,
    snapshot: fixtureSnapshot("booking_concierge", "in_person"),
  });

  assert.equal(
    await stampAuthorization([bookingId], `pi_${RUN}_n24`),
    true,
    "the booking still authorizes — a skipped grant is not a failed checkout",
  );
  assert.deepEqual(
    await allAdvisorRows(),
    [],
    "DB FACT: no advisor row for the listing owner — the named skip, not a change to impact-class.ts",
  );
});

test("N25: a plan-work booking whose provider is the platform concierge account grants no row", async (t) => {
  invalidatePlatformConciergeCache();
  const platformUserId = await getPlatformConciergeUserId();
  if (!platformUserId) {
    t.skip("migration 313 has not seeded the platform concierge account on this database");
    return;
  }
  await clearAdvisorRows();
  // Reuses the ORDINARY plan-work listing (not booking_concierge) so this proves the SECOND named
  // skip independently of the first — the platform account is refused whichever listing it names.
  const bookingId = await makeBooking({
    paymentIntentId: null,
    serviceId: ids.planWorkService,
    providerId: platformUserId,
    snapshot: fixtureSnapshot("full_itinerary", "pdf"),
  });

  assert.equal(await stampAuthorization([bookingId], `pi_${RUN}_n25`), true);
  const rows = await db.execute(sql`
    SELECT local_expert_id, status FROM trip_expert_advisors
    WHERE trip_id = ${ids.trip} AND local_expert_id = ${platformUserId}
  `);
  assert.deepEqual(
    rows.rows,
    [],
    "DB FACT: the platform concierge account never becomes an advisor — a pool marker, never a person who agreed to write",
  );
});
