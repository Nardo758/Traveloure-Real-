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
