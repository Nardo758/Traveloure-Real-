/**
 * LANE 4 — THE ADMIN EXCEPTION REFUND (decision-maker ruled Sep 27, 2026; ledger
 * `2026-09-27-admin-exception-refund`). The service under the admin route, with the Stripe client
 * stubbed to record the cents it is asked for.
 *
 *   X1  full: Stripe is asked for everything charged (booking + fee); the booking ends `refunded`;
 *       the `refunds` audit row carries the admin's reason; a second attempt is refused
 *   X2  partial: Stripe is asked for EXACTLY the cents entered, split at one percentage
 *   X3  payment_pending, failed, disputed and expired are refused by name; Stripe is never called
 *   X4  an amount above the charge is refused, never clamped; nothing moves
 *   X5  a booking the app already refunded (a cancelled booking carrying its refund record) is refused
 *   X6  the shared refund refuses a disputed booking BEFORE the ledger moves (its earning stays held)
 *
 * Run: JOURNEY_DB_WRITES_OK=1 DATABASE_URL=… npx tsx --test --test-force-exit server/__tests__/admin-exception-refund.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { issueExceptionRefund, quoteExceptionRefund } from "../services/admin-exception-refund.service";
import { refundServiceBookingWithLedger } from "../services/service-booking-refund.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `aer-${RUN}-user`, admin: `aer-${RUN}-admin`, service: `aer-${RUN}-svc` };
const bookings: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host: string | null = null;
    try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
    if (host === null || !DISPOSABLE_HOSTS.has(host)) {
      throw new Error(`[admin-exception-refund] REFUSING to write fixtures to '${host ?? "<none>"}'; opt in with JOURNEY_DB_WRITES_OK=1.`);
    }
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`aer-${RUN}@t.test`}, 'Aer', 'Traveler')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.admin}, ${`aer-${RUN}-admin@t.test`}, 'Aer', 'Admin', 'admin')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.service}, ${ids.user}, 'Aer fixture', '105.00')`);
});

after(async () => {
  for (const id of bookings) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.user}, ${ids.admin})`).catch(() => {});
});

async function booking(status: string, details: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  bookings.push(id);
  await db.execute(sql`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, stripe_payment_intent_id, booking_details)
    VALUES (${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${status}, '105.00', '0.00', ${`pi_aer_${RUN}_${id.slice(0, 8)}`},
      ${JSON.stringify({ travelerServiceFee: { charged: 10, waived: false }, ...details })}::jsonb)`);
  return id;
}
const statusOf = async (id: string) => ((await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)).rows[0] as any).status;

async function withFakeRefunds<T>(fn: (calls: Array<{ amount: number }>) => Promise<T>): Promise<T> {
  const { stripe } = await import("../services/stripe-payment.service");
  const s: any = stripe;
  const orig = s.refunds.create;
  const calls: Array<{ amount: number }> = [];
  s.refunds.create = async (params: any) => {
    calls.push({ amount: params.amount });
    return { id: `re_aer_${RUN}_${calls.length}_${crypto.randomUUID().slice(0, 4)}`, status: "succeeded", amount: params.amount, currency: "usd", charge: null, metadata: params.metadata };
  };
  try { return await fn(calls); } finally { s.refunds.create = orig; }
}

const REASON = "goodwill: the guide never showed up";

test("X1 full refund: everything charged, booking refunded, reason on the audit row; a second attempt is refused", async () => {
  const id = await booking("confirmed");
  const q = await quoteExceptionRefund(id);
  assert.deepEqual([q.bookingChargedCents, q.feeChargedCents, q.chargedCents, q.refusal], [10500, 1000, 11500, null]);
  await withFakeRefunds(async (calls) => {
    const out = await issueExceptionRefund({ bookingId: id, adminId: ids.admin, reason: REASON, request: { mode: "full" } });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(calls.map((c) => c.amount), [11500]);
    if (out.ok) assert.deepEqual([out.refundedCents, out.bookingRefundCents, out.feeRefundCents], [11500, 10500, 1000]);
    assert.equal(await statusOf(id), "refunded");
    const audit = (await db.execute(sql`SELECT reason, amount FROM refunds WHERE booking_id = ${id}`)).rows as any[];
    assert.equal(audit.length, 1);
    assert.equal(audit[0].reason, `admin_exception_refund: ${REASON}`);
    const again = await issueExceptionRefund({ bookingId: id, adminId: ids.admin, reason: REASON, request: { mode: "full" } });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.refusal, "refunded");
    assert.equal(calls.length, 1, "never a second Stripe refund");
  });
});

test("X2 partial refund: Stripe is asked for exactly the cents entered", async () => {
  const id = await booking("completed");
  await withFakeRefunds(async (calls) => {
    const out = await issueExceptionRefund({ bookingId: id, adminId: ids.admin, reason: REASON, request: { mode: "partial", amountCents: 4001 } });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(calls.map((c) => c.amount), [4001]);
    if (out.ok) assert.equal(out.bookingRefundCents + out.feeRefundCents, 4001);
    assert.equal(await statusOf(id), "refunded", "a partial refund is final, with its amount recorded (R163 amendment)");
  });
});

test("X3 payment_pending, failed, disputed and expired are refused by name; Stripe is never called", async () => {
  await withFakeRefunds(async (calls) => {
    for (const status of ["payment_pending", "failed", "disputed", "expired"]) {
      const id = await booking(status);
      const out = await issueExceptionRefund({ bookingId: id, adminId: ids.admin, reason: REASON, request: { mode: "full" } });
      assert.equal(out.ok, false, status);
      if (!out.ok) assert.equal(out.refusal, status);
      assert.equal(await statusOf(id), status, `${status} unchanged`);
    }
    assert.equal(calls.length, 0);
  });
});

test("X4 an amount above the charge is refused, never clamped", async () => {
  const id = await booking("confirmed");
  await withFakeRefunds(async (calls) => {
    const out = await issueExceptionRefund({ bookingId: id, adminId: ids.admin, reason: REASON, request: { mode: "partial", amountCents: 11501 } });
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.refusal, "invalid_amount");
      assert.match(out.message, /\$115\.00/);
    }
    assert.equal(calls.length, 0);
    assert.equal(await statusOf(id), "confirmed");
  });
});

test("X5 a booking the app already refunded is refused", async () => {
  const id = await booking("cancelled", { serviceBookingRefund: { refundId: "re_prior", amountCents: 5750 } });
  const q = await quoteExceptionRefund(id);
  assert.equal(q.refusal, "already_refunded_by_app");
});

test("X6 the shared refund refuses a disputed booking before the ledger moves", async () => {
  const id = await booking("disputed");
  await db.execute(sql`INSERT INTO provider_earnings (id, provider_id, type, amount, source_type, source_id, status, dispute_state)
    VALUES (${crypto.randomUUID()}, ${ids.user}, 'service_booking', 80, 'booking', ${id}, 'held', 'open')`);
  await assert.rejects(
    refundServiceBookingWithLedger(id, { refundFraction: 1 }),
    (e: any) => e?.name === "ServiceBookingRefundRefusedError",
  );
  const e = (await db.execute(sql`SELECT status FROM provider_earnings WHERE source_id = ${id}`)).rows[0] as any;
  assert.equal(e.status, "held", "the earning was not reversed for a refund that never happened");
});
