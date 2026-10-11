/**
 * stay-booking.test.ts — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`; S1-d-3 rulings 2–3).
 * SB1 "Book" draws only for the owner on a server-bookable stay with no live booking.
 * SB2 every named server refusal has words, and an unknown one never claims a booking.
 * SB3 the price is the server's minor units in the server's currency.
 * SB4 the SDK key follows the server's env, and nothing else.
 * SB5 the page holds no card field, sends no payment method and no offer, and the SDK is loaded in ONE module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAY_BOOK_REFUSALS, paymentSdkPublicKey, showsStayBook, stayBookedReturnPath, stayPriceText, stayRefusalText } from "../stay-booking";

const read = (b: any) => ({ bookable: true, booking: b ? { id: "r", status: b, hotelConfirmationCode: null, amountCents: 1, currency: "USD", checkin: "2026-11-01", checkout: "2026-11-02", adults: 2, env: "sandbox" } : null });

test("SB1 Book draws only for the owner on a bookable stay with no live booking", () => {
  assert.equal(showsStayBook({ isOwner: true, read: read(null) }), true);
  assert.equal(showsStayBook({ isOwner: false, read: read(null) }), false);
  assert.equal(showsStayBook({ isOwner: true, read: { bookable: false, booking: null } }), false);
  assert.equal(showsStayBook({ isOwner: true, read: undefined }), false);
  for (const s of ["prebooked", "failed", "cancelled"]) assert.equal(showsStayBook({ isOwner: true, read: read(s) }), true, s);
  for (const s of ["booking", "confirmed", "cancelling"]) assert.equal(showsStayBook({ isOwner: true, read: read(s) }), false, s);
});

test("SB2 every server refusal has words; an unknown one claims nothing", () => {
  const src = readFileSync("server/services/liteapi-booking.service.ts", "utf8");
  const states = new Set([...src.matchAll(/state: "([a-z_]+)"/g)].map((m) => m[1]).filter((s) => !["prebooked", "confirmed", "cancelled"].includes(s)));
  assert.ok(states.size >= 8, "found the server's states");
  for (const s of states) assert.ok(STAY_BOOK_REFUSALS[s], `words for ${s}`);
  assert.match(stayRefusalText("something_new"), /Nothing was booked/);
});

test("SB3 the price is the server's minor units in its currency", () => {
  assert.equal(stayPriceText(28000, "USD"), "$280.00");
  assert.match(stayPriceText(4200000, "JPY"), /42,000/);
});

test("SB4 the SDK key is the server's env and nothing else", () => {
  assert.equal(paymentSdkPublicKey("sandbox"), "sandbox");
  assert.equal(paymentSdkPublicKey("production"), "live");
  assert.equal(paymentSdkPublicKey(""), null);
  assert.equal(paymentSdkPublicKey("live"), null);
  assert.equal(stayBookedReturnPath("t 1", "i"), "/plans/t%201/stays/i/booked");
});

test("SB5 no card field, no payment method, no offer from the page; one SDK loader", () => {
  for (const f of ["client/src/components/plan/StayBookButton.tsx", "client/src/pages/stay-booked.tsx", "client/src/lib/stay-booking.ts"]) {
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /cardNumber|type="password"|autocomplete="cc-/i, f);
    assert.doesNotMatch(t, /TRANSACTION_ID|offerId|payment-wrapper/, f);
  }
  assert.match(readFileSync("client/src/lib/stay-booking.ts", "utf8"), /body: "\{\}"/, "every post sends an empty body");
  assert.match(readFileSync("client/src/lib/liteapi-payment-sdk.ts", "utf8"), /payment-wrapper\.liteapi\.travel/);
});
