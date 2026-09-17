/**
 * BUNDLE COMPONENT + SETTLEMENT COPY — proofs (ledger `2026-09-17-surfaces-quotes-settlement`).
 *
 * Pure: the module imports nothing at all, so these prove the §13 distinctions with no database.
 *
 * S1-S5  the five component states word differently, in BOTH audiences' voices.
 * S6     an unknown status is UNRESOLVED, never read forward as delivered.
 * P1-P3  "prepared, awaiting" ≠ "refunded" — the distinction LD 50's `refunded` value exists for.
 * L1-L3  §13 — a missing allocation says NOT CAPTURED, never 0.
 * T1-T2  the pinned cancellation percent is shown only when the row carries one.
 * N1     there is NO preview before the act, and the note says what decides it instead.
 * E1-E6  the settlement read-out: claimed ≠ settled, a 0 refund is said honestly, and the
 *        remainder sentence appears ONLY when the settlement row says the seller kept something.
 * G1-G2  a legacy jsonb bundle is listed and nothing more is claimed about it.
 * C1     no capacity sentence exists anywhere in the module (nothing per-component is reserved).
 *
 * Run: npx tsx --test client/src/lib/__tests__/bundle-component-state-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPONENT_CANCEL_NO_PREVIEW_NOTE,
  centsLine,
  componentAllocationLine,
  componentCanBeCancelled,
  componentCanBeMarkedFailed,
  componentCancelTermsLine,
  componentRefundLine,
  componentSourceNote,
  componentStateCopy,
  componentsAreActionable,
  settlementReadout,
  type BundleComponentStateRow,
} from "../bundle-component-state-copy";

const comp = (over: Partial<BundleComponentStateRow> = {}): BundleComponentStateRow => ({
  componentServiceId: "c1",
  status: "pending",
  ...over,
});

test("S1-S5: the five component states word differently for both audiences", () => {
  const states = ["pending", "completed", "failed", "cancelled", "refunded"];
  const traveler = new Set<string>();
  const seller = new Set<string>();
  for (const s of states) {
    const copy = componentStateCopy(s);
    assert.ok(copy.label.length > 0, `${s} has a label`);
    traveler.add(copy.traveler);
    seller.add(copy.seller);
  }
  assert.equal(traveler.size, states.length, "no two states share a traveler sentence");
  assert.equal(seller.size, states.length, "no two states share a seller sentence");
  // `failed` (the seller's answer) and `cancelled` (the traveler's) are different facts and are
  // labelled as different people's answers.
  assert.notEqual(componentStateCopy("failed").label, componentStateCopy("cancelled").label);
  // `refunded` is the MONEY being settled, not another way of saying not-delivered.
  assert.match(componentStateCopy("refunded").traveler, /settled/);
});

test("S6: an unknown component status is unresolved, never read forward as delivered", () => {
  const copy = componentStateCopy("some_future_state");
  assert.match(copy.traveler, /does not recognise/);
  assert.ok(!/delivered\b/i.test(copy.label));
  assert.equal(componentStateCopy(null).label, "Unrecognised");
  // And it offers neither action — only an explicitly `pending` component is actionable.
  assert.equal(componentCanBeMarkedFailed(comp({ status: "some_future_state" })), false);
  assert.equal(componentCanBeCancelled(comp({ status: "some_future_state" })), false);
  assert.equal(componentCanBeMarkedFailed(comp({ status: "pending" })), true);
  assert.equal(componentCanBeCancelled(comp({ status: "pending" })), true);
  assert.equal(componentCanBeCancelled(comp({ status: "completed" })), false);
});

test("P1-P3: 'prepared, awaiting' is never rendered as 'refunded'", () => {
  // A failed part with a known allocation but no `refundedAt`: money PREPARED, not returned.
  const prepared = componentRefundLine(comp({ status: "failed", allocationCents: 50000 }));
  assert.match(prepared ?? "", /Prepared, awaiting/);
  assert.ok(!/^Refunded/.test(prepared ?? ""), "a prepared part never opens with 'Refunded'");
  // A traveler-cancelled part is the same shape.
  assert.match(componentRefundLine(comp({ status: "cancelled", cancelRefundPercent: 50 })) ?? "", /Prepared, awaiting/);
  // Stamped: the refund is named, with the Stripe id when the row carries one.
  const done = componentRefundLine(
    comp({ status: "refunded", refundedAt: "2026-09-17T00:00:00Z", refundAmountCents: 50000, stripeRefundId: "re_x" }),
  );
  assert.equal(done, "Refunded 500.00 · refund re_x");
  // Stamped with no Stripe id: still refunded, no id invented.
  assert.equal(
    componentRefundLine(comp({ status: "refunded", refundedAt: "2026-09-17T00:00:00Z", refundAmountCents: 0 })),
    "Refunded 0.00",
  );
  // A delivered or outstanding part has no refund line at all.
  assert.equal(componentRefundLine(comp({ status: "completed" })), null);
  assert.equal(componentRefundLine(comp({ status: "pending" })), null);
});

test("L1-L3: §13 — a missing allocation says NOT CAPTURED, never 0", () => {
  assert.equal(componentAllocationLine(comp({})), "No allocation recorded for this part");
  assert.equal(componentAllocationLine(comp({ allocationCents: null })), "No allocation recorded for this part");
  assert.ok(!componentAllocationLine(comp({})).includes("0.00"));
  assert.equal(componentAllocationLine(comp({ allocationCents: 125000 })), "Allocated 1250.00");
  // A genuine zero allocation IS shown as zero — it was captured and it is zero.
  assert.equal(componentAllocationLine(comp({ allocationCents: 0 })), "Allocated 0.00");
  assert.equal(centsLine(null), null);
  assert.equal(centsLine(5), "0.05");
  assert.equal(centsLine(105), "1.05");
});

test("T1-T2: the pinned cancellation percent is shown only when the row carries one", () => {
  assert.equal(componentCancelTermsLine(comp({ status: "cancelled" })), null);
  const line = componentCancelTermsLine(comp({ status: "cancelled", cancelRefundPercent: 50 }));
  assert.match(line ?? "", /50%/);
  assert.match(line ?? "", /at purchase/, "the sentence names the SNAPSHOTTED policy, not the live one");
  // A pinned 0 is a real answer and is stated, not suppressed as absent.
  assert.match(componentCancelTermsLine(comp({ status: "cancelled", cancelRefundPercent: 0 })) ?? "", /0%/);
});

test("N1: no number is promised before the act; the note says what decides it", () => {
  assert.match(COMPONENT_CANCEL_NO_PREVIEW_NOTE, /will not estimate it first/);
  assert.match(COMPONENT_CANCEL_NO_PREVIEW_NOTE, /bought under/);
  // It contains no figure of its own.
  assert.ok(!/\d/.test(COMPONENT_CANCEL_NO_PREVIEW_NOTE), "the note states no number at all");
});

test("E1-E6: the settlement read-out distinguishes claimed from settled and states no remainder it lacks", () => {
  assert.equal(settlementReadout(null), null, "no settlement row ⇒ nothing said");
  assert.equal(settlementReadout(undefined), null);

  // CLAIMED, not settled: nothing has been refunded, and it says so.
  const inProgress = settlementReadout({ settled: false, settledAmountCents: 40000, travelerRefundCents: 10000 });
  assert.equal(inProgress?.state, "in_progress");
  assert.match(inProgress?.refund ?? "", /Nothing has been refunded yet/);
  assert.equal(inProgress?.remainder, null, "an unsettled claim asserts no remainder");

  // SETTLED with a refund: the pinned amount and the Stripe id, both the row's own.
  const settled = settlementReadout({
    settled: true,
    settledAmountCents: 40000,
    travelerRefundCents: 10000,
    stripeRefundId: "re_y",
  });
  assert.equal(settled?.state, "settled");
  assert.ok(settled?.refund.includes("100.00") && settled.refund.includes("re_y"));
  assert.match(settled?.remainder ?? "", /400\.00/);
  assert.match(settled?.remainder ?? "", /stays with the provider/);

  // SETTLED at ZERO: a valid settlement that moved no money, said honestly — never "refunded 0.00".
  const zero = settlementReadout({ settled: true, settledAmountCents: 40000, travelerRefundCents: 0 });
  assert.match(zero?.refund ?? "", /No money was refunded/);

  // SETTLED with nothing kept: the remainder sentence is OMITTED rather than claiming one of 0.
  const nothingKept = settlementReadout({ settled: true, settledAmountCents: 0, travelerRefundCents: 50000 });
  assert.equal(nothingKept?.remainder, null);
});

test("G1-G2: a legacy jsonb bundle is listed and nothing more is claimed about it", () => {
  assert.equal(componentsAreActionable("rows"), true);
  assert.equal(componentsAreActionable("legacy_jsonb"), false);
  assert.equal(componentsAreActionable(undefined), false, "an unnamed source is not actionable");
  assert.equal(componentSourceNote("rows"), null);
  assert.match(componentSourceNote("legacy_jsonb") ?? "", /before per-part records existed/);
});

test("C1: no capacity sentence exists — nothing per-component is reserved, so none is claimed", () => {
  const everySentence = [
    COMPONENT_CANCEL_NO_PREVIEW_NOTE,
    componentSourceNote("legacy_jsonb") ?? "",
    settlementReadout({ settled: true, settledAmountCents: 1, travelerRefundCents: 1 })?.refund ?? "",
    settlementReadout({ settled: true, settledAmountCents: 1, travelerRefundCents: 1 })?.remainder ?? "",
    ...["pending", "completed", "failed", "cancelled", "refunded"].flatMap((s) => {
      const c = componentStateCopy(s);
      return [c.label, c.traveler, c.seller];
    }),
  ].join(" ");
  assert.ok(!/\bslot\b|\bcapacity\b|\breleased\b/i.test(everySentence), "no capacity claim anywhere");
});
