/**
 * RECONCILIATION DETECTION — behavioural proof that money/database disagreement is VISIBLE
 * (reconciliation-detection lane; DECISIONS.md ruling 40, CLAUDE.md §17).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * Recovery on the money path is three-layered (client confirm / webhook / TTL sweep, one shared
 * promotion — rulings 38/39). DETECTION was one-eyed: `server/jobs/stripeReconciliation.ts`
 * scanned ONLY the legacy `bookings` table, so cart-checkout charges — the primary checkout —
 * never appeared in the daily Stripe-vs-DB drift job. Nothing told anyone the two disagreed.
 *
 *   N20  DRIFT CLASSIFICATION — each cart-rail drift case is seeded as real rows and a real
 *        (injected) Stripe view, and must appear as a PERSISTED exception row carrying the
 *        CORRECT classification. Seven kinds, one test each. The legacy rail's two original
 *        checks are re-proven in the same pass, because "one job, both rails" is the claim.
 *
 *   N21  PI-SUCCEEDED / STILL-PROVISIONAL → recovered through the EXISTING shared promotion
 *        (`promotePaidCheckout`), NOT through repair code of the job's own: booking `confirmed`,
 *        a `checkout_payment_confirmed` diary row with `actor_type='reconciliation'`. This is
 *        the ONE narrow repair the job is permitted; everything else is detect-only, which N20's
 *        cases assert by leaving their seeded rows untouched.
 *
 *   N22  CLEAN STATE — zero exceptions AND a RECORDED run. Silence must be distinguishable from
 *        the job not having run; the old version wrote a stdout line and no durable trace, so
 *        "no drift today" and "the scheduler died three weeks ago" were the same picture.
 *
 *   N23  THE READY-MADE RAIL (punchlist V-3, ready-made-reconciliation-rail lane). The SAME
 *        failure one table over: `ready_made_purchases` appeared nowhere in the job, so a store
 *        purchase whose delivery never completed had no detector at all. Five kinds, each seeded
 *        as real rows against an injected Stripe view — plus the negatives that matter more than
 *        the positives: a healthy purchase raises nothing, a purchase inside the fulfilment grace
 *        raises nothing, a buyer-deleted clone raises nothing, a re-detected drift records no
 *        second row, and the three rails never indict each other's PaymentIntents. This rail has
 *        NO repair at all — not even the cart rail's one narrow exception — so every positive case
 *        re-reads its seeded row and asserts it was left exactly as found.
 *
 * Every assertion is a DATABASE FACT read back after the call. The Stripe half is INJECTED (the
 * `StripeReader` seam), so all nine classifications are exercised deterministically with no
 * network and no Stripe key — the job's decision logic IS the thing under test, and a suite that
 * could only run against live Stripe would not be permanent.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 *   N25  THE INTERRUPTED FULFILMENT (punchlist V-3b, ledger 2026-09-12-readymade-earning-retry).
 *        N24 closed the hole BEFORE the purchase row; this closes the one AFTER it. A process
 *        dying between the atomic `paid → cloned` claim and the author-credit INSERT left a
 *        DELIVERED purchase with no earning and no way back, because every later fulfil returned
 *        at `status === 'cloned'`. Migration 294's partial unique index makes the credit safe to
 *        retry and the fulfilment now ENSURES the money leg — §15c's "money leg only", one table
 *        over. N25a is the lane's own negative and fails on the pre-fix code.
 *
 *   N24  THE RECOVERY PATH (ledger 2026-09-12-readymade-recovery-path). N23 reported the hole this
 *        rail had — the purchase row was written ONLY by the buyer's own browser, because the
 *        `payment_intent.succeeded` webhook keys on `metadata.bookingIds` a ready-made PaymentIntent
 *        never carries — and deliberately did not fill it (§17: a detector that fulfils is a fourth
 *        unreviewed writer). The fill is on the WEBHOOK, driving the SAME
 *        `recordAndFulfilReadyMadePurchase` the confirm route drives. N24 proves the four
 *        exactly-once facts and, more importantly, the refusals: a client-supplied PaymentIntent
 *        fulfils nothing, two deliveries make one clone and one earning, a delivery racing the
 *        buyer's own confirm makes one of each, an unresolvable PaymentIntent creates NOTHING, and
 *        a PaymentIntent that did not succeed fulfils nothing. The JOB is unchanged and still only
 *        detects.
 *
 * Run solo: npx tsx --test server/__tests__/reconciliation-detection.db.test.ts
 */
// N24 imports the real stripe-payment.service (to prove the WIRING, not just the helper), whose
// module graph constructs a Stripe client at load time and throws without a key. A DUMMY TEST-MODE
// key satisfies the constructor; nothing in this file makes a network call — every PaymentIntent is
// a literal and the Stripe reader is injected. Same technique as checkout-payment-promotion.
// N22b deletes and restores this variable itself, so setting it here does not weaken that case.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_reconciliation_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runStripeReconciliation, type StripeReader } from "../jobs/stripeReconciliation";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `recon-${RUN}-user`,
  service: `recon-${RUN}-svc`,
  trip: `recon-${RUN}-trip`,
  // The ready-made rail needs a listing, and a listing needs its own source trip — `ready_made_trips`
  // carries a UNIQUE index on `source_trip_id` (one listing per source trip).
  rmSourceTrip: `recon-${RUN}-rm-src`,
  listing: `recon-${RUN}-listing`,
};
const createdBookingIds: string[] = [];
const createdPurchaseIds: string[] = [];
const createdBuyerIds: string[] = [];
const createdItemIds: string[] = [];
const createdRefundIds: string[] = [];
const dedupeKeys: string[] = [];
/** Clone trips minted by N24's REAL fulfilment runs (the detector never mints one). */
const createdCloneTripIds: string[] = [];

// ── Disposable-DB guard (identical posture to checkout-claim-sweep.db.test.ts) ────────────────
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
      `[reconciliation-detection] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`recon-${RUN}@t.test`}, 'Recon', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Reconciliation fixture service', '100.00')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Reconciliation fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.rmSourceTrip}, ${ids.user}, 'Ready-made source trip', 'Kyoto', CURRENT_DATE + 60, CURRENT_DATE + 64)
  `);
  await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status)
    VALUES (${ids.listing}, ${ids.user}, ${ids.rmSourceTrip}, 'Kyoto', 'Reconciliation fixture listing', 5, 12500, 'approved')
  `);
});

after(async () => {
  for (const k of dedupeKeys) {
    await db.execute(sql`DELETE FROM reconciliation_exceptions WHERE dedupe_key LIKE ${k}`).catch(() => {});
  }
  // N24's recovery cases run the REAL fulfilment, which mints a clone trip and writes an earning
  // and a platform-revenue row. Those are cleaned FIRST: the clone trips must go before their
  // buyers (below), and the ledger rows reference purchase ids that are deleted a few lines down.
  for (const id of createdPurchaseIds) {
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
  }
  for (const id of createdCloneTripIds) {
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdRefundIds) {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_refund_id = ${id}`).catch(() => {});
  }
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdPurchaseIds) {
    // N27's hand-off runs the REAL shared sender, which writes a bell row and enqueues an email.
    // Both are keyed on the purchase and are cleaned before the purchase and its buyer go.
    await db
      .execute(sql`DELETE FROM notifications WHERE dedupe_key = ${`ready_made_purchase:${id}:delivered`}`)
      .catch(() => {});
    await db
      .execute(sql`DELETE FROM email_outbox WHERE metadata->>'purchaseId' = ${id}`)
      .catch(() => {});
    await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`).catch(() => {});
  for (const id of createdBuyerIds) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdItemIds) {
    await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.rmSourceTrip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
  // Runs this suite opened are cleaned last (exceptions FK-cascade off them anyway).
  await db
    .execute(sql`DELETE FROM reconciliation_runs WHERE triggered_by = 'test' AND note IS NOT DISTINCT FROM note AND id IN (
      SELECT id FROM reconciliation_runs WHERE triggered_by = 'test'
    )`)
    .catch(() => {});
});

// ── Fixture builders ─────────────────────────────────────────────────────────────────────────

/** A booking exactly as the checkout spine leaves it. `total_amount` is the item price and
 *  `platform_fee` the platform's share of THAT price — their SUM is what Stripe was asked to
 *  capture, which is why the amount check derives the expected total from these two columns and
 *  never from a rate literal (§8/§14). */
async function makeBooking(opts: {
  paymentIntentId: string | null;
  status?: string;
  totalAmount?: string;
  platformFee?: string;
  itemId?: string | null;
  idempotencyKey?: string;
  /**
   * D-11 (ledger `2026-09-15-d11-no-item-booking-exception`). Every row this builder writes NAMES
   * `ids.trip`, and LD 39 says a plan's contents live in `itinerary_items` with
   * `itinerary_items.booking_id` (migration 159) as the item→booking link — so a booking on a trip
   * with NO item pointing at it is itself a drift kind now. The DEFAULT is therefore the realistic
   * shape of a cart-checkout row: a linked plan item, written here the way `markItemPurchased`
   * writes it at promote. `false` is the fixture knob for the stray, and `noItemReason` is the
   * knob for a ratified exception class.
   */
  withPlanItem?: boolean;
  noItemReason?: string;
}): Promise<string> {
  const id = `recon-${RUN}-bk-${createdBookingIds.length}`;
  const details = JSON.stringify({
    ...(opts.itemId ? { itineraryItemId: opts.itemId } : {}),
    ...(opts.noItemReason ? { noItemReason: opts.noItemReason } : {}),
  });
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, booking_details, idempotency_key, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${opts.status ?? "payment_pending"},
      ${opts.totalAmount ?? "100.00"}, ${opts.platformFee ?? "25.00"}, ${opts.paymentIntentId},
      ${details}::jsonb, ${opts.idempotencyKey ?? null}, NOW()
    )
  `);
  createdBookingIds.push(id);
  if (opts.withPlanItem ?? true) await makeLinkedItem(id);
  return id;
}

/** The plan row a purchase leaves behind: `booking_id` stamped and `routing_status='purchased'`,
 *  exactly what `markItemPurchased` writes when a checkout promotes (item-routing.service.ts). */
async function makeLinkedItem(bookingId: string): Promise<string> {
  const id = `recon-${RUN}-linked-${createdItemIds.length}`;
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status, booking_id)
    VALUES (${id}, ${ids.trip}, 'Reconciliation linked item', 1, 'purchased', ${bookingId})
  `);
  createdItemIds.push(id);
  return id;
}

async function makeReadyItem(): Promise<string> {
  const id = `recon-${RUN}-item-${createdItemIds.length}`;
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, day_number, routing_status)
    VALUES (${id}, ${ids.trip}, 'Reconciliation fixture item', 1, 'ready_for_checkout')
  `);
  createdItemIds.push(id);
  return id;
}

