/**
 * Native legacy payment writers, real PostgreSQL, simulated mail/Stripe only.
 * Run through scripts/verification/run-messaging-gate.mjs --isolated-db.
 * The existing runner clones constraints and owns/cleans all fixture sequences.
 * No public data, real mail, payment captures, refunds, or migrations.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";
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
const { _outboxTestHooks, drainOutbox } = await import("../services/email-outbox.service");
const { isLegacyBookingEmailPersistenceError } = await import("../services/legacy-booking-email-persistence-error");

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
  // Traveler notices are already durable at writer return. Delivery belongs
  // solely to the existing drain, including after a confirmation process dies.
  await drainOutbox();
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
  const transaction = db.transaction.bind(db);
  const dialect = new PgDialect();
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const deadline = setTimeout(release, 5000);
  db.transaction = ((action, config) => transaction(async (tx) => {
    const execute = tx.execute.bind(tx);
    tx.execute = (async (query: Parameters<typeof tx.execute>[0]) => {
      const rendered = dialect.sqlToQuery(query.getSQL());
      if (/UPDATE\s+bookings\s+SET/i.test(rendered.sql) && rendered.params.includes(f.bookingId)) {
        arrived++;
        if (arrived === count) release();
        await barrier;
      }
      return execute(query);
    }) as typeof tx.execute;
    return action(tx);
  }, config)) as typeof db.transaction;
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

async function travelerRows(f: Fixture) {
  return db.select().from(emailOutbox).where(sql`
    ${emailOutbox.metadata}->>'bookingId' = ${f.bookingId}
    AND ${emailOutbox.emailType} = 'booking_confirmation'
  `);
}

async function assertRolledBack(f: Fixture) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.equal(booking.status, "pending_payment");
  assert.equal(booking.paymentStatus, "pending");
  assert.equal(booking.confirmationCode, null);
  assert.equal(booking.confirmedAt, null);
  assert.equal(booking.depositPaid, false);
  assert.equal((await travelerRows(f)).length, 0);
  assert.equal((await db.select().from(providerEarnings)
    .where(eq(providerEarnings.sourceId, f.bookingId))).length, 0);
  assert.equal((await db.select().from(platformRevenue)
    .where(eq(platformRevenue.sourceId, f.bookingId))).length, 0);
  assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 0);
}

async function assertDurablePending(f: Fixture) {
  const rows = await travelerRows(f);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
  assert.equal(booking.status, "confirmed");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].attemptCount, 0);
  assert.equal((rows[0].metadata as { confirmationCode: string }).confirmationCode, booking.confirmationCode);
  assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 0,
    "no traveler transport before the drain");
  return booking;
}

/** Simulate a failing detail query using a real PostgreSQL error inside the winning transaction. */
async function failDetailQuery(f: Fixture, action: () => Promise<unknown>) {
  const transaction = db.transaction.bind(db);
  const dialect = new PgDialect();
  let failures = 0;
  db.transaction = ((work, config) => transaction(async (tx) => {
    const execute = tx.execute.bind(tx);
    tx.execute = (async (query: Parameters<typeof tx.execute>[0]) => {
      const rendered = dialect.sqlToQuery(query.getSQL());
      if (/SELECT\s+b\.title,\s*b\.booking_date,\s*b\.confirmation_code/i.test(rendered.sql)
        && rendered.params.includes(f.bookingId)) {
        failures++;
        return execute(sql`SELECT 1 / 0`);
      }
      return execute(query);
    }) as typeof tx.execute;
    return work(tx);
  }, config)) as typeof db.transaction;
  try {
    await assert.rejects(action, isLegacyBookingEmailPersistenceError);
    assert.equal(failures, 1, "failed the actual transactional detail-query boundary");
  } finally {
    db.transaction = transaction;
  }
}

/** Reject only this owned fixture's traveler insert; no persistence result is mocked. */
async function failTravelerInsert(f: Fixture, action: () => Promise<unknown>, expectsRejection = true) {
  await db.execute(sql`
    CREATE FUNCTION fixture_reject_traveler_email() RETURNS trigger AS $$
    BEGIN
      IF NEW.email_type = 'booking_confirmation' THEN
        RAISE EXCEPTION 'simulated traveler outbox persistence failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER fixture_reject_traveler_email
      BEFORE INSERT ON email_outbox
      FOR EACH ROW EXECUTE FUNCTION fixture_reject_traveler_email();
  `);
  try {
    if (expectsRejection) await assert.rejects(action, isLegacyBookingEmailPersistenceError);
    else await action();
    await assertRolledBack(f);
  } finally {
    await db.execute(sql`
      DROP TRIGGER fixture_reject_traveler_email ON email_outbox;
      DROP FUNCTION fixture_reject_traveler_email();
    `);
  }
}

