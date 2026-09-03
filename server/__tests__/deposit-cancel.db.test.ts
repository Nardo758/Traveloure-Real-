/**
 * DEPOSIT-PAID PROVIDER CANCEL — behavioural proof of ledger `2026-09-03-deposit-paid-cancel`
 * (CLAUDE.md §13/§14/§15/§18b).
 *
 * THE BUG: `OWNER_BOOKING_TRANSITIONS.cancelled` was `["pending","confirmed"]`, so a provider whose
 * listing takes deposits could not cancel their own deposit-paid booking at all — every attempt
 * answered 409 with no remedy, while the traveler's deposit sat at Stripe and the availability slot
 * the checkout had claimed stayed consumed. Adding the status alone would not have been enough: the
 * refund branch computed `total_amount + platform_fee + insurance_fee`, money that was NEVER
 * CHARGED on a deposit booking — Stripe rejects a refund larger than the charge, so the provider
 * would have traded a 409 for a 502.
 *
 * THE RULING: a provider cancel of a deposit-paid booking refunds exactly what was CAPTURED — the
 * deposit — and nothing else. The balance was never charged, so there is nothing on it to refund;
 * it is simply never collected.
 *
 *   D1  a `deposit_paid` cancel SUCCEEDS and refunds the DEPOSIT, not the total: the Stripe refund
 *       and the `refunds` row both carry the deposit amount, the booking reaches its terminal
 *       cancelled state (`status='refunded'` + `cancelled_at` — the same terminal shape the
 *       pre-existing provider-cancel-with-refund path uses), and `refund.scope === "deposit"`.
 *   D2  a RETRY is a no-op: exactly ONE `refunds` row and ONE refund at Stripe. Enforced on both
 *       §15 layers — the atomic status claim inside `refundServiceBooking` (status <> 'refunded')
 *       and its deterministic idempotency key `refund-sb-<id>-<cents>` (booking id + operation
 *       amount), so even a cross-process retry returns the same refund.
 *   D3  the claimed `vendor_availability_slots.booked_count` COMES BACK. This is the §18b lesson:
 *       the money layers can hold while the INVENTORY layer silently loses a seat, so the slot is
 *       asserted separately from the status.
 *   D4  a `deposit_paid` booking whose row cannot say what it captured is REFUSED (409) — never
 *       cancelled with a "$0 refund" (§13). Asserted on the booking too: status UNCHANGED, no
 *       `refunds` row, so the row stays repairable rather than terminal-and-unpaid. This case
 *       needs neither Stripe nor a network: the refusal precedes the PaymentIntent lookup.
 *   D5  the TRAVELER SERVICE FEE captured at the deposit charge comes back too. Ruling D of Lane 7
 *       assesses that fee ONCE, at the deposit — so it IS part of what was captured, and a
 *       provider cancellation makes the traveler whole on it exactly as the full-refund path does
 *       (`feeRefundPercent: 100`, ruling 2026-09-02-traveler-fee-refundability). Refunding the
 *       deposit while keeping a fee the provider's cancellation caused would not be "what was
 *       captured".
 *
 * ONE REFUND IMPLEMENTATION: this rail does NOT get its own Stripe call. It hands the
 * server-derived amount to the EXISTING `stripePaymentService.refundServiceBooking`, which owns
 * the clamp, the idempotency key, the atomic claim, the `refunds` row, the fee-ledger reversal and
 * the slot release. A second refund implementation for deposits is the derivation-drift class
 * §18 rule 1 names.
 *
 * ── HOW TO RUN ────────────────────────────────────────────────────────────────────────────────
 * BENCH-ONLY. Three things this file cannot fabricate: a booted app on :5000, a disposable
 * database, and a REAL Stripe test-mode key (D1/D2/D3/D5 refund an actual test-mode PaymentIntent —
 * nothing Stripe-shaped is mocked, on the `checkout-oneclick.stripe.db.test.ts` precedent).
 *
 *   STRIPE_SECRET_KEY=sk_test_… JOURNEY_DB_WRITES_OK=1 \
 *     npx tsx --test server/__tests__/deposit-cancel.db.test.ts
 *
 * SKIP CONTRACT: without a real test key the file SKIPS VISIBLY — it never silently passes. A key
 * matching the CI stub/dummy patterns counts as absent.
 *
 * The DECISION half — which rows are in scope, what amount is captured, and which rows must be
 * refused — is proven with no DB, no server and no Stripe by
 * `server/__tests__/deposit-captured-resolution.test.ts`, which runs anywhere.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 */