/**
 * A ready-made purchase exactly as `POST /api/ready-made/:id/purchase/confirm` leaves it: born
 * `paid` (the row is inserted only AFTER Stripe says succeeded), carrying a NOT-NULL, UNIQUE
 * PaymentIntent id. Each purchase gets its OWN buyer because `idx_rmp_buyer_trip_active` is a
 * partial UNIQUE on (buyer_id, ready_made_trip_id) for live statuses — one live purchase of a
 * listing per buyer.
 */
async function makePurchase(opts: {
  paymentIntentId: string;
  status?: string;
  cloneTripId?: string | null;
  pricePaidCents?: number;
  /** How long ago the purchase was captured — the fulfilment-grace fixture knob. */
  ageMinutes?: number;
}): Promise<string> {
  const buyerId = `recon-${RUN}-buyer-${createdPurchaseIds.length}`;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${buyerId}, ${`recon-${RUN}-b${createdPurchaseIds.length}@t.test`}, 'Recon', 'Buyer')
  `);
  createdBuyerIds.push(buyerId);

  const id = `recon-${RUN}-rmp-${createdPurchaseIds.length}`;
  const ageMinutes = opts.ageMinutes ?? 120;
  await db.execute(sql`
    INSERT INTO ready_made_purchases (
      id, buyer_id, ready_made_trip_id, price_paid_cents, currency,
      stripe_payment_intent_id, clone_trip_id, status, purchased_at
    ) VALUES (
      ${id}, ${buyerId}, ${ids.listing}, ${opts.pricePaidCents ?? 12500}, 'USD',
      ${opts.paymentIntentId}, ${opts.cloneTripId ?? null}, ${opts.status ?? "paid"},
      NOW() - make_interval(mins => ${ageMinutes})
    )
  `);
  createdPurchaseIds.push(id);
  return id;
}

/** A PaymentIntent shaped exactly as `POST /api/ready-made/:id/purchase` writes it: the metadata
 *  `type`/`listingId`/`buyerId` triple, and deliberately NO `bookingIds` — which is what keeps the
 *  three rails from judging each other's payments. */
function rmPi(opts: { id: string; status?: string; amountDollars?: number }): any {
  const cents = Math.round((opts.amountDollars ?? 125) * 100);
  return {
    id: opts.id,
    object: "payment_intent",
    status: opts.status ?? "succeeded",
    amount: cents,
    amount_received: opts.status === "succeeded" || !opts.status ? cents : 0,
    currency: "usd",
    latest_charge: `ch_${opts.id}`,
    created: Math.floor(Date.now() / 1000),
    metadata: { type: "ready_made_purchase", listingId: ids.listing, buyerId: `recon-${RUN}-buyer` },
  };
}

/** A PaymentIntent shaped exactly as `createPaymentIntent` writes it (cents + `bookingIds`). */
function pi(opts: {
  id: string;
  status?: string;
  amountDollars?: number;
  bookingIds?: string[];
  /** The legacy rail's SINGULAR metadata key — a legacy PI must not be indicted by the cart rail. */
  legacyBookingId?: string;
}): any {
  const cents = Math.round((opts.amountDollars ?? 125) * 100);
  return {
    id: opts.id,
    object: "payment_intent",
    status: opts.status ?? "succeeded",
    amount: cents,
    amount_received: opts.status === "succeeded" || !opts.status ? cents : 0,
    currency: "usd",
    latest_charge: `ch_${opts.id}`,
    created: Math.floor(Date.now() / 1000),
    metadata: {
      ...(opts.bookingIds ? { bookingIds: opts.bookingIds.join(",") } : {}),
      ...(opts.legacyBookingId ? { bookingId: opts.legacyBookingId } : {}),
    },
  };
}

function reader(view: {
  paymentIntents?: any[];
  charges?: any[];
  refunds?: any[];
}): StripeReader {
  return {
    listPaymentIntents: async () => (view.paymentIntents ?? []) as any,
    listCharges: async () => (view.charges ?? []) as any,
    listRefunds: async () => (view.refunds ?? []) as any,
    // Ledger `2026-09-21-membership-reconciliation` added a fourth rail to the SAME injectable
    // seam. This suite predates it and asserts nothing about memberships, so it lists NO
    // subscriptions — the membership rail then scans zero and changes none of these counts.
    listSubscriptions: async () => [],
  };
}

// ── Readback helpers (every assertion is a DB fact) ───────────────────────────────────────────

async function exceptionsForRun(runId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT rail, kind, severity, dedupe_key, booking_id, payment_intent_id,
           expected_amount, actual_amount, details
    FROM reconciliation_exceptions
    WHERE run_id = ${runId}
    ORDER BY kind ASC
  `);
  return r.rows as any[];
}

async function runRow(runId: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, triggered_by, started_at, finished_at, exceptions_detected, exceptions_new,
           promoted, scanned_payment_intents, scanned_cart_bookings, note
    FROM reconciliation_runs WHERE id = ${runId}
  `);
  return r.rows[0] as any;
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, confirmed_at FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function purchaseRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, clone_trip_id, stripe_payment_intent_id, price_paid_cents
    FROM ready_made_purchases WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function diaryRows(eventType: string, itemId?: string | null): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT event_type, actor_type, from_status, to_status, item_id
    FROM item_transition_log
    WHERE trip_id = ${ids.trip} AND event_type = ${eventType}
      ${itemId ? sql`AND item_id = ${itemId}` : sql``}
    ORDER BY created_at ASC
  `);
  return r.rows as any[];
}

/** Scope every pass to the ids it seeded, so a neighbouring row in the same database can never
 *  change a per-pass count (the sweep suite's `onlyBookingIds` discipline). */
async function scan(view: Parameters<typeof reader>[0], bookingIds: string[]) {
  dedupeKeys.push(`%${RUN}%`);
  return runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader(view),
    onlyBookingIds: bookingIds,
    // Every cart/legacy pass scopes the ready-made rail to NOTHING, so the third rail cannot
    // change a count those cases already assert.
    onlyPurchaseIds: [],
  });
}

/** The mirror of `scan` for the ready-made rail: the cart rail is scoped to nothing, so each N23
 *  case owns its pass exactly as the N20 cases own theirs. */
async function scanReadyMade(view: Parameters<typeof reader>[0], purchaseIds: string[]) {
  dedupeKeys.push(`%${RUN}%`);
  return runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader(view),
    onlyBookingIds: [],
    onlyPurchaseIds: purchaseIds,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N20 — DRIFT CLASSIFICATION (each case → a persisted row with the right kind)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N20a: a succeeded PaymentIntent with NO booking behind it is recorded as pi_succeeded_no_booking", async () => {
  // Money moved and the database has no record of it — the most serious classification here.
  const intent = pi({ id: `pi_${RUN}_n20a`, bookingIds: [`recon-${RUN}-ghost`] });

  const result = await scan({ paymentIntents: [intent] }, []);

  assert.ok(result.runId, "a run row was opened");
  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "pi_succeeded_no_booking");
  assert.ok(hit, "DB FACT: the drift is a persisted row, not a log line");
  assert.equal(hit.rail, "cart");
  assert.equal(hit.severity, "critical");
  assert.equal(hit.payment_intent_id, intent.id);
  assert.equal(Number(hit.actual_amount), 125, "the charged amount is recorded for the human who follows up");
});

test("N20b: a succeeded PaymentIntent whose booking is VOIDED is pi_succeeded_booking_voided — and the row is NOT resurrected", async () => {
  // Ruling 39: void wins after TTL. The detector's job is to make the money visible, never to
  // undo the void.
  const piId = `pi_${RUN}_n20b`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "expired" });
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "pi_succeeded_booking_voided");
  assert.ok(hit, "DB FACT: the voided-but-paid booking is recorded");
  assert.equal(hit.booking_id, bookingId);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "expired", "DB FACT: DETECT, DON'T REPAIR — the void stands");
});

test("N20c: a paid-equivalent booking with NO PaymentIntent is booking_confirmed_no_pi", async () => {
  const bookingId = await makeBooking({ paymentIntentId: null, status: "confirmed" });

  const result = await scan({ paymentIntents: [] }, [bookingId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "booking_confirmed_no_pi");
  assert.ok(hit, "DB FACT: a booking that claims payment with nothing to point at is recorded");
  assert.equal(hit.booking_id, bookingId);
  assert.equal(
    Number(hit.expected_amount),
    125,
    "the expected charge is SERVER-DERIVED from total_amount + platform_fee (§14), never from Stripe",
  );
});

test("N20d: a confirmed booking whose PaymentIntent is not succeeded is booking_confirmed_pi_not_succeeded", async () => {
  const piId = `pi_${RUN}_n20d`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const intent = pi({ id: piId, status: "requires_payment_method", bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "booking_confirmed_pi_not_succeeded");
  assert.ok(hit, "DB FACT: a confirmed booking behind an unpaid PaymentIntent is recorded");
  assert.equal(hit.details.paymentIntentStatus, "requires_payment_method");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "DB FACT: detect-only — the booking was not cancelled");
});

test("N20e: a charged amount that disagrees with the server-derived total is amount_mismatch", async () => {
  const piId = `pi_${RUN}_n20e`;
  // Rows total $100 + $25 = $125. Stripe captured $200.
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const intent = pi({ id: piId, amountDollars: 200, bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "amount_mismatch");
  assert.ok(hit, "DB FACT: the money disagreement is recorded");
  assert.equal(Number(hit.expected_amount), 125, "expected = SUM(total_amount + platform_fee) over the PI's rows");
  assert.equal(Number(hit.actual_amount), 200, "actual = what Stripe captured");
});

test("N20f: cent-level rounding is NOT drift — the tolerance is the checkout's own arithmetic, not a fudge", async () => {
  const piId = `pi_${RUN}_n20f`;
  // Two rows, each rounded to the cent; Stripe's total is one cent off the exact sum. That is
  // the arithmetic, not a discrepancy — a detector that cried wolf here would be ignored.
  const key = `recon-${RUN}-key-n20f`;
  const a = await makeBooking({ paymentIntentId: piId, status: "confirmed", totalAmount: "33.33", platformFee: "8.33", idempotencyKey: key });
  const b = await makeBooking({ paymentIntentId: piId, status: "confirmed", totalAmount: "33.33", platformFee: "8.33", idempotencyKey: `${key}#1` });
  const intent = pi({ id: piId, amountDollars: 83.33, bookingIds: [a, b] }); // exact sum is 83.32

  const result = await scan({ paymentIntents: [intent] }, [a, b]);

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "amount_mismatch").length,
    0,
    "DB FACT: a one-cent rounding difference across two rows is not reported as drift",
  );
});

