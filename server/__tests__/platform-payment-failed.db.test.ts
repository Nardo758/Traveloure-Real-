/**
 * A FAILED PLATFORM PAYMENT MARKS THE CART BOOKING FAILED (ledger `2026-09-27-platform-payment-failed`, R161).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * A cart checkout's PaymentIntent is a PLATFORM PaymentIntent, so Stripe delivers its
 * `payment_intent.payment_failed` to the PLATFORM endpoint (`POST /api/bookings/webhooks/stripe` →
 * `stripePaymentService.handleWebhook` → `handlePaymentFailed`). That handler updated only the
 * LEGACY `bookings` table by `metadata.bookingIds` — `service_bookings` ids, so it matched nothing —
 * and the one code that flipped `service_bookings` to `failed` lived only on the CONNECT endpoint.
 * The §15c class (ruling 39), on the failure side. Both endpoints now call ONE shared
 * `markCheckoutPaymentFailed`.
 *
 *   PF1  platform delivery → the cart booking is `failed` (the finding; fails on 3b998d112).
 *   PF2  redelivery → a no-op: nothing flips twice, the email is sent once.
 *   PF3  a `confirmed` row is never demoted by a late failure.
 *   PF4  the Connect caller's function (the shared one) still flips, and the legacy `bookings`
 *        update on the platform path still runs for a legacy-owned id (both rails run, §15c).
 *
 * Every assertion is a DATABASE FACT read back after the call. No Stripe network: the event is a
 * literal shaped like the delivery Stripe signs (the checkout-payment-promotion.db.test.ts N17d
 * technique). DISPOSABLE DB ONLY; every row written here is deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/platform-payment-failed.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_payment_failed_suite";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `pfail-${RUN}-user`,
  service: `pfail-${RUN}-svc`,
};
const createdBookingIds: string[] = [];
const createdLegacyBookingIds: string[] = [];
const createdEventIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[platform-payment-failed] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`pfail-${RUN}@t.test`}, 'Pfail', 'Fixture')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Payment-failed fixture service', '100.00')
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdLegacyBookingIds) {
    await db.execute(sql`DELETE FROM bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdEventIds) {
    await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** A cart-checkout booking as the checkout spine leaves it: a UUID id, the PI stamped. */
async function makeBooking(pi: string, status = "payment_pending"): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, booking_details, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${status},
      '100.00', '25.00', ${pi}, '{}'::jsonb, NOW()
    )
  `);
  createdBookingIds.push(id);
  return id;
}

async function statusOf(id: string): Promise<string> {
  const r = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`);
  return (r.rows[0] as any).status;
}

/** The platform delivery exactly as the cart checkout's PI carries it (metadata.bookingIds). */
function platformFailedEvent(pi: string, bookingIds: string[]) {
  const eventId = `evt_${RUN}_${pi}_${createdEventIds.length}`;
  createdEventIds.push(eventId);
  return {
    id: eventId,
    object: "event",
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: pi,
        object: "payment_intent",
        metadata: { userId: ids.user, bookingIds: bookingIds.join(","), isDeposit: "false" },
        last_payment_error: { message: "Your card was declined." },
      },
    },
  } as any;
}

test("PF1: a payment_failed delivered to the PLATFORM endpoint marks the cart booking failed", async () => {
  const pi = `pi_${RUN}_pf1`;
  const a = await makeBooking(pi);
  const b = await makeBooking(pi);

  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const res = await stripePaymentService.handleWebhook(platformFailedEvent(pi, [a, b]));
  assert.deepEqual(res, { received: true });

  assert.equal(await statusOf(a), "failed", "DB FACT: the platform rail now reaches service_bookings");
  assert.equal(await statusOf(b), "failed", "DB FACT: every booking on the PaymentIntent");
});

