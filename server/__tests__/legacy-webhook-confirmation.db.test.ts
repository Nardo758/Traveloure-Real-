/**
 * Native legacy payment writers, real PostgreSQL, simulated mail/Stripe only.
 * Run through scripts/verification/run-messaging-gate.mjs --isolated-db.
 * The existing runner clones constraints and owns/cleans all fixture sequences.
 * No public data, real mail, payment captures, refunds, or migrations.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, test } from "node:test";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

assert.equal(process.env.NODE_ENV, "test");
assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("options"),
  `-c search_path=${process.env.MESSAGING_VERIFICATION_SCHEMA}`);

// Stub before importing writers. Any unexpected Stripe HTTP request fails closed.
const probe = new Stripe("sk_test_fixture_only");
const stripePrototype = Object.getPrototypeOf(probe.paymentIntents);
const previousRetrieve = stripePrototype.retrieve;
stripePrototype.retrieve = async (id: string) => ({ id, status: "succeeded" });
const { default: http } = await import("node:http");
const { default: https } = await import("node:https");
const previousHttp = http.request;
const previousHttps = https.request;
const previousFetch = globalThis.fetch;
const forbidNetwork = () => { throw new Error("Real provider network forbidden in confirmation fixtures"); };
http.request = forbidNetwork as typeof http.request;
https.request = forbidNetwork as typeof https.request;
globalThis.fetch = forbidNetwork as typeof fetch;

const { db, pool } = await import("../db");
const { bookings, users, emailOutbox, paymentIntents, providerEarnings, platformRevenue } =
  await import("../../shared/schema");
const { stripePaymentService } = await import("../services/stripe-payment.service");
const { bookingService } = await import("../services/booking.service");
const { _outboxTestHooks } = await import("../services/email-outbox.service");

const sends: Array<{ to: string | string[]; text?: string }> = [];
_outboxTestHooks.sendEmailFn = async (params) => {
  sends.push({ to: params.to, text: params.text });
  return { ok: true, id: `simulated_${crypto.randomUUID()}` };
};

after(async () => {
  delete _outboxTestHooks.sendEmailFn;
  stripePrototype.retrieve = previousRetrieve;
  http.request = previousHttp;
  https.request = previousHttps;
  globalThis.fetch = previousFetch;
  await pool.end();
});

async function fixture(deposit = false) {
  const travelerId = crypto.randomUUID(), providerId = crypto.randomUUID();
  const bookingId = crypto.randomUUID(), piId = `pi_fixture_${crypto.randomUUID().replaceAll("-", "")}`;
  const email = `${travelerId}@example.invalid`;
  await db.insert(users).values([
    { id: travelerId, email, role: "traveler" },
    { id: providerId, email: `${providerId}@example.invalid`, role: "provider" },
  ]);
  await db.insert(bookings).values({
    id: bookingId, userId: travelerId, providerId, status: "pending_payment",
    paymentStatus: "pending", title: "Isolated confirmation fixture", travelers: 1,
    serviceAmount: "100.00", platformFee: "20.00", totalAmount: "120.00",
    providerPayout: "80.00",
  });
  await db.insert(paymentIntents).values({
    stripePaymentIntentId: piId, userId: travelerId, amount: "120.00",
    currency: "usd", status: "pending", isDeposit: deposit,
  });
  const pi = {
    id: piId, status: "succeeded", currency: "usd", amount: 12000, amount_received: 12000,
    metadata: { userId: travelerId, bookingIds: bookingId, isDeposit: String(deposit) },
  } as unknown as Stripe.PaymentIntent;
  return { bookingId, travelerId, email, pi,
    webhook: () => stripePaymentService.handlePaymentSucceeded(pi),
    pageWriter: () => bookingService.confirmBookingPayment(bookingId, piId, travelerId) };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function assertConfirmation(f: Fixture, pageWon = false, deposit = false) {
  // Both authoritative writers retain fire-and-forget enqueue semantics. Poll
  // boundedly for the actual persisted sent row, not a fixed sleep or acceptance.
  let rows: typeof emailOutbox.$inferSelect[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    rows = await db.select().from(emailOutbox).where(sql`
      ${emailOutbox.metadata}->>'bookingId' = ${f.bookingId}
      AND ${emailOutbox.emailType} = 'booking_confirmation'
    `);
    if (rows.length && rows.every(row => row.status === "sent")) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.paymentStatus, "succeeded");
  assert.equal(booking.depositPaid, true);
  if (!pageWon) assert.equal(booking.balancePaid, !deposit);
  assert.equal(rows.length, 1, "one traveler outbox row");
  assert.equal(rows[0].status, "sent", "simulated delivery completed");
  assert.equal((rows[0].metadata as { confirmationCode: string }).confirmationCode, booking.confirmationCode);
  const travelerSends = sends.filter(send => [send.to].flat().includes(f.email));
  assert.equal(travelerSends.length, 1, "one simulated traveler send");
  assert.ok(travelerSends[0].text?.includes(booking.confirmationCode!));
  // Webhook still does not mint legacy earnings; the existing page transaction
  // still mints exactly once at the original amounts.
  const earnings = await db.select().from(providerEarnings).where(eq(providerEarnings.sourceId, f.bookingId));
  const revenue = await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, f.bookingId));
  assert.equal(earnings.length, pageWon ? 1 : 0);
  assert.equal(revenue.length, pageWon ? 1 : 0);
  if (pageWon) {
    assert.equal(Number(earnings[0].amount), 80);
    assert.equal(Number(revenue[0].grossAmount), 120);
    assert.equal(Number(revenue[0].platformFee), 20);
    assert.equal(Number(revenue[0].netAmount), 19.4);
    assert.equal(Number(revenue[0].processingFees), 0.6);
    assert.equal(Number(revenue[0].providerEarnings), 80);
  }
  assert.equal(Number(booking.serviceAmount), 100);
  assert.equal(Number(booking.totalAmount), 120);
  assert.equal(Number(booking.providerPayout), 80);
  const [payment] = await db.select().from(paymentIntents)
    .where(eq(paymentIntents.stripePaymentIntentId, f.pi.id));
  assert.equal(payment.status, "succeeded");
  assert.equal(Number(payment.amount), 120);
  assert.equal(payment.currency, "usd");
}

/**
 * Pause immediately before each real legacy UPDATE until every caller reaches
 * it. In the old SELECT-then-UPDATE writer all reads have now seen pending, so
 * the duplicate-email regression fails deterministically, not by lucky timing.
 * No SQL result or confirmation/outbox/ledger writer is mocked.
 */