test("N20g: a Stripe refund with no reversal in the database is refund_not_reversed", async () => {
  const piId = `pi_${RUN}_n20g`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const refundId = `re_${RUN}_n20g`;
  createdRefundIds.push(refundId);
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan(
    {
      paymentIntents: [intent],
      refunds: [{ id: refundId, payment_intent: piId, charge: `ch_${piId}`, amount: 12500, currency: "usd" }],
    },
    [bookingId],
  );

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "refund_not_reversed");
  assert.ok(hit, "DB FACT: money went back to the traveler and the ledger did not know — recorded");
  assert.equal(hit.details.stripeRefundId, refundId);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "DB FACT: detect-only — the job did not flip the booking to refunded");
});

test("N20h: a refund the `refunds` table already records is NOT drift", async () => {
  const piId = `pi_${RUN}_n20h`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const refundId = `re_${RUN}_n20h`;
  createdRefundIds.push(refundId);
  await db.execute(sql`
    INSERT INTO refunds (booking_id, stripe_refund_id, stripe_payment_intent_id, amount, currency, status)
    VALUES (${bookingId}, ${refundId}, ${piId}, '125.00', 'usd', 'succeeded')
  `);
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan(
    {
      paymentIntents: [intent],
      refunds: [{ id: refundId, payment_intent: piId, charge: `ch_${piId}`, amount: 12500, currency: "usd" }],
    },
    [bookingId],
  );

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "refund_not_reversed").length,
    0,
    "DB FACT: a reversal the ledger already carries is not reported",
  );
});

test("N20i: ONE JOB, BOTH RAILS — a legacy charge with no booking is still classified, and a legacy PaymentIntent is not indicted by the cart rail", async () => {
  // The legacy `bookings` rail is still live (CLAUDE.md §15c:
  // POST /api/bookings/process-cart — D-12 dated its no-new-writes switch and retired its two
  // client surfaces; the rows and this scan are untouched), so extending the scan must not
  // cost its two original checks — nor may the new cart rail report every legacy PI as "no
  // booking", which is what a naive extension would do.
  const legacyChargeId = `ch_${RUN}_legacy`;
  const legacyPi = pi({ id: `pi_${RUN}_legacy`, legacyBookingId: `${RUN}-legacy-ghost` });

  const result = await scan(
    {
      paymentIntents: [legacyPi],
      charges: [
        {
          id: legacyChargeId,
          status: "succeeded",
          amount: 5000,
          currency: "usd",
          payment_intent: legacyPi.id,
          metadata: { bookingId: `${RUN}-legacy-ghost` },
        },
      ],
    },
    [],
  );

  const rows = await exceptionsForRun(result.runId!);
  const legacyHit = rows.find((r) => r.kind === "stripe_charge_no_booking");
  assert.ok(legacyHit, "DB FACT: the legacy rail's original check still fires");
  assert.equal(legacyHit.rail, "legacy", "and is classified onto the legacy rail, not the cart one");
  assert.equal(
    rows.filter((r) => r.kind === "pi_succeeded_no_booking").length,
    0,
    "DB FACT: a legacy-owned PaymentIntent (singular `bookingId` metadata) is NOT reported as cart drift",
  );
});

test("N20j: APPEND-ONLY — the same drift on a second pass records no second row", async () => {
  const piId = `pi_${RUN}_n20j`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const intent = pi({ id: piId, amountDollars: 200, bookingIds: [bookingId] });

  const first = await scan({ paymentIntents: [intent] }, [bookingId]);
  const second = await scan({ paymentIntents: [intent] }, [bookingId]);

  assert.equal(first.newExceptions, 1, "the first pass records the drift");
  assert.equal(second.newExceptions, 0, "the second pass records NO duplicate (ON CONFLICT DO NOTHING)");
  assert.equal(second.exceptions.length, 1, "but it still DETECTS it — 'still drifting' stays visible");

  const secondRun = await runRow(second.runId!);
  assert.equal(Number(secondRun.exceptions_detected), 1, "DB FACT: the run row records detected…");
  assert.equal(Number(secondRun.exceptions_new), 0, "…separately from newly-recorded, without mutating a fact");

  const all = await db.execute(sql`
    SELECT count(*)::int AS n FROM reconciliation_exceptions
    WHERE payment_intent_id = ${piId} AND kind = 'amount_mismatch'
  `);
  assert.equal((all.rows[0] as any).n, 1, "DB FACT: exactly ONE row for a drift seen twice");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N21 — THE ONE NARROW REPAIR (shared promotion, actor=reconciliation)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N21a: PI succeeded / claim still provisional — recovered through the SHARED promotion, diary actor=reconciliation", async () => {
  const piId = `pi_${RUN}_n21a`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "payment_pending", itemId });
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  assert.equal(result.promoted, 1, "the scan recovered exactly one paid-but-unpromoted claim");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "DB FACT: the booking is purchasable, not stuck payment_pending");
  assert.ok(row.confirmed_at, "confirmed_at is stamped by the SHARED promotion, not by job-local code");

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary.length, 1, "exactly one diary row (rulings 12/16/18)");
  assert.equal(
    diary[0].actor_type,
    "reconciliation",
    "DB FACT: the actor is recorded as the drift scan — a promotion that arrived a day late is a " +
      "materially different fact from one that arrived on the webhook",
  );
  assert.equal(diary[0].from_status, "payment_pending");
  assert.equal(diary[0].to_status, "confirmed");

  const runRecord = await runRow(result.runId!);
  assert.equal(Number(runRecord.promoted), 1, "DB FACT: the run row records the recovery");
});

test("N21b: the mid-authorization window — a PI whose id was NEVER stamped is resolved from Stripe's own metadata and promoted", async () => {
  // The server died between `paymentIntents.create` and `stampAuthorization`, so nothing keyed on
  // stripe_payment_intent_id can find the row. Only the PaymentIntent's own bookingIds metadata
  // can — and this job reads that PI from the Stripe API with the platform's own key, which is
  // Stripe's word exactly as a signature-verified webhook delivery is (ruling 40 amending 39).
  const piId = `pi_${RUN}_n21b`;
  const itemId = await makeReadyItem();
  const bookingId = await makeBooking({ paymentIntentId: null, status: "payment_pending", itemId });
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  assert.equal(result.promoted, 1);
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed");
  assert.equal(row.stripe_payment_intent_id, piId, "DB FACT: the PI is now stamped — no paid booking without one");

  const diary = await diaryRows("checkout_payment_confirmed", itemId);
  assert.equal(diary[0].actor_type, "reconciliation");
});

test("N21c: when the shared promotion cannot take, the drift is RECORDED — never force-written by the job", async () => {
  // A provisional-looking claim carrying a DIFFERENT PaymentIntent. The shared promotion refuses
  // (payment_intent_mismatch), and the job's only remaining move is to record it.
  const piId = `pi_${RUN}_n21c`;
  const bookingId = await makeBooking({ paymentIntentId: `${piId}_other`, status: "payment_pending" });
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  assert.equal(result.promoted, 0, "nothing was promoted");
  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "pi_succeeded_claim_provisional");
  assert.ok(hit, "DB FACT: the unrecoverable case is recorded as an exception");
  assert.equal(hit.booking_id, bookingId);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "payment_pending", "DB FACT: the job did not force the flip");
  assert.equal(row.stripe_payment_intent_id, `${piId}_other`, "DB FACT: nor did it overwrite the stamped PI");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N22 — CLEAN STATE (zero exceptions AND a recorded run)
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N22a: a clean platform yields ZERO exceptions and a RECORDED run — silence is not the same as a dead job", async () => {
  const piId = `pi_${RUN}_n22a`;
  const bookingId = await makeBooking({ paymentIntentId: piId, status: "confirmed" });
  const intent = pi({ id: piId, bookingIds: [bookingId] }); // $125 = 100.00 + 25.00 — aligned

  const result = await scan({ paymentIntents: [intent] }, [bookingId]);

  assert.equal(result.exceptions.length, 0, "no drift detected");
  assert.equal(result.newExceptions, 0);
  assert.ok(result.runId, "and yet a run WAS recorded");

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(rows.length, 0, "DB FACT: zero exception rows");

  const record = await runRow(result.runId!);
  assert.equal(record.status, "completed", "DB FACT: the clean pass is durably recorded as completed");
  assert.ok(record.finished_at, "DB FACT: it has a finish timestamp — a stuck run would not");
  assert.equal(Number(record.exceptions_detected), 0);
  assert.equal(Number(record.scanned_payment_intents), 1, "DB FACT: what it actually looked at is recorded");
});

test("N22b: a pass that could not consult Stripe is recorded as SKIPPED, not silently absent", async () => {
  // No STRIPE_SECRET_KEY and no injected reader. The old job logged a line and returned; a
  // reader of the admin page could not tell that apart from a healthy quiet day.
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const result = await runStripeReconciliation({ triggeredBy: "test" });
    assert.equal(result.status, "skipped");
    assert.ok(result.runId, "a run row exists even though nothing was compared");
    const record = await runRow(result.runId!);
    assert.equal(record.status, "skipped", "DB FACT: 'we could not look' is a recorded state of its own");
    assert.ok(record.note, "DB FACT: and it says why");
  } finally {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N23 — THE READY-MADE RAIL (punchlist V-3)
//
// `ready_made_purchases` appeared nowhere in the job, so §17's founding failure repeated itself
// one table over: a ready-made PaymentIntent carries `metadata.type='ready_made_purchase'` and no
// `bookingIds`, its row is not a `service_bookings` row, and every cart-rail query therefore
// matched zero rows and errored on nothing. A Stripe success whose delivery never completed had
// NO detector at all.
//
// The negatives are the point. N23f proves a healthy purchase raises nothing; N23g proves the
// fulfilment grace keeps a purchase that is being delivered out of the report; N23h proves a
// re-detected drift records no second row; N23i proves the three rails do not indict each other's
// PaymentIntents; and every positive case re-reads its seeded row to prove DETECT-DON'T-REPAIR —
// this rail has NO repair at all, not even the cart rail's one narrow exception.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N23a: a succeeded ready-made PaymentIntent with NO purchase row is rm_pi_succeeded_no_purchase", async () => {
  // The live shape: the buyer's card was charged and nothing recorded it. When this case was
  // written, /purchase/confirm — the buyer's own browser call — was the ONLY writer of the row,
  // because the payment_intent.succeeded webhook keyed on metadata.bookingIds a ready-made PI never
  // carries. The webhook is now a second writer (N24), so a row missing here means the delivery
  // never arrived or the PaymentIntent is unresolvable. The DETECTION is unchanged either way.
  const intent = rmPi({ id: `pi_${RUN}_n23a`, amountDollars: 249 });

  const result = await scanReadyMade({ paymentIntents: [intent] }, []);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "rm_pi_succeeded_no_purchase");
  assert.ok(hit, "DB FACT: money with no purchase behind it is a persisted row, not a log line");
  assert.equal(hit.rail, "ready_made", "classified onto its own rail, not cart or legacy");
  assert.equal(hit.severity, "critical");
  assert.equal(hit.payment_intent_id, intent.id);
  assert.equal(Number(hit.actual_amount), 249, "the captured amount is recorded for the human who follows up");
  assert.equal(hit.details.metadataListingId, ids.listing, "and the server-written metadata that identifies it");

  assert.equal(
    rows.filter((r) => r.kind === "pi_succeeded_no_booking").length,
    0,
    "DB FACT: a ready-made PaymentIntent is NOT also reported as cart-rail drift",
  );
});

