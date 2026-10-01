/**
 * CANONICAL CART BOOKING CONFIRMATIONS — database contract tests for the mail written by the
 * winning cart and balance promotions.
 *
 * These tests deliberately enter through promotePaidCheckout / promoteBalancePayment and inspect
 * the durable email_outbox rows. They do not call a mail builder or an email sender: promotion
 * must commit the booking transition and its mail together, and a DB-backed outbox record is the
 * observable contract. No generic outbox drain is used, so unrelated mail can never be claimed.
 *
 *   C1  full payment writes a truthful, linked full confirmation;
 *   C2  a deposit writes only a deposit confirmation, then concurrent/replayed balance signals
 *       converge on one balance confirmation;
 *   C3  replay after a simulated transient failure leaves the same durable row for retry;
 *   C4  a missing traveler address is explicitly dead-lettered rather than silently discarded;
 *   C5  an outbox persistence failure rolls full, deposit and balance promotions back and can recover;
 *   C6  a nested stay date range is rendered; C7 keeps the pure payload safe and truthful.
 *
 * DISPOSABLE DB ONLY. No Stripe calls and no email sender/network calls.
 * Run solo: JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/canonical-booking-email.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  promotePaidCheckout,
  promoteBalancePayment,
  stampBalanceAuthorization,
} from "../services/checkout-claim.service";
import { buildCanonicalBookingEmailPayload } from "../services/canonical-booking-email";
import { emailOutbox } from "../../shared/schema";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  traveler: `mail-${RUN}-traveler`,
  noEmailTraveler: `mail-${RUN}-no-email`,
  provider: `mail-${RUN}-provider`,
  service: `mail-${RUN}-service`,
};
const bookingIds: string[] = [];
const paymentIntentIds: string[] = [];
const SERVICE_DATE = "2030-05-14";
const BALANCE_DUE_AT = "2030-05-10";
const CURRENCY = "CAD";
const PAYMENT_INTENT_CURRENCY = "cad";
const CATEGORY = "canonical_booking_confirmation";

// Keep this suite's write guard aligned with the existing payment-promotion DB suites.
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
      `[canonical-booking-email] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.traveler}, ${`mail-${RUN}@t.test`}, 'Taylor', 'Traveler')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.noEmailTraveler}, NULL, 'No', 'Address')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`provider-${RUN}@t.test`}, 'Kiko', 'Guide', 'expert')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, delivery_method)
    VALUES (${ids.service}, ${ids.provider}, 'Guided Kyoto Day', '100.00', 'in_person')
  `);
});

after(async () => {
  try {
    if (bookingIds.length > 0) {
      await pool.query(
        `DELETE FROM email_outbox WHERE metadata->>'bookingId' = ANY($1)`,
        [bookingIds],
      );
      if (paymentIntentIds.length > 0) {
        await pool.query(
          `DELETE FROM payment_intents WHERE stripe_payment_intent_id = ANY($1)`,
          [paymentIntentIds],
        );
      }
      await db.execute(sql`
        DELETE FROM service_bookings WHERE id IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})
      `).catch(() => {});
    }
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.provider}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.noEmailTraveler}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${ids.traveler}`).catch(() => {});
  } finally {
    await pool.end();
  }
});

async function makeBooking(opts: {
  paymentIntentId: string | null;
  status?: string;
  travelerId?: string;
  depositAmount?: string | null;
  balanceAmount?: string | null;
  detailsCurrency?: string;
  paymentIntentAmount?: string;
  totalAmount?: string;
  platformFee?: string;
  travelerServiceFeeCharged?: string;
  conciergeFee?: string;
  travelSurcharge?: string;
  scheduledDate?: string;
  checkIn?: string;
  checkOut?: string;
  stay?: { checkIn: string; checkOut: string };
}): Promise<{ id: string; trackingNumber: string }> {
  const index = bookingIds.length;
  const id = `mail-${RUN}-booking-${index}`;
  const trackingNumber = `TRK-${RUN}-${index}`;
  const details = JSON.stringify({
    serviceTitle: "Guided Kyoto Day",
    ...(opts.scheduledDate ? { scheduledDate: opts.scheduledDate } : {}),
    ...(opts.checkIn ? { checkIn: opts.checkIn } : {}),
    ...(opts.checkOut ? { checkOut: opts.checkOut } : {}),
    ...(opts.stay ? { stay: opts.stay } : {}),
    ...(!opts.scheduledDate && !opts.checkIn && !opts.stay ? { serviceDate: SERVICE_DATE } : {}),
    ...(opts.travelerServiceFeeCharged != null
      ? { travelerServiceFee: { charged: opts.travelerServiceFeeCharged } }
      : {}),
    ...(opts.conciergeFee != null ? { travelerCharge: { conciergeFee: opts.conciergeFee } } : {}),
    ...(opts.travelSurcharge != null ? { travelSurcharge: opts.travelSurcharge } : {}),
    currency: opts.detailsCurrency ?? CURRENCY,
  });
  bookingIds.push(id);
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, tracking_number, service_id, traveler_id, provider_id, status,
      total_amount, platform_fee, provider_earnings, stripe_payment_intent_id,
      deposit_amount, balance_amount, balance_paid, balance_due_at, booking_details, booking_metadata,
      created_at
    ) VALUES (
      ${id}, ${trackingNumber}, ${ids.service}, ${opts.travelerId ?? ids.traveler}, ${ids.provider},
      ${opts.status ?? "payment_pending"},
      ${opts.totalAmount ?? "100.00"}, ${opts.platformFee ?? "0.00"}, '75.00', ${opts.paymentIntentId},
      ${opts.depositAmount ?? null}, ${opts.balanceAmount ?? null}, false,
      ${opts.balanceAmount ? BALANCE_DUE_AT : null},
      ${details}::jsonb, ${details}::jsonb, NOW()
    )
  `);
  if (opts.paymentIntentId) {
    await seedPaymentIntent({
      paymentIntentId: opts.paymentIntentId,
      bookingId: id,
      travelerId: opts.travelerId ?? ids.traveler,
      currency: PAYMENT_INTENT_CURRENCY,
      isDeposit: opts.depositAmount != null,
      amount: opts.paymentIntentAmount ?? opts.depositAmount ?? "100.00",
    });
  }
  return { id, trackingNumber };
}

/** Seed the same local currency record the Stripe writer persists; no payment API is called. */
async function seedPaymentIntent(opts: {
  paymentIntentId: string;
  bookingId: string;
  travelerId?: string;
  currency?: string;
  isDeposit?: boolean;
  amount?: string;
}): Promise<void> {
  paymentIntentIds.push(opts.paymentIntentId);
  await db.execute(sql`
    INSERT INTO payment_intents (
      stripe_payment_intent_id, user_id, amount, currency, status, is_deposit, metadata, created_at
    ) VALUES (
      ${opts.paymentIntentId}, ${opts.travelerId ?? ids.traveler}, ${opts.amount ?? "100.00"},
      ${opts.currency ?? PAYMENT_INTENT_CURRENCY}, 'requires_payment_method',
      ${opts.isDeposit ?? false}, ${JSON.stringify({ bookingId: opts.bookingId })}::jsonb, NOW()
    )
  `);
}

