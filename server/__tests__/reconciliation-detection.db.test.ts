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
 * Run solo: npx tsx --test server/__tests__/reconciliation-detection.db.test.ts
 */
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
  for (const id of createdRefundIds) {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_refund_id = ${id}`).catch(() => {});
  }
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdPurchaseIds) {
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
}): Promise<string> {
  const id = `recon-${RUN}-bk-${createdBookingIds.length}`;
  const details = JSON.stringify(opts.itemId ? { itineraryItemId: opts.itemId } : {});
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
  // The legacy `bookings` rail is still live (CLAUDE.md §15c: /booking-demo,
  // /itinerary-comparison/:id → POST /api/bookings/process-cart), so extending the scan must not
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
  // The live shape: the buyer's card was charged and their browser never got to call
  // /purchase/confirm — which is the ONLY thing that writes the row, since the
  // payment_intent.succeeded webhook keys on metadata.bookingIds a ready-made PI never carries.
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
