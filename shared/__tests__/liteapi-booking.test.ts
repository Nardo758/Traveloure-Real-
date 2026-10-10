/**
 * S1-d-3a — the booking rules, pure (ledger `2026-10-10-s1-d3a-liteapi-booking`).
 *
 *   LB1 the offer id is read from the re-quote's first room type; absent ⇒ null
 *   LB2 prebook: the pair, the secret and the price; no SDK ids, no price and below-SSP are refused by name
 *   LB3 book: LiteAPI's id, status and confirmation code; commission and processing fee in cents, null when unstated
 *   LB4 confirmed only on CONFIRMED; the booked line needs a code
 *   LB5 the one payment method is TRANSACTION_ID; live statuses are the three that hold an item
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LITEAPI_LIVE_STATUSES,
  LITEAPI_PAYMENT_METHOD,
  bookIsConfirmed,
  bookingStatusOf,
  liteapiBookedLine,
  offerIdFromRates,
  parseBook,
  parsePrebook,
} from "../liteapi-booking";

test("LB1 offer id from the re-quote", () => {
  assert.equal(offerIdFromRates({ data: [{ roomTypes: [{ offerId: "o1" }] }] }), "o1");
  assert.equal(offerIdFromRates({ data: [{ roomTypes: [{}] }] }), null);
  assert.equal(offerIdFromRates(null), null);
});

test("LB2 prebook", () => {
  const d = { prebookId: "p", transactionId: "t", secretKey: "s", price: 312.5, currency: "usd", suggestedSellingPrice: 300 };
  const ok = parsePrebook({ data: d });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.facts.prebookId, ok.facts.transactionId, ok.facts.secretKey, ok.facts.amountCents, ok.facts.currency], ["p", "t", "s", 31250, "USD"]);
  assert.deepEqual(parsePrebook({ data: { ...d, prebookId: "" } }), { ok: false, reason: "no_prebook" });
  assert.deepEqual(parsePrebook({ data: { ...d, secretKey: undefined } }), { ok: false, reason: "no_payment_sdk" });
  assert.deepEqual(parsePrebook({ data: { ...d, price: 0 } }), { ok: false, reason: "no_price" });
  assert.deepEqual(parsePrebook({ data: { ...d, price: 280 } }), { ok: false, reason: "below_ssp" });
  assert.ok(parsePrebook({ data: { ...d, suggestedSellingPrice: undefined } }).ok, "no SSP stated ⇒ the price stands");
});

test("LB3 book", () => {
  assert.deepEqual(parseBook({ data: { bookingId: "b", status: "confirmed", hotelConfirmationCode: "HC", clientCommission: 33.25, processingFee: "1.5" } }), {
    liteapiBookingId: "b",
    status: "CONFIRMED",
    hotelConfirmationCode: "HC",
    commissionCents: 3325,
    processingFeeCents: 150,
  });
  const bare = parseBook({ data: { bookingId: "b", status: "CONFIRMED" } });
  assert.equal(bare?.commissionCents, null);
  assert.equal(bare?.processingFeeCents, null);
  assert.equal(bare?.hotelConfirmationCode, null);
  assert.equal(parseBook({ data: {} }), null);
});

test("LB4 confirmed and the booked line", () => {
  assert.equal(bookIsConfirmed(parseBook({ data: { bookingId: "b", status: "CONFIRMED" } })!), true);
  assert.equal(bookIsConfirmed(parseBook({ data: { bookingId: "b", status: "PENDING" } })!), false);
  assert.equal(bookingStatusOf({ data: { status: "cancelled" } }), "CANCELLED");
  assert.equal(bookingStatusOf({}), null);
  assert.equal(liteapiBookedLine("HC-42"), "Booked · HC-42");
  assert.equal(liteapiBookedLine(null), null);
  assert.equal(liteapiBookedLine("  "), null);
});

test("LB5 the one payment method and the live set", () => {
  assert.equal(LITEAPI_PAYMENT_METHOD, "TRANSACTION_ID");
  assert.deepEqual([...LITEAPI_LIVE_STATUSES], ["booking", "confirmed", "cancelling"]);
});
