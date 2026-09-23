/**
 * RECONCILIATION AT A MONTH BOUNDARY — board task #1259 (ledger `2026-09-23-reconciliation-month-boundary`).
 *
 * The daily Stripe-vs-DB drift job (`server/jobs/stripeReconciliation.ts`, CLAUDE.md §17) scans a
 * ROLLING window, `now − SCAN_WINDOW_HOURS`, computed from the epoch — and its findings are keyed by
 * a `dedupe_key` that carries no date at all. Nothing in it is calendar-shaped, so a month boundary
 * should be invisible to it. This file proves that on the pass most likely to break if that ever
 * stopped being true: the first run of a new month.
 *
 *   M1  The window STRADDLES the boundary. The 00:30 UTC run on the 1st scans from 00:30 on the
 *       last day of the previous month (recorded as the run's `window_start`), so a booking written
 *       at 23:50 on the 30th and charged at 00:05 on the 1st is matched, and its drift is reported.
 *   M2  The same drift seen again by the next day's run is ONE row, not two (`exceptions_new = 0`) —
 *       "a month-long drift is ONE row, not thirty" holds across the month it started in.
 *   M3  A booking a whole month older than the window is still loaded when an in-window
 *       PaymentIntent NAMES it (`metadata.bookingIds`) — the money is inside the window, so the row
 *       is examined whatever month it was written in.
 *   M4  The window is 24 hours, not "this calendar month" and not "since midnight": a PaymentIntent
 *       one second older than the window start is not listed and indicts nothing, and one created
 *       exactly at the window start is listed (the reader's `created >= gte` contract).
 *
 * Time is pinned with node:test's `mock.timers` on the `Date` API only, so the job's own
 * `Date.now()` sees the instants this file chooses; the database's clock is never consulted by the
 * window. The Stripe half is INJECTED and — unlike the detection suite's reader — honours the
 * `created >= gte` argument the job passes, because that argument is the thing under test.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 *
 * Run solo: npx tsx --test server/__tests__/reconciliation-month-boundary.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_reconciliation_suite";

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runStripeReconciliation, type StripeReader } from "../jobs/stripeReconciliation";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `recmb-${RUN}-user`, service: `recmb-${RUN}-svc` };
const createdBookingIds: string[] = [];
const createdRunIds: string[] = [];

/** The first pass of October, and the next day's. */
const OCT_1_0030 = Date.parse("2026-10-01T00:30:00.000Z");
const OCT_2_0030 = Date.parse("2026-10-02T00:30:00.000Z");
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

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
      `[reconciliation-month-boundary] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`recmb-${RUN}@t.test`}, 'Recon', 'MonthBoundary')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Month-boundary fixture service', '100.00')
  `);
});

after(async () => {
  mock.timers.reset();
  for (const runId of createdRunIds) {
    await db.execute(sql`DELETE FROM reconciliation_exceptions WHERE run_id = ${runId}`).catch(() => {});
    await db.execute(sql`DELETE FROM reconciliation_runs WHERE id = ${runId}`).catch(() => {});
  }
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** A confirmed cart booking with no plan behind it (`trip_id` NULL), written at an exact instant. */
async function makeBooking(createdAtIso: string, paymentIntentId: string | null): Promise<string> {
  const id = `recmb-${RUN}-bk-${createdBookingIds.length}`;
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, booking_details, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.user}, ${ids.user}, 'confirmed',
      '100.00', '25.00', ${paymentIntentId}, '{}'::jsonb, ${createdAtIso}
    )
  `);
  createdBookingIds.push(id);
  return id;
}

/** A succeeded PaymentIntent as `createPaymentIntent` writes it, at an exact creation instant. */
function pi(id: string, createdIso: string, amountDollars: number, bookingIds: string[]): any {
  const cents = Math.round(amountDollars * 100);
  return {
    id,
    object: "payment_intent",
    status: "succeeded",
    amount: cents,
    amount_received: cents,
    currency: "usd",
    latest_charge: `ch_${id}`,
    created: unix(createdIso),
    metadata: { bookingIds: bookingIds.join(",") },
  };
}

/** Honours `created >= gte`, as Stripe's list endpoints do — the window argument is under test. */
function windowedReader(paymentIntents: any[], seenGte: number[]): StripeReader {
  return {
    listPaymentIntents: async (gte) => {
      seenGte.push(gte);
      return paymentIntents.filter((p) => p.created >= gte);
    },
    listCharges: async () => [],
    listRefunds: async () => [],
    listSubscriptions: async () => [],
  };
}

/** Run the job with `Date` pinned to `atMs`, scoped to this file's bookings. */
async function runAt(atMs: number, paymentIntents: any[], bookingIds: string[]) {
  const seenGte: number[] = [];
  mock.timers.enable({ apis: ["Date"], now: atMs });
  try {
    const result = await runStripeReconciliation({
      triggeredBy: "test",
      stripeReader: windowedReader(paymentIntents, seenGte),
      onlyBookingIds: bookingIds,
      onlyPurchaseIds: [],
      onlySubscriptionIds: [],
    });
    if (result.runId) createdRunIds.push(result.runId);
    return { result, seenGte };
  } finally {
    mock.timers.reset();
  }
}

async function exceptionsByKey(dedupeKey: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT run_id, kind, booking_id, payment_intent_id, expected_amount, actual_amount
    FROM reconciliation_exceptions WHERE dedupe_key = ${dedupeKey}
  `);
  return r.rows as any[];
}