test("PF2: a redelivery is a no-op — nothing flips twice, the email goes once", async () => {
  const pi = `pi_${RUN}_pf2`;
  const a = await makeBooking(pi);
  const { markCheckoutPaymentFailed } = await import("../services/checkout-claim.service");

  const sent: string[] = [];
  const sendEmail = async (p: { toEmail: string }) => {
    sent.push(p.toEmail);
  };
  const first = await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "platform_webhook", sendEmail });
  // The same event reaching the OTHER endpoint, then a Stripe redelivery to the first.
  const second = await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "connect_webhook", sendEmail });
  const third = await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "platform_webhook", sendEmail });

  assert.deepEqual(first.failedBookingIds, [a]);
  assert.deepEqual(second.failedBookingIds, [], "the loser matches zero rows");
  assert.deepEqual(third.failedBookingIds, [], "a redelivery matches zero rows");
  assert.equal(await statusOf(a), "failed");
  assert.deepEqual(sent, [`pfail-${RUN}@t.test`], "exactly one email, for the one flip");

  // And through the real platform handler: a redelivered event still answers 2xx and moves nothing.
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  assert.deepEqual(await stripePaymentService.handleWebhook(platformFailedEvent(pi, [a])), { received: true });
  assert.equal(await statusOf(a), "failed");
});

test("PF3: a late failure never demotes a confirmed booking", async () => {
  const pi = `pi_${RUN}_pf3`;
  const a = await makeBooking(pi, "confirmed");
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handleWebhook(platformFailedEvent(pi, [a]));
  assert.equal(await statusOf(a), "confirmed", "DB FACT: status='payment_pending' is the guard");

  const { markCheckoutPaymentFailed } = await import("../services/checkout-claim.service");
  const r = await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "connect_webhook", sendEmail: async () => {} });
  assert.deepEqual(r.failedBookingIds, []);
  assert.equal(await statusOf(a), "confirmed");
});

test("PF4: the Connect caller's function flips; the platform path still runs the legacy rail", async () => {
  // (a) Connect: processStripeWebhookEvent is module-private; its payment_failed arm is now a
  //     single call to markCheckoutPaymentFailed({ actor: "connect_webhook" }) — assert that source
  //     shape (no second inline UPDATE survives) and the function's effect.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes/webhooks.routes.ts"), "utf8");
  assert.match(src, /markCheckoutPaymentFailed\(\{[^}]*actor:\s*"connect_webhook"/);
  assert.doesNotMatch(src, /SET status\s*=\s*'failed'/, "no second copy of the flip on the Connect rail");

  const pi = `pi_${RUN}_pf4`;
  const a = await makeBooking(pi);
  const { markCheckoutPaymentFailed } = await import("../services/checkout-claim.service");
  const r = await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "connect_webhook", sendEmail: async () => {} });
  assert.deepEqual(r.failedBookingIds, [a]);
  assert.equal(await statusOf(a), "failed");

  // (b) Legacy rail: a `bookings` row named in metadata.bookingIds still becomes payment_failed.
  const legacyId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO bookings (id, user_id, status, payment_status)
    VALUES (${legacyId}, ${ids.user}, 'pending', 'pending')
  `);
  createdLegacyBookingIds.push(legacyId);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handleWebhook(platformFailedEvent(`pi_${RUN}_pf4_legacy`, [legacyId]));
  const lr = await db.execute(sql`SELECT status, payment_status FROM bookings WHERE id = ${legacyId}`);
  assert.deepEqual(lr.rows[0], { status: "payment_failed", payment_status: "failed" });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PF7–PF10 — R162 `failed` IS FINAL (ledger `2026-09-27-failed-is-final`). No network: the SERVICE'S
// OWN Stripe client (`stripe` exported by stripe-payment.service) has its three methods replaced by
// recorders, so the real claim, refund call site, audit writer and cancel decision all run.
// `checkout-payment-failed-final.stripe.db.test.ts` proves the same chain against Stripe test mode.
// ═══════════════════════════════════════════════════════════════════════════════════════════

type FakePi = { status: string; amount_received: number; amount_refunded?: number };
async function withFakeStripe<T>(pis: Record<string, FakePi>, fn: (calls: { refunds: any[]; cancels: any[] }) => Promise<T>): Promise<T> {
  const { stripe } = await import("../services/stripe-payment.service");
  const s: any = stripe;
  const orig = { retrieve: s.paymentIntents.retrieve, cancel: s.paymentIntents.cancel, create: s.refunds.create };
  const calls = { refunds: [] as any[], cancels: [] as any[] };
  const refundByKey = new Map<string, any>();
  s.paymentIntents.retrieve = async (id: string) => {
    const p = pis[id];
    if (!p) throw new Error(`no such PaymentIntent ${id}`);
    return { id, status: p.status, amount_received: p.amount_received, latest_charge: { amount_refunded: p.amount_refunded ?? 0 } };
  };
  s.paymentIntents.cancel = async (id: string, params: any, options: any) => {
    calls.cancels.push({ id, params, options });
    if ((pis[id] as any)?.cancelThrows) throw new Error("stripe cancel refused");
    pis[id].status = "canceled";
    return { id, status: "canceled" };
  };
  s.refunds.create = async (params: any, options: any) => {
    calls.refunds.push({ params, options });
    const key = options?.idempotencyKey;
    if (!refundByKey.has(key)) {
      refundByKey.set(key, { id: `re_${RUN}_${refundByKey.size}`, status: "succeeded", amount: params.amount, metadata: params.metadata });
      const p = pis[params.payment_intent];
      if (p) p.amount_refunded = (p.amount_refunded ?? 0) + params.amount;
    }
    return refundByKey.get(key);
  };
  try {
    return await fn(calls);
  } finally {
    s.paymentIntents.retrieve = orig.retrieve;
    s.paymentIntents.cancel = orig.cancel;
    s.refunds.create = orig.create;
  }
}

async function refundRows(pi: string): Promise<any[]> {
  const r = await db.execute(sql`SELECT stripe_refund_id, amount, reason FROM refunds WHERE stripe_payment_intent_id = ${pi}`);
  return r.rows as any[];
}

after(async () => {
  await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id LIKE ${`pi_${RUN}_%`}`).catch(() => {});
});

