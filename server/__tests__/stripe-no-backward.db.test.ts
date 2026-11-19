/**
 * F7 (#1820): a paid or confirmed booking never moves backward on a Stripe event.
 *
 * THIS FILE DRIVES THE REAL CODE. It builds Stripe `PaymentIntent` and `Event` objects and calls the service's own
 * `handlePaymentFailed` / `handlePaymentCanceled`, and `markCheckoutPaymentFailed` for the ledger case. It copies NO
 * SQL from the handlers: if a guard is removed from the handler, these cases go red. (The first version of this file
 * ran a copy of the SQL and could not fail that way; Leon's review, Nov 19 2026.)
 *
 * The brief's seven cases (2026-11-10 brief lines 42-49), and which line of the handler each one depends on:
 *   F7.1 confirmed cart + failed      -> checkout-claim.service.ts `markCheckoutPaymentFailed`'s guarded flip
 *   F7.2 confirmed legacy + failed    -> stripe-payment.service.ts `handlePaymentFailed` legacy UPDATE's from-state
 *   F7.3 the same two for canceled    -> `handlePaymentCanceled`'s from-state, and the ledger write's NOT succeeded
 *   F7.4 a succeeded ledger + failed  -> the ledger write's `AND status NOT IN ('succeeded')`
 *   F7.5 pending + failed still fails -> the from-state admits `pending` (it must)
 *   F7.6 a redelivered ignored event writes ONE record -> the record's `NOT (... @> eventId)` dedupe
 *   F7.7 a failure created before confirmation is ignored and recorded with stripeCreated -> the record's field set
 *
 * DB-backed, and CI is its database (this workstation has none, per the overnight rule).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { stripePaymentService } from "../services/stripe-payment.service";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
let bookingId = "";
let cartBookingId = "";
let piId = "";

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* refuse below */ }
  if (!DISPOSABLE.has(host)) throw new Error(`[stripe-no-backward] REFUSING to write to '${host}'.`);
}

/** A PaymentIntent good enough for the two handlers: id, metadata.bookingIds and a created clock. */
function intent(id: string, bookingIds: string | undefined, created = Math.floor(Date.now() / 1000)) {
  return {
    id,
    object: "payment_intent",
    created,
    metadata: bookingIds ? { bookingIds } : {},
  } as unknown as Stripe.PaymentIntent;
}

/** A Stripe Event with the id, type and created the handlers now read. */
function eventFor(type: string, object: Stripe.PaymentIntent, created?: number): Stripe.Event {
  return {
    id: `evt_f7_${crypto.randomUUID()}`,
    object: "event",
    type,
    created: created ?? (object as any).created ?? Math.floor(Date.now() / 1000),
    data: { object },
  } as unknown as Stripe.Event;
}

async function bookingRow() {
  const [row] = (await db.execute(sql`SELECT status, payment_status, metadata FROM bookings WHERE id = ${bookingId}`)).rows ?? [];
  return row as { status: string; payment_status: string | null; metadata: any };
}

before(async () => {
  assertDisposableDb();
  bookingId = uid();
  cartBookingId = uid();
  piId = `pi_f7_${RUN}`;
  await db.execute(sql`
    INSERT INTO bookings (id, title, status, payment_status, stripe_payment_intent_id, metadata)
    VALUES (${bookingId}, ${"F7 fixture " + RUN}, 'pending', 'unpaid', ${piId}, '{}'::jsonb)
  `);
  // The cart rail's row: the minimum the guarded flip keys on.
  // The cart fixture carries the columns a booking row needs: the admin-list fixture's own shape plus the PI id the
  // handlers read (`admin-bookings-list.db.test.ts:39` is the minimal insert that works on this schema).
  await db.execute(sql`
    INSERT INTO service_bookings (id, status, stripe_payment_intent_id, booking_details, total_amount)
    VALUES (${cartBookingId}, 'payment_pending', ${piId}, '{}'::jsonb, 10)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM service_bookings WHERE id = ${cartBookingId}`).catch(() => {});
  await db.execute(sql`DELETE FROM bookings WHERE id = ${bookingId}`);
});

const service = stripePaymentService as any;

