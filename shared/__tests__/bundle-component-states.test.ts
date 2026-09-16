/**
 * THE ONE BUNDLE DERIVATION, proven with no database (punchlist D-32..D-35, all option A; ledger
 * `2026-09-16-d32-d35-bundle-components`). The DB half — birth, the atomic component claims, the
 * partial flip and its ONE reduced mint — is `server/__tests__/bundle-component-states.db.test.ts`.
 *
 * NO FEE LITERALS (§8): every amount below is arbitrary fixture money; the assertions are about the
 * SHARE arithmetic (pro-rata over the snapshot) and the refusals, never about a rate.
 *
 * Run solo: npx tsx --test shared/__tests__/bundle-component-states.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_COMPONENT_STATUS,
  PARTIALLY_COMPLETED_STATUS,
  deriveBundleOutcome,
  reducedBundleFigures,
  snapshotPriceCentsOf,
  type BundleComponentView,
} from "../bundle-component-states";

const c = (id: string, status: string, cents: number | null = 1000): BundleComponentView => ({
  componentServiceId: id,
  status,
  snapshotPriceCents: cents,
});

test("B-P1: the parent outcome is DERIVED from the components — and `completed` still means EVERY one", () => {
  assert.equal(deriveBundleOutcome([]).outcome, "no_components", "§13: nothing to derive from is never 'all complete'");
  assert.equal(deriveBundleOutcome([c("a", "completed"), c("b", "pending")]).outcome, "incomplete");
  assert.equal(deriveBundleOutcome([c("a", "completed"), c("b", "completed")]).outcome, "completed");
  const partial = deriveBundleOutcome([c("a", "completed"), c("b", "failed"), c("d", "completed")]);
  assert.equal(partial.outcome, PARTIALLY_COMPLETED_STATUS);
  assert.deepEqual(partial.undeliveredComponentIds, ["b"], "the failed component is NAMED, not counted");
  assert.deepEqual(partial.completedComponentIds, ["a", "d"]);
  assert.equal(deriveBundleOutcome([c("a", "failed"), c("b", "cancelled")]).outcome, "all_undelivered");
  // A failed component beside a PENDING one is still incomplete — partial is reached only when
  // every component has an answer (the reason COMPLETION_ALLOWED_FROM_STATUSES needs no widening).
  assert.equal(deriveBundleOutcome([c("a", "failed"), c("b", "pending")]).outcome, "incomplete");
});

test("B-P2 (§13): an UNKNOWN component status is unresolved — never read as delivered, never as failed", () => {
  const out = deriveBundleOutcome([c("a", "completed"), c("b", "something_new")]);
  assert.equal(out.outcome, "incomplete");
  assert.deepEqual(out.pendingComponentIds, ["b"]);
  assert.equal(PARTIALLY_COMPLETED_STATUS, "partially_completed");
  assert.deepEqual(Object.values(BUNDLE_COMPONENT_STATUS).sort(), ["cancelled", "completed", "failed", "pending", "refunded"]);
});

test("B-P3 (D-33/D-35): the reduced figures are PRO-RATA over the SNAPSHOT — the row's own three figures scaled by the delivered share", () => {
  const r = reducedBundleFigures({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    components: [c("a", "completed", 4000), c("b", "completed", 4000), c("d", "failed", 2000)],
  });
  assert.ok(r.ok);
  assert.equal(r.keptFraction, 0.8);
  assert.equal(r.grossAmount, "80.00");
  assert.equal(r.platformFee, "20.00");
  assert.equal(r.providerEarnings, "60.00");
  assert.equal(r.deductedAmount, "20.00", "what the undelivered component is owed back — the pro-rata share of what was CHARGED");
  assert.deepEqual(r.undeliveredComponentIds, ["d"]);
  assert.equal(r.undeliveredSnapshotCents, 2000);
  assert.equal(r.totalSnapshotCents, 10000);
});

test("B-P4 (D-33's sub-question): component prices need NOT sum to the bundle price — a discounted bundle refunds the SHARE, never the raw component price", () => {
  // Components list at 60 + 40 = 100.00 but the bundle was SOLD for 90.00. Failing the 40.00
  // component deducts 40% of 90.00 = 36.00, not 40.00 — the traveler is never refunded more of a
  // component than they paid for it, and the seller never keeps more than the delivered share.
  const r = reducedBundleFigures({
    totalAmount: "90.00",
    platformFee: "18.00",
    providerEarnings: "72.00",
    components: [c("a", "completed", 6000), c("b", "failed", 4000)],
  });
  assert.ok(r.ok);
  assert.equal(r.keptFraction, 0.6);
  assert.equal(r.grossAmount, "54.00");
  assert.equal(r.deductedAmount, "36.00");
  assert.equal(r.platformFee, "10.80");
  assert.equal(r.providerEarnings, "43.20");
});

test("B-P5 (§13): a component with NO snapshotted price makes the reduction UNKNOWABLE — a stated refusal, never an equal split", () => {
  const r = reducedBundleFigures({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    components: [c("a", "completed", 4000), c("b", "failed", null)],
  });
  assert.deepEqual(r, { ok: false, reason: "component_price_unknown" });
  assert.deepEqual(
    reducedBundleFigures({ totalAmount: "10.00", platformFee: "1.00", providerEarnings: "9.00", components: [c("a", "completed", 0), c("b", "failed", 0)] }),
    { ok: false, reason: "zero_priced_bundle" },
  );
  assert.deepEqual(
    reducedBundleFigures({ totalAmount: "10.00", platformFee: "1.00", providerEarnings: "9.00", components: [c("a", "completed"), c("b", "completed")] }),
    { ok: false, reason: "nothing_undelivered" },
    "no undelivered component is the FULL mint's case, not a reduction",
  );
});

test("B-P6 (§13): a snapshot price is an integer number of cents or NOT CAPTURED — never coerced to 0", () => {
  assert.equal(snapshotPriceCentsOf({ id: "a", priceCents: 4000 }), 4000);
  assert.equal(snapshotPriceCentsOf({ id: "a", priceCents: 0 }), 0, "a genuinely free component is 0");
  assert.equal(snapshotPriceCentsOf({ id: "a" }), null, "a pre-D-33 snapshot entry has no price");
  assert.equal(snapshotPriceCentsOf({ id: "a", priceCents: "4000" }), null, "a string is not a captured price");
  assert.equal(snapshotPriceCentsOf({ id: "a", priceCents: 12.5 }), null, "a fractional cent is not a captured price");
  assert.equal(snapshotPriceCentsOf({ id: "a", priceCents: -1 }), null);
  assert.equal(snapshotPriceCentsOf(null), null);
});