/**
 * Give a booking the traveler-fee snapshot checkout stamps at claim time and the `+traveler_service_fee`
 * ledger row authorization writes — through the PRODUCTION resolver and writer, never a hand-built row.
 */
async function withTravelerFee(bookingId: string, price = 100): Promise<number> {
  const { resolveTravelerServiceFee } = await import("../services/fee-resolution.service");
  const { recordTravelerServiceFeeLedger } = await import("../services/fee-ledger.service");
  const resolved = await resolveTravelerServiceFee(price);
  const snapshot = {
    charged: resolved.amount, wouldHaveBeen: resolved.amount, rate: resolved.rate, bandId: resolved.bandId,
    bandKey: resolved.bandKey, capApplied: resolved.capApplied, waived: false, waiverBasis: null,
  };
  await db.execute(sql`
    UPDATE service_bookings SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object('travelerServiceFee', ${JSON.stringify(snapshot)}::jsonb)
    WHERE id = ${bookingId}
  `);
  await recordTravelerServiceFeeLedger({ bookingIds: [bookingId], actor: "test" });
  return resolved.amount;
}

async function feeLedger(bookingId: string): Promise<{ net: number; reversals: number; fees: number }> {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::numeric AS net,
           COUNT(*) FILTER (WHERE fee_type = 'reversal')::int AS reversals,
           COUNT(*) FILTER (WHERE fee_type = 'traveler_service_fee')::int AS fees
    FROM fee_ledger WHERE booking_id = ${bookingId}
      AND fee_type IN ('traveler_service_fee', 'reversal')
  `);
  const row = r.rows[0] as any;
  return { net: Number(row.net), reversals: row.reversals, fees: row.fees };
}

async function refundNotices(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${ids.user} AND type = 'payment_refunded'`);
  return (r.rows[0] as any).n;
}

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.user}`).catch(() => {});
  for (const id of createdBookingIds) await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
});

test("PF7: a late success on a FAILED booking stays failed, is an exception, and is refunded exactly once", async () => {
  const pi = `pi_${RUN}_pf7`;
  const a = await makeBooking(pi);
  const fee = await withTravelerFee(a);
  assert.ok(fee > 0, "fixture: the traveler service fee band charges a fee");
  assert.deepEqual(await feeLedger(a), { net: fee, reversals: 0, fees: 1 }, "authorization recorded the fee");
  const { markCheckoutPaymentFailed, promotePaidCheckout, refundLateSuccessOnFailedIntent } = await import(
    "../services/checkout-claim.service"
  );
  await markCheckoutPaymentFailed({ paymentIntentId: pi, actor: "platform_webhook", sendEmail: async () => {} });
  assert.equal(await statusOf(a), "failed");

  await withFakeStripe({ [pi]: { status: "succeeded", amount_received: 12500 } }, async (calls) => {
    // The traveler re-confirmed the SAME intent and it succeeded; the client fallback reports it.
    const first = await promotePaidCheckout({ paymentIntentId: pi, actor: "client", actorId: ids.user, bookingIds: [a] });
    assert.deepEqual(first.promoted, [], "failed is final — never promoted");
    assert.equal(first.exceptions[0]?.reason, "not_promotable");
    assert.equal(first.lateSuccessRefund?.outcome, "refunded");
    assert.equal(await statusOf(a), "failed", "DB FACT: the booking STAYS failed");

    // Redelivery through every other path: the webhook, the drift job's hand-off, a concurrent pair.
    await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [a] });
    const [x, y] = await Promise.all([
      refundLateSuccessOnFailedIntent({ paymentIntentId: pi, actor: "reconciliation" }),
      refundLateSuccessOnFailedIntent({ paymentIntentId: pi, actor: "reconciliation" }),
    ]);
    assert.ok([x.outcome, y.outcome].every((o) => o === "already_refunded"), JSON.stringify([x, y]));

    const keys = new Set(calls.refunds.map((c) => c.options?.idempotencyKey));
    assert.deepEqual([...keys], [`late-success-refund-${pi}`], "ONE Stripe idempotency key, derived from the PI");
    assert.equal(calls.refunds.length, 1, "exactly one Stripe refund call");
    assert.equal(calls.refunds[0].params.amount, 12500, "the amount is what Stripe says it received (§14)");
    assert.equal(calls.refunds[0].params.metadata.source, "late_success_on_failed_booking");
  });
  const rows = await refundRows(pi);
  assert.equal(rows.length, 1, "DB FACT: one refunds audit row");
  assert.equal(rows[0].reason, "late_success_on_failed_booking");
  const d = await db.execute(sql`SELECT booking_details->'lateSuccessRefund' AS l, booking_details->'reconciliationException' AS e FROM service_bookings WHERE id = ${a}`);
  assert.equal((d.rows[0] as any).l.refundId, rows[0].stripe_refund_id, "DB FACT: the claim records the refund id");
  assert.equal((d.rows[0] as any).e.reason, "not_promotable", "DB FACT: the reconciliation exception is recorded");

  // The fee record: reversed through the shared writer, exactly once — it nets to zero.
  assert.deepEqual(await feeLedger(a), { net: 0, reversals: 1, fees: 1 }, "DB FACT: the traveler fee is reversed once and nets to 0");
  // The traveler is told, exactly once, in honest words.
  assert.equal(await refundNotices(), 1, "DB FACT: ONE refund notice");
  const n = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${ids.user} AND type = 'payment_refunded'`);
  const msg = String((n.rows[0] as any).message);
  assert.match(msg, /didn't go through/);
  assert.match(msg, /refunded/);
  assert.match(msg, /nothing was booked/);
  assert.match(msg, /not a new charge/);

  // Yet more redeliveries: still one reversal, still one notice.
  await withFakeStripe({ [pi]: { status: "succeeded", amount_received: 12500, amount_refunded: 12500 } }, async () => {
    await promotePaidCheckout({ paymentIntentId: pi, actor: "client", actorId: ids.user, bookingIds: [a] });
    await refundLateSuccessOnFailedIntent({ paymentIntentId: pi, actor: "reconciliation" });
  });
  assert.deepEqual(await feeLedger(a), { net: 0, reversals: 1, fees: 1 });
  assert.equal(await refundNotices(), 1);
});