/** Kill an actual writer process at a proved native transaction boundary. */
async function crashWriter(f: Fixture, writer: "webhook" | "page", point: "before_commit" | "after_commit") {
  const child = spawn(process.execPath, [
    "--require", path.resolve("scripts/verification/messaging-schema-preload.cjs"),
    "--import", "tsx",
    path.resolve("server/__tests__/fixtures/legacy-confirmation-crash-worker.ts"),
    writer, point, JSON.stringify({ bookingId: f.bookingId, travelerId: f.travelerId, pi: f.pi }),
  ], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.includes(`CRASH_POINT_READY=${point}`)) resolve();
    });
    child.stderr.on("data", chunk => { output += chunk; });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(`Crash worker exited before kill point: ${output}`)));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Crash worker readiness timeout: ${output}`)), 20000);
      }),
    ]);
    if (point === "after_commit") await assertDurablePending(f);
    child.kill("SIGKILL");
    const result = await exited;
    assert.equal(result.signal, "SIGKILL", "actual writer process was killed");
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    await exited;
  }
}

for (const writer of ["webhook", "page"] as const) {
  test(`${writer}: detail lookup failure rolls back and authoritative retry saves one code`, async () => {
    const f = await fixture();
    const action = writer === "webhook" ? f.webhook : f.pageWriter;
    await failDetailQuery(f, action);
    await assertRolledBack(f);
    await action();
    const before = await assertDurablePending(f);
    await f.webhook();
    const [afterRetry] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
    assert.equal(afterRetry.confirmationCode, before.confirmationCode);
    await assertConfirmation(f, writer === "page");
  });

  test(`${writer}: outbox insert failure never sends and rolls back until persistence recovers`, async () => {
    const f = await fixture();
    const action = writer === "webhook" ? f.webhook : f.pageWriter;
    await failTravelerInsert(f, action);
    await action();
    await assertDurablePending(f);
    await f.webhook();
    await assertConfirmation(f, writer === "page");
  });

  for (const point of ["before_commit", "after_commit"] as const) {
    test(`${writer}: SIGKILL ${point} recovers through the authoritative writer or existing drain`, async () => {
      const f = await fixture();
      await crashWriter(f, writer, point);
      if (point === "before_commit") {
        await assertRolledBack(f);
        await (writer === "webhook" ? f.webhook() : f.pageWriter());
      }
      const before = await assertDurablePending(f);
      const earningsBefore = await db.select().from(providerEarnings)
        .where(eq(providerEarnings.sourceId, f.bookingId));
      const revenueBefore = await db.select().from(platformRevenue)
        .where(eq(platformRevenue.sourceId, f.bookingId));
      // A different, surviving process owns this drain; redelivery must not
      // create another code, traveler email, or earning for the committed row.
      await f.webhook();
      await assertConfirmation(f, writer === "page");
      const [afterRetry] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
      assert.equal(afterRetry.confirmationCode, before.confirmationCode);
      assert.deepEqual(afterRetry.confirmedAt, before.confirmedAt);
      assert.deepEqual(await db.select().from(providerEarnings)
        .where(eq(providerEarnings.sourceId, f.bookingId)), earningsBefore);
      assert.deepEqual(await db.select().from(platformRevenue)
        .where(eq(platformRevenue.sourceId, f.bookingId)), revenueBefore);
    });
  }

  test(`${writer}: a missing recipient is durable and visibly blocked, never sent`, async () => {
    const f = await fixture();
    await db.update(users).set({ email: null }).where(eq(users.id, f.travelerId));
    await (writer === "webhook" ? f.webhook() : f.pageWriter());
    await f.webhook();
    const rows = await travelerRows(f);
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, f.bookingId));
    assert.equal(booking.status, "confirmed");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "dead");
    assert.equal(rows[0].attemptCount, 0);
    assert.equal(rows[0].toEmail, "");
    assert.match(rows[0].lastError!, /Traveler email missing/);
    assert.equal((rows[0].metadata as { confirmationCode: string }).confirmationCode, booking.confirmationCode);
    assert.equal((rows[0].metadata as { deliveryBlocked: boolean }).deliveryBlocked, true);
    await drainOutbox();
    assert.equal(sends.filter(send => [send.to].flat().includes("")).length, 0,
      "dead row is not delivered to an invented recipient");
    assert.equal(sends.filter(send => [send.to].flat().includes(f.email)).length, 0);
    assert.equal((await travelerRows(f))[0].status, "dead");
    const earnings = await db.select().from(providerEarnings)
      .where(eq(providerEarnings.sourceId, f.bookingId));
    assert.equal(earnings.length, writer === "page" ? 1 : 0);
    if (earnings.length) assert.equal(Number(earnings[0].amount), 80);
  });
}

test("failed simulated transport retries the same durable row and stored code", async () => {
  const f = await fixture();
  await f.webhook();
  const before = await assertDurablePending(f);
  const sender = _outboxTestHooks.sendEmailFn;
  let failedCalls = 0;
  _outboxTestHooks.sendEmailFn = async () => {
    failedCalls++;
    return { ok: false, error: "simulated transport outage" };
  };
  try {
    await drainOutbox();
    const rows = await travelerRows(f);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "failed");
    assert.equal(rows[0].attemptCount, 1);
    assert.equal(failedCalls, 1);
    assert.equal((rows[0].metadata as { confirmationCode: string }).confirmationCode, before.confirmationCode);
    await f.webhook();
    assert.equal((await travelerRows(f)).length, 1);
    await db.update(emailOutbox).set({ retryAfter: new Date(0) }).where(eq(emailOutbox.id, rows[0].id));
  } finally {
    _outboxTestHooks.sendEmailFn = sender;
  }
  await assertConfirmation(f);
});

function responseCapture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

test("browser response boundary reports retryable 503 for native outbox persistence failure", async () => {
  const { default: router } = await import("../routes/bookings");
  const layer = router.stack.find((entry: any) => entry.route?.path === "/confirm-payment")!;
  const handler = layer.route!.stack.at(-1)!.handle;
  const f = await fixture();
  const request = {
    body: { bookingId: f.bookingId, paymentIntentId: f.pi.id },
    user: { claims: { sub: f.travelerId } },
  };
  await failTravelerInsert(f, async () => {
    const response = responseCapture();
    await handler(request as any, response as any, () => {});
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, "booking_confirmation_persistence_failed");
    assert.equal(response.body.retryable, true);
    assert.match(response.body.message, /please do not pay again/);
  }, false);
  const recovered = responseCapture();
  await handler(request as any, recovered as any, () => {});
  assert.equal(recovered.statusCode, 200);
  await f.webhook();
  await assertConfirmation(f, true);
});

test("signed webhook response boundary rejects a failed save and accepts the same event on retry", async () => {
  const { createPlatformStripeWebhookHandler } = await import("../routes/bookings");
  const f = await fixture();
  // This runner supplies no real webhook secret. Signing is local and synthetic.
  assert.equal(process.env.STRIPE_WEBHOOK_SECRET_TEST, undefined);
  const secret = "whsec_fixture_persistence_only";
  process.env.STRIPE_WEBHOOK_SECRET_TEST = secret;
  try {
    const handler = createPlatformStripeWebhookHandler();
    const payload = JSON.stringify({
      id: `evt_fixture_${crypto.randomUUID()}`, object: "event",
      type: "payment_intent.succeeded", data: { object: f.pi },
    });
    const signature = probe.webhooks.generateTestHeaderString({ payload, secret });
    const request = { rawBody: Buffer.from(payload), headers: { "stripe-signature": signature } };
    await failTravelerInsert(f, async () => {
      const response = responseCapture();
      await handler(request, response);
      assert.equal(response.statusCode, 500);
      assert.match(response.body.error, /delivery can be retried/);
    }, false);
    const recovered = responseCapture();
    await handler(request, recovered);
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.body.received, true);
    await assertConfirmation(f);
    const duplicate = responseCapture();
    await handler(request, duplicate);
    assert.equal(duplicate.statusCode, 200);
    await assertConfirmation(f);
  } finally {
    delete process.env.STRIPE_WEBHOOK_SECRET_TEST;
  }
});