const RAW_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const HAVE_REAL_KEY =
  /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
// The Stripe service constructs its client at import time and throws keyless — the same dummy-key
// technique the one-click suite uses. Only the skip path ever runs with the dummy.
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_deposit_cancel_suite";
// SKIP path only: ../db throws at IMPORT when DATABASE_URL is unset, which would turn a keyless run
// into a crash instead of a visible skip. Never connected to — every hook and body returns first.
if (!HAVE_REAL_KEY) process.env.DATABASE_URL ||= "postgresql://skip:skip@127.0.0.1:5432/skip";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

// Dynamic import, deliberately AFTER the env guards above: static `import` declarations hoist above
// every statement in ESM, so a static `import { db }` would execute ../db (which throws on a missing
// DATABASE_URL) before the skip-path placeholder was set — turning a keyless run into a crash
// instead of a visible skip. Same technique as checkout-oneclick.stripe.db.test.ts.
const { db } = await import("../db");
const stripe = HAVE_REAL_KEY ? new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 }) : null!;

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const SKIP = HAVE_REAL_KEY ? undefined : "SKIPPED: no real sk_test_ Stripe key (see SKIP CONTRACT)";

// $500 service; the listing takes a 30% deposit ⇒ $150 captured, $350 balance outstanding.
const TOTAL_AMOUNT = "500.00";
const PLATFORM_FEE = "75.00";
const DEPOSIT = 150;
const BALANCE = 425; // (total + platform_fee) − deposit, per resolveDepositPlan
const TRAVELER_FEE = 12.5; // D5 only

const emails = {
  provider: `dpc-${RUN}-provider@t.test`,
  traveler: `dpc-${RUN}-traveler@t.test`,
};
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
const ids = {
  service: `dpc-${RUN}-svc`,
  slotGood: `dpc-${RUN}-slot-good`,
  slotBad: `dpc-${RUN}-slot-bad`,
  slotFee: `dpc-${RUN}-slot-fee`,
  bookingGood: `dpc-${RUN}-bkg-good`,
  bookingBad: `dpc-${RUN}-bkg-bad`,
  bookingFee: `dpc-${RUN}-bkg-fee`,
};
const paymentIntents: Record<string, string> = {};

// ── Disposable-DB guard (mirrors the sweep/promotion suites; never defaults open) ────────────
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
      `[deposit-cancel] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(email: string, first: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: first, lastName: "DepositCancel" }),
  });
  assert.equal(res.status, 201, `register ${email} failed (${res.status}): ${await res.clone().text()}`);
  return ((await res.json()) as any).user.id;
}

async function loginCookie(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email} failed (${res.status}): ${await res.clone().text()}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

/** A REAL succeeded test-mode PaymentIntent for `amount` dollars — what the deposit charge left behind. */
async function makeSucceededPaymentIntent(amount: number, bookingId: string): Promise<string> {
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    payment_method: "pm_card_visa",
    confirm: true,
    off_session: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { bookingIds: bookingId, source: "deposit_cancel_suite" },
  });
  assert.equal(pi.status, "succeeded", `fixture PaymentIntent for ${bookingId} did not succeed`);
  return pi.id;
}

async function seedSlot(id: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, end_time, capacity, booked_count, status)
    VALUES (${id}, ${ids.service}, ${userIds.provider}, '2026-12-01', '09:00', '12:00', 1, 1, 'fully_booked')
  `);
}