test("F7.1 a confirmed cart booking is not moved by a failed event", async () => {
  await db.execute(sql`UPDATE service_bookings SET status='confirmed' WHERE id = ${cartBookingId}`);
  await service.handlePaymentFailed(intent(piId, undefined), eventFor("payment_intent.payment_failed", intent(piId, undefined)));
  const [row] = (await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${cartBookingId}`)).rows ?? [];
  if (row) assert.equal(row.status, "confirmed");
});

test("F7.2 a confirmed legacy booking is not moved by a failed event", async () => {
  await db.execute(sql`UPDATE bookings SET status='confirmed', payment_status='paid' WHERE id = ${bookingId}`);
  const pi = intent(piId, bookingId);
  await service.handlePaymentFailed(pi, eventFor("payment_intent.payment_failed", pi));
  const row = await bookingRow();
  assert.equal(row.status, "confirmed");
  assert.equal(row.payment_status, "paid");
});

test("F7.3a the same holds for a canceled event (legacy)", async () => {
  const pi = intent(piId, bookingId);
  await service.handlePaymentCanceled(pi, eventFor("payment_intent.canceled", pi));
  assert.equal((await bookingRow()).status, "confirmed");
});

test("F7.3b and the ledger row of a succeeded intent is not rewritten", async () => {
  const ledgerId = `pi_f7_ledger_${RUN}`;
  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, amount, currency, status, metadata)
    VALUES (${ledgerId}, '10.00', 'usd', 'succeeded', '{"type":"f7_fixture"}'::jsonb)
  `);
  await service.handlePaymentCanceled(intent(ledgerId, undefined), eventFor("payment_intent.canceled", intent(ledgerId, undefined)));
  const [row] = (await db.execute(sql`SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`)).rows ?? [];
  assert.equal(row.status, "succeeded");
  await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`);
});

test("F7.4 a succeeded ledger row survives a failed event too", async () => {
  const ledgerId = `pi_f7_ledger_f_${RUN}`;
  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, amount, currency, status, metadata)
    VALUES (${ledgerId}, '10.00', 'usd', 'succeeded', '{"type":"f7_fixture"}'::jsonb)
  `);
  await service.handlePaymentFailed(intent(ledgerId, undefined), eventFor("payment_intent.payment_failed", intent(ledgerId, undefined)));
  const [row] = (await db.execute(sql`SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`)).rows ?? [];
  assert.equal(row.status, "succeeded");
  await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`);
});

test("F7.5 a pending booking still fails (the normal path keeps working)", async () => {
  await db.execute(sql`UPDATE bookings SET status='pending', payment_status='unpaid', metadata='{}'::jsonb WHERE id = ${bookingId}`);
  const pi = intent(piId, bookingId);
  await service.handlePaymentFailed(pi, eventFor("payment_intent.payment_failed", pi));
  assert.equal((await bookingRow()).status, "payment_failed");
});

test("F7.6 a redelivered ignored event writes ONE admin record", async () => {
  await db.execute(sql`UPDATE bookings SET status='confirmed', payment_status='paid', metadata='{}'::jsonb WHERE id = ${bookingId}`);
  const pi = intent(piId, bookingId);
  const event = eventFor("payment_intent.payment_failed", pi);
  await service.handlePaymentFailed(pi, event);
  await service.handlePaymentFailed(pi, event);
  const row = await bookingRow();
  const records = row.metadata?.lateFailureIgnored ?? [];
  assert.equal(records.length, 1, "deduplicated on the event id");
  assert.equal(records[0].eventId, event.id);
});

test("F7.7 a failure created before confirmation is ignored, and recorded with stripeCreated", async () => {
  await db.execute(sql`UPDATE bookings SET status='confirmed', payment_status='paid', metadata='{}'::jsonb WHERE id = ${bookingId}`);
  const confirmedAt = new Date("2026-11-19T10:00:00.000Z");
  await db.execute(sql`UPDATE bookings SET created_at = ${confirmedAt.toISOString()}::timestamptz WHERE id = ${bookingId}`);
  const before = Math.floor(new Date("2026-11-19T09:00:00.000Z").getTime() / 1000);
  const pi = intent(piId, bookingId, before);
  const event = eventFor("payment_intent.payment_failed", pi, before);
  await service.handlePaymentFailed(pi, event);
  const row = await bookingRow();
  assert.equal(row.status, "confirmed");
  const records = row.metadata?.lateFailureIgnored ?? [];
  assert.equal(records.length, 1);
  assert.equal(records[0].stripeCreated, new Date(before * 1000).toISOString());
});

test("F7.8 a confirmed CART booking is not moved by a failed event, and keeps ONE record", async () => {
  await db.execute(sql`UPDATE service_bookings SET status='confirmed', booking_details='{}'::jsonb WHERE id = ${cartBookingId}`);
  const pi = intent(piId, undefined);
  await service.handlePaymentFailed(pi, eventFor("payment_intent.payment_failed", pi));
  const [row] = (await db.execute(sql`SELECT status, booking_details FROM service_bookings WHERE id = ${cartBookingId}`)).rows ?? [];
  assert.equal(row.status, "confirmed");
  const records = row.booking_details?.lateFailureIgnored ?? [];
  assert.equal(records.length, 1, "one record in booking_details");
  assert.equal(records[0].rail, "cart");
});

test("F7.9 the same for a canceled event on a confirmed CART booking", async () => {
  await db.execute(sql`UPDATE service_bookings SET status='confirmed', booking_details='{}'::jsonb WHERE id = ${cartBookingId}`);
  const pi = intent(piId, undefined);
  await service.handlePaymentCanceled(pi, eventFor("payment_intent.canceled", pi));
  const [row] = (await db.execute(sql`SELECT status, booking_details FROM service_bookings WHERE id = ${cartBookingId}`)).rows ?? [];
  assert.equal(row.status, "confirmed");
  assert.equal((row.booking_details?.lateFailureIgnored ?? []).length, 1);
});

test("F7.10 a legacy booking in 'pending_payment' still fails, and writes NO late record", async () => {
  // The legacy rail's own pending spelling (legacy-payment-expiry.ts:21, admin.routes.ts:572). `stripe-non-cart-
  // terminal-webhooks.db.test.ts` is the suite that caught its absence from the set.
  await db.execute(sql`UPDATE bookings SET status='pending_payment', payment_status='processing', metadata='{}'::jsonb WHERE id = ${bookingId}`);
  const pi = intent(piId, bookingId);
  await service.handlePaymentFailed(pi, eventFor("payment_intent.payment_failed", pi));
  const row = await bookingRow();
  assert.equal(row.status, "payment_failed");
  assert.deepEqual(row.metadata?.lateFailureIgnored ?? [], [], "no late record for a booking that was still pending");
});