test("N23b: a purchase still `paid` with no clone is rm_purchase_paid_not_cloned — and is NOT fulfilled by the job", async () => {
  // V-3's named case: captured and never delivered. The buyer has no trip and the author has no
  // earning, and `fulfillReadyMadePurchase` is idempotent — which is exactly why the temptation to
  // call it has to be refused in writing (§17: the ready-made rail has no ratified recovery layer).
  const piId = `pi_${RUN}_n23b`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "paid", cloneTripId: null, ageMinutes: 120 });
  const intent = rmPi({ id: piId });

  const result = await scanReadyMade({ paymentIntents: [intent] }, [purchaseId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "rm_purchase_paid_not_cloned");
  assert.ok(hit, "DB FACT: paid-but-undelivered is recorded");
  assert.equal(hit.booking_id, purchaseId);
  assert.equal(
    Number(hit.expected_amount),
    125,
    "the amount is SERVER-DERIVED from the purchase row's own price_paid_cents (§14/§17 rule 3)",
  );

  const row = await purchaseRow(purchaseId);
  assert.equal(row.status, "paid", "DB FACT: DETECT, DON'T REPAIR — the job did not fulfil it");
  assert.equal(row.clone_trip_id, null, "DB FACT: and minted no clone trip");
  assert.equal(result.promoted, 0, "no repair of any kind was performed on this rail");
});

test("N23c: price_paid_cents that disagrees with the captured amount is rm_amount_mismatch", async () => {
  const piId = `pi_${RUN}_n23c`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "cloned", ageMinutes: 120 }); // row says $125
  const intent = rmPi({ id: piId, amountDollars: 200 }); // Stripe captured $200

  const result = await scanReadyMade({ paymentIntents: [intent] }, [purchaseId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "rm_amount_mismatch");
  assert.ok(hit, "DB FACT: the money disagreement is recorded");
  assert.equal(Number(hit.expected_amount), 125, "expected = the purchase row's own column, never the listing's price today");
  assert.equal(Number(hit.actual_amount), 200, "actual = what Stripe captured");
  assert.equal(hit.details.deltaCents, -7500);
});

test("N23d: a live purchase whose PaymentIntent is not succeeded is rm_purchase_pi_not_succeeded", async () => {
  const piId = `pi_${RUN}_n23d`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "cloned", ageMinutes: 120 });
  const intent = rmPi({ id: piId, status: "requires_payment_method" });

  const result = await scanReadyMade({ paymentIntents: [intent] }, [purchaseId]);

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "rm_purchase_pi_not_succeeded");
  assert.ok(hit, "DB FACT: a purchase standing on an unpaid PaymentIntent is recorded");
  assert.equal(hit.details.paymentIntentStatus, "requires_payment_method");

  const row = await purchaseRow(purchaseId);
  assert.equal(row.status, "cloned", "DB FACT: detect-only — the purchase was not revoked");

  assert.equal(
    rows.filter((r) => r.kind === "rm_amount_mismatch").length,
    0,
    "and the amount check does not fire on a non-succeeded intent (it only judges captured money)",
  );
});

test("N23e: a Stripe refund against a still-live purchase is rm_refund_not_reversed — nothing is reversed by the job", async () => {
  // The shape a refund issued straight from the Stripe dashboard leaves behind: the buyer has the
  // money back AND the trip, and the author's escrowed earning was never reversed.
  const piId = `pi_${RUN}_n23e`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "cloned", ageMinutes: 120 });
  const refundId = `re_${RUN}_n23e`;
  createdRefundIds.push(refundId);

  const result = await scanReadyMade(
    {
      paymentIntents: [rmPi({ id: piId })],
      refunds: [{ id: refundId, payment_intent: piId, charge: `ch_${piId}`, amount: 12500, currency: "usd" }],
    },
    [purchaseId],
  );

  const rows = await exceptionsForRun(result.runId!);
  const hit = rows.find((r) => r.kind === "rm_refund_not_reversed");
  assert.ok(hit, "DB FACT: money went back and the ledger still treats the purchase as live — recorded");
  assert.equal(hit.details.stripeRefundId, refundId);
  assert.equal(hit.booking_id, purchaseId);

  const row = await purchaseRow(purchaseId);
  assert.equal(row.status, "cloned", "DB FACT: the job did not flip the purchase to refunded");
});

test("N23e2: the SAME refund against an already-refunded purchase is NOT drift", async () => {
  // The platform's own admin refund flips the status BEFORE calling Stripe, so this is the normal
  // path — a detector that reported it would make every legitimate refund noise.
  const piId = `pi_${RUN}_n23e2`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "refunded", ageMinutes: 120 });
  const refundId = `re_${RUN}_n23e2`;
  createdRefundIds.push(refundId);

  const result = await scanReadyMade(
    {
      paymentIntents: [rmPi({ id: piId })],
      refunds: [{ id: refundId, payment_intent: piId, charge: `ch_${piId}`, amount: 12500, currency: "usd" }],
    },
    [purchaseId],
  );

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_refund_not_reversed").length,
    0,
    "DB FACT: a reversal the purchase row already carries is not reported",
  );
});

test("N23f: a healthy ready-made purchase raises NOTHING, and the run is still recorded", async () => {
  const piId = `pi_${RUN}_n23f`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: ids.trip,
    ageMinutes: 120,
  });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  assert.equal(result.exceptions.length, 0, "a delivered, correctly-priced, succeeded purchase is not drift");
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(rows.length, 0, "DB FACT: zero exception rows");

  const record = await runRow(result.runId!);
  assert.equal(record.status, "completed", "DB FACT: and the clean pass is durably recorded");
  assert.ok(record.finished_at);
  assert.equal(result.checkedReadyMadePurchases, 1, "what the rail actually examined is reported");
});

test("N23g: a purchase INSIDE the fulfilment grace is not reported — the detector does not cry wolf on its own timing", async () => {
  // /purchase/confirm INSERTs the row and calls fulfillReadyMadePurchase in the same request, so
  // `paid` with no clone is the NORMAL state for the milliseconds in between.
  const piId = `pi_${RUN}_n23g`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "paid", cloneTripId: null, ageMinutes: 1 });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_purchase_paid_not_cloned").length,
    0,
    "DB FACT: a purchase that is still being delivered is not indicted",
  );
});

test("N23g2: a `cloned` purchase whose clone trip was DELETED is not reported — that is the buyer's own act", async () => {
  // clone_trip_id is ON DELETE SET NULL and a buyer may delete their own trip. Reporting it would
  // turn ordinary housekeeping into a drift alert (§13) — the kind names a FAILED DELIVERY, and a
  // delivered-then-deleted product is not one.
  const piId = `pi_${RUN}_n23g2`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "cloned", cloneTripId: null, ageMinutes: 120 });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_purchase_paid_not_cloned").length,
    0,
    "DB FACT: only status='paid' with no clone is a failed delivery",
  );
});

test("N23h: APPEND-ONLY — the same ready-made drift on a second pass records no second row", async () => {
  const piId = `pi_${RUN}_n23h`;
  const purchaseId = await makePurchase({ paymentIntentId: piId, status: "paid", cloneTripId: null, ageMinutes: 120 });
  const view = { paymentIntents: [rmPi({ id: piId })] };

  const first = await scanReadyMade(view, [purchaseId]);
  const second = await scanReadyMade(view, [purchaseId]);

  assert.equal(first.newExceptions, 1, "the first pass records the drift");
  assert.equal(second.newExceptions, 0, "the second records NO duplicate (ON CONFLICT DO NOTHING)");
  assert.equal(second.exceptions.length, 1, "but still DETECTS it — 'still drifting' stays visible");

  const secondRun = await runRow(second.runId!);
  assert.equal(Number(secondRun.exceptions_detected), 1, "DB FACT: the run row records detected…");
  assert.equal(Number(secondRun.exceptions_new), 0, "…separately from newly-recorded");

  const all = await db.execute(sql`
    SELECT count(*)::int AS n FROM reconciliation_exceptions
    WHERE booking_id = ${purchaseId} AND kind = 'rm_purchase_paid_not_cloned'
  `);
  assert.equal((all.rows[0] as any).n, 1, "DB FACT: exactly ONE row for a drift seen twice");
});

