/**
 * stay-booking.test.ts — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`; S1-d-3 rulings 2–3).
 * SB1 "Book" draws only for the owner on a server-bookable stay with no live booking.
 * SB2 every named server refusal has words, and an unknown one never claims a booking.
 * SB3 the price is the server's minor units in the server's currency.
 * SB4 the SDK key follows the server's env, and nothing else.
 * SB5 the page holds no card field, sends no payment method and no offer, and the SDK is loaded in ONE module.
 * SB6 the cancel sheet: drawn for the owner on a confirmed booking; its charge lines are the server's terms, and an
 *     amount the policy did not state is said, never shown as a number (ledger `2026-10-15-liteapi-cancel-with-charges`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAY_BOOK_REFUSALS,
  STAY_CANCEL_WORDS,
  paymentSdkPublicKey,
  showsStayBook,
  showsStayCancel,
  stayBookedReturnPath,
  stayCancelChargeLines,
  stayPriceText,
  stayRefusalText,
} from "../stay-booking";

const read = (b: any) => ({ bookable: true, booking: b ? { id: "r", status: b, hotelConfirmationCode: null, amountCents: 1, currency: "USD", checkin: "2026-11-01", checkout: "2026-11-02", adults: 2, env: "sandbox" } : null });

test("SB1 Book draws only for the owner on a bookable stay with no live booking", () => {
  assert.equal(showsStayBook({ isOwner: true, read: read(null) }), true);
  assert.equal(showsStayBook({ isOwner: false, read: read(null) }), false);
  assert.equal(showsStayBook({ isOwner: true, read: { bookable: false, booking: null } }), false);
  assert.equal(showsStayBook({ isOwner: true, read: undefined }), false);
  for (const s of ["prebooked", "failed", "cancelled"]) assert.equal(showsStayBook({ isOwner: true, read: read(s) }), true, s);
  for (const s of ["booking", "confirmed", "cancelling", "needs_review"]) assert.equal(showsStayBook({ isOwner: true, read: read(s) }), false, s);
});

test("SB2 every server refusal has words; an unknown one claims nothing", () => {
  const src = readFileSync("server/services/liteapi-booking.service.ts", "utf8");
  const states = new Set([...src.matchAll(/state: "([a-z_]+)"/g)].map((m) => m[1]).filter((s) => !["prebooked", "confirmed", "cancelled"].includes(s)));
  assert.ok(states.size >= 8, "found the server's states");
  for (const s of states) assert.ok(STAY_BOOK_REFUSALS[s], `words for ${s}`);
  assert.match(stayRefusalText("something_new"), /Nothing was booked/);
  // Below SSP is refused (decision-maker, Oct 11, 2026) and says so — never "no room is available".
  assert.match(stayRefusalText("unavailable", "below_ssp"), /price available right now/);
  assert.match(stayRefusalText("unavailable", "no_ssp"), /price available right now/);
  assert.match(stayRefusalText("unavailable", "ssp_currency"), /price available right now/);
  assert.equal(stayRefusalText("unavailable", "no_offer"), STAY_BOOK_REFUSALS.unavailable);
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
  // Every post's body admits ONE field, the cancel's consent flag (ledger `2026-10-15-liteapi-cancel-with-charges`);
  // prebook and book still send an empty body.
  assert.match(readFileSync("client/src/lib/stay-booking.ts", "utf8"), /body: \{ acknowledgeCharges\?: true \} = \{\}/);
  assert.doesNotMatch(readFileSync("client/src/components/plan/StayBookButton.tsx", "utf8"), /postStayBooking\([^)]*"(prebook|book)",/);
  assert.match(readFileSync("client/src/lib/liteapi-payment-sdk.ts", "utf8"), /payment-wrapper\.liteapi\.travel/);
});

test("SB6 the cancel sheet: owner + confirmed only; the charge lines are the server's terms", () => {
  assert.equal(showsStayCancel({ isOwner: true, read: read("confirmed") }), true);
  assert.equal(showsStayCancel({ isOwner: false, read: read("confirmed") }), false);
  for (const st of ["prebooked", "booking", "cancelling", "cancelled", "needs_review", "failed"]) {
    assert.equal(showsStayCancel({ isOwner: true, read: read(st) }), false, st);
  }
  const nrfn = stayCancelChargeLines({ policy: "NRFN", deadline: null, amount: 312.5, currency: "USD" });
  assert.equal(nrfn[0], STAY_CANCEL_WORDS.nonRefundable);
  assert.equal(nrfn[1], "The hotel keeps $312.50.");
  assert.equal(nrfn[2], STAY_CANCEL_WORDS.refundNote);
  const past = stayCancelChargeLines({ policy: "RFN", deadline: "2026-10-01T00:00:00.000Z", amount: null, currency: null });
  assert.equal(past[0], "Free cancellation ended on 2026-10-01.");
  assert.equal(past[1], STAY_CANCEL_WORDS.chargeUnstated, "an unstated amount is said, never a number");
  // The sheet sends the consent flag only from its second step, and the request body carries nothing else.
  const sheet = readFileSync("client/src/components/plan/StayCancelButton.tsx", "utf8");
  assert.match(sheet, /send\(true\)/);
  assert.equal((sheet.match(/acknowledgeCharges: true/g) ?? []).length, 1);
});
