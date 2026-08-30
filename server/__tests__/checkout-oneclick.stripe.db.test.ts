/**
 * ONE-CLICK BOOKING CHECKOUT (B2) — live-Stripe behavioural proof.
 *
 * WHAT THIS GUARDS
 * ────────────────
 * `POST /api/checkout` with `useSavedCard: true` asks `createPaymentIntent` for an OFF-SESSION
 * confirm against the traveler's vaulted card, and — when Stripe answers `succeeded` — promotes
 * the money leg inline through the SAME `promotePaidCheckout` the webhook and the client fallback
 * drive (§15c: one promotion implementation, N callers). This file proves that chain against the
 * REAL Stripe test-mode API; nothing Stripe-shaped is mocked.
 *
 *   OC1  success — a vaulted default card confirms off-session: `status === "succeeded"`, the
 *        PaymentIntent's `metadata.bookingIds` names the claimed bookings (the §15c/§19b linkage
 *        a parallel helper would have dropped — the reason B2 parameterised createPaymentIntent
 *        instead of reusing chargeSavedMethod), a `payment_intents` row is written, and
 *        promotePaidCheckout(actor "checkout") flips the stamped claims to `confirmed`.
 *
 *   OC2  double signal — the webhook fires after the inline promotion: ZERO new promotions, the
 *        rows land in `alreadyConfirmed`, statuses untouched. One flip total, either order.
 *
 *   OC3  SCA demanded — the vaulted card requires authentication off-session
 *        (pm_card_authenticationRequired): the confirm does NOT succeed, a usable clientSecret
 *        comes back for the interactive fallback, and the claim stays `payment_pending` —
 *        NOT promoted, NOT voided (it remains reclaimable exactly as §15b requires).
 *
 *   OC4  no saved card — `offSession: true` with nothing vaulted degrades to the interactive
 *        path: an unconfirmed PaymentIntent with a clientSecret, never an error. The absence of
 *        a saved card must never fail a checkout.
 *
 * SKIP CONTRACT (mirrors the journey suite's Stripe positive/negative posture): without a REAL
 * test key the file SKIPS VISIBLY — it never silently passes. A key matching the CI stub/dummy
 * patterns counts as absent. In CI this runs in the job that holds the STRIPE_SECRET_KEY repo
 * secret, so once that secret is set the skip path is unreachable there — and the run is the
 * proof the sandbox (whose egress policy blocks api.stripe.com) cannot produce locally.
 *
 * DISPOSABLE DB ONLY — same guard as the sweep/promotion suites. Every DB row this file writes
 * is created here and deleted in after(); Stripe-side fixtures are deleted best-effort (test
 * mode, no money moves — `succeeded` here means a test-mode confirm, never a real charge).
 *
 * Run solo: STRIPE_SECRET_KEY=sk_test_… JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test server/__tests__/checkout-oneclick.stripe.db.test.ts
 */

const RAW_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const HAVE_REAL_KEY =
  /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
// The service module constructs its Stripe client at import time and throws keyless — the same
// dummy-key technique the promotion suite uses. Only the skip path ever runs with the dummy.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_oneclick_suite";
// SKIP path only: ../db throws at IMPORT when DATABASE_URL is unset, which would turn a keyless
// run into a crash instead of a visible skip. The placeholder is never connected to — every hook
// and test body returns/skips first. With a real key present we deliberately leave DATABASE_URL
// alone so a missing DB fails LOUDLY rather than skipping the proof.
if (!HAVE_REAL_KEY) process.env.DATABASE_URL ||= "postgresql://skip:skip@127.0.0.1:5432/skip";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

// Dynamic imports, deliberately AFTER the env guards above: static `import` declarations hoist
// above any statement in ESM, so a static `import { db }` would execute ../db (which throws on a
// missing DATABASE_URL) before the skip-path placeholder was set, turning a keyless run into a
// crash instead of a visible skip.
const { db } = await import("../db");
const { promotePaidCheckout, stampAuthorization, markStripeAttempt } = await import(
  "../services/checkout-claim.service"
);
const { stripePaymentService } = await import("../services/stripe-payment.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  userOk: `oc-${RUN}-ok`,
  userSca: `oc-${RUN}-sca`,
  userBare: `oc-${RUN}-bare`,
  service: `oc-${RUN}-svc`,
};
const createdBookingIds: string[] = [];
const stripeCustomerIds: string[] = [];
const stripe = HAVE_REAL_KEY ? new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 }) : null;

// ── Disposable-DB guard (identical posture to checkout-payment-promotion.db.test.ts) ─────────
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
      `[checkout-oneclick] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Create a user row + Stripe Customer, vault `pmToken` as the default card when given. */
async function makeUserWithCard(userId: string, pmToken: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${userId}, ${`${userId}@t.test`}, 'OneClick', 'Fixture')
  `);
  if (!stripe) return;
  const customer = await stripe.customers.create({
    email: `${userId}@t.test`,
    metadata: { fixture: "checkout-oneclick", run: RUN },
  });
  stripeCustomerIds.push(customer.id);
  await db.execute(sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${userId}`);
  if (pmToken) {
    const pm = await stripe.paymentMethods.attach(pmToken, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
  }
}

/** One payment_pending claim row for `userId`, with the pre-flight marker already stamped. */
async function makeClaim(userId: string, key: string): Promise<string> {
  const bookingId = crypto.randomUUID();
  createdBookingIds.push(bookingId);
  // service_bookings has NO booking_date column (that's the legacy `bookings` table — CI run #33
  // failed on exactly that mixup); trip dates live inside booking_details jsonb.
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, total_amount, platform_fee,
       status, idempotency_key, booking_details)
    VALUES
      (${bookingId}, ${ids.service}, ${userId}, ${ids.userOk}, '100.00',
       '15.00', 'payment_pending', ${key}, '{}'::jsonb)
  `);
  await markStripeAttempt([bookingId], `pi-${key}`);
  return bookingId;
}