/** A `deposit_paid` booking: FULL amounts on total/platform_fee, the deposit split recorded beside them. */
async function seedDepositBooking(args: {
  id: string;
  slotId: string;
  paymentIntentId: string | null;
  depositAmount: number | null;
  bookingDetails?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, insurance_fee,
       provider_earnings, stripe_payment_intent_id, stripe_deposit_intent_id,
       deposit_amount, deposit_paid, balance_amount, balance_paid, slot_id, booking_details, tracking_number)
    VALUES
      (${args.id}, ${ids.service}, ${userIds.traveler}, ${userIds.provider}, 'deposit_paid',
       ${TOTAL_AMOUNT}, ${PLATFORM_FEE}, '0.00', '425.00',
       ${args.paymentIntentId}, ${args.paymentIntentId},
       ${args.depositAmount === null ? null : args.depositAmount.toFixed(2)}, true,
       ${BALANCE.toFixed(2)}, false, ${args.slotId},
       ${JSON.stringify(args.bookingDetails ?? {})}::jsonb, ${args.id})
  `);
}

function patchStatus(bookingId: string, body: Record<string, unknown>) {
  return fetch(`${BASE_URL}/api/provider/bookings/${bookingId}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookies.provider },
    body: JSON.stringify(body),
  });
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, cancelled_at, deposit_amount, balance_amount, total_amount, platform_fee
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0];
}

async function refundRows(bookingId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT amount, stripe_refund_id, stripe_payment_intent_id, status
    FROM refunds WHERE booking_id = ${bookingId} ORDER BY created_at
  `);
  return r.rows as any[];
}

async function slotBookedCount(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${id}`);
  return Number((r.rows[0] as any)?.booked_count);
}

before(async () => {
  if (!HAVE_REAL_KEY) return;
  await assertDisposableDb();

  userIds.provider = await registerUser(emails.provider, "Provider");
  userIds.traveler = await registerUser(emails.traveler, "Traveler");
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${userIds.provider}`);
  cookies.provider = await loginCookie(emails.provider);

  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, status, approval_status,
       deposit_enabled, deposit_type, deposit_percentage)
    VALUES (${ids.service}, ${userIds.provider}, ${`Deposit cancel service ${RUN}`}, 'fixture',
            ${TOTAL_AMOUNT}, 'active', 'approved', true, 'percentage', 30)
  `);

  await Promise.all([seedSlot(ids.slotGood), seedSlot(ids.slotBad), seedSlot(ids.slotFee)]);

  // D1/D2/D3 — a clean deposit-partial: exactly the deposit captured, no traveler fee.
  paymentIntents.good = await makeSucceededPaymentIntent(DEPOSIT, ids.bookingGood);
  await seedDepositBooking({
    id: ids.bookingGood,
    slotId: ids.slotGood,
    paymentIntentId: paymentIntents.good,
    depositAmount: DEPOSIT,
  });

  // D4 — `deposit_paid` with NO deposit amount on the row: the platform cannot say what it captured.
  await seedDepositBooking({
    id: ids.bookingBad,
    slotId: ids.slotBad,
    paymentIntentId: `pi_never_charged_${RUN}`,
    depositAmount: null,
  });

  // D5 — the traveler service fee rode the deposit charge (Lane 7 ruling D: assessed ONCE, at the
  // deposit), so the captured amount is deposit + fee and BOTH come back.
  paymentIntents.fee = await makeSucceededPaymentIntent(DEPOSIT + TRAVELER_FEE, ids.bookingFee);
  await seedDepositBooking({
    id: ids.bookingFee,
    slotId: ids.slotFee,
    paymentIntentId: paymentIntents.fee,
    depositAmount: DEPOSIT,
    bookingDetails: {
      travelerServiceFee: { charged: TRAVELER_FEE, wouldHaveBeen: TRAVELER_FEE, waived: false },
    },
  });
});

after(async () => {
  if (!HAVE_REAL_KEY) return;
  await db.execute(sql`DELETE FROM refunds WHERE booking_id IN (${ids.bookingGood}, ${ids.bookingBad}, ${ids.bookingFee})`);
  await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${ids.bookingGood}, ${ids.bookingBad}, ${ids.bookingFee})`);
  await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id IN (${ids.slotGood}, ${ids.slotBad}, ${ids.slotFee})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${userIds.provider}, ${userIds.traveler})`);
});

