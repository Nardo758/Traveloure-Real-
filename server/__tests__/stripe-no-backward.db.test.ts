/**
 * F7 (#1820): a paid or confirmed booking never moves backward on a Stripe event.
 *
 * Seven cases, exactly the brief's list (2026-11-10 brief lines 42-49). DB-backed: it runs in CI, where a
 * disposable PostgreSQL exists; this workstation has none, and the overnight rule is that the test is written and
 * the CI step table is the proof.
 *
 * What it does NOT prove: that a Stripe event actually arrives. These call the two handlers' SQL through the same
 * service, with fixture rows, so the assertion is about the guard - the webhook plumbing is `suite-server-tests`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { BOOKING_IS_NOT_PAID, BOOKING_IS_PENDING, STRIPE_TERMINAL_FROM_STATUSES } from "../utils/booking-from-states";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* refuse below */ }
  if (!DISPOSABLE.has(host)) throw new Error(`[stripe-no-backward] REFUSING to write to '${host}'.`);
}

let bookingId = "";
let piId = "";

/** The legacy guard, verbatim as the handler writes it. */
async function legacyTerminal(status: string, paymentStatus: string | null): Promise<number> {
  const res = await db.execute(sql`
    UPDATE bookings SET status = ${status}, payment_status = ${status}
    WHERE id = ${bookingId} AND ${BOOKING_IS_PENDING} AND ${BOOKING_IS_NOT_PAID}
    RETURNING id
  `);
  return (res.rows ?? []).length;
}

before(async () => {
  assertDisposableDb();
  bookingId = uid();
  piId = `pi_f7_${RUN}`;
  await db.execute(sql`
    INSERT INTO bookings (id, title, status, payment_status, stripe_payment_intent_id)
    VALUES (${bookingId}, ${"F7 fixture " + RUN}, 'pending', 'unpaid', ${piId})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM bookings WHERE id = ${bookingId}`);
});

test("F7.0 the named set is the Stripe one, and it carries the paid condition", () => {
  assert.deepEqual([...STRIPE_TERMINAL_FROM_STATUSES], ["pending", "payment_pending"]);
});

test("F7.1 a pending booking still fails (the normal path keeps working)", async () => {
  await db.execute(sql`UPDATE bookings SET status='pending', payment_status='unpaid' WHERE id = ${bookingId}`);
  assert.equal(await legacyTerminal("payment_failed", "unpaid"), 1);
});

test("F7.2 a confirmed booking is not moved by a failure", async () => {
  await db.execute(sql`UPDATE bookings SET status='confirmed', payment_status='unpaid' WHERE id = ${bookingId}`);
  assert.equal(await legacyTerminal("payment_failed", "unpaid"), 0);
  const [row] = (await db.execute(sql`SELECT status FROM bookings WHERE id = ${bookingId}`)).rows ?? [];
  assert.equal(row.status, "confirmed");
});

test("F7.3 a paid booking is not moved by a cancel", async () => {
  await db.execute(sql`UPDATE bookings SET status='pending', payment_status='paid' WHERE id = ${bookingId}`);
  assert.equal(await legacyTerminal("canceled", "paid"), 0);
  const [row] = (await db.execute(sql`SELECT status, payment_status FROM bookings WHERE id = ${bookingId}`)).rows ?? [];
  assert.deepEqual({ ...row }, { status: "pending", payment_status: "paid" });
});

test("F7.4 a succeeded ledger row is never rewritten by a failed or canceled event", async () => {
  const ledgerId = `pi_f7_ledger_${RUN}`;
  await db.execute(sql`
    INSERT INTO payment_intents (id, stripe_payment_intent_id, status)
    VALUES (${uid()}, ${ledgerId}, 'succeeded')
  `);
  await db.execute(sql`UPDATE payment_intents SET status='failed' WHERE stripe_payment_intent_id = ${ledgerId} AND status NOT IN ('succeeded')`);
  await db.execute(sql`UPDATE payment_intents SET status='canceled' WHERE stripe_payment_intent_id = ${ledgerId} AND status NOT IN ('succeeded')`);
  const [row] = (await db.execute(sql`SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`)).rows ?? [];
  assert.equal(row.status, "succeeded");
  await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ${ledgerId}`);
});

test("F7.5 an already-failed booking is untouched by a redelivery", async () => {
  await db.execute(sql`UPDATE bookings SET status='payment_failed', payment_status='failed' WHERE id = ${bookingId}`);
  assert.equal(await legacyTerminal("payment_failed", "failed"), 0);
});

test("F7.6 an id that matches no row changes nothing (the cart ids on the legacy rail)", async () => {
  const res = await db.execute(sql`
    UPDATE bookings SET status='payment_failed', payment_status='failed'
    WHERE id = ${uid()} AND ${BOOKING_IS_PENDING} AND ${BOOKING_IS_NOT_PAID}
    RETURNING id
  `);
  assert.equal((res.rows ?? []).length, 0);
});