async function bookingStatus(id: string): Promise<string> {
  const r = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`);
  return (r.rows[0] as any)?.status ?? "<missing>";
}

before(async () => {
  if (!HAVE_REAL_KEY) return;
  await assertDisposableDb();
  await makeUserWithCard(ids.userOk, "pm_card_visa");
  await makeUserWithCard(ids.userSca, "pm_card_authenticationRequired");
  await makeUserWithCard(ids.userBare, null);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.userOk}, 'One-click fixture service', '100.00')
  `);
});

after(async () => {
  if (!HAVE_REAL_KEY) return;
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM payment_intents WHERE metadata::text LIKE ${"%" + id + "%"}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  for (const u of [ids.userOk, ids.userSca, ids.userBare]) {
    await db.execute(sql`DELETE FROM users WHERE id = ${u}`).catch(() => {});
  }
  for (const c of stripeCustomerIds) {
    await stripe?.customers.del(c).catch(() => {});
  }
});

test("OC1: vaulted card → off-session confirm succeeds, metadata links bookings, checkout-actor promotion flips the stamped claim", { skip: !HAVE_REAL_KEY && "no real STRIPE_SECRET_KEY — one-click proof requires Stripe test mode" }, async () => {
  const key = `oc1-${RUN}`;
  const b1 = await makeClaim(ids.userOk, key);
  const b2 = await makeClaim(ids.userOk, `${key}-b`);

  const pi = await stripePaymentService.createPaymentIntent(
    ids.userOk,
    [{ id: b1 }, { id: b2 }],
    115,
    false,
    "usd",
    key,
    { offSession: true },
  );

  assert.equal(pi.status, "succeeded", "off-session confirm against pm_card_visa must succeed");
  assert.ok(pi.paymentIntentId?.startsWith("pi_"), "a real PaymentIntent id");

  // The linkage a parallel helper would have dropped: Stripe's own copy of the PI must name the
  // bookings (this is what §15c ordering-1 resolves from and §19b clears provenance from).
  const remote = await stripe!.paymentIntents.retrieve(pi.paymentIntentId);
  assert.equal(remote.status, "succeeded");
  const namedIds = String(remote.metadata.bookingIds ?? "");
  assert.ok(namedIds.includes(b1) && namedIds.includes(b2), "metadata.bookingIds names both claims");

  // The payment_intents row — the second thing only createPaymentIntent writes.
  const piRow = await db.execute(sql`
    SELECT user_id FROM payment_intents WHERE stripe_payment_intent_id = ${pi.paymentIntentId}
  `);
  assert.equal((piRow.rows[0] as any)?.user_id, ids.userOk, "payment_intents row written");

  // The route's remaining steps, in the route's order: stamp, then promote as actor "checkout".
  assert.equal(await stampAuthorization([b1, b2], pi.paymentIntentId), true);
  const promo = await promotePaidCheckout({
    paymentIntentId: pi.paymentIntentId,
    actor: "checkout",
    actorId: ids.userOk,
    bookingIds: [b1, b2],
  });
  assert.equal(promo.promoted.length, 2, "both claims promoted by the checkout actor");
  assert.equal(await bookingStatus(b1), "confirmed");
  assert.equal(await bookingStatus(b2), "confirmed");

  // OC2 folded in where it is strongest — the webhook arrives AFTER the inline promotion.
  const replay = await promotePaidCheckout({
    paymentIntentId: pi.paymentIntentId,
    actor: "webhook",
    metadataBookingIds: [b1, b2],
  });
  assert.equal(replay.promoted.length, 0, "webhook replay promotes nothing");
  assert.equal(replay.alreadyConfirmed.length, 2, "replay sees both as already confirmed");
  assert.equal(await bookingStatus(b1), "confirmed", "no second flip");
});

test("OC3: SCA-demanding card → confirm does not succeed, clientSecret handed back, claim stays payment_pending (reclaimable, never half-committed)", { skip: !HAVE_REAL_KEY && "no real STRIPE_SECRET_KEY — one-click proof requires Stripe test mode" }, async () => {
  const key = `oc3-${RUN}`;
  const b = await makeClaim(ids.userSca, key);

  const pi = await stripePaymentService.createPaymentIntent(
    ids.userSca,
    [{ id: b }],
    115,
    false,
    "usd",
    key,
    { offSession: true },
  );

  assert.notEqual(pi.status, "succeeded", "authentication_required must not silently succeed");
  assert.ok(pi.clientSecret, "interactive fallback needs a clientSecret");
  assert.ok(pi.paymentIntentId?.startsWith("pi_"), "the error-path PI is a real, completable PI");
  assert.equal(await bookingStatus(b), "payment_pending", "claim untouched — not promoted, not voided");
});

test("OC4: no saved card → off-session request degrades to the interactive path, never an error", { skip: !HAVE_REAL_KEY && "no real STRIPE_SECRET_KEY — one-click proof requires Stripe test mode" }, async () => {
  const key = `oc4-${RUN}`;
  const b = await makeClaim(ids.userBare, key);

  const pi = await stripePaymentService.createPaymentIntent(
    ids.userBare,
    [{ id: b }],
    115,
    false,
    "usd",
    key,
    { offSession: true },
  );

  assert.notEqual(pi.status, "succeeded", "nothing vaulted — cannot have charged");
  assert.ok(pi.clientSecret, "standard interactive PaymentIntent returned");
  assert.equal(await bookingStatus(b), "payment_pending");
});