async function outboxRows(bookingId: string): Promise<any[]> {
  const r = await pool.query(
    `SELECT id, email_type, to_email, subject, html, text_body, status, attempt_count,
            retry_after, last_error, metadata
       FROM email_outbox
      WHERE metadata->>'bookingId' = $1
      ORDER BY id ASC`,
    [bookingId],
  );
  return r.rows;
}

/**
 * Inject an outbox insert failure only for the selected fixture booking, while keeping the
 * production transaction and every preceding SQL statement real. In particular, the booking
 * conditional UPDATE and paid-charge stamp execute before the failing insert, so the caller can
 * prove PostgreSQL rolls the whole transaction back. No DDL or global mail drain is involved.
 */
async function withOutboxInsertFailure<T>(bookingId: string, action: () => Promise<T>): Promise<T> {
  const mutableDb = db as any;
  const originalTransaction = mutableDb.transaction;
  mutableDb.transaction = function (callback: (tx: any) => Promise<unknown>, ...args: any[]) {
    return originalTransaction.call(
      this,
      async (tx: any) => {
        const originalInsert = tx.insert.bind(tx);
        tx.insert = (table: unknown) => {
          const builder = originalInsert(table);
          if (table !== emailOutbox) return builder;
          return new Proxy(builder, {
            get(target, property) {
              if (property === "values") {
                return (values: any) => {
                  if (values?.metadata?.bookingId === bookingId) {
                    throw new Error(`simulated outbox persistence failure for ${bookingId}`);
                  }
                  return Reflect.get(target, property, target).call(target, values);
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        };
        return callback(tx);
      },
      ...args,
    );
  };
  try {
    return await action();
  } finally {
    mutableDb.transaction = originalTransaction;
  }
}

function assertPayload(row: any, opts: {
  bookingId: string;
  trackingNumber: string;
  leg: "full" | "deposit" | "balance";
  amount: string;
  recipient: string;
}): void {
  assert.equal(row.email_type, CATEGORY);
  assert.equal(row.metadata.bookingId, opts.bookingId);
  assert.equal(row.metadata.paymentLeg, opts.leg);
  assert.equal(row.to_email, opts.recipient);
  assert.ok(["pending", "failed"].includes(row.status), "confirmation remains durably queued");
  assert.ok(row.retry_after == null || new Date(row.retry_after).getTime() > 0);

  const rendered = `${row.subject}\n${row.html}\n${row.text_body ?? ""}`;
  assert.ok(rendered.includes(opts.trackingNumber), "the confirmation includes the booking's tracking reference");
  assert.ok(rendered.includes("Guided Kyoto Day"), "the confirmation uses the purchased service title");
  assert.ok(rendered.includes(SERVICE_DATE) || rendered.includes("May 14, 2030"), "the confirmed service date is present");
  assert.ok(rendered.includes(CURRENCY), "the booking currency is explicit in the payload");
  assert.ok(rendered.includes(opts.amount), `the ${opts.leg} amount is present`);
  if (opts.leg === "deposit") {
    assert.ok(rendered.includes("70.00"), "the deposit confirmation names the remaining balance");
    assert.ok(rendered.includes(BALANCE_DUE_AT) || rendered.includes("May 10, 2030"), "the deposit confirmation includes the stored balance due date");
  }
  assert.match(row.html, /<a\b[^>]*href=["'][^"']*(?:booking|trip|service)[^"']*["']/i, "the email contains a booking-related link");
}

test("C1: a winning full-payment promotion commits one linked, truthful confirmation row", async () => {
  const pi = `pi_mail_${RUN}_full`;
  // The actual charged share is $112.00 (base + $12.00 surcharge) + $5.00 concierge + $7.00
  // traveler service fee = $124.00. The commission/platform fee is withheld, not charged again.
  // The local Stripe-writer currency (CAD) wins over the inconsistent EUR booking snapshot.
  const booking = await makeBooking({
    paymentIntentId: pi,
    detailsCurrency: "EUR",
    paymentIntentAmount: "124.00",
    totalAmount: "112.00",
    platformFee: "25.00",
    travelerServiceFeeCharged: "7.00",
    conciergeFee: "5.00",
    travelSurcharge: "12.00",
    scheduledDate: "2030-01-01",
    checkIn: SERVICE_DATE,
    checkOut: "2030-05-16",
  });

  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [booking.id],
  });
  assert.deepEqual(result.promoted, [booking.id]);

  const rows = await outboxRows(booking.id);
  assert.equal(rows.length, 1, "the winning full promotion committed exactly one durable mail row");
  assertPayload(rows[0], {
    bookingId: booking.id,
    trackingNumber: booking.trackingNumber,
    leg: "full",
    amount: "124.00",
    recipient: `mail-${RUN}@t.test`,
  });
  const rendered = `${rows[0].subject}\n${rows[0].html}\n${rows[0].text_body ?? ""}`;
  assert.ok(rendered.includes("2030-05-16"), "the stay's check-out date appears alongside check-in");
  assert.ok(!rendered.includes("2030-01-01"), "the unrelated scheduled date does not replace the stay range");
});

test("C2: deposit and concurrent/replayed balance promotions converge on one row for each paid leg", async () => {
  const depositPi = `pi_mail_${RUN}_deposit`;
  const balancePi = `pi_mail_${RUN}_balance`;
  const booking = await makeBooking({
    paymentIntentId: depositPi,
    depositAmount: "30.00",
    balanceAmount: "70.00",
    travelerServiceFeeCharged: "7.00",
    paymentIntentAmount: "37.00",
  });

  const depositSignals = await Promise.all([
    promotePaidCheckout({ paymentIntentId: depositPi, actor: "webhook", metadataBookingIds: [booking.id] }),
    promotePaidCheckout({ paymentIntentId: depositPi, actor: "client", actorId: ids.traveler, bookingIds: [booking.id] }),
  ]);
  assert.equal(depositSignals.reduce((n, r) => n + r.promoted.length, 0), 1, "only one signal wins the deposit transition");

  const depositRows = await outboxRows(booking.id);
  assert.equal(depositRows.length, 1, "a deposit never enqueues the final/balance message early");
  assertPayload(depositRows[0], {
    bookingId: booking.id,
    trackingNumber: booking.trackingNumber,
    leg: "deposit",
    amount: "37.00",
    recipient: `mail-${RUN}@t.test`,
  });

  assert.equal(await stampBalanceAuthorization(booking.id, balancePi), true);
  await seedPaymentIntent({ paymentIntentId: balancePi, bookingId: booking.id, isDeposit: false, amount: "70.00" });
  const balanceSignals = await Promise.all([
    promoteBalancePayment({ bookingId: booking.id, paymentIntentId: balancePi, actor: "webhook" }),
    promoteBalancePayment({ bookingId: booking.id, paymentIntentId: balancePi, actor: "checkout", actorId: ids.traveler }),
  ]);
  assert.equal(balanceSignals.filter((r) => r.promoted).length, 1, "only one signal wins the balance transition");

  const rows = await outboxRows(booking.id);
  assert.equal(rows.length, 2, "the booking has exactly one durable row per paid leg");
  assert.deepEqual(rows.map((r) => r.metadata.paymentLeg), ["deposit", "balance"]);
  assertPayload(rows[1], {
    bookingId: booking.id,
    trackingNumber: booking.trackingNumber,
    leg: "balance",
    amount: "70.00",
    recipient: `mail-${RUN}@t.test`,
  });
  const balanceBody = `${rows[1].subject}\n${rows[1].html}\n${rows[1].text_body ?? ""}`;
  assert.doesNotMatch(balanceBody, /77\.00\s+CAD/, "the deposit traveler service fee is not charged a second time on balance");

  // A later client/webhook replay must not enqueue another full, deposit or balance confirmation.
  await promotePaidCheckout({ paymentIntentId: depositPi, actor: "webhook", metadataBookingIds: [booking.id] });
  await promoteBalancePayment({ bookingId: booking.id, paymentIntentId: balancePi, actor: "webhook" });
  assert.equal((await outboxRows(booking.id)).length, 2, "replays leave one row for each paid leg");
});

test("C3: replay after a simulated transient send failure preserves one retryable durable row", async () => {
  const pi = `pi_mail_${RUN}_retry`;
  const booking = await makeBooking({ paymentIntentId: pi });
  await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [booking.id] });

  // Simulate a previously failed delivery without invoking the global outbox drain (which could
  // claim unrelated rows). The actual retry scheduler can safely own this one row later.
  const rows = await outboxRows(booking.id);
  assert.equal(rows.length, 1);
  await pool.query(
    `UPDATE email_outbox
        SET status = 'failed', attempt_count = 1, last_error = 'simulated mail transport failure',
            retry_after = NOW() + INTERVAL '5 minutes'
      WHERE id = $1`,
    [rows[0].id],
  );

  const replay = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "client",
    actorId: ids.traveler,
    bookingIds: [booking.id],
  });
  assert.equal(replay.promoted.length, 0, "business-state replay is an idempotent no-op");

  const afterReplay = await outboxRows(booking.id);
  assert.equal(afterReplay.length, 1, "replay did not create a duplicate confirmation");
  assert.equal(afterReplay[0].status, "failed");
  assert.equal(afterReplay[0].attempt_count, 1);
  assert.ok(afterReplay[0].retry_after, "the failed row retains its retry schedule");
});

test("C4: a full promotion with no traveler email records an explicit dead-letter row", async () => {
  const pi = `pi_mail_${RUN}_no_email`;
  const booking = await makeBooking({ paymentIntentId: pi, travelerId: ids.noEmailTraveler });
  const result = await promotePaidCheckout({
    paymentIntentId: pi,
    actor: "webhook",
    metadataBookingIds: [booking.id],
  });
  assert.deepEqual(result.promoted, [booking.id], "missing contact data does not undo a paid booking");

  const rows = await outboxRows(booking.id);
  assert.equal(rows.length, 1, "the missing-recipient failure is durable and discoverable");
  assert.equal(rows[0].email_type, CATEGORY);
  assert.equal(rows[0].metadata.bookingId, booking.id);
  assert.equal(rows[0].metadata.paymentLeg, "full");
  assert.equal(rows[0].status, "dead", "an undeliverable address is not queued forever for retry");
  assert.ok(rows[0].last_error, "ops can see why delivery was impossible");
});

test("C5: failure to persist the outbox row rolls the winning full promotion back", async () => {
  const fullPi = `pi_mail_${RUN}_rollback_full`;
  const full = await makeBooking({ paymentIntentId: fullPi });
  await assert.rejects(
    withOutboxInsertFailure(full.id, () =>
      promotePaidCheckout({ paymentIntentId: fullPi, actor: "webhook", metadataBookingIds: [full.id] }),
    ),
    /Could not persist the canonical booking confirmation/,
  );
  let state = await pool.query(
    `SELECT status, booking_details->'paidCharge' AS paid_charge FROM service_bookings WHERE id = $1`,
    [full.id],
  );
  assert.equal(state.rows[0]?.status, "payment_pending");
  assert.equal(state.rows[0]?.paid_charge, null);
  assert.equal((await outboxRows(full.id)).length, 0, "failed full promotion left no partial confirmation");

  const fullRecovery = await promotePaidCheckout({ paymentIntentId: fullPi, actor: "webhook", metadataBookingIds: [full.id] });
  assert.deepEqual(fullRecovery.promoted, [full.id], "the same full signal can recover after the failed transaction");
  const fullReplay = await promotePaidCheckout({ paymentIntentId: fullPi, actor: "webhook", metadataBookingIds: [full.id] });
  assert.deepEqual(fullReplay.promoted, []);
  assert.deepEqual(fullReplay.alreadyConfirmed, [full.id]);
  const fullRows = await outboxRows(full.id);
  assert.deepEqual(fullRows.map((r) => r.metadata.paymentLeg), ["full"]);
  assert.equal(fullRows[0]?.status, "pending", "recovered full confirmation is durably queued");

  const depositPi = `pi_mail_${RUN}_rollback_deposit`;
  const deposit = await makeBooking({ paymentIntentId: depositPi, depositAmount: "30.00", balanceAmount: "70.00" });
  await assert.rejects(
    withOutboxInsertFailure(deposit.id, () =>
      promotePaidCheckout({ paymentIntentId: depositPi, actor: "webhook", metadataBookingIds: [deposit.id] }),
    ),
    /Could not persist the canonical booking confirmation/,
  );
  state = await pool.query(
    `SELECT status, deposit_paid, booking_details->'paidCharge' AS paid_charge FROM service_bookings WHERE id = $1`,
    [deposit.id],
  );
  assert.equal(state.rows[0]?.status, "payment_pending");
  assert.equal(state.rows[0]?.deposit_paid, false);
  assert.equal(state.rows[0]?.paid_charge, null);
  assert.equal((await outboxRows(deposit.id)).length, 0, "failed deposit promotion left no partial confirmation");

  const depositRecovery = await promotePaidCheckout({ paymentIntentId: depositPi, actor: "webhook", metadataBookingIds: [deposit.id] });
  assert.deepEqual(depositRecovery.promoted, [deposit.id]);
  const depositReplay = await promotePaidCheckout({ paymentIntentId: depositPi, actor: "webhook", metadataBookingIds: [deposit.id] });
  assert.deepEqual(depositReplay.promoted, []);
  assert.deepEqual(depositReplay.alreadyConfirmed, [deposit.id]);
  const depositRows = await outboxRows(deposit.id);
  assert.deepEqual(depositRows.map((r) => r.metadata.paymentLeg), ["deposit"]);
  assert.equal(depositRows[0]?.status, "pending", "recovered deposit confirmation is durably queued");

  const balancePi = `pi_mail_${RUN}_rollback_balance`;
  const balance = await makeBooking({
    paymentIntentId: `pi_mail_${RUN}_rollback_balance_deposit`,
    depositAmount: "30.00",
    balanceAmount: "70.00",
  });
  await seedPaymentIntent({ paymentIntentId: balancePi, bookingId: balance.id, isDeposit: false, amount: "70.00" });
  await promotePaidCheckout({
    paymentIntentId: `pi_mail_${RUN}_rollback_balance_deposit`,
    actor: "webhook",
    metadataBookingIds: [balance.id],
  });
  assert.equal(await stampBalanceAuthorization(balance.id, balancePi), true);
  await assert.rejects(
    withOutboxInsertFailure(balance.id, () =>
      promoteBalancePayment({ bookingId: balance.id, paymentIntentId: balancePi, actor: "webhook" }),
    ),
    /Could not persist the canonical booking confirmation/,
  );
  state = await pool.query(
    `SELECT status, balance_paid FROM service_bookings WHERE id = $1`,
    [balance.id],
  );
  assert.equal(state.rows[0]?.status, "deposit_paid");
  assert.equal(state.rows[0]?.balance_paid, false, "failed balance promotion rolled back its paid flip");
  assert.deepEqual((await outboxRows(balance.id)).map((r) => r.metadata.paymentLeg), ["deposit"]);

  const balanceRecovery = await promoteBalancePayment({ bookingId: balance.id, paymentIntentId: balancePi, actor: "webhook" });
  assert.equal(balanceRecovery.promoted, true, "the balance signal can recover after its failed transaction");
  const balanceReplay = await promoteBalancePayment({ bookingId: balance.id, paymentIntentId: balancePi, actor: "webhook" });
  assert.equal(balanceReplay.promoted, false);
  assert.equal(balanceReplay.alreadyConfirmed, true);
  const balanceRows = await outboxRows(balance.id);
  assert.deepEqual(balanceRows.map((r) => r.metadata.paymentLeg), ["deposit", "balance"]);
  assert.equal(balanceRows.length, 2, "balance recovery and replay leave one row per paid leg");
  assert.ok(balanceRows.every((r) => r.status === "pending"), "the recovered balance row joins its pending deposit row");
});

test("C6: a nested stay.checkIn/checkOut range is rendered when no top-level date snapshot exists", async () => {
  const pi = `pi_mail_${RUN}_nested_stay`;
  const booking = await makeBooking({
    paymentIntentId: pi,
    stay: { checkIn: "2030-06-01", checkOut: "2030-06-03" },
  });
  await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [booking.id] });

  const rows = await outboxRows(booking.id);
  assert.equal(rows.length, 1);
  const rendered = `${rows[0].subject}\n${rows[0].html}\n${rows[0].text_body ?? ""}`;
  assert.ok(rendered.includes("2030-06-01"), "nested stay check-in is preserved");
  assert.ok(rendered.includes("2030-06-03"), "nested stay check-out is preserved");
});

