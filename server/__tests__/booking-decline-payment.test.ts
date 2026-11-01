/**
 * Owner decline releases an uncaptured card hold and still refunds a captured charge.
 *
 *   D1  `requires_capture` → one cancel, hold released. The log names the booking, the
 *       PaymentIntent, the status and the outcome, and never a card or a client secret.
 *   D2  `succeeded` → the refund rail runs, and the intent is not cancelled.
 *   D3  a second decline is a no-op: the hold is not cancelled again, and a succeeded
 *       charge the refunder already returned is not refunded again. A cancel Stripe
 *       answers with "already canceled" is the same no-op.
 *
 * No database and no Stripe. The route wires this helper; the helper is the decision.
 *
 *   npx tsx --test server/__tests__/booking-decline-payment.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bookingDeclineCancelIdempotencyKey,
  settleBookingDeclinePayment,
  type BookingDeclinePaymentLog,
} from "../services/booking-decline-payment.service";

const BOOKING = "bkg_decline_hold";
const PI = "pi_decline_hold";
const CARD_NUMBER = "4242424242424242";
const CLIENT_SECRET = "pi_secret_decline_hold_test";

const LOG_KEYS = new Set([
  "bookingId",
  "paymentIntentId",
  "paymentIntentStatus",
  "outcome",
  "stripeCode",
]);

type View = { status: string; card?: { number: string; last4: string }; client_secret?: string };

function assertSafeLogs(logs: BookingDeclinePaymentLog[]): void {
  const dumped = JSON.stringify(logs);
  assert.equal(dumped.includes(CARD_NUMBER), false, dumped);
  assert.equal(dumped.includes("4242"), false, dumped);
  assert.equal(dumped.includes(CLIENT_SECRET), false, dumped);
  assert.equal(dumped.includes("client_secret"), false, dumped);
  for (const line of logs) {
    for (const key of Object.keys(line)) {
      assert.ok(LOG_KEYS.has(key), `unexpected log key ${key}`);
    }
    for (const value of Object.values(line)) {
      assert.ok(value === undefined || value === null || typeof value === "string", JSON.stringify(line));
    }
    assert.equal(line.bookingId, BOOKING);
    assert.equal(line.paymentIntentId, PI);
  }
}

test("D1: declining a requires_capture PaymentIntent cancels it once and logs no card data", async () => {
  const view: View = {
    status: "requires_capture",
    card: { number: CARD_NUMBER, last4: "4242" },
    client_secret: CLIENT_SECRET,
  };
  const cancels: string[] = [];
  const refunds: number[] = [];
  const logs: BookingDeclinePaymentLog[] = [];

  const settled = await settleBookingDeclinePayment({
    bookingId: BOOKING,
    paymentIntentId: PI,
    retrieve: async () => view,
    cancel: async (id, key) => {
      cancels.push(key);
      assert.equal(id, PI);
      assert.equal(key, bookingDeclineCancelIdempotencyKey(PI));
      view.status = "canceled";
      return { status: "canceled" };
    },
    refund: async () => {
      refunds.push(1);
      return { alreadyRefunded: false };
    },
    log: (line) => {
      logs.push(line);
    },
  });

  assert.deepEqual(settled, { outcome: "hold_released" });
  assert.deepEqual(cancels, [bookingDeclineCancelIdempotencyKey(PI)]);
  assert.deepEqual(refunds, []);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].outcome, "hold_released");
  assert.equal(logs[0].paymentIntentStatus, "canceled");
  assertSafeLogs(logs);
});

test("D2: declining a succeeded PaymentIntent refunds it and does not cancel the charge", async () => {
  const cancels: string[] = [];
  const refunds: string[] = [];
  const logs: BookingDeclinePaymentLog[] = [];
  const view: View = {
    status: "succeeded",
    card: { number: CARD_NUMBER, last4: "4242" },
    client_secret: CLIENT_SECRET,
  };

  const settled = await settleBookingDeclinePayment({
    bookingId: BOOKING,
    paymentIntentId: PI,
    retrieve: async () => view,
    cancel: async (_id, key) => {
      cancels.push(key);
      return { status: "canceled" };
    },
    refund: async () => {
      refunds.push("issued");
      return { alreadyRefunded: false, amount: 80 };
    },
    log: (line) => {
      logs.push(line);
    },
  });

  assert.equal(settled.outcome, "refund");
  if (settled.outcome !== "refund") return;
  assert.equal(settled.alreadyRefunded, false);
  assert.equal(settled.payload.amount, 80);
  assert.deepEqual(cancels, []);
  assert.deepEqual(refunds, ["issued"]);
  assert.equal(logs[0].outcome, "refund");
  assert.equal(logs[0].paymentIntentStatus, "succeeded");
  assertSafeLogs(logs);
});

test("D3: a second decline or a retry is a no-op", async () => {
  const view: View = {
    status: "requires_capture",
    card: { number: CARD_NUMBER, last4: "4242" },
    client_secret: CLIENT_SECRET,
  };
  let cancels = 0;
  const logs: BookingDeclinePaymentLog[] = [];
  const declineHold = () =>
    settleBookingDeclinePayment({
      bookingId: BOOKING,
      paymentIntentId: PI,
      retrieve: async () => view,
      cancel: async () => {
        cancels += 1;
        view.status = "canceled";
        return { status: "canceled" };
      },
      refund: async () => {
        throw new Error("a released hold is not a refund");
      },
      log: (line) => {
        logs.push(line);
      },
    });

  const first = await declineHold();
  const second = await declineHold();
  assert.deepEqual(first, { outcome: "hold_released" });
  assert.deepEqual(second, { outcome: "noop", reason: "already_canceled" });
  assert.equal(cancels, 1, "the retry must not cancel the PaymentIntent again");
  assert.equal(logs[1].outcome, "already_canceled");

  // Stripe reports the intent already canceled (the response to the first cancel was lost).
  const raced: View = {
    status: "requires_capture",
    card: { number: CARD_NUMBER, last4: "4242" },
    client_secret: CLIENT_SECRET,
  };
  let racedCancels = 0;
  const racedLogs: BookingDeclinePaymentLog[] = [];
  const lost = await settleBookingDeclinePayment({
    bookingId: BOOKING,
    paymentIntentId: PI,
    retrieve: async () => raced,
    cancel: async () => {
      racedCancels += 1;
      raced.status = "canceled";
      const err = new Error("You cannot cancel this PaymentIntent because it has a status of canceled.") as Error & {
        code: string;
        payment_intent: { card: { number: string } };
      };
      err.code = "payment_intent_unexpected_state";
      err.payment_intent = { card: { number: CARD_NUMBER } };
      throw err;
    },
    refund: async () => {
      throw new Error("a released hold is not a refund");
    },
    log: (line) => {
      racedLogs.push(line);
    },
  });
  const again = await settleBookingDeclinePayment({
    bookingId: BOOKING,
    paymentIntentId: PI,
    retrieve: async () => raced,
    cancel: async () => {
      racedCancels += 1;
      return { status: "canceled" };
    },
    refund: async () => ({ alreadyRefunded: false }),
    log: (line) => {
      racedLogs.push(line);
    },
  });
  assert.deepEqual(lost, { outcome: "noop", reason: "already_canceled" });
  assert.deepEqual(again, { outcome: "noop", reason: "already_canceled" });
  assert.equal(racedCancels, 1);
  assert.equal(racedLogs[0].stripeCode, "payment_intent_unexpected_state");

  // A succeeded charge refunds once. The refunder's own already-issued answer is the retry.
  let stripeRefunds = 0;
  const refundLogs: BookingDeclinePaymentLog[] = [];
  const refundDecline = () =>
    settleBookingDeclinePayment({
      bookingId: BOOKING,
      paymentIntentId: PI,
      retrieve: async () => ({ status: "succeeded", card: { number: CARD_NUMBER, last4: "4242" }, client_secret: CLIENT_SECRET }),
      cancel: async () => {
        throw new Error("a captured charge is refunded, not cancelled");
      },
      refund: async () => {
        if (stripeRefunds === 0) {
          stripeRefunds += 1;
          return { alreadyRefunded: false };
        }
        return { alreadyRefunded: true };
      },
      log: (line) => {
        refundLogs.push(line);
      },
    });
  const paid = await refundDecline();
  const paidAgain = await refundDecline();
  assert.equal(paid.outcome, "refund");
  if (paid.outcome === "refund") assert.equal(paid.alreadyRefunded, false);
  assert.equal(paidAgain.outcome, "refund");
  if (paidAgain.outcome === "refund") assert.equal(paidAgain.alreadyRefunded, true);
  assert.equal(stripeRefunds, 1);
  assert.equal(refundLogs[1].outcome, "already_refunded");

  assertSafeLogs([...logs, ...racedLogs, ...refundLogs]);
});

test("a cancel that leaves the hold in place does not report the hold released", async () => {
  const logs: BookingDeclinePaymentLog[] = [];
  const settled = await settleBookingDeclinePayment({
    bookingId: BOOKING,
    paymentIntentId: PI,
    retrieve: async () => ({
      status: "requires_capture",
      card: { number: CARD_NUMBER, last4: "4242" },
      client_secret: CLIENT_SECRET,
    }),
    cancel: async () => {
      const err = new Error("stripe unavailable") as Error & { code: string; payment_method: { card: { number: string } } };
      err.code = "api_error";
      err.payment_method = { card: { number: CARD_NUMBER } };
      throw err;
    },
    refund: async () => {
      throw new Error("must not refund");
    },
    log: (line) => {
      logs.push(line);
    },
  });
  assert.deepEqual(settled, { outcome: "release_failed" });
  assert.equal(logs[0].outcome, "release_failed");
  assert.equal(logs[0].stripeCode, "api_error");
  assertSafeLogs(logs);
});

test("the owner decline handler settles through this helper and does not cancel a PaymentIntent itself", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const start = routes.indexOf("const handleOwnerBookingStatus");
  const end = routes.indexOf('app.patch("/api/expert/bookings/:id/status"');
  assert.ok(start > 0 && end > start);
  const handler = routes.slice(start, end);
  assert.match(handler, /applyOwnerDecline\(/);
  assert.equal(handler.includes("paymentIntents.cancel"), false);
  const decline = fs.readFileSync("server/services/booking-owner-decline.service.ts", "utf8");
  assert.match(decline, /settleBookingDeclinePayment\(/);
  assert.match(decline, /refundServiceBooking\(/);
  assert.match(decline, /outcome === "release_failed"/);
  assert.equal(decline.includes("paymentIntents.cancel"), false);
  const helper = fs.readFileSync("server/services/booking-decline-payment.service.ts", "utf8");
  assert.equal(helper.includes("paymentIntents.cancel"), false);
  assert.match(helper, /booking-decline-cancel-/);
});