test("PF8: no refund when Stripe says the intent did not succeed; no refund for a booking that is not failed", async () => {
  const pi = `pi_${RUN}_pf8`;
  const a = await makeBooking(pi, "failed");
  const conf = `pi_${RUN}_pf8c`;
  await makeBooking(conf, "confirmed");
  const { refundLateSuccessOnFailedIntent } = await import("../services/checkout-claim.service");
  await withFakeStripe(
    { [pi]: { status: "requires_payment_method", amount_received: 0 }, [conf]: { status: "succeeded", amount_received: 12500 } },
    async (calls) => {
      assert.equal((await refundLateSuccessOnFailedIntent({ paymentIntentId: pi, actor: "t" })).outcome, "nothing_to_refund");
      assert.equal((await refundLateSuccessOnFailedIntent({ paymentIntentId: conf, actor: "t" })).outcome, "not_applicable");
      assert.equal(calls.refunds.length, 0);
    },
  );
  assert.equal(await statusOf(a), "failed");
});

test("PF9: cancelStalePaymentIntent cancels an open intent once, and never one that is processing or succeeded", async () => {
  const { cancelStalePaymentIntent } = await import("../services/checkout-claim.service");
  const open = `pi_${RUN}_pf9o`, proc = `pi_${RUN}_pf9p`, won = `pi_${RUN}_pf9s`, gone = `pi_${RUN}_pf9c`;
  await withFakeStripe(
    {
      [open]: { status: "requires_payment_method", amount_received: 0 },
      [proc]: { status: "processing", amount_received: 0 },
      [won]: { status: "succeeded", amount_received: 100 },
      [gone]: { status: "canceled", amount_received: 0 },
    },
    async (calls) => {
      assert.equal((await cancelStalePaymentIntent({ paymentIntentId: open })).outcome, "canceled");
      assert.equal((await cancelStalePaymentIntent({ paymentIntentId: open })).outcome, "already_canceled", "idempotent");
      assert.deepEqual((await cancelStalePaymentIntent({ paymentIntentId: proc })), { outcome: "not_cancellable", status: "processing" });
      assert.deepEqual((await cancelStalePaymentIntent({ paymentIntentId: won })), { outcome: "not_cancellable", status: "succeeded" });
      assert.equal((await cancelStalePaymentIntent({ paymentIntentId: gone })).outcome, "already_canceled");
      assert.equal(calls.cancels.length, 1, "exactly one Stripe cancel, for the open intent only");
      assert.deepEqual(calls.cancels[0].params, { cancellation_reason: "abandoned" });
      assert.equal(calls.cancels[0].options.idempotencyKey, `cancel-stale-pi-${open}`);
    },
  );
});