test("C7: the pure builder does not invent missing amounts or dates, escapes HTML, and strips title CRLF", () => {
  const payload = buildCanonicalBookingEmailPayload({
    appBaseUrl: "https://example.test",
    leg: "full",
    bookingId: `mail-${RUN}-payload`,
    confirmationCode: `REF-${RUN}`,
    travelerName: `<img src=x onerror="alert(1)">`,
    bookingTitle: "Kyoto guide\r\nBcc: outsider@example.test",
    bookingDate: null,
    balanceDueAt: null,
    currency: null,
    amountPaid: null,
    remainingBalance: null,
  });

  assert.doesNotMatch(payload.subject, /[\r\n]/, "the subject cannot be split by a title line break");
  assert.ok(!payload.html.includes("<img"), "traveler text is escaped instead of rendered as markup");
  assert.ok(payload.html.includes("&lt;img"));
  assert.ok(!payload.text.includes("Date:"), "a missing booking date stays absent");
  assert.ok(!payload.text.includes("Balance due:"), "a missing balance deadline stays absent");
  assert.ok(!payload.text.includes("undefined") && !payload.text.includes("NaN"), "missing amounts stay absent");
  assert.doesNotMatch(payload.text, /Payment recorded:\s*(?:$|\n)/, "a missing amount is not rendered as zero");
});