async function runRow(runId: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT window_start, exceptions_new FROM reconciliation_runs WHERE id = ${runId}
  `);
  return r.rows[0] as any;
}

const PI_M1 = `pi_recmb_${RUN}_m1`;
let m1Booking = "";
let m1FirstRunId = "";

test("M1: the first run of a month scans back across the boundary and reports last month's booking", async () => {
  // Written at 23:50 on the last day of September, charged 15 minutes into October — for $5 too
  // much. The server-derived total is total_amount + platform_fee = $125.
  m1Booking = await makeBooking("2026-09-30T23:50:00.000Z", PI_M1);
  const charge = pi(PI_M1, "2026-10-01T00:05:00.000Z", 130, [m1Booking]);

  const { result, seenGte } = await runAt(OCT_1_0030, [charge], [m1Booking]);
  assert.equal(result.status, "completed");
  assert.ok(result.runId, "the pass must record a run row");
  m1FirstRunId = result.runId!;

  // The window is exactly 24h back from the pinned instant — 00:30 on 30 September.
  assert.deepEqual(seenGte, [unix("2026-09-30T00:30:00.000Z")]);
  const run = await runRow(m1FirstRunId);
  assert.equal(new Date(run.window_start).toISOString(), "2026-09-30T00:30:00.000Z");

  const rows = await exceptionsByKey(`cart:amount_mismatch:${PI_M1}:125.00:130.00`);
  assert.equal(rows.length, 1, "the straddling drift must be reported exactly once");
  assert.equal(rows[0].booking_id, m1Booking);
  assert.equal(rows[0].run_id, m1FirstRunId);
  assert.equal(Number(rows[0].expected_amount), 125);
  assert.equal(Number(rows[0].actual_amount), 130);
});

test("M2: the next day's run sees the same drift and records no second row", async () => {
  assert.ok(m1Booking, "M1 must have run");
  // A day later the charge (00:05 on the 1st) has left a 24h window, so the pass that sees it
  // again is a 48h one — the wider manual pass an operator runs to re-check a drift. It must
  // detect it again and still write nothing new.
  const charge = pi(PI_M1, "2026-10-01T00:05:00.000Z", 130, [m1Booking]);
  const seenGte: number[] = [];
  mock.timers.enable({ apis: ["Date"], now: OCT_2_0030 });
  let runId: string | null = null;
  try {
    const result = await runStripeReconciliation({
      triggeredBy: "test",
      stripeReader: windowedReader([charge], seenGte),
      windowHours: 48,
      onlyBookingIds: [m1Booking],
      onlyPurchaseIds: [],
      onlySubscriptionIds: [],
    });
    runId = result.runId;
    if (runId) createdRunIds.push(runId);
    assert.ok(
      result.exceptions.some((e) => e.dedupeKey === `cart:amount_mismatch:${PI_M1}:125.00:130.00`),
      "the second pass must still DETECT the drift",
    );
  } finally {
    mock.timers.reset();
  }
  assert.deepEqual(seenGte, [unix("2026-09-30T00:30:00.000Z")]);

  const rows = await exceptionsByKey(`cart:amount_mismatch:${PI_M1}:125.00:130.00`);
  assert.equal(rows.length, 1, "re-detection across the boundary must not append a second row");
  assert.equal(rows[0].run_id, m1FirstRunId, "the row keeps the run that FIRST saw the drift");
  assert.ok(runId);
  assert.equal(Number((await runRow(runId!)).exceptions_new), 0);
});

test("M3: a booking written a month before the window is examined when an in-window charge names it", async () => {
  // The claim was written on 1 September; the PaymentIntent that pays for it succeeded on
  // 1 October. The row is outside every window the job computes, but the money is inside it.
  const piId = `pi_recmb_${RUN}_m3`;
  const booking = await makeBooking("2026-09-01T12:00:00.000Z", piId);
  const charge = pi(piId, "2026-10-01T00:10:00.000Z", 90, [booking]);

  const { result } = await runAt(OCT_1_0030, [charge], [booking]);
  assert.equal(result.status, "completed");
  const rows = await exceptionsByKey(`cart:amount_mismatch:${piId}:125.00:90.00`);
  assert.equal(rows.length, 1, "last month's booking must be matched by this month's charge");
  assert.equal(rows[0].booking_id, booking);
});

test("M4: the window is 24 hours to the second — not the calendar month, not since midnight", async () => {
  const outsideId = `pi_recmb_${RUN}_m4_out`;
  const edgeId = `pi_recmb_${RUN}_m4_edge`;
  const outsideBooking = await makeBooking("2026-09-30T00:29:00.000Z", outsideId);
  const edgeBooking = await makeBooking("2026-09-30T00:29:30.000Z", edgeId);
  // One second before the window start (still September, still "yesterday"): not listed.
  const outside = pi(outsideId, "2026-09-30T00:29:59.000Z", 99, [outsideBooking]);
  // Exactly at the window start: listed.
  const edge = pi(edgeId, "2026-09-30T00:30:00.000Z", 99, [edgeBooking]);

  const { result } = await runAt(OCT_1_0030, [outside, edge], [outsideBooking, edgeBooking]);
  assert.equal(result.status, "completed");
  assert.equal(
    (await exceptionsByKey(`cart:amount_mismatch:${outsideId}:125.00:99.00`)).length,
    0,
    "a charge older than the window is not listed and must indict nothing",
  );
  assert.equal(
    (await exceptionsByKey(`cart:amount_mismatch:${edgeId}:125.00:99.00`)).length,
    1,
    "a charge created exactly at the window start is inside it",
  );
});