test("N23i: ONE JOB, THREE RAILS — a cart PaymentIntent is not judged by the ready-made rail, and vice versa", async () => {
  // The disjoint-id-space failure this lane exists to close must not be traded for a cross-rail
  // one: each rail keys on metadata its own purchase route writes server-side.
  const cartPiId = `pi_${RUN}_n23i_cart`;
  const bookingId = await makeBooking({ paymentIntentId: cartPiId, status: "confirmed" });
  const rmPiId = `pi_${RUN}_n23i_rm`;
  const purchaseId = await makePurchase({ paymentIntentId: rmPiId, status: "paid", cloneTripId: null, ageMinutes: 120 });

  dedupeKeys.push(`%${RUN}%`);
  const result = await runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader({ paymentIntents: [pi({ id: cartPiId, bookingIds: [bookingId] }), rmPi({ id: rmPiId })] }),
    onlyBookingIds: [bookingId],
    onlyPurchaseIds: [purchaseId],
  });

  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.rail === "cart").length,
    0,
    "DB FACT: the aligned cart booking is clean, and the ready-made PI raised no cart-rail kind",
  );
  const rm = rows.filter((r) => r.rail === "ready_made");
  assert.equal(rm.length, 1, "exactly the ready-made drift");
  assert.equal(rm[0].kind, "rm_purchase_paid_not_cloned");
  assert.equal(
    rows.filter((r) => r.kind === "rm_pi_succeeded_no_purchase").length,
    0,
    "DB FACT: the CART PaymentIntent is not reported as a ready-made purchase with no row",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N24 — THE RECOVERY PATH (ledger 2026-09-12-readymade-recovery-path; §15b/§15c)
//
// N23 reported the hole and refused to fill it: the `ready_made_purchases` row was written ONLY
// by the buyer's own browser calling `POST /api/ready-made/:id/purchase/confirm`, because the
// `payment_intent.succeeded` webhook keys on `metadata.bookingIds` — which a ready-made
// PaymentIntent never carries — so `handlePaymentSucceeded` read the delivery and did nothing.
// Money taken, no purchase, no clone, no author earning, nothing in any log. The cart rail has
// three recovery layers; this rail had zero.
//
// The fill is §15c's shape one table over: ONE fulfilment implementation
// (`fulfillReadyMadePurchase`, UNCHANGED), and the webhook becomes its second caller through the
// shared `recordAndFulfilReadyMadePurchase`. §17 is untouched — the DRIFT JOB still only detects,
// and N23's cases above still prove it repairs nothing.
//
// THE NEGATIVES ARE THE POINT, and they are what these cases mostly assert: a client-supplied
// PaymentIntent fulfils nothing (this rail's N17c), two deliveries make ONE clone and ONE author
// earning, a delivery racing the buyer's own confirm makes one of each, an UNRESOLVABLE
// PaymentIntent creates NOTHING and stays the detector's problem, and a PaymentIntent that did not
// succeed — or that was only partially captured — fulfils nothing.
//
// STATED NEGATIVE SPACE: there is NO purchase-confirmation EMAIL on this rail anywhere in the
// repo (the fulfilment writes a purchase row, a clone trip, an author earning and a
// platform-revenue row, and sends nothing), so the fourth "exactly once" fact asserted here is the
// platform-revenue row, not an email. This lane deliberately did not ADD one: an email is a new
// non-idempotent effect and a product decision nobody has ratified.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** A buyer of this suite's own making. Each recovery case needs its own, because
 *  `idx_rmp_buyer_trip_active` is a partial UNIQUE on (buyer_id, ready_made_trip_id). */
async function makeBuyer(tag: string): Promise<string> {
  const id = `recon-${RUN}-rcv-${tag}`;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${id}, ${`recon-${RUN}-rcv-${tag}@t.test`}, 'Recovery', 'Buyer')
  `);
  createdBuyerIds.push(id);
  return id;
}

/** A ready-made PaymentIntent addressed at a SPECIFIC buyer/listing — the shape
 *  `POST /api/ready-made/:id/purchase` writes server-side. `rmPi` above hard-codes a placeholder
 *  buyer because the DETECTOR never resolves one; the recovery path does. */
function rmPiFor(opts: {
  id: string;
  buyerId: string | null;
  listingId?: string | null;
  status?: string;
  amountCents?: number;
  amountReceivedCents?: number;
}): any {
  const cents = opts.amountCents ?? 12500;
  const status = opts.status ?? "succeeded";
  return {
    id: opts.id,
    object: "payment_intent",
    status,
    amount: cents,
    amount_received: opts.amountReceivedCents ?? (status === "succeeded" ? cents : 0),
    currency: "usd",
    latest_charge: `ch_${opts.id}`,
    created: Math.floor(Date.now() / 1000),
    metadata: {
      type: "ready_made_purchase",
      ...(opts.listingId === null ? {} : { listingId: opts.listingId ?? ids.listing }),
      ...(opts.buyerId === null ? {} : { buyerId: opts.buyerId }),
    },
  };
}

async function purchaseByPi(paymentIntentId: string): Promise<any | undefined> {
  const r = await db.execute(sql`
    SELECT id, buyer_id, status, clone_trip_id, price_paid_cents, currency
    FROM ready_made_purchases WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  const row = r.rows[0] as any;
  if (row) {
    createdPurchaseIds.push(row.id);
    if (row.clone_trip_id) createdCloneTripIds.push(row.clone_trip_id);
  }
  return row;
}

async function countPurchasesForPi(paymentIntentId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM ready_made_purchases WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  return (r.rows[0] as any).n;
}

async function countClonesFor(buyerId: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM trips WHERE user_id = ${buyerId}`);
  return (r.rows[0] as any).n;
}

async function countEarningsFor(purchaseId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM expert_earnings
    WHERE reference_id = ${purchaseId} AND type = 'ready_made_sale'
  `);
  return (r.rows[0] as any).n;
}

