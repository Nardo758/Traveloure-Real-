/**
 * THE TRAVELER SERVICE FEE BEFORE CHECKOUT — the wording/omission rule (ledger
 * `2026-09-27-service-fee-before-checkout`, R144).
 *
 *   F1  no block / an empty block ⇒ NO line (§13 — no answer is never "$0").
 *   F2  a fee that nothing waived and that is zero ⇒ NO line (never "$0" as the fee).
 *   F3  a charged fee ⇒ the server's amount, labelled an ESTIMATE finalized at checkout.
 *   F4  every line covered by Trip Pass ⇒ "covered", naming what it would have been; the addend to
 *       the displayed total is 0 and the amount is never presented as the fee charged.
 *   F5  partly covered ⇒ the charged amount, and the covered share is named.
 *   F6  a capped line says so.
 *   F7  the rule computes no fee: the amount drawn is the server's `chargedTotal`, byte for byte.
 *   F8  both surfaces read THIS module (cart + slip), and neither restates the label.
 *
 * Run: npx tsx --test client/src/lib/__tests__/traveler-fee-preview.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  TRAVELER_FEE_PREVIEW_COVERED_NOTE,
  TRAVELER_FEE_PREVIEW_FINAL_NOTE,
  TRAVELER_FEE_PREVIEW_LABEL,
  paymentStepTotal,
  travelerFeePreviewAddend,
  travelerFeePreviewDisplay,
  type TravelerFeePreviewTotals,
} from "../traveler-fee-preview";
import {
  clearCheckoutKey,
  readOrMintCheckoutKey,
} from "../checkout-idempotency";

const t = (o: Partial<TravelerFeePreviewTotals>): TravelerFeePreviewTotals => ({
  chargedTotal: 0,
  wouldHaveBeenTotal: 0,
  lineCount: 0,
  waivedLineCount: 0,
  capAppliedLineCount: 0,
  ...o,
});

test("F1 no block, or no lines, draws nothing", () => {
  assert.equal(travelerFeePreviewDisplay(undefined), null);
  assert.equal(travelerFeePreviewDisplay(null), null);
  assert.equal(travelerFeePreviewDisplay(t({ lineCount: 0 })), null);
});

test("F2 a zero fee nothing waived is not drawn as $0", () => {
  assert.equal(travelerFeePreviewDisplay(t({ lineCount: 2 })), null);
});

test("F3 a charged fee is the server's amount, worded as an estimate", () => {
  const d = travelerFeePreviewDisplay(t({ lineCount: 1, chargedTotal: 12.34, wouldHaveBeenTotal: 12.34 }));
  assert.ok(d && d.kind === "charged");
  assert.equal(d.amount, 12.34);
  assert.equal(d.label, TRAVELER_FEE_PREVIEW_LABEL);
  assert.match(d.label, /estimate/i);
  assert.ok(d.note.endsWith(TRAVELER_FEE_PREVIEW_FINAL_NOTE));
  assert.equal(travelerFeePreviewAddend(d), 12.34);
});

test("F4 fully covered by Trip Pass is stated as covered, never as a $0 fee", () => {
  const d = travelerFeePreviewDisplay(
    t({ lineCount: 2, waivedLineCount: 2, chargedTotal: 0, wouldHaveBeenTotal: 9.5 }),
  );
  assert.ok(d && d.kind === "covered");
  assert.equal(d.wouldHaveBeen, 9.5);
  assert.equal(d.note, TRAVELER_FEE_PREVIEW_COVERED_NOTE);
  assert.equal(travelerFeePreviewAddend(d), 0);
  assert.ok(!("amount" in d), "a covered fee carries no charged amount to draw");
});

test("F5 partly covered names the covered share", () => {
  const d = travelerFeePreviewDisplay(
    t({ lineCount: 2, waivedLineCount: 1, chargedTotal: 5, wouldHaveBeenTotal: 8 }),
  );
  assert.ok(d && d.kind === "charged");
  assert.equal(d.amount, 5);
  assert.match(d.note, /\$3\.00 covered by Trip Pass/);
});

test("F6 a capped line says the cap applied", () => {
  const d = travelerFeePreviewDisplay(t({ lineCount: 1, chargedTotal: 20, wouldHaveBeenTotal: 20, capAppliedLineCount: 1 }));
  assert.ok(d && d.kind === "charged");
  assert.match(d.note, /per-booking cap/);
});

test("F7 the rule computes no fee — it draws the server's figure", () => {
  const odd = 7.77;
  const d = travelerFeePreviewDisplay(t({ lineCount: 3, chargedTotal: odd, wouldHaveBeenTotal: odd }));
  assert.ok(d && d.kind === "charged");
  assert.equal(d.amount, odd);
});

test("F9 the payment step prefers the PaymentIntent, then the snapshot, then amountDue", () => {
  assert.equal(
    paymentStepTotal({ paymentIntentAmountCents: 13440, snapshotTotal: "126.00", amountDue: "100.00", fallback: 1 }),
    134.4,
  );
  assert.equal(paymentStepTotal({ snapshotTotal: "134.40", amountDue: "100.00", fallback: 1 }), 134.4);
  assert.equal(paymentStepTotal({ amountDue: "134.40", fallback: 126 }), 134.4);
  assert.equal(paymentStepTotal({ fallback: 126 }), 126);
});

test("F10 one checkout key is reused for the same lines and cleared on success", () => {
  const store = new Map<string, string>();
  const mem = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const first = readOrMintCheckoutKey(mem, ["b", "a"]);
  const again = readOrMintCheckoutKey(mem, ["a", "b"]);
  assert.equal(again, first);
  assert.ok(first && first.length > 0);
  clearCheckoutKey(mem, ["a", "b"]);
  const fresh = readOrMintCheckoutKey(mem, ["a", "b"]);
  assert.notEqual(fresh, first);
});

test("F8 the cart and the slip both read this module and restate no label", () => {
  const root = path.resolve(process.cwd(), "client");
  for (const rel of ["src/pages/cart.tsx", "src/components/plancard/SlipRail.tsx"]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /from "@\/lib\/traveler-fee-preview"/, `${rel} imports the one rule`);
    assert.match(src, /travelerFeePreviewDisplay\(/, `${rel} calls the one rule`);
    assert.ok(!src.includes(`"${TRAVELER_FEE_PREVIEW_LABEL}"`), `${rel} restates no label`);
  }
});
