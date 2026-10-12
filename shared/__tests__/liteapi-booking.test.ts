/**
 * S1-d-3a — the booking rules, pure (ledger `2026-10-10-s1-d3a-liteapi-booking`).
 *
 *   LB1 the offer id is read from the re-quote's first room type; absent ⇒ null
 *   LB2 prebook: the pair, the secret and the price; no SDK ids, no price and below-SSP are refused by name
 *   LB3 book: LiteAPI's id, status and confirmation code; commission and processing fee in cents, null when unstated
 *   LB4 confirmed only on CONFIRMED; the booked line needs a code
 *   LB5 the one payment method is TRANSACTION_ID; live statuses are the three that hold an item
 *   LB6 the booking margin: max(band, SSP / net − 1), rounded up; refused only for no SSP / another currency
 *   LB7 (S1-d-3c) the prebook's own SSP is the floor, the re-quote's only when it states none; the one
 *       re-prebook margin is max(band, floor / net − 1), rounded up and always above the margin tried
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LITEAPI_LIVE_STATUSES,
  LITEAPI_PAYMENT_METHOD,
  bookIsConfirmed,
  bookingStatusOf,
  offerIdFromRates,
  parseBook,
  parsePrebook,
  sspFromRates,
  bookingMarginFraction,
  prebookSspFloor,
  prebookFloorPercent,
  quoteRetail,
  prebookDiagnostic,
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
  // The founder's sandbox prebook states no SSP: the re-quote's SSP is the floor.
  const bare = { ...d, suggestedSellingPrice: undefined };
  assert.ok(parsePrebook({ data: bare }, { amount: 300, currency: "USD" }).ok);
  assert.deepEqual(parsePrebook({ data: { ...bare, price: 299 } }, { amount: 300, currency: "USD" }), { ok: false, reason: "below_ssp" });
  assert.deepEqual(parsePrebook({ data: bare }, { amount: 300, currency: "EUR" }), { ok: false, reason: "below_ssp" }, "another currency cannot be floored");
});

test("LB2b the re-quote's SSP", () => {
  assert.deepEqual(sspFromRates({ data: [{ roomTypes: [{ suggestedSellingPrice: { amount: 300, currency: "usd" } }] }] }), { amount: 300, currency: "USD" });
  assert.deepEqual(sspFromRates({ data: [{ roomTypes: [{ suggestedSellingPrice: [{ amount: "310.5", currency: "USD" }] }] }] }), { amount: 310.5, currency: "USD" });
  assert.deepEqual(sspFromRates({ data: [{ roomTypes: [{ rates: [{ retailRate: { suggestedSellingPrice: [{ amount: 280, currency: "USD" }] } }] }] }] }), { amount: 280, currency: "USD" });
  assert.equal(sspFromRates({ data: [{ roomTypes: [{}] }] }), null);
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

test("LB4 confirmed and the status read", () => {
  assert.equal(bookIsConfirmed(parseBook({ data: { bookingId: "b", status: "CONFIRMED" } })!), true);
  assert.equal(bookIsConfirmed(parseBook({ data: { bookingId: "b", status: "PENDING" } })!), false);
  assert.equal(bookingStatusOf({ data: { status: "cancelled" } }), "CANCELLED");
  assert.equal(bookingStatusOf({}), null);
});

test("LB5 the one payment method and the live set", () => {
  assert.equal(LITEAPI_PAYMENT_METHOD, "TRANSACTION_ID");
  assert.deepEqual([...LITEAPI_LIVE_STATUSES], ["booking", "confirmed", "cancelling"]);
});

test("LB6 the booking margin", () => {
  const body = (o: { retail?: number; ssp?: any; commission?: number; ccy?: string }) => ({
    data: [
      {
        roomTypes: [
          {
            offerId: "o",
            offerRetailRate: o.retail === undefined ? undefined : { amount: o.retail, currency: o.ccy ?? "USD" },
            suggestedSellingPrice: o.ssp,
            commission: o.commission === undefined ? undefined : [{ amount: o.commission, currency: "USD" }],
          },
        ],
      },
    ],
  });
  // The band already clears the SSP ⇒ the band.
  const a = bookingMarginFraction(body({ retail: 336, ssp: { amount: 300, currency: "USD" }, commission: 36 }), 0.12);
  assert.ok(a.ok && a.percent === 12);
  // Net 250 (retail 280 − commission 30), SSP 300 ⇒ 20%, above a 12% band.
  const b = bookingMarginFraction(body({ retail: 280, ssp: { amount: 300, currency: "USD" }, commission: 30 }), 0.12);
  assert.ok(b.ok && b.percent === 20 && b.fraction === 0.2);
  // No commission stated ⇒ net = retail / (1 + band); rounded UP so the price is never under the SSP.
  const c = bookingMarginFraction(body({ retail: 270, ssp: { amount: 300, currency: "USD" } }), 0);
  assert.ok(c.ok && c.percent === 11.12 && 270 * (1 + c.fraction) >= 300);
  // Never below the band, even when the SSP is far under the price.
  const d = bookingMarginFraction(body({ retail: 500, ssp: { amount: 100, currency: "USD" }, commission: 0 }), 0.12);
  assert.ok(d.ok && d.percent === 12);
  // The rate-level fields are the fallback.
  const e = bookingMarginFraction({ data: [{ roomTypes: [{ suggestedSellingPrice: { amount: 300, currency: "USD" }, rates: [{ retailRate: { total: [{ amount: 250, currency: "USD" }] } }] }] }] }, 0);
  assert.ok(e.ok && e.percent === 20);
  // Refused by name only for these.
  assert.deepEqual(bookingMarginFraction(body({ retail: 280 }), 0.12), { ok: false, reason: "no_ssp" });
  assert.deepEqual(bookingMarginFraction(body({ retail: 280, ssp: { amount: 300, currency: "EUR" } }), 0.12), { ok: false, reason: "ssp_currency" });
  assert.deepEqual(bookingMarginFraction(body({ ssp: { amount: 300, currency: "USD" } }), 0.12), { ok: false, reason: "no_price" });
});

test("LB7 the prebook's own SSP is the floor; the one re-prebook margin", () => {
  // CI run 38258094086: the re-quote said 327.31, the prebook for the same offer said 284.58 at a price of 284.60.
  const b = { data: { prebookId: "p", transactionId: "t", secretKey: "s", price: 284.6, currency: "USD", suggestedSellingPrice: 284.58 } };
  assert.deepEqual(prebookSspFloor(b, { amount: 327.31, currency: "USD" }), { amount: 284.58, currency: "USD" });
  assert.ok(parsePrebook(b, { amount: 327.31, currency: "USD" }).ok, "the prebook's own SSP decides");
  const bare = { data: { ...b.data, suggestedSellingPrice: undefined } };
  assert.deepEqual(prebookSspFloor(bare, { amount: 300, currency: "USD" }), { amount: 300, currency: "USD" }, "falls back to the re-quote's");
  assert.equal(prebookSspFloor(bare, null), null);

  // 202.27 against its own 202.30 at 15%: net 175.89, needed 15.017% ⇒ 15.02%.
  const shy = { data: { price: 202.27, currency: "USD", suggestedSellingPrice: 202.3 } };
  assert.deepEqual(prebookFloorPercent(shy, null, 15, 0.12), { ok: true, percent: 15.02 });
  // The band wins when it is higher; the result is always above the margin already tried.
  assert.deepEqual(prebookFloorPercent(shy, null, 15, 0.2), { ok: true, percent: 20 });
  assert.deepEqual(prebookFloorPercent({ data: { price: 100, currency: "USD", suggestedSellingPrice: 100 } }, null, 10, 0), { ok: true, percent: 10.01 });
  assert.deepEqual(prebookFloorPercent({ data: { currency: "USD", suggestedSellingPrice: 1 } }, null, 12, 0.12), { ok: false, reason: "no_price" });
  assert.deepEqual(prebookFloorPercent({ data: { price: 280, currency: "USD" } }, null, 12, 0.12), { ok: false, reason: "no_ssp" });
  assert.deepEqual(prebookFloorPercent({ data: { price: 280, currency: "USD" } }, { amount: 300, currency: "EUR" }, 12, 0.12), { ok: false, reason: "ssp_currency" });

  // The diagnostic reads the facts it was given and invents none.
  assert.deepEqual(quoteRetail({ data: [{ roomTypes: [{ offerRetailRate: { amount: 202.27, currency: "usd" } }] }] }), { amount: 202.27, currency: "USD" });
  assert.equal(quoteRetail({}), null);
  assert.match(prebookDiagnostic({}, shy, 15), /requote retail=none .*prebook price=202\.27 prebook ssp=202\.3 currency=USD margin=15%/);
});