async function countRevenueFor(purchaseId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM platform_revenue WHERE source_id = ${purchaseId}
  `);
  return (r.rows[0] as any).n;
}

/** Drive the REAL webhook entry point, exactly as a signature-verified delivery reaches it. */
async function deliver(intent: any): Promise<void> {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handlePaymentSucceeded(intent as any);
}

test("N24a: THE WIRING — a succeeded ready-made PaymentIntent with no purchase row is RECOVERED by the webhook", async () => {
  // The exact case N23a reports as `rm_pi_succeeded_no_purchase`: the buyer's card was charged and
  // their browser never got to call /purchase/confirm. Driven through the REAL
  // `handlePaymentSucceeded`, because the caller is what ruling 39 recorded as inert for this rail.
  const buyerId = await makeBuyer("a");
  const piId = `pi_${RUN}_n24a`;

  await deliver(rmPiFor({ id: piId, buyerId }));

  const row = await purchaseByPi(piId);
  assert.ok(row, "DB FACT: the purchase the buyer paid for now exists");
  assert.equal(row.buyer_id, buyerId, "DB FACT: the buyer is Stripe's own metadata, not a guess");
  assert.equal(row.status, "cloned", "DB FACT: fulfilled, not merely recorded");
  assert.ok(row.clone_trip_id, "DB FACT: the buyer has the trip they bought");
  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: the author was credited exactly once");
  assert.equal(await countRevenueFor(row.id), 1, "DB FACT: one platform-revenue row");
  assert.equal(await countClonesFor(buyerId), 1, "DB FACT: exactly one clone trip");
});

test("N24b: TWO DELIVERIES — one row, one clone, one author earning, one revenue row", async () => {
  // Stripe re-delivers. The UNIQUE stripe_payment_intent_id is the guard on the row (§15: the
  // statement IS the guard, never a check-then-insert) and the atomic paid→cloned claim is the
  // guard on everything downstream — only the claim winner credits the author.
  const buyerId = await makeBuyer("b");
  const piId = `pi_${RUN}_n24b`;
  const intent = rmPiFor({ id: piId, buyerId });

  await deliver(intent);
  await deliver(intent);

  assert.equal(await countPurchasesForPi(piId), 1, "DB FACT: one purchase per payment, ever");
  const row = await purchaseByPi(piId);
  assert.equal(row.status, "cloned");
  assert.equal(await countClonesFor(buyerId), 1, "DB FACT: the second delivery minted no second trip");
  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: the author is paid ONCE — the money one");
  assert.equal(await countRevenueFor(row.id), 1, "DB FACT: no double bookkeeping");
});

test("N24c: THE RACE — a delivery landing alongside the buyer's own confirm produces ONE of each", async () => {
  // The ordering this lane creates and must therefore prove: the webhook is authorization arriving
  // late, and it can arrive EARLY — in the same milliseconds as the confirm call. Both drive the
  // ONE shared implementation, so the loser of the insert falls through to the idempotent fulfil
  // and the loser of the paid→cloned claim deletes its own orphan clone.
  const { recordAndFulfilReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("c");
  const piId = `pi_${RUN}_n24c`;
  const intent = rmPiFor({ id: piId, buyerId });

  const [webhookOutcome, confirmOutcome] = await Promise.all([
    recordAndFulfilReadyMadePurchase({ intent, actor: "webhook" }),
    recordAndFulfilReadyMadePurchase({
      intent,
      actor: "buyer_confirm",
      expect: { listingId: ids.listing, buyerId },
    }),
  ]);

  assert.equal(webhookOutcome.ok, true, "both callers succeed — a race is not an error");
  assert.equal(confirmOutcome.ok, true);
  assert.equal(await countPurchasesForPi(piId), 1, "DB FACT: exactly one purchase row");
  const row = await purchaseByPi(piId);
  assert.equal(row.status, "cloned");
  assert.equal(await countClonesFor(buyerId), 1, "DB FACT: the losing fulfil removed its own orphan");
  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: the author is credited exactly once");
  assert.equal(await countRevenueFor(row.id), 1);
  assert.equal(
    (webhookOutcome as any).purchaseId,
    (confirmOutcome as any).purchaseId,
    "both callers resolved the SAME purchase — never two",
  );
});

test("N24d: A CLIENT-SUPPLIED PaymentIntent FULFILS NOTHING — §15c's clause, this rail's N17c", async () => {
  // §15c: only a SIGNATURE-VERIFIED Stripe delivery may resolve a purchase from PaymentIntent
  // metadata ALONE. Any other actor must name the buyer and listing its own authenticated context
  // established, and Stripe's metadata must agree — so a PaymentIntent id lifted from somebody
  // else's checkout resolves nothing. Two shapes, both must create NOTHING.
  const { recordAndFulfilReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const victimId = await makeBuyer("d-victim");
  const attackerId = await makeBuyer("d-attacker");
  const piId = `pi_${RUN}_n24d`;
  const intent = rmPiFor({ id: piId, buyerId: victimId });

  const noExpectation = await recordAndFulfilReadyMadePurchase({ intent, actor: "buyer_confirm" });
  assert.equal(noExpectation.ok, false);
  assert.equal((noExpectation as any).reason, "unverified_actor_without_expectation");

  const wrongBuyer = await recordAndFulfilReadyMadePurchase({
    intent,
    actor: "buyer_confirm",
    expect: { listingId: ids.listing, buyerId: attackerId },
  });
  assert.equal(wrongBuyer.ok, false);
  assert.equal((wrongBuyer as any).reason, "metadata_mismatch");

  assert.equal(await countPurchasesForPi(piId), 0, "DB FACT: no purchase row was born");
  assert.equal(await countClonesFor(attackerId), 0, "DB FACT: the attacker got no trip");
  assert.equal(await countClonesFor(victimId), 0, "DB FACT: and nothing was fulfilled for the victim either");
});

test("N24e: AN UNRESOLVABLE PaymentIntent CREATES NOTHING, and stays the detector's finding (§13)", async () => {
  // A deleted listing, a buyer whose account is gone, metadata naming neither. An unresolvable
  // PaymentIntent has no HONEST fulfilment, so the recovery invents none — and the drift job still
  // reports it as `rm_pi_succeeded_no_purchase`, which is exactly where a human should find it.
  const { recordAndFulfilReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("e");

  const ghostListing = await recordAndFulfilReadyMadePurchase({
    intent: rmPiFor({ id: `pi_${RUN}_n24e_l`, buyerId, listingId: `recon-${RUN}-no-such-listing` }),
    actor: "webhook",
  });
  assert.equal(ghostListing.ok, false);
  assert.equal((ghostListing as any).reason, "listing_not_found");

  const ghostBuyer = await recordAndFulfilReadyMadePurchase({
    intent: rmPiFor({ id: `pi_${RUN}_n24e_b`, buyerId: `recon-${RUN}-no-such-buyer` }),
    actor: "webhook",
  });
  assert.equal(ghostBuyer.ok, false);
  assert.equal((ghostBuyer as any).reason, "buyer_not_found");

  const noMetadata = await recordAndFulfilReadyMadePurchase({
    intent: rmPiFor({ id: `pi_${RUN}_n24e_m`, buyerId: null, listingId: null }),
    actor: "webhook",
  });
  assert.equal(noMetadata.ok, false);
  assert.equal((noMetadata as any).reason, "metadata_incomplete");

  assert.equal(await countPurchasesForPi(`pi_${RUN}_n24e_l`), 0, "DB FACT: nothing invented");
  assert.equal(await countPurchasesForPi(`pi_${RUN}_n24e_b`), 0);
  assert.equal(await countPurchasesForPi(`pi_${RUN}_n24e_m`), 0);
  assert.equal(await countClonesFor(buyerId), 0);

  // …and the DETECTOR still names it. The two halves of this rail, in one assertion.
  const scanned = await scanReadyMade(
    { paymentIntents: [rmPiFor({ id: `pi_${RUN}_n24e_l`, buyerId, listingId: `recon-${RUN}-no-such-listing` })] },
    [],
  );
  const rows = await exceptionsForRun(scanned.runId!);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "rm_pi_succeeded_no_purchase", "DB FACT: still a FINDING, never a silent gap");
});

test("N24f: A PaymentIntent THAT DID NOT SUCCEED — or was only partly captured — fulfils nothing (§14)", async () => {
  // §15b: irreversible effects follow the AUTHORIZATION. A PI that is not `succeeded` is not
  // authorization, and a `succeeded` PI whose captured amount is less than the amount locked at
  // creation is not a completed purchase — handing over the product for either would be delivering
  // against money the platform does not hold.
  const { recordAndFulfilReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("f");

  const notSucceeded = await recordAndFulfilReadyMadePurchase({
    intent: rmPiFor({ id: `pi_${RUN}_n24f_s`, buyerId, status: "requires_payment_method" }),
    actor: "webhook",
  });
  assert.equal(notSucceeded.ok, false);
  assert.equal((notSucceeded as any).reason, "payment_not_succeeded");

  const partial = await recordAndFulfilReadyMadePurchase({
    intent: rmPiFor({ id: `pi_${RUN}_n24f_p`, buyerId, amountCents: 12500, amountReceivedCents: 5000 }),
    actor: "webhook",
  });
  assert.equal(partial.ok, false);
  assert.equal((partial as any).reason, "amount_not_fully_captured");

  assert.equal(await countPurchasesForPi(`pi_${RUN}_n24f_s`), 0, "DB FACT: no row for an unpaid intent");
  assert.equal(await countPurchasesForPi(`pi_${RUN}_n24f_p`), 0, "DB FACT: no row for a partial capture");
  assert.equal(await countClonesFor(buyerId), 0, "DB FACT: and no product handed over");
});

test("N24g: RAIL SEPARATION — a cart PaymentIntent is never recovered as a ready-made purchase", async () => {
  // The disjoint-id-space failure this whole family exists to close must not be traded for a
  // cross-rail one on the RECOVERY side either: the branch keys on the metadata the ready-made
  // purchase route writes server-side, and nothing else.
  const { recordAndFulfilReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const cartPiId = `pi_${RUN}_n24g`;
  const bookingId = await makeBooking({ paymentIntentId: cartPiId, status: "payment_pending" });

  const outcome = await recordAndFulfilReadyMadePurchase({
    intent: pi({ id: cartPiId, bookingIds: [bookingId] }) as any,
    actor: "webhook",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as any).reason, "not_a_ready_made_intent");
  assert.equal(await countPurchasesForPi(cartPiId), 0, "DB FACT: no store purchase behind a cart payment");
});

test("N24h: §14 — price_paid_cents is what STRIPE CAPTURED, not the listing's price at recovery time", async () => {
  // The amount is server-derived at PaymentIntent CREATION from the listing (§14) and the row
  // records what was actually taken. A listing may legitimately be repriced after a sale, and the
  // detector's own `rm_amount_mismatch` note says so — so a recovery that re-read the listing would
  // record a number the buyer never paid, and then indict itself on the next scan.
  const buyerId = await makeBuyer("h");
  const piId = `pi_${RUN}_n24h`;
  const capturedCents = 9900;

  await db.execute(sql`UPDATE ready_made_trips SET price_cents = 44400 WHERE id = ${ids.listing}`);
  try {
    await deliver(rmPiFor({ id: piId, buyerId, amountCents: capturedCents }));
  } finally {
    await db.execute(sql`UPDATE ready_made_trips SET price_cents = 12500 WHERE id = ${ids.listing}`);
  }

  const row = await purchaseByPi(piId);
  assert.ok(row, "recovered");
  assert.equal(row.price_paid_cents, capturedCents, "DB FACT: what Stripe captured, never the current price");
  assert.equal(row.currency, "USD");
  assert.equal(row.status, "cloned");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N25 — THE INTERRUPTED FULFILMENT (punchlist V-3b, ledger
//                  2026-09-12-readymade-earning-retry)
// ═══════════════════════════════════════════════════════════════════════════════════════════
// N24 closed the hole BEFORE the purchase row: a closed tab between capture and confirm lost the
// whole delivery, and the webhook now recovers it. This closes the hole AFTER it, and it is a
// different failure with a different shape.
//
// `fulfillReadyMadePurchase` credited the author with a PLAIN INSERT reached only by the winner of
// the atomic `paid → cloned` claim. Under CONCURRENCY that is exactly right — one claim, one
// credit. Under a CRASH it is unreachable: a process dying between the claim and the insert leaves
// a purchase that is `cloned` (the clone trip and its items are committed, the buyer has what they
// bought) with NO author earning, and every later fulfil short-circuited on `status === 'cloned'`
// and returned. Delivered buyer, unpaid author, no exception, no log line, no detector.
//
// THE FIX HAS TWO HALVES AND N25a IS THE ONE THAT MATTERS. Migration 294's PARTIAL unique index
// (`reference_id WHERE reference_type='ready_made_purchase' AND amount >= 0`) prevents a DOUBLE
// credit; it does not create a credit that never happened. So the fulfilment now ENSURES the money
// leg on an already-`cloned` purchase instead of returning early — §15c's "the promotion is the
// money leg only … the one effect it does retry is idempotent by construction", one table over.
//
// THE CLONE IS NOT PART OF THE RETRY, and N25b is the proof: it is NOT uniqueness-guarded and a
// second one would be a real second trip in the buyer's account.
//
// N25a FAILS ON THE PRE-FIX CODE (it is the lane's own negative); N25c/N25d are the guards that
// the fix did not buy recovery at the price of double-crediting or of re-crediting a refund.

/** Delete the author earning a fulfilment wrote — the DB state a process death between the atomic
 *  `paid → cloned` claim and the credit insert leaves behind. Nothing else is touched: the
 *  purchase stays `cloned`, the clone trip and its items stay committed, the buyer keeps what they
 *  paid for. That asymmetry IS the defect. */
async function eraseAuthorCredit(purchaseId: string): Promise<void> {
  await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${purchaseId} AND type = 'ready_made_sale'`);
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${purchaseId}`);
}

async function earningRowFor(purchaseId: string): Promise<any | undefined> {
  const r = await db.execute(sql`
    SELECT expert_id, amount, currency, status, reference_type
    FROM expert_earnings WHERE reference_id = ${purchaseId} AND type = 'ready_made_sale'
  `);
  return r.rows[0] as any;
}

test("N25a: INTERRUPTED AFTER THE CLAIM — a re-run ends with exactly ONE earning and ONE revenue row", async () => {
  // The lane's own negative. On the pre-fix code the re-run returns at `status === 'cloned'` and
  // both counts stay 0: the buyer has their trip and the author is never paid.
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("v3b-a");
  const piId = `pi_${RUN}_n25a`;

  await deliver(rmPiFor({ id: piId, buyerId }));
  const row = await purchaseByPi(piId);
  assert.ok(row, "the delivery recorded the purchase");
  assert.equal(row.status, "cloned", "and fulfilled it");
  const amountBefore = (await earningRowFor(row.id))?.amount;
  assert.ok(amountBefore, "the first pass credited the author");

  // The crash: the claim committed, the credit did not.
  await eraseAuthorCredit(row.id);
  assert.equal(await countEarningsFor(row.id), 0, "DB FACT: the interrupted state — cloned, uncredited");
  assert.equal(await countRevenueFor(row.id), 0);

  const again = await fulfillReadyMadePurchase(row.id);

  assert.equal(again.alreadyFulfilled, true, "the CLONE is not redone — this is the money leg only");
  assert.equal(again.cloneTripId, row.clone_trip_id, "and it is still the SAME clone trip");
  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: the author is paid — exactly one earning");
  assert.equal(await countRevenueFor(row.id), 1, "DB FACT: and exactly one platform-revenue row");
  assert.equal(await countClonesFor(buyerId), 1, "DB FACT: still exactly one trip — no second clone");

  const recovered = await earningRowFor(row.id);
  assert.equal(recovered.amount, amountBefore, "§14/§8: the recovered amount is the SAME number, not a new one");
  assert.equal(recovered.status, "held", "born HELD on the escrow spine, exactly as a first pass does");
  assert.equal(recovered.reference_type, "ready_made_purchase", "the reference_type migration 294's index is scoped to");
  assert.equal((again.authorCredit as any)?.earning, "created", "the caller is TOLD the credit was made");
});

test("N25b: A NORMAL DOUBLE-RUN still produces exactly one of each, and mints no second clone", async () => {
  // The other direction of the same predicate: re-entering a fulfilment that is ALREADY complete
  // must be a no-op on every row, and must report `existing` rather than claiming it created one.
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("v3b-b");
  const piId = `pi_${RUN}_n25b`;

  await deliver(rmPiFor({ id: piId, buyerId }));
  const row = await purchaseByPi(piId);
  assert.ok(row);

  const again = await fulfillReadyMadePurchase(row.id);
  const third = await fulfillReadyMadePurchase(row.id);

  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: migration 294's partial index is the guard");
  assert.equal(await countRevenueFor(row.id), 1, "DB FACT: migration 244's index is the guard");
  assert.equal(await countClonesFor(buyerId), 1, "DB FACT: the clone is NOT part of the retry");
  assert.equal((again.authorCredit as any)?.earning, "existing", "§13: an existing credit is reported as existing");
  assert.equal((third.authorCredit as any)?.earning, "existing");
});

test("N25c: THE PARTIAL PREDICATE IS LOAD-BEARING — every other earnings rail still repeats freely", async () => {
  // Migration 294 scopes its unique index to `reference_type = 'ready_made_purchase'` precisely so
  // the five other writers of `expert_earnings` (tip, referral bonus, affiliate commission, expert
  // review fee, recordRevenueEvent) keep their exact behaviour — several legitimately repeat a
  // reference_id. A table-wide unique index would have broken all of them silently.
  const sharedRef = `recon-${RUN}-shared-ref`;
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, reference_id, reference_type, status)
    VALUES (${`recon-${RUN}-ee-1`}, ${ids.user}, 'tip', '5.00', ${sharedRef}, 'expert_tip', 'held'),
           (${`recon-${RUN}-ee-2`}, ${ids.user}, 'tip', '7.00', ${sharedRef}, 'expert_tip', 'held')
  `);
  try {
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM expert_earnings WHERE reference_id = ${sharedRef}
    `);
    assert.equal((r.rows[0] as any).n, 2, "DB FACT: a non-ready-made rail is untouched by the new index");
  } finally {
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${sharedRef}`).catch(() => {});
  }
});

