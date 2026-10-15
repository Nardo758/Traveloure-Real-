/**
 * PAY-1 — payment checks (ledger `2026-10-15-pay1-payment-checks`).
 *
 *   P1  §1  a paid transport session with no recordable PaymentIntent holds the booking at
 *           `needs_review` with the reason merged, and only from `pending`.
 *   P2  §2  the legacy deposit webhook records the deposit PaymentIntent on the row, never over one.
 *   P3  §3  the webhook claim on platform_webhook_consumers: one claim; a completed one is a replay; a
 *           live one is in flight; a failed one and a stale one are re-taken; the work's failure
 *           records `error` and leaves `completed_at` NULL.
 *   P4  §4  Resolve on a service booking: confirmed needs a PaymentIntent (422 without), records it
 *           with the paid stamp, never over a different one (409); cancelled moves status only; a
 *           row already resolved is 409.
 *   P5  §4  Resolve on legacy and LiteAPI rows; LiteAPI → cancelled is not available yet (501).
 *   P6  §4  the detail read says whether a PaymentIntent exists and carries the hold on its timeline.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by it and deleted in after().
 * Run solo: npx tsx --test server/__tests__/pay1-payment-checks.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_pay1_suite";
}
import { sql } from "drizzle-orm";
import { db } from "../db";
import { holdTransportBookingForReview } from "../services/stripe.service";
import {
  claimWebhookEvent,
  failWebhookClaim,
  runUnderWebhookClaim,
  WebhookClaimInFlightError,
  WEBHOOK_CLAIM_TTL_MINUTES,
} from "../services/webhook-claim.service";
import { loadAdminBookingDetail, resolveNeedsReviewBooking } from "../services/admin-booking-detail.service";
import { stripePaymentService } from "../services/stripe-payment.service";

const RUN = crypto.randomUUID().slice(0, 8);
const traveler = `pay1-${RUN}-trav`;
const trip = `pay1-${RUN}-trip`;
const serviceIds: string[] = [];
const legacyIds: string[] = [];
const liteapiIds: string[] = [];
const eventIds: string[] = [];

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[pay1] REFUSING to write fixtures on '${host ?? "<none>"}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function seedService(status: string, pi: string | null = null): Promise<string> {
  const id = `booking-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, trip_id, status, total_amount, stripe_payment_intent_id, booking_details)
    VALUES (${id}, NULL, ${traveler}, ${trip}, ${status}, '120.00', ${pi}, ${JSON.stringify({ bookingType: "transport" })}::jsonb)
  `);
  serviceIds.push(id);
  return id;
}
async function readService(id: string): Promise<any> {
  return rowsOf(await db.execute(sql`SELECT status, stripe_payment_intent_id, booking_details FROM service_bookings WHERE id = ${id}`))[0];
}
async function seedLegacy(status: string, pi: string | null = null): Promise<string> {
  const r = rowsOf(await db.execute(sql`
    INSERT INTO bookings (user_id, trip_id, status, total_amount, stripe_payment_intent_id)
    VALUES (${traveler}, ${trip}, ${status}, '80.00', ${pi}) RETURNING id
  `));
  legacyIds.push(String(r[0].id));
  return String(r[0].id);
}
async function seedLiteapi(status: string): Promise<string> {
  const r = rowsOf(await db.execute(sql`
    INSERT INTO liteapi_bookings (trip_id, itinerary_item_id, user_id, provider_hotel_id, env, status, offer_id, prebook_id, transaction_id, checkin, checkout, adults, amount_cents, currency)
    VALUES (${trip}, ${`pay1-${RUN}-item-${crypto.randomUUID().slice(0, 6)}`}, ${traveler}, 'lp1', 'sandbox', ${status}, 'offer', ${`pre-${crypto.randomUUID()}`}, 'tx', CURRENT_DATE + 30, CURRENT_DATE + 32, 2, 30000, 'USD')
    RETURNING id
  `));
  liteapiIds.push(String(r[0].id));
  return String(r[0].id);
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${traveler}, ${`pay1-${RUN}@t.test`}, 'Pay', 'One')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date) VALUES (${trip}, ${traveler}, 'PAY-1 trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
});

after(async () => {
  for (const id of serviceIds) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  for (const id of legacyIds) await db.execute(sql`DELETE FROM bookings WHERE id::text = ${id}`).catch(() => {});
  for (const id of liteapiIds) await db.execute(sql`DELETE FROM liteapi_bookings WHERE id = ${id}`).catch(() => {});
  for (const id of eventIds) await db.execute(sql`DELETE FROM platform_webhook_consumers WHERE stripe_event_id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id LIKE ${`pi_${RUN}%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${traveler}`).catch(() => {});
});

test("P1: a paid transport session with no recordable PaymentIntent is held at needs_review, only from pending", async () => {
  const id = await seedService("pending");
  const held = await holdTransportBookingForReview(id, { reason: "no_payment_intent", sessionId: `cs_${RUN}`, paymentIntentId: null, amountDollars: 120 });
  assert.equal(held, true);
  const row = await readService(id);
  assert.equal(row.status, "needs_review");
  assert.equal(row.stripe_payment_intent_id, null, "nothing is invented");
  assert.equal(row.booking_details.needsReview.reason, "no_payment_intent");
  assert.equal(row.booking_details.bookingType, "transport", "the reason is merged, never assigned over other keys");
  assert.equal(Number(row.booking_details.needsReview.amount), 120);

  const again = await holdTransportBookingForReview(id, { reason: "later", sessionId: `cs_${RUN}`, paymentIntentId: null, amountDollars: null });
  assert.equal(again, false, "a row already held is not moved again");
  assert.equal((await readService(id)).booking_details.needsReview.reason, "no_payment_intent", "the first record survives");

  const confirmed = await seedService("confirmed");
  assert.equal(await holdTransportBookingForReview(confirmed, { reason: "x", sessionId: "cs", paymentIntentId: null, amountDollars: null }), false);
  assert.equal((await readService(confirmed)).status, "confirmed", "a confirmed row is never pulled back");
});

test("P2: the legacy deposit webhook records the deposit PaymentIntent, never over one already there", async () => {
  const fresh = await seedLegacy("pending_payment");
  const carrying = await seedLegacy("pending_payment", `pi_${RUN}_already`);
  const pi = `pi_${RUN}_deposit`;
  await stripePaymentService.handlePaymentSucceeded({
    id: pi,
    metadata: { bookingIds: `${fresh},${carrying}`, isDeposit: "true", userId: traveler },
  } as any);
  const rows = rowsOf(await db.execute(sql`
    SELECT id::text AS id, status, stripe_payment_intent_id, stripe_deposit_intent_id FROM bookings WHERE id::text IN (${fresh}, ${carrying})
  `));
  const a = rows.find((r) => r.id === fresh);
  const b = rows.find((r) => r.id === carrying);
  assert.equal(a.status, "confirmed");
  assert.equal(a.stripe_payment_intent_id, pi);
  assert.equal(a.stripe_deposit_intent_id, pi);
  assert.equal(b.stripe_payment_intent_id, `pi_${RUN}_already`, "an id already on the row is never overwritten");
  assert.equal(b.stripe_deposit_intent_id, pi);
});

test("P3: the webhook claim — one claim, replays skipped, live claims in flight, failed and stale ones re-taken", async () => {
  const evt = { id: `evt_${RUN}_claim`, type: "payment_intent.succeeded" } as const;
  eventIds.push(evt.id);
  assert.deepEqual(await claimWebhookEvent(evt, "platform", evt), { claimed: true });
  assert.deepEqual(await claimWebhookEvent(evt, "platform", evt), { claimed: false, reason: "in_flight" });
  assert.deepEqual(await claimWebhookEvent(evt, "connect", evt), { claimed: true }, "another consumer has its own claim");

  await failWebhookClaim(evt.id, "platform", new Error("boom"));
  assert.deepEqual(await claimWebhookEvent(evt, "platform", evt), { claimed: true }, "a failed claim is re-taken");
  const retaken = rowsOf(await db.execute(sql`SELECT error FROM platform_webhook_consumers WHERE stripe_event_id = ${evt.id} AND consumer = 'platform'`))[0];
  assert.equal(retaken.error, null, "the re-take clears the error");

  await db.execute(sql`
    UPDATE platform_webhook_consumers SET created_at = NOW() - make_interval(mins => ${WEBHOOK_CLAIM_TTL_MINUTES + 1})
    WHERE stripe_event_id = ${evt.id} AND consumer = 'connect'
  `);
  assert.deepEqual(await claimWebhookEvent(evt, "connect", evt), { claimed: true }, "a claim older than the TTL is re-taken");

  const done = { id: `evt_${RUN}_run`, type: "charge.refunded" } as const;
  eventIds.push(done.id);
  let runs = 0;
  assert.equal(await runUnderWebhookClaim(done, "platform", done, async () => { runs += 1; }), "processed");
  assert.equal(await runUnderWebhookClaim(done, "platform", done, async () => { runs += 1; }), "already_completed");
  assert.equal(runs, 1, "a completed claim never runs the work again");

  const failing = { id: `evt_${RUN}_fail`, type: "charge.refunded" } as const;
  eventIds.push(failing.id);
  await assert.rejects(runUnderWebhookClaim(failing, "platform", failing, async () => { throw new Error("handler failed"); }), /handler failed/);
  const failedRow = rowsOf(await db.execute(sql`SELECT completed_at, error FROM platform_webhook_consumers WHERE stripe_event_id = ${failing.id} AND consumer = 'platform'`))[0];
  assert.equal(failedRow.completed_at, null);
  assert.equal(failedRow.error, "handler failed");

  const live = { id: `evt_${RUN}_live`, type: "charge.refunded" } as const;
  eventIds.push(live.id);
  await claimWebhookEvent(live, "platform", live);
  await assert.rejects(runUnderWebhookClaim(live, "platform", live, async () => {}), (e: any) => e instanceof WebhookClaimInFlightError);
});

test("P4: Resolve on a service booking", async () => {
  const noPi = await seedService("needs_review");
  const refused = await resolveNeedsReviewBooking("service", noPi, "confirmed", null);
  assert.equal(refused.ok, false);
  assert.equal((refused as any).httpStatus, 422, "never confirmed without a PaymentIntent");
  assert.equal((await readService(noPi)).status, "needs_review");

  const pi = `pi_${RUN}_admin`;
  const ok = await resolveNeedsReviewBooking("service", noPi, "confirmed", pi);
  assert.deepEqual(ok, { ok: true, status: "confirmed", paymentIntentId: pi });
  const row = await readService(noPi);
  assert.equal(row.status, "confirmed");
  assert.equal(row.stripe_payment_intent_id, pi);
  assert.equal(row.booking_details.paidCharge.status, "confirmed", "a confirm carries the payment-on-record stamp");

  const again = await resolveNeedsReviewBooking("service", noPi, "cancelled", null);
  assert.equal((again as any).httpStatus, 409, "a resolved row is not resolved twice");
  assert.equal((await readService(noPi)).status, "confirmed");

  const carrying = await seedService("needs_review", `pi_${RUN}_row`);
  const different = await resolveNeedsReviewBooking("service", carrying, "confirmed", `pi_${RUN}_other`);
  assert.equal((different as any).httpStatus, 409);
  assert.equal((different as any).reason, "different_payment_intent");
  assert.equal((await readService(carrying)).stripe_payment_intent_id, `pi_${RUN}_row`, "never overwritten");
  const rowPi = await resolveNeedsReviewBooking("service", carrying, "confirmed", null);
  assert.equal(rowPi.ok, true, "the row's own PaymentIntent is enough");

  const toCancel = await seedService("needs_review");
  const cancelled = await resolveNeedsReviewBooking("service", toCancel, "cancelled", null);
  assert.equal(cancelled.ok, true);
  const c = await readService(toCancel);
  assert.equal(c.status, "cancelled");
  assert.equal(c.booking_details.paidCharge, undefined, "cancelled moves status only");

  const missing = await resolveNeedsReviewBooking("service", `booking-${RUN}-missing`, "cancelled", null);
  assert.equal((missing as any).httpStatus, 404);
});

test("P5: Resolve on legacy and LiteAPI rows", async () => {
  const legacy = await seedLegacy("needs_review");
  assert.equal(((await resolveNeedsReviewBooking("legacy", legacy, "confirmed", null)) as any).httpStatus, 422);
  const ok = await resolveNeedsReviewBooking("legacy", legacy, "confirmed", `pi_${RUN}_legacy`);
  assert.equal(ok.ok, true);
  const row = rowsOf(await db.execute(sql`SELECT status, stripe_payment_intent_id FROM bookings WHERE id::text = ${legacy}`))[0];
  assert.equal(row.status, "confirmed");
  assert.equal(row.stripe_payment_intent_id, `pi_${RUN}_legacy`);

  const stay = await seedLiteapi("needs_review");
  const cancel = await resolveNeedsReviewBooking("liteapi", stay, "cancelled", null);
  assert.equal((cancel as any).httpStatus, 501, "the LiteAPI cancelled branch lands with the stay-item release");
  assert.equal(rowsOf(await db.execute(sql`SELECT status FROM liteapi_bookings WHERE id = ${stay}`))[0].status, "needs_review");
  const confirm = await resolveNeedsReviewBooking("liteapi", stay, "confirmed", null);
  assert.equal(confirm.ok, true, "a LiteAPI stay is paid through Nuitée; no PaymentIntent is asked for");
  assert.equal(rowsOf(await db.execute(sql`SELECT status FROM liteapi_bookings WHERE id = ${stay}`))[0].status, "confirmed");
});

test("P6: the detail read says whether a PaymentIntent exists and shows the hold", async () => {
  const id = await seedService("pending");
  await holdTransportBookingForReview(id, { reason: "stamp_refused:terminal_status", sessionId: `cs_${RUN}_d`, paymentIntentId: null, amountDollars: null });
  const d = await loadAdminBookingDetail("service", id);
  assert.ok(d);
  assert.equal(d!.hasPaymentIntent, false);
  assert.equal(d!.paidThrough, "stripe");
  assert.equal(d!.canResolve, true);
  assert.equal(d!.traveler.email, `pay1-${RUN}@t.test`);
  assert.ok(d!.timeline.some((t) => t.label === "needsReview" && t.detail === "stamp_refused:terminal_status"));

  const withPi = await seedService("confirmed", `pi_${RUN}_d2`);
  const d2 = await loadAdminBookingDetail("service", withPi);
  assert.equal(d2!.hasPaymentIntent, true);
  assert.equal(d2!.paymentIntentId, `pi_${RUN}_d2`);
  assert.equal(d2!.canResolve, false);

  const stay = await seedLiteapi("confirmed");
  const d3 = await loadAdminBookingDetail("liteapi", stay);
  assert.equal(d3!.paidThrough, "nuitee");
  assert.equal(d3!.hasPaymentIntent, false);

  assert.equal(await loadAdminBookingDetail("legacy", crypto.randomUUID()), null);
});
