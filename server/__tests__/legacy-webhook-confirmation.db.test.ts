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
import type { RequestHandler } from "express";
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
const intents = new Map<string, Stripe.PaymentIntent>();
stripePrototype.retrieve = async (id: string) => intents.get(id) ?? { id, status: "succeeded", metadata: {} };
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
const { _outboxTestHooks, drainOutbox } = await import("../services/email-outbox.service");
const { storage } = await import("../storage");
const { default: express } = await import("express");
const { default: bookingRouter } = await import("../routes/bookings");

// Exercise the production router and its real auth/ownership checks over HTTP.
// Only the Passport session identity is supplied by the isolated fixture.
const app = express();
app.use(express.json() as RequestHandler);
app.use((req, _res, next) => {
  req.user = { id: String(req.headers["x-fixture-user"] ?? "") };
  req.isAuthenticated = (() => Boolean(req.headers["x-fixture-user"])) as typeof req.isAuthenticated;
  req.logout = ((done: (error?: Error) => void) => done()) as typeof req.logout;
  next();
});
app.use("/api/bookings", bookingRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const port = address.port;

async function confirmHttp(f: Fixture, overrides: { userId?: string; bookingId?: string; piId?: string } = {}) {
  const body = JSON.stringify({
    bookingId: overrides.bookingId ?? f.bookingId,
    paymentIntentId: overrides.piId ?? f.pi.id,
  });
  // The original transport is allowed only to this owned local server.
  return new Promise<{ status: number; body: { success: boolean; source?: string; error?: string } }>((resolve, reject) => {
    const request = previousHttp({
      hostname: "127.0.0.1", port, path: "/api/bookings/confirm-payment", method: "POST",
      headers: { "content-type": "application/json", "x-fixture-user": overrides.userId ?? f.travelerId },
    }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { text += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode!, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(10_000, () => request.destroy(new Error("Fixture confirmation HTTP timeout")));
    request.end(body);
  });
}

const sends: Array<{ to: string | string[]; text?: string }> = [];
_outboxTestHooks.sendEmailFn = async (params) => {
  sends.push({ to: params.to, text: params.text });
  return { ok: true, id: `simulated_${crypto.randomUUID()}` };
};

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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
    metadata: { userId: travelerId, bookingIds: bookingId, isDeposit: String(deposit) },
  });
  const pi = {
    id: piId, status: "succeeded", currency: "usd", amount: 12000, amount_received: 12000,
    metadata: { userId: travelerId, bookingIds: bookingId, isDeposit: String(deposit) },
  } as unknown as Stripe.PaymentIntent;
  intents.set(piId, pi);
  return { bookingId, travelerId, email, pi,
    webhook: async () => {
      await stripePaymentService.handlePaymentSucceeded(pi);
      // Simulate the existing drain after the authoritative transaction commits.
      await drainOutbox();
    },
    pageWriter: () => bookingService.confirmBookingPayment(bookingId, piId, travelerId) };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function assertConfirmation(f: Fixture, pageWon = false, deposit = false, ledgerStatus = "succeeded") {
  // Traveler delivery now belongs to the existing outbox drain after commit.
  await drainOutbox();
  // Poll boundedly for the actual persisted sent row, not fixed-sleep acceptance.
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
  assert.equal(payment.status, ledgerStatus);
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
  const transaction = db.transaction.bind(db);
  const dialect = new PgDialect();
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const deadline = setTimeout(release, 5000);
  db.transaction = (async (action: Parameters<typeof db.transaction>[0], ...options: any[]) => {
    return transaction(async (tx) => {
      const execute = tx.execute.bind(tx);
      tx.execute = (async (query: Parameters<typeof tx.execute>[0]) => {
        if (typeof query === "string") return execute(query);
        const rendered = dialect.sqlToQuery(query.getSQL());
        if (/UPDATE\s+bookings\s+SET/i.test(rendered.sql) && rendered.params.includes(f.bookingId)) {
          arrived++;
          if (arrived === count) release();
          await barrier;
        }
        return execute(query);
      }) as typeof tx.execute;
      return action(tx);
    }, ...options);
  }) as typeof db.transaction;
  try {
    await Promise.all(Array.from({ length: count }, f.webhook));
    assert.equal(arrived, count, "all webhook claims reached the same race");
  } finally {
    clearTimeout(deadline);
    release();
    db.transaction = transaction;
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

test("HTTP webhook then page fast-path returns success with one confirmation and no new earnings", async () => {
  const f = await fixture();
  await f.webhook();
  assert.deepEqual(await confirmHttp(f), {
    status: 200, body: { success: true, message: "Booking confirmed", source: "webhook" },
  });
  await assertConfirmation(f);
});

for (const deposit of [false, true]) {
  test(`HTTP ${deposit ? "deposit" : "full-payment"} webhook wins after route read: success and one matching traveler confirmation`, async () => {
    const f = await fixture(deposit);
    const read = storage.getBookingStatusForUser.bind(storage);
    let raced = false;
    storage.getBookingStatusForUser = async (id, userId) => {
      const result = await read(id, userId);
      if (id === f.bookingId) {
        assert.equal(result?.status, "pending_payment");
        raced = true;
        await f.webhook();
      }
      return result;
    };
    try {
      assert.deepEqual(await confirmHttp(f), {
        status: 200, body: { success: true, message: "Booking confirmed", source: "webhook" },
      });
      assert.equal(raced, true, "webhook completed after the real stale route read");
    } finally {
      storage.getBookingStatusForUser = read;
    }
    await assertConfirmation(f, false, deposit);
    assert.equal((await confirmHttp(f)).status, 200);
    await assertConfirmation(f, false, deposit);
  });
}

test("HTTP webhook wins the atomic claim after the page writer read: success without losing-writer earnings", async () => {
  const f = await fixture();
  const transaction = db.transaction.bind(db);
  let raced = false;
  db.transaction = (async (...args: Parameters<typeof db.transaction>) => {
    if (!raced) {
      raced = true;
      await f.webhook();
    }
    return transaction(...args);
  }) as typeof db.transaction;
  try {
    assert.deepEqual(await confirmHttp(f), {
      status: 200, body: { success: true, message: "Booking confirmed", source: "webhook" },
    });
    assert.equal(raced, true, "webhook won immediately before the real page transaction");
  } finally {
    db.transaction = transaction;
  }
  await assertConfirmation(f);
});

test("HTTP rejects another traveler, mismatched/missing recorded intent, replay, and non-success states", async () => {
  const f = await fixture();
  await f.webhook();
  await assertConfirmation(f);
  const other = await fixture();
  assert.equal((await confirmHttp(f, { userId: other.travelerId })).status, 403);
  assert.equal((await confirmHttp(f, { piId: other.pi.id })).status, 409);
  assert.equal((await confirmHttp(f, { bookingId: crypto.randomUUID() })).status, 404);

  await db.update(bookings).set({ stripePaymentIntentId: f.pi.id }).where(eq(bookings.id, other.bookingId));
  assert.equal((await confirmHttp(f)).status, 409, "duplicate intent on another booking cannot recover");
  await db.update(bookings).set({ stripePaymentIntentId: null }).where(eq(bookings.id, other.bookingId));
  await db.update(bookings).set({ stripePaymentIntentId: f.pi.id }).where(eq(bookings.id, f.bookingId));
  assert.equal((await confirmHttp(other, { piId: f.pi.id })).status, 409, "pending replay still rejected");

  await db.update(bookings).set({ stripePaymentIntentId: other.pi.id }).where(eq(bookings.id, f.bookingId));
  assert.equal((await confirmHttp(f)).status, 409, "conflicting saved intent cannot recover");
  await db.update(bookings).set({ stripePaymentIntentId: null }).where(eq(bookings.id, f.bookingId));
  assert.equal((await confirmHttp(f)).status, 200, "unstamped legacy intent needs exact Stripe and ledger association");
  await db.update(paymentIntents).set({ metadata: {} }).where(eq(paymentIntents.stripePaymentIntentId, f.pi.id));
  assert.equal((await confirmHttp(f)).status, 409, "no server-created ledger association cannot recover");
  await db.update(bookings).set({ stripePaymentIntentId: f.pi.id }).where(eq(bookings.id, f.bookingId));

  for (const status of ["failed", "payment_failed", "cancelled", "completed"]) {
    await db.update(bookings).set({ status }).where(eq(bookings.id, f.bookingId));
    assert.equal((await confirmHttp(f)).status, 409, `${status} is not a confirmed race`);
  }
  await db.update(bookings).set({ status: "confirmed", paymentStatus: "failed" }).where(eq(bookings.id, f.bookingId));
  assert.equal((await confirmHttp(f)).status, 409, "failed payment record cannot recover");
  await db.update(bookings).set({ paymentStatus: "succeeded" }).where(eq(bookings.id, f.bookingId));
  await assertConfirmation(f);
});

test("HTTP recovery rejects absent, wrong-traveler, and substring-only Stripe associations", async () => {
  const f = await fixture();
  await f.webhook();
  const metadata = f.pi.metadata;
  try {
    for (const replacement of [
      {},
      { ...metadata, userId: crypto.randomUUID() },
      { ...metadata, bookingIds: `${f.bookingId}0` },
      { ...metadata, bookingIds: crypto.randomUUID() },
    ]) {
      f.pi.metadata = replacement;
      assert.equal((await confirmHttp(f)).status, 409);
    }
  } finally {
    f.pi.metadata = metadata;
  }
  await assertConfirmation(f);
});

for (const invalidFact of ["owner", "status", "payment", "intent", "ledger", "stripe-association"] as const) {
  test(`HTTP stale route read cannot turn changed ${invalidFact} facts into race success`, async () => {
    const f = await fixture();
    const read = storage.getBookingStatusForUser.bind(storage);
    let raced = false;
    storage.getBookingStatusForUser = async (id, userId) => {
      const result = await read(id, userId);
      if (id === f.bookingId) {
        assert.equal(result?.status, "pending_payment");
        raced = true;
        await f.webhook();
        await assertConfirmation(f);
        if (invalidFact === "owner") {
          const other = await fixture();
          await db.update(bookings).set({ userId: other.travelerId }).where(eq(bookings.id, f.bookingId));
        } else if (invalidFact === "status") {
          await db.update(bookings).set({ status: "payment_failed" }).where(eq(bookings.id, f.bookingId));
        } else if (invalidFact === "payment") {
          await db.update(bookings).set({ paymentStatus: "failed" }).where(eq(bookings.id, f.bookingId));
        } else if (invalidFact === "intent") {
          await db.update(bookings).set({ stripePaymentIntentId: `pi_conflict_${crypto.randomUUID()}` })
            .where(eq(bookings.id, f.bookingId));
        } else if (invalidFact === "ledger") {
          await db.update(paymentIntents).set({ status: "failed" })
            .where(eq(paymentIntents.stripePaymentIntentId, f.pi.id));
        } else {
          f.pi.metadata = { ...f.pi.metadata, bookingIds: crypto.randomUUID() };
        }
      }
      return result;
    };
    try {
      const response = await confirmHttp(f);
      assert.equal(response.status, invalidFact === "owner" ? 403 : 409);
      assert.equal(response.body.success, false);
      assert.equal(raced, true);
    } finally {
      storage.getBookingStatusForUser = read;
    }
    assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 1);
    assert.equal((await db.select().from(providerEarnings).where(eq(providerEarnings.sourceId, f.bookingId))).length, 0);
    assert.equal((await db.select().from(platformRevenue).where(eq(platformRevenue.sourceId, f.bookingId))).length, 0);
  });
}

test("HTTP page fallback still succeeds and mints its original earnings exactly once", async () => {
  const f = await fixture();
  assert.deepEqual(await confirmHttp(f), {
    status: 200, body: { success: true, message: "Booking confirmed", source: "fallback" },
  });
  // The page writer does not advance the local PI ledger; that remains the
  // webhook's responsibility. Verify the existing behavior, not new writes.
  await assertConfirmation(f, true, false, "pending");
  assert.equal((await confirmHttp(f)).status, 200);
  await assertConfirmation(f, true, false, "pending");
});

for (const initialConfirmed of [false, true]) {
  test(`HTTP ${initialConfirmed ? "confirmed" : "pending"} booking rejects unsuccessful Stripe payment and lookup failure`, async () => {
    const f = await fixture();
    if (initialConfirmed) await f.webhook();
    const retrieve = stripePrototype.retrieve;
    try {
      stripePrototype.retrieve = async (id: string) => ({ id, status: "requires_payment_method" });
      assert.equal((await confirmHttp(f)).status, 402);
      stripePrototype.retrieve = async () => { throw new Error("Simulated Stripe lookup failure"); };
      assert.equal((await confirmHttp(f)).status, 402);
    } finally {
      stripePrototype.retrieve = retrieve;
    }
    if (initialConfirmed) await assertConfirmation(f);
    else {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
      assert.equal(booking.status, "pending_payment");
      assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 0);
      assert.equal((await db.select().from(providerEarnings).where(eq(providerEarnings.sourceId, f.bookingId))).length, 0);
    }
  });
}

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
  } as unknown as Stripe.PaymentIntent);
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