test("N25d: A REFUNDED PURCHASE IS NEVER RE-CREDITED by the re-entrant path (§13)", async () => {
  // The refund ledger REVERSES the author's earning. `refunded` is terminal, so the money leg must
  // NOT re-run for it — ensuring the credit there would fight the reversal that just happened.
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("v3b-d");
  const piId = `pi_${RUN}_n25d`;

  await deliver(rmPiFor({ id: piId, buyerId }));
  const row = await purchaseByPi(piId);
  assert.ok(row);

  await db.execute(sql`UPDATE ready_made_purchases SET status = 'refunded' WHERE id = ${row.id}`);
  await db.execute(sql`
    UPDATE expert_earnings SET status = 'reversed'
    WHERE reference_id = ${row.id} AND type = 'ready_made_sale'
  `);

  const again = await fulfillReadyMadePurchase(row.id);

  assert.equal(again.authorCredit, undefined, "a terminal purchase runs no money leg at all");
  assert.equal(await countEarningsFor(row.id), 1, "DB FACT: no second earning was written");
  const reversed = await earningRowFor(row.id);
  assert.equal(reversed.status, "reversed", "DB FACT: and the reversal stands");
});

test("N25e: AN EARNING THAT CANNOT HONESTLY BE CREATED IS NOT INVENTED — the skip is REPORTED (§13)", async () => {
  // Three facts can be missing when the money leg runs: the listing row, its author's account, or
  // a payable share. All three take the SAME branch — create NOTHING, name the reason, log at
  // ERROR — and the fulfilment deliberately does NOT throw: the buyer's clone is already committed,
  // and a throw here would turn a bookkeeping gap into a webhook that retries forever without ever
  // being able to succeed. It stays the drift job's finding (§17), never a fabricated row.
  //
  // STATED NEGATIVE SPACE: the `no_payable_share` arm is the one this suite can reach without DDL.
  // `ready_made_purchases.ready_made_trip_id` and `ready_made_trips.author_id` are both NO-ACTION
  // FKs, so the database itself refuses to produce a purchase whose listing or author is gone —
  // which is a real guarantee, not a gap in the test, and it is why those two arms exist as
  // defence against a future loosening rather than against today's schema.
  const { fulfillReadyMadePurchase } = await import("../services/ready-made-purchase.service");
  const buyerId = await makeBuyer("v3b-e");
  const piId = `pi_${RUN}_n25e`;

  await deliver(rmPiFor({ id: piId, buyerId }));
  const row = await purchaseByPi(piId);
  assert.ok(row);
  await eraseAuthorCredit(row.id);

  await db.execute(sql`UPDATE ready_made_purchases SET price_paid_cents = 0 WHERE id = ${row.id}`);
  const again = await fulfillReadyMadePurchase(row.id);

  assert.equal((again.authorCredit as any)?.earning, "skipped", "the caller is TOLD, never left guessing");
  assert.equal((again.authorCredit as any)?.reason, "no_payable_share");
  assert.equal(await countEarningsFor(row.id), 0, "DB FACT: no earning was invented");
  assert.equal(await countRevenueFor(row.id), 0, "DB FACT: and no revenue row either");
  assert.equal(again.cloneTripId, row.clone_trip_id, "the buyer keeps the trip they paid for");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N26 — D-11: A TRIP-LEVEL OBLIGATION THE PLAN DOES NOT KNOW ABOUT
// (ledger `2026-09-15-d11-no-item-booking-exception`, decision-maker ruling, option A)
//
// LD 39: `itinerary_items` is the ONE store of a plan's contents and `itinerary_items.booking_id`
// (migration 159) is the item→booking link. The ruling makes a trip-bearing booking with no item
// behind it a MIGRATION EXCEPTION confined to named classes — marked server-side — and everything
// else a FINDING. The positive is cheap; the two negatives are what keep this kind from burying
// every legitimate purchase on the platform, which is the same discriminating discipline B5 keeps
// for `payment_provenance_unverified`.
// ═══════════════════════════════════════════════════════════════════════════════════════════

test("N26a: a trip-bearing booking with NO plan item and no ratified reason is trip_booking_without_item — detected ONCE, and repaired never", async () => {
  const piId = `pi_${RUN}_n26a`;
  const bookingId = await makeBooking({
    paymentIntentId: piId,
    status: "confirmed",
    withPlanItem: false, // the stray: the plan holds an obligation it cannot see
  });
  const intent = pi({ id: piId, bookingIds: [bookingId] });

  const first = await scan({ paymentIntents: [intent] }, [bookingId]);

  const rows = await exceptionsForRun(first.runId!);
  const hit = rows.find((r) => r.kind === "trip_booking_without_item");
  assert.ok(hit, `expected trip_booking_without_item, got: ${rows.map((r) => r.kind).join(", ") || "(none)"}`);
  assert.equal(hit.rail, "cart");
  assert.equal(
    hit.severity,
    "warning",
    "a plan-integrity fact, not a payment one — the money here may be perfectly correct",
  );
  assert.equal(hit.booking_id, bookingId);
  assert.equal(hit.dedupe_key, `cart:trip_booking_without_item:${bookingId}`, "keyed on the BOOKING alone");
  assert.equal(hit.details.tripId, ids.trip, "the plan it names is recorded for the human who follows up");
  assert.equal(
    hit.details.noItemReasonOnRow,
    null,
    "recorded as NULL rather than omitted: 'carries nothing' and 'carries a string we do not know' " +
      "are different facts (§13)",
  );

  // DETECT, DON'T REPAIR (§17): no item was invented, no reason was stamped, the row is untouched.
  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed", "the job did not move the booking");
  const after = await db.execute(sql`
    SELECT (SELECT count(*)::int FROM itinerary_items WHERE booking_id = ${bookingId}) AS items,
           booking_details->>'noItemReason' AS reason
    FROM service_bookings WHERE id = ${bookingId}
  `);
  assert.equal((after.rows[0] as any).items, 0, "DB FACT: the job linked NO item — that would be inventing a plan entry");
  assert.equal((after.rows[0] as any).reason, null, "DB FACT: and it backfilled NO reason — that would manufacture a fact");

  // APPEND-ONLY: a stray that persists is ONE row, still reported every pass (§17 rule 1).
  const second = await scan({ paymentIntents: [intent] }, [bookingId]);
  assert.equal(second.newExceptions, 0, "the second pass records no duplicate");
  assert.ok(
    second.exceptions.some((e) => e.kind === "trip_booking_without_item"),
    "but it still DETECTS it — 'still drifting' stays visible",
  );
  const count = await db.execute(sql`
    SELECT count(*)::int AS n FROM reconciliation_exceptions
    WHERE booking_id = ${bookingId} AND kind = 'trip_booking_without_item'
  `);
  assert.equal((count.rows[0] as any).n, 1, "DB FACT: exactly ONE row for a stray seen twice");
});

test("N26b: a NAMED-CLASS row is NOT drift — and an unrecognised reason still is", async () => {
  // The ratified exception: a rail with no item reference to carry, marked server-side at birth
  // (`shared/no-item-booking.ts`). Without this the kind would indict every transport booking and
  // every expert request on a plan, which is precisely what "marked and audited" prevents.
  const markedId = await makeBooking({
    paymentIntentId: null,
    status: "pending",
    withPlanItem: false,
    noItemReason: "transport_commerce",
  });

  const marked = await scan({}, [markedId]);
  const markedRows = await exceptionsForRun(marked.runId!);
  assert.equal(
    markedRows.filter((r) => r.kind === "trip_booking_without_item").length,
    0,
    "a ratified class SAYS why it has no item, and is therefore not a finding",
  );

  // §13 — THE MARK IS NOT A FREE PASS. Only the ratified vocabulary exempts a row; an unknown
  // string is not a class, so a rail that invented its own reason is still reported.
  const bogusId = await makeBooking({
    paymentIntentId: null,
    status: "pending",
    withPlanItem: false,
    noItemReason: "because_i_said_so",
  });

  const bogus = await scan({}, [bogusId]);
  const bogusRows = await exceptionsForRun(bogus.runId!);
  const hit = bogusRows.find((r) => r.kind === "trip_booking_without_item");
  assert.ok(hit, "an unrecognised reason exempts nothing");
  assert.equal(
    hit.details.noItemReasonOnRow,
    "because_i_said_so",
    "and the string that was actually on the row is recorded, not just its absence",
  );
  assert.deepEqual(
    hit.details.ratifiedClasses,
    ["transport_commerce", "expert_booking_request"],
    "the exception names the vocabulary it judged against, so the finding is readable without the code",
  );
});

test("N26c: a LINKED booking and an IN-FLIGHT claim are both silent — the discriminating half", async () => {
  // (a) The ordinary case: a cart checkout whose plan item points at the booking. If this fired,
  //     every purchase on the platform would be a finding and the real strays would be invisible.
  const piId = `pi_${RUN}_n26c`;
  const linkedId = await makeBooking({ paymentIntentId: piId, status: "confirmed" }); // withPlanItem defaults true
  const intent = pi({ id: piId, bookingIds: [linkedId] });

  const linked = await scan({ paymentIntents: [intent] }, [linkedId]);
  assert.equal(linked.exceptions.length, 0, "a linked, correctly-priced, succeeded purchase is not drift at all");

  // (b) The §15b in-flight claim. `payment_pending` with no PaymentIntent stamped is an
  //     UNAUTHORIZED PROVISIONAL CLAIM by construction, and the item link is written at PROMOTE
  //     (`markItemPurchased`), not at birth — so "no item yet" is the spine's own ordering, not
  //     drift. Reporting it would be the detector crying wolf on the checkout it is auditing.
  const claimId = await makeBooking({ paymentIntentId: null, status: "payment_pending", withPlanItem: false });

  const claim = await scan({}, [claimId]);
  const claimRows = await exceptionsForRun(claim.runId!);
  assert.equal(
    claimRows.filter((r) => r.kind === "trip_booking_without_item").length,
    0,
    "an in-flight claim is not yet an obligation — the link comes at promote",
  );

  // (c) And a row that is no longer an obligation: a swept claim. Same reasoning, other end.
  const voidedId = await makeBooking({ paymentIntentId: null, status: "expired", withPlanItem: false });
  const voided = await scan({}, [voidedId]);
  const voidedRows = await exceptionsForRun(voided.runId!);
  assert.equal(
    voidedRows.filter((r) => r.kind === "trip_booking_without_item").length,
    0,
    "a voided claim owes the plan nothing",
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// matrix-id: N27 — D-18: A DELIVERED PURCHASE RECORDS THAT IT WAS ANNOUNCED
//
// Ruling 2026-09-15, punchlist D-18 = option A; ledger `2026-09-15-d18-announced-marker`;
// migration 297.
//
// Ledger `2026-09-14-readymade-notifications` closed the DUPLICATE-SEND half of the buyer's
// delivery notice and stated its own LIVENESS gap out loud: a process dying between the atomic
// `paid → cloned` claim and the send left a purchase that was DELIVERED and ANNOUNCED TO NOBODY,
// with nothing recording the fact and therefore nothing able to retry it.
//
// This is §17's ONE narrow exception arriving on a second rail: the job HANDS the row back to the
// EXISTING shared sender (`notifyBuyerOfReadyMadeDelivery`) — it composes no message, sends
// nothing itself, and NEVER writes `notified_at`. The negatives carry the weight, as ever: the
// grace keeps a fresh delivery out of it, a second pass does nothing at all, a `paid` row is never
// announced, and a buyer who deleted their own clone trip is not indicted for housekeeping.
//
// The STATIC half — that the job cannot stamp the column even in principle — is pinned purely in
// `server/__tests__/ready-made-announce-marker.test.ts` (A4), which needs no database.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** The buyer's bell row for one purchase, by the sender's own dedupe key. */
async function deliveryNotificationRows(purchaseId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT id, user_id, type, dedupe_key, created_at
    FROM notifications
    WHERE dedupe_key = ${`ready_made_purchase:${purchaseId}:delivered`}
  `);
  return r.rows as any[];
}

async function notifiedAtOf(purchaseId: string): Promise<Date | null> {
  const r = await db.execute(sql`SELECT notified_at FROM ready_made_purchases WHERE id = ${purchaseId}`);
  const v = (r.rows[0] as any)?.notified_at;
  return v ? new Date(String(v)) : null;
}

test("N27a: a DELIVERED purchase with no announce marker is handed to the shared sender — and the job stamps nothing itself", async () => {
  // The liveness gap, seeded exactly: the `paid → cloned` claim took (the buyer HAS their plan),
  // and the send never happened. Nothing on disk said so before migration 297.
  const piId = `pi_${RUN}_n27a`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: ids.trip,
    ageMinutes: 24 * 60,
  });
  assert.equal(await notifiedAtOf(purchaseId), null, "seeded as never announced (§13: NULL, not a default)");
  assert.equal((await deliveryNotificationRows(purchaseId)).length, 0, "and with no bell row behind it");

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  // THE HAND-OFF HAPPENED, and it happened through the ONE shared sender.
  const bells = await deliveryNotificationRows(purchaseId);
  assert.equal(bells.length, 1, "DB FACT: the buyer now has exactly ONE delivery notification");
  assert.equal(bells[0].type, "ready_made_purchase", "written by the shared sender, not composed by the job");

  // AND THE MARKER IS STAMPED — by the SENDER, which is the only writer of the column.
  const stampedAt = await notifiedAtOf(purchaseId);
  assert.ok(stampedAt instanceof Date, "DB FACT: the delivery now records that it was announced");

  // THE ORDINARY CASE RECORDS NO EXCEPTION. An append-only accusation about a fact this same pass
  // just fixed would outlive the problem it describes.
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_delivery_not_announced").length,
    0,
    "a hand-off that succeeded leaves no drift to report",
  );

  // AND IT IS NOT A PROMOTION. `promoted` means "claims recovered via the shared PROMOTION" and is
  // persisted as such; an announcement borrowing that counter would read as money recovery (§13).
  assert.equal(result.promoted, 0, "no money moved and none is claimed to have moved");
  assert.deepEqual(
    result.readyMadeAnnounceHandOffs,
    [purchaseId],
    "the work IS reported — a pass that re-drove a delivery must not render as a silent clean pass",
  );

  // DETECT, DON'T REPAIR still holds for everything else on the rail.
  const row = await purchaseRow(purchaseId);
  assert.equal(row.status, "cloned", "DB FACT: the job changed no status");
  assert.equal(row.clone_trip_id, ids.trip, "and re-minted nothing");
});

test("N27b: a SECOND pass over an announced delivery does nothing — the stamp is an atomic conditional", async () => {
  const piId = `pi_${RUN}_n27b`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: ids.trip,
    ageMinutes: 24 * 60,
  });

  await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);
  const first = await notifiedAtOf(purchaseId);
  assert.ok(first, "the first pass announced it");

  const second = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  assert.equal(
    (await deliveryNotificationRows(purchaseId)).length,
    1,
    "DB FACT: still exactly ONE bell row — the dedupe key is the send's guard",
  );
  const after = await notifiedAtOf(purchaseId);
  assert.equal(
    after?.getTime(),
    first?.getTime(),
    "§15: `WHERE notified_at IS NULL` is the guard, so the SECOND STAMP IS A NO-OP and the " +
      "timestamp somebody already wrote is never moved",
  );
  assert.deepEqual(
    second.readyMadeAnnounceHandOffs,
    [],
    "and the second pass reports no work, because there was none: the row is no longer in the predicate",
  );
  const rows = await exceptionsForRun(second.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_delivery_not_announced").length,
    0,
    "nothing is recorded about an announced delivery",
  );
});

test("N27c: INSIDE the announce grace nothing is sent, stamped or reported", async () => {
  // The window is a claim about what we KNOW, not about what happened: a delivery seconds old may
  // have its announcement in flight, and re-driving it would race the fulfilment that is running.
  const piId = `pi_${RUN}_n27c`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: ids.trip,
    ageMinutes: 0,
  });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  assert.equal((await deliveryNotificationRows(purchaseId)).length, 0, "no bell row");
  assert.equal(await notifiedAtOf(purchaseId), null, "no stamp");
  assert.deepEqual(result.readyMadeAnnounceHandOffs, [], "no hand-off");
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_delivery_not_announced").length,
    0,
    "and no finding — the detector does not cry wolf on a delivery that is still being delivered",
  );
});

test("N27d: a `paid` purchase is never announced — the two classifications do not overlap", async () => {
  // A `paid` row was never delivered, so there is nothing to announce. Telling the buyer their plan
  // is in their account when it is not is the §13 lie this predicate exists to avoid; R3's
  // `rm_purchase_paid_not_cloned` is that row's own, correct classification.
  const piId = `pi_${RUN}_n27d`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "paid",
    cloneTripId: null,
    ageMinutes: 24 * 60,
  });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  assert.equal((await deliveryNotificationRows(purchaseId)).length, 0, "DB FACT: no delivery was announced");
  assert.equal(await notifiedAtOf(purchaseId), null, "and no marker was stamped");
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_purchase_paid_not_cloned").length,
    1,
    "it is reported as UNDELIVERED, which is what it is",
  );
  assert.equal(
    rows.filter((r) => r.kind === "rm_delivery_not_announced").length,
    0,
    "and never as unannounced — the buyer is owed a delivery, not a message about one",
  );
});

test("N27e: a buyer who DELETED their own clone trip is not indicted, and is not messaged", async () => {
  // `clone_trip_id` is ON DELETE SET NULL and deleting your own trip is an ordinary act. R3 already
  // refuses to read that shape as a failed delivery; this rail refuses it for the same reason —
  // and there is nothing left to announce anyway, since the notice links to the plan.
  const piId = `pi_${RUN}_n27e`;
  const purchaseId = await makePurchase({
    paymentIntentId: piId,
    status: "cloned",
    cloneTripId: null,
    ageMinutes: 24 * 60,
  });

  const result = await scanReadyMade({ paymentIntents: [rmPi({ id: piId })] }, [purchaseId]);

  assert.equal((await deliveryNotificationRows(purchaseId)).length, 0, "nothing is sent");
  assert.equal(await notifiedAtOf(purchaseId), null, "nothing is stamped");
  const rows = await exceptionsForRun(result.runId!);
  assert.equal(
    rows.filter((r) => r.kind === "rm_delivery_not_announced").length,
    0,
    "§13: the buyer's own housekeeping is not drift",
  );
});