test("PF10: 'Try again' retires the OLD intent of the same plan item after the new one exists; a failed cancel blocks", async () => {
  const { retireStalePaymentIntentsForCheckout } = await import("../services/checkout-claim.service");
  const item = `pfail-${RUN}-item`;
  const oldPi = `pi_${RUN}_pf10old`, newPi = `pi_${RUN}_pf10new`;
  const oldB = await makeBooking(oldPi, "failed");
  const newB = await makeBooking(newPi);
  for (const id of [oldB, newB]) {
    await db.execute(sql`UPDATE service_bookings SET booking_details = jsonb_build_object('itineraryItemId', ${item}::text) WHERE id = ${id}`);
  }
  await withFakeStripe(
    { [oldPi]: { status: "requires_payment_method", amount_received: 0 }, [newPi]: { status: "requires_payment_method", amount_received: 0 } },
    async (calls) => {
      const r = await retireStalePaymentIntentsForCheckout({ travelerId: ids.user, bookingIds: [newB], newPaymentIntentId: newPi });
      assert.equal(r.ok, true);
      assert.deepEqual(calls.cancels.map((c) => c.id), [oldPi], "the OLD intent is cancelled, never the new one");
    },
  );
  // A cancel Stripe refuses ⇒ ok:false ⇒ the checkout route opens nothing.
  const oldPi2 = `pi_${RUN}_pf10old2`, newPi2 = `pi_${RUN}_pf10new2`;
  const oldB2 = await makeBooking(oldPi2, "failed");
  const newB2 = await makeBooking(newPi2);
  for (const id of [oldB2, newB2]) {
    await db.execute(sql`UPDATE service_bookings SET booking_details = jsonb_build_object('itineraryItemId', ${`${item}-2`}::text) WHERE id = ${id}`);
  }
  await withFakeStripe(
    { [oldPi2]: { status: "requires_payment_method", amount_received: 0, cancelThrows: true } as any },
    async () => {
      const r = await retireStalePaymentIntentsForCheckout({ travelerId: ids.user, bookingIds: [newB2], newPaymentIntentId: newPi2 });
      assert.equal(r.ok, false);
    },
  );
  const { isTerminalUnpromotable } = await import("../services/checkout-claim.service");
  assert.equal(isTerminalUnpromotable("failed"), true, "the same-key re-POST never hands back a failed row's intent");
  assert.equal(isTerminalUnpromotable("payment_pending"), false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PF5/PF6 — SIGNED HTTP DELIVERY to the RUNNING app (the `platform-refund-webhook.signed.db.test.ts`
// pattern). The defect lived between Stripe's routing and the endpoints, so these drive the real
// routes: raw body, `stripe-signature`, `constructEvent`. CI's suite-server-tests job starts the app
// with STRIPE_WEBHOOK_SECRET_TEST / STRIPE_CONNECT_WEBHOOK_SECRET_TEST and sets JOURNEY_BASE_URL;
// without them these skip (a unit run has no server to deliver to).
// ═══════════════════════════════════════════════════════════════════════════════════════════

const BASE_URL = process.env.JOURNEY_BASE_URL;

async function signedDeliver(path: string, secret: string, event: any): Promise<number> {
  const Stripe = (await import("stripe")).default;
  const signer = new Stripe("sk_test_signing_only_no_network", { apiVersion: "2024-12-18.acacia" as any });
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return res.status;
}

test("PF5: SIGNED delivery to POST /api/bookings/webhooks/stripe marks the cart booking failed; a replay is a no-op", async (t) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!BASE_URL || !secret) {
    t.skip("needs a running app: JOURNEY_BASE_URL + STRIPE_WEBHOOK_SECRET_TEST");
    return;
  }
  const pi = `pi_${RUN}_pf5`;
  const a = await makeBooking(pi);
  const event = platformFailedEvent(pi, [a]);

  assert.equal(await signedDeliver("/api/bookings/webhooks/stripe", secret, event), 200);
  assert.equal(await statusOf(a), "failed", "DB FACT: the real platform route now marks the cart booking");

  const before = await db.execute(sql`SELECT status, updated_at FROM service_bookings WHERE id = ${a}`);
  assert.equal(await signedDeliver("/api/bookings/webhooks/stripe", secret, event), 200, "the replay is answered 2xx");
  const after = await db.execute(sql`SELECT status, updated_at FROM service_bookings WHERE id = ${a}`);
  assert.deepEqual(after.rows[0], before.rows[0], "DB FACT: the replay changed nothing (status AND updated_at)");
});

test("PF6: SIGNED delivery to POST /api/webhooks/stripe (Connect) still marks the cart booking failed", async (t) => {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST;
  if (!BASE_URL || !secret) {
    t.skip("needs a running app: JOURNEY_BASE_URL + STRIPE_CONNECT_WEBHOOK_SECRET_TEST");
    return;
  }
  const pi = `pi_${RUN}_pf6`;
  const a = await makeBooking(pi);
  assert.equal(await signedDeliver("/api/webhooks/stripe", secret, platformFailedEvent(pi, [a])), 200);
  assert.equal(await statusOf(a), "failed", "DB FACT: the Connect caller of the shared flip is unchanged");
});