async function concurrentWebhooks(f: Fixture, count: number) {
  const execute = db.execute.bind(db);
  const dialect = new PgDialect();
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const deadline = setTimeout(release, 5000);
  db.execute = (async (query: Parameters<typeof db.execute>[0]) => {
    const rendered = dialect.sqlToQuery(query.getSQL());
    if (/UPDATE\s+bookings\s+SET/i.test(rendered.sql) && rendered.params.includes(f.bookingId)) {
      arrived++;
      if (arrived === count) release();
      await barrier;
    }
    return execute(query);
  }) as typeof db.execute;
  try {
    await Promise.all(Array.from({ length: count }, f.webhook));
    assert.equal(arrived, count, "all webhook claims reached the same race");
  } finally {
    clearTimeout(deadline);
    release();
    db.execute = execute;
  }
}

for (const deposit of [false, true]) {
  for (const count of [2, 8]) {
    test(`${count} concurrent ${deposit ? "deposit" : "full-payment"} webhooks send one matching code`, async () => {
      for (let loop = 0; loop < 2; loop++) {
        const f = await fixture(deposit);
        await concurrentWebhooks(f, count);
        await assertConfirmation(f, false, deposit);
        const [before] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
        await f.webhook();
        const [afterRetry] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
        assert.equal(afterRetry.confirmationCode, before.confirmationCode);
        assert.deepEqual(afterRetry.confirmedAt, before.confirmedAt);
        await assertConfirmation(f, false, deposit);
      }
    });
  }
}

test("three sequential webhook deliveries retain one confirmation", async () => {
  const f = await fixture();
  await f.webhook(); await f.webhook(); await f.webhook();
  await assertConfirmation(f);
});

test("webhook then page fast-path retains one confirmation and no new earnings", async () => {
  const f = await fixture();
  await f.webhook();
  // This is the existing route fast-path, which never calls the fallback writer.
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.equal(booking.status, "confirmed");
  await assertConfirmation(f);
});

test("page writer then webhook preserves its confirmation and earnings", async () => {
  const f = await fixture();
  await f.pageWriter();
  const [before] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  await f.webhook();
  const [afterWebhook] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.equal(afterWebhook.confirmationCode, before.confirmationCode);
  assert.deepEqual(afterWebhook.confirmedAt, before.confirmedAt);
  await assertConfirmation(f, true);
});

test("a stale page writer racing the webhook cannot mint earnings after losing", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.webhook(), f.pageWriter()]);
  assert.equal(results[0].status, "fulfilled");
  const pageWon = results[1].status === "fulfilled";
  if (!pageWon) {
    assert.equal((results[1] as PromiseRejectedResult).reason.code, "BOOKING_ALREADY_CONFIRMED");
  }
  await assertConfirmation(f, pageWon);
});

test("missing legacy IDs cannot enqueue a traveler confirmation", async () => {
  const before = await db.select().from(emailOutbox);
  await stripePaymentService.handlePaymentSucceeded({
    id: `pi_fixture_${crypto.randomUUID()}`,
    metadata: { bookingIds: crypto.randomUUID() },
  } as Stripe.PaymentIntent);
  assert.equal((await db.select().from(emailOutbox)).length, before.length);
});

test("duplicate IDs in one payment delivery share the same claim", async () => {
  const f = await fixture();
  f.pi.metadata.bookingIds = `${f.bookingId},${f.bookingId}`;
  await f.webhook();
  await assertConfirmation(f);
});

test("already-confirmed booking retains its code, flags, and existing financial rows", async () => {
  const f = await fixture();
  await db.update(bookings).set({
    status: "confirmed", confirmationCode: "TRV_EXISTING",
    paymentStatus: "succeeded", depositPaid: true, balancePaid: false,
    confirmedAt: new Date("2026-01-01T12:00:00Z"),
  }).where(eq(bookings.id, f.bookingId));
  const [before] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  await f.webhook();
  const [afterWebhook] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.deepEqual(afterWebhook, before);
  const rows = await db.select().from(emailOutbox).where(sql`
    ${emailOutbox.metadata}->>'bookingId' = ${f.bookingId}
  `);
  assert.equal(rows.length, 0);
  assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 0);
});
