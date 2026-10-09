/**
 * Held-batch-1 item 23: the Optimized board's paid line reads the run's own toll rows
 * (`runChargeFromLedger`); NULL is "say nothing", never "free" (§13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChargeFromLedger, type RunTollRow } from "../version-board";

const RUN = "2026-10-03T15:00:00.000Z";
const row = (p: Partial<RunTollRow>): RunTollRow => ({
  id: p.id ?? "r1",
  feeType: "ai_concierge_fee",
  amount: "5.99",
  currency: "usd",
  createdAt: "2026-10-03T14:59:00.000Z",
  stripePaymentRef: null,
  reversesLedgerId: null,
  metadata: {},
  ...p,
});

test("RC1 a paid run: the toll row carries its PaymentIntent", () => {
  assert.deepEqual(runChargeFromLedger([row({ stripePaymentRef: "pi_1" })], RUN), {
    basis: "paid",
    amountCents: 599,
    currency: "usd",
    at: "2026-10-03T14:59:00.000Z",
  });
});

test("RC2 a covered run is named by its waiver's covered_by", () => {
  const rows = [
    row({ metadata: { runId: "run-a" } }),
    row({ id: "w1", feeType: "fee_waiver", amount: "-5.99", metadata: { runId: "run-a", covered_by: "trip_pass" } }),
  ];
  assert.equal(runChargeFromLedger(rows, RUN)?.basis, "trip_pass");
});

test("RC3 no row, no PaymentIntent, an unnamed waiver or a reversal ⇒ NULL", () => {
  assert.equal(runChargeFromLedger([], RUN), null);
  assert.equal(runChargeFromLedger([row({})], RUN), null);
  assert.equal(runChargeFromLedger([row({ metadata: { runId: "x" } })], RUN), null);
  assert.equal(
    runChargeFromLedger([row({ stripePaymentRef: "pi_1" }), row({ id: "rev", feeType: "reversal", amount: "-5.99", reversesLedgerId: "r1" })], RUN),
    null,
  );
});

test("RC4 the newest toll at or before the run is the run's; a later run's toll is not", () => {
  const rows = [
    row({ id: "old", stripePaymentRef: "pi_old", amount: "3.00", createdAt: "2026-10-01T10:00:00.000Z" }),
    row({ id: "new", stripePaymentRef: "pi_new", createdAt: "2026-10-03T14:58:00.000Z" }),
    row({ id: "later", stripePaymentRef: "pi_later", amount: "9.00", createdAt: "2026-10-04T10:00:00.000Z" }),
  ];
  assert.equal(runChargeFromLedger(rows, RUN)?.amountCents, 599);
});
