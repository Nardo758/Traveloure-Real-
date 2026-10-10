/**
 * S1-d-2 — live rates, the pure rules (ledger `2026-10-10-s1-d2-liteapi-rates`).
 *
 *   LR1 the SSP floor: never below the SSP; a missing SSP leaves the retail total; an SSP in another
 *       currency refuses the offer rather than show it unfloored
 *   LR2 the offer: cheapest rate parsed from LiteAPI's own fields; board, refundable tag, the EARLIEST
 *       deadline, only NOT-included taxes as pay-at-property; unstated fields omitted (§13)
 *   LR3 a non-refundable rate carries no deadline; no rate / no retail total ⇒ no offer
 *   LR4 the deadline line with a plan zone uses the local formatter (date-time + abbreviation)
 *   LR5 with no zone: relative to check-in — "N days before", "1 day before", "the day of", never a UTC stamp
 *   LR6 an unstated refundable tag draws no line (never "free cancellation" by default)
 *
 * Run: npx tsx --test shared/__tests__/liteapi-rates.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cancellationLine, daysBeforeCheckin, parseCheapestOffer, publicSellAmount } from "../liteapi-rates";

const body = (rate: any) => ({ data: [{ hotelId: "lp1", roomTypes: [{ rates: [rate] }] }] });
const rate = (over: any = {}) => ({
  boardName: "Breakfast Included",
  retailRate: {
    total: [{ amount: 300, currency: "USD" }],
    suggestedSellingPrice: [{ amount: 320, currency: "USD" }],
    taxesAndFees: [
      { included: true, description: "VAT", amount: 20, currency: "USD" },
      { included: false, description: "City tax", amount: 4.5, currency: "JPY" },
    ],
  },
  cancellationPolicies: { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2027-05-08 12:00:00" }, { cancelTime: "2027-05-06 12:00:00" }] },
  ...over,
});

test("LR1 the SSP floor", () => {
  assert.equal(publicSellAmount({ amount: 300, currency: "USD" }, { amount: 320, currency: "USD" }), 320);
  assert.equal(publicSellAmount({ amount: 400, currency: "USD" }, { amount: 320, currency: "USD" }), 400);
  assert.equal(publicSellAmount({ amount: 300, currency: "USD" }, null), 300);
  assert.equal(publicSellAmount({ amount: 300, currency: "USD" }, { amount: 320, currency: "EUR" }), null);
});

test("LR2 the cheapest offer, from LiteAPI's own fields", () => {
  const o = parseCheapestOffer(body(rate()), { adults: 2, kids: 1 })!;
  assert.equal(o.amountCents, 32000, "floored at the SSP");
  assert.equal(o.currency, "USD");
  assert.equal(o.boardName, "Breakfast Included");
  assert.equal(o.refundable, true);
  assert.equal(o.cancelDeadline, "2027-05-06T12:00:00.000Z", "the earliest deadline, read as GMT");
  assert.deepEqual(o.payAtProperty, [{ label: "City tax", amountCents: 450, currency: "JPY" }], "only the not-included tax");
  assert.equal(o.adults, 2);
  assert.equal(o.childrenNotPriced, true);
  const bare = parseCheapestOffer(body(rate({ boardName: "", cancellationPolicies: {}, retailRate: { total: [{ amount: 300, currency: "USD" }] } })), { adults: 1, kids: 0 })!;
  assert.equal(bare.boardName, null);
  assert.equal(bare.refundable, null);
  assert.equal(bare.cancelDeadline, null);
  assert.deepEqual(bare.payAtProperty, []);
  assert.equal(bare.amountCents, 30000);
  assert.equal(bare.childrenNotPriced, false);
});

test("LR3 non-refundable has no deadline; nothing to show ⇒ no offer", () => {
  const n = parseCheapestOffer(body(rate({ cancellationPolicies: { refundableTag: "NRFN", cancelPolicyInfos: [{ cancelTime: "2027-05-06 12:00:00" }] } })), { adults: 2, kids: 0 })!;
  assert.equal(n.refundable, false);
  assert.equal(n.cancelDeadline, null);
  assert.equal(parseCheapestOffer({ data: [] }, { adults: 2, kids: 0 }), null);
  assert.equal(parseCheapestOffer(body(rate({ retailRate: { total: [] } })), { adults: 2, kids: 0 }), null);
});

test("LR4 with a plan zone the line is local", () => {
  const line = cancellationLine({ refundable: true, cancelDeadline: "2027-05-06T03:00:00Z" }, { checkin: "2027-05-08", timezone: "Asia/Tokyo", local: (iso, tz) => `${iso}@${tz}` });
  assert.equal(line, "Free cancellation until 2027-05-06T03:00:00Z@Asia/Tokyo");
});

test("LR5 with no zone the line is relative to check-in", () => {
  const ctx = (checkin: string) => ({ checkin, timezone: null, local: () => "never" });
  assert.equal(cancellationLine({ refundable: true, cancelDeadline: "2027-05-06T12:00:00.000Z" }, ctx("2027-05-08")), "Free cancellation until 2 days before check-in");
  assert.equal(cancellationLine({ refundable: true, cancelDeadline: "2027-05-07T23:00:00Z" }, ctx("2027-05-08")), "Free cancellation until 1 day before check-in");
  assert.equal(cancellationLine({ refundable: true, cancelDeadline: "2027-05-08T10:00:00Z" }, ctx("2027-05-08")), "Free cancellation until the day of check-in");
  assert.equal(cancellationLine({ refundable: true, cancelDeadline: "2027-05-09T10:00:00Z" }, ctx("2027-05-08")), null);
  assert.equal(daysBeforeCheckin("not a date", "2027-05-08"), null);
  assert.doesNotMatch(String(cancellationLine({ refundable: true, cancelDeadline: "2027-05-06T12:00:00.000Z" }, ctx("2027-05-08"))), /UTC|GMT|\d{2}:\d{2}/);
});

test("LR6 unstated refundability draws nothing; non-refundable says so", () => {
  const ctx = { checkin: "2027-05-08", timezone: null, local: () => null };
  assert.equal(cancellationLine({ refundable: null, cancelDeadline: "2027-05-06 12:00:00" }, ctx), null);
  assert.equal(cancellationLine({ refundable: true, cancelDeadline: null }, ctx), null);
  assert.equal(cancellationLine({ refundable: false, cancelDeadline: null }, ctx), "Non-refundable");
});