test("D1 — a deposit_paid cancel succeeds and refunds the DEPOSIT, not the total", { skip: SKIP }, async () => {
  const res = await patchStatus(ids.bookingGood, { status: "cancelled", reason: "provider unavailable" });
  const body: any = await res.json();
  assert.equal(res.status, 200, `deposit_paid cancel must not 409 any more: ${JSON.stringify(body)}`);

  assert.equal(body.refund?.issued, true);
  assert.equal(body.refund?.scope, "deposit", "the client must be told the balance was never charged");
  assert.equal(Number(body.refund?.amount), DEPOSIT);

  const rows = await refundRows(ids.bookingGood);
  assert.equal(rows.length, 1, "exactly one refund row");
  assert.equal(Number(rows[0].amount), DEPOSIT, "the refund is the DEPOSIT");
  assert.notEqual(
    Number(rows[0].amount),
    Number(TOTAL_AMOUNT) + Number(PLATFORM_FEE),
    "refunding the full charge would be returning money that was never captured",
  );
  assert.equal(rows[0].stripe_payment_intent_id, paymentIntents.good, "refunded against the DEPOSIT intent");

  // Terminal cancelled state — the same shape the pre-existing provider-cancel-with-refund path
  // reaches (`refundServiceBooking` owns the terminal status; `cancelled_at` records the cancel).
  const row = await bookingRow(ids.bookingGood);
  assert.equal(row.status, "refunded");
  assert.ok(row.cancelled_at, "cancelled_at must be stamped");
});

test("D2 — a retry is a no-op: ONE refund row, ONE refund at Stripe", { skip: SKIP }, async () => {
  const res = await patchStatus(ids.bookingGood, { status: "cancelled", reason: "provider unavailable" });
  const body: any = await res.json();
  // Either the atomic claim reports alreadyRefunded, or the from-state guard refuses the second
  // transition. Both are correct; what must NEVER happen is a second refund.
  assert.ok([200, 409].includes(res.status), `unexpected retry status ${res.status}: ${JSON.stringify(body)}`);
  if (res.status === 200) assert.equal(body.refund?.issued, false);

  const rows = await refundRows(ids.bookingGood);
  assert.equal(rows.length, 1, "a retry must not write a second refund row");

  const stripeRefunds = await stripe.refunds.list({ payment_intent: paymentIntents.good, limit: 10 });
  assert.equal(stripeRefunds.data.length, 1, "a retry must not issue a second refund at Stripe");
});

test("D3 — the claimed availability slot gives its capacity back", { skip: SKIP }, async () => {
  // §18b: the money layers can hold while the INVENTORY layer silently loses a seat, so this is
  // asserted on its own and not inferred from the status flip.
  assert.equal(await slotBookedCount(ids.slotGood), 0, "booked_count must return on a refunded cancel");
});

test("D4 — a deposit_paid booking that cannot say what it captured is REFUSED, never refunded 0", { skip: SKIP }, async () => {
  const res = await patchStatus(ids.bookingBad, { status: "cancelled", reason: "provider unavailable" });
  const body: any = await res.json();
  assert.equal(res.status, 409, `must refuse, not cancel: ${JSON.stringify(body)}`);
  assert.equal(body.reason, "no_captured_deposit_amount");

  // The booking is left REPAIRABLE — not terminal with the traveler's money still at Stripe.
  const row = await bookingRow(ids.bookingBad);
  assert.equal(row.status, "deposit_paid", "status must be untouched");
  assert.equal(row.cancelled_at, null);
  assert.equal((await refundRows(ids.bookingBad)).length, 0, "no refund row — least of all a $0 one");
  assert.equal(await slotBookedCount(ids.slotBad), 1, "nothing was released either");
});

test("D5 — the traveler service fee captured at the deposit charge comes back too", { skip: SKIP }, async () => {
  const res = await patchStatus(ids.bookingFee, { status: "cancelled", reason: "provider unavailable" });
  const body: any = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.refund?.scope, "deposit");

  const rows = await refundRows(ids.bookingFee);
  assert.equal(rows.length, 1);
  // Lane 7 ruling D assesses the traveler fee ONCE, at the deposit charge — so it IS part of what
  // was captured, and a PROVIDER cancellation makes the traveler whole on it (feeRefundPercent 100,
  // ruling 2026-09-02-traveler-fee-refundability), exactly as the pre-existing full-refund path does.
  assert.equal(Number(rows[0].amount), DEPOSIT + TRAVELER_FEE);
  assert.equal(await slotBookedCount(ids.slotFee), 0);
});
