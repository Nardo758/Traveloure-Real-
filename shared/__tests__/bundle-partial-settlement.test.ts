/**
 * D-51 (ledger `2026-09-16-bundle-partial-settlement`) — the PURE layer: the allocation arithmetic,
 * the basis the reduced figures read, and the ONE settlement derivation. No DB, no server, no Stripe.
 *
 *   SP1  a discounted bundle allocates pro-rata and sums EXACTLY to the price
 *   SP2  odd cents: largest-remainder rounding is exact, nonnegative and DETERMINISTIC
 *   SP3  not captured: a missing price, a zero-priced snapshot, a bad total ⇒ NULL, never a split
 *   SP4  `reducedBundleFigures` reads the allocation FIRST and names the basis; falls back to snapshot
 *   SP5  the derivation: seller keeps the delivered allocation, traveler gets the undelivered + fee share
 *   SP6  historical snapshot: a later catalog price is NOT an input — nothing moves
 *   SP7  custody: no PaymentIntent ⇒ unknown ⇒ refused; explicit foreign custody ⇒ refused
 *   SP8  failed vs cancelled asymmetry, and every other refusal is NAMED
 *   SP9  Locked Decision 50, second half (ledger `2026-09-16-bundle-component-traveler-cancel`): a
 *        CANCELLED component follows its PINNED policy percent — the one refund arithmetic, the retained
 *        remainder in the mint, the fee share at the refunded fraction, a zero-refund settlement, and a
 *        cancelled row with no pin refused by name in BOTH the mint and the settlement
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_COMPONENT_STATUS,
  allocateBundleCents,
  allocationsAreComplete,
  cancelledComponentRefundCents,
  isValidCancelRefundPercent,
  reducedBundleFigures,
  type BundleComponentView,
} from "../bundle-component-states";
import {
  COMPONENT_CUSTODY,
  deriveBundlePartialSettlement,
  type SettlementComponentView,
} from "../bundle-partial-settlement";

const view = (
  id: string,
  status: string,
  snapshotPriceCents: number | null,
  allocationCents: number | null | undefined,
  extra: Partial<SettlementComponentView> = {},
): SettlementComponentView => ({ componentServiceId: id, status, snapshotPriceCents, allocationCents, ...extra });

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

test("SP1 — a discounted bundle allocates pro-rata and sums EXACTLY to the pre-fee price", () => {
  // Components list at 60.00 + 40.00; the bundle sold for 95.00.
  const alloc = allocateBundleCents([6000, 4000], 9500);
  assert.deepEqual(alloc, [5700, 3800]);
  assert.equal(sum(alloc!), 9500);
  // Undiscounted: the allocation IS the price.
  assert.deepEqual(allocateBundleCents([4000, 4000, 2000], 10000), [4000, 4000, 2000]);
});

test("SP2 — odd cents: largest-remainder rounding is exact, nonnegative and deterministic", () => {
  // 40/40/20 sold for 100.01: shares 4000.4 / 4000.4 / 2000.2 ⇒ floors sum to 10000, ONE cent left,
  // which goes to the largest remainder; the tie between the two .4s breaks by POSITION.
  const a = allocateBundleCents([4000, 4000, 2000], 10001);
  assert.deepEqual(a, [4001, 4000, 2000]);
  assert.deepEqual(allocateBundleCents([4000, 4000, 2000], 10001), a, "a re-run reproduces it byte for byte");
  // Three equal components sold for 100.00: 3333.33… each ⇒ 3334/3333/3333.
  assert.deepEqual(allocateBundleCents([1000, 1000, 1000], 10000), [3334, 3333, 3333]);
  // Property sweep: exact sum and nonnegativity over awkward vectors.
  const vectors: Array<[number[], number]> = [
    [[1, 1, 1], 10],
    [[7, 13, 29], 101],
    [[12345, 1, 99999], 77777],
    [[500, 0, 500], 999],
    [[1, 2, 3, 4, 5, 6, 7], 1],
    [[9999, 1], 1],
  ];
  for (const [prices, total] of vectors) {
    const r = allocateBundleCents(prices, total)!;
    assert.ok(r, `allocates ${JSON.stringify(prices)} @ ${total}`);
    assert.equal(sum(r), total, `sums exactly for ${JSON.stringify(prices)} @ ${total}`);
    assert.ok(r.every((x) => Number.isInteger(x) && x >= 0), `nonnegative integers for ${JSON.stringify(prices)}`);
    assert.equal(r.length, prices.length);
  }
  // A zero-priced component inside a priced bundle gets 0 — never a share it did not carry.
  assert.deepEqual(allocateBundleCents([500, 0, 500], 1000), [500, 0, 500]);
});

test("SP3 — NOT CAPTURED: a missing price, a zero-priced snapshot or a bad total yields NULL, never an equal split", () => {
  assert.equal(allocateBundleCents([4000, null, 2000], 10000), null);
  assert.equal(allocateBundleCents([4000, undefined, 2000], 10000), null);
  assert.equal(allocateBundleCents([0, 0], 10000), null, "zero-priced snapshot: no share can be derived");
  assert.equal(allocateBundleCents([4000, 2000], -1), null);
  assert.equal(allocateBundleCents([4000, 2000], 100.5), null, "a fractional total is not cents");
  assert.equal(allocateBundleCents([], 10000), null);
  assert.equal(allocateBundleCents([-1, 2000], 10000), null, "a negative price is not a price");

  const complete = [view("a", "completed", 4000, 5700), view("b", "failed", 4000, 3800)];
  assert.equal(allocationsAreComplete(complete, 9500), true);
  assert.equal(allocationsAreComplete([view("a", "completed", 4000, 5700), view("b", "failed", 4000, null)], 9500), false);
  assert.equal(allocationsAreComplete(complete, 9600), false, "a rewritten total no longer matches the contract");
  assert.equal(allocationsAreComplete([], 0), false);
});

test("SP4 — reducedBundleFigures reads the ALLOCATION first and names the basis; a pre-307 row falls back to snapshot pro-rata", () => {
  // 60/40 catalog, sold for 95.00 (fee 20.00 / earnings 75.00); the 40 fails.
  const withAlloc: BundleComponentView[] = [view("a", "completed", 6000, 5700), view("b", "failed", 4000, 3800)];
  const r = reducedBundleFigures({ totalAmount: "95.00", platformFee: "20.00", providerEarnings: "75.00", components: withAlloc });
  assert.ok(r.ok);
  assert.equal(r.basis, "allocation");
  assert.equal(r.grossAmount, "57.00", "Σ delivered allocations, exactly");
  assert.equal(r.deductedAmount, "38.00");
  assert.equal(r.keptFraction, 0.6);
  assert.equal(r.platformFee, "12.00");
  assert.equal(r.providerEarnings, "45.00");
  assert.equal(r.totalSnapshotCents, 10000);

  const noAlloc: BundleComponentView[] = [view("a", "completed", 6000, null), view("b", "failed", 4000, null)];
  const s = reducedBundleFigures({ totalAmount: "95.00", platformFee: "20.00", providerEarnings: "75.00", components: noAlloc });
  assert.ok(s.ok);
  assert.equal(s.basis, "snapshot_pro_rata");
  assert.equal(s.grossAmount, "57.00", "the same pro-rata share of what was charged (D-33/D-35)");
  assert.equal(s.deductedAmount, "38.00");

  // Allocations present but NOT summing to the price (a rewritten total) ⇒ snapshot basis, never a trust.
  const drifted: BundleComponentView[] = [view("a", "completed", 6000, 5700), view("b", "failed", 4000, 3800)];
  const d = reducedBundleFigures({ totalAmount: "96.00", platformFee: "20.00", providerEarnings: "75.00", components: drifted });
  assert.ok(d.ok);
  assert.equal(d.basis, "snapshot_pro_rata");

  // No snapshot AND no allocation ⇒ refused, never guessed (unchanged D-35 posture).
  const unknown: BundleComponentView[] = [view("a", "completed", null, null), view("b", "failed", 2000, null)];
  const u = reducedBundleFigures({ totalAmount: "95.00", platformFee: "20.00", providerEarnings: "75.00", components: unknown });
  assert.equal(u.ok, false);
  assert.equal((u as any).reason, "component_price_unknown");
  // The snapshot sums are NULL, not 0, when a snapshot price is missing but the allocation is complete.
  const halfKnown: BundleComponentView[] = [view("a", "completed", null, 5700), view("b", "failed", 4000, 3800)];
  const h = reducedBundleFigures({ totalAmount: "95.00", platformFee: "20.00", providerEarnings: "75.00", components: halfKnown });
  assert.ok(h.ok);
  assert.equal(h.basis, "allocation");
  assert.equal(h.totalSnapshotCents, null);
});

const BASE = {
  totalAmount: "100.00",
  platformFee: "25.00",
  providerEarnings: "75.00",
  parentHasPaymentIntent: true,
  travelerFeesChargedCents: 500, // the concierge fee the traveler paid on top (A3)
  travelerServiceFeeChargedCents: 1000, // booking_details.travelerServiceFee.charged
};
const THREE = (cStatus: string = BUNDLE_COMPONENT_STATUS.failed) => [
  view("a", BUNDLE_COMPONENT_STATUS.completed, 4000, 4000, { serviceName: "A" }),
  view("b", BUNDLE_COMPONENT_STATUS.completed, 4000, 4000, { serviceName: "B" }),
  view("c", cStatus, 2000, 2000, { serviceName: "C" }),
];

test("SP5 — the derivation: seller keeps the delivered allocation less the ORIGINAL commission share; traveler gets the undelivered allocation plus the SAME share of every fee", () => {
  const d = deriveBundlePartialSettlement({ ...BASE, components: THREE() });
  assert.ok(d.ok);
  assert.equal(d.settledAmountCents, 8000, "Σ delivered allocations");
  assert.equal(d.refundedAllocationCents, 2000);
  assert.equal(d.refundedFraction, 0.2);
  assert.equal(d.feeRefundCents, 100, "20% of the 5.00 concierge fee");
  assert.equal(d.travelerServiceFeeRefundCents, 200, "20% of the 10.00 traveler service fee");
  assert.equal(d.travelerRefundCents, 2300, "allocation + both fee shares; no processing cost deducted");
  assert.equal(d.sellerEarningCents, 6000, "the row's own 75.00 × 0.8 — the original resolver output scaled");
  assert.equal(d.platformRevenueCents, 2000, "the row's own 25.00 × 0.8");
  assert.deepEqual(
    d.componentOutcomes.map((o) => [o.componentServiceId, o.outcome, o.refundCents, o.custody]),
    [
      ["a", "delivered", 0, COMPONENT_CUSTODY.traveloure],
      ["b", "delivered", 0, COMPONENT_CUSTODY.traveloure],
      ["c", "failed", 2000, COMPONENT_CUSTODY.traveloure],
    ],
  );
  assert.equal(d.componentOutcomes[2].serviceName, "C", "the outcome NAMES the component as bought");
  // No fees paid ⇒ the refund is exactly the undelivered allocation.
  const bare = deriveBundlePartialSettlement({ ...BASE, travelerFeesChargedCents: 0, travelerServiceFeeChargedCents: 0, components: THREE() });
  assert.ok(bare.ok);
  assert.equal(bare.travelerRefundCents, 2000);
  // Pre-A3 shape: the fees the traveler REALLY paid (platform fee + insurance) ride the same share.
  const preA3 = deriveBundlePartialSettlement({ ...BASE, travelerFeesChargedCents: 2500, travelerServiceFeeChargedCents: 0, components: THREE() });
  assert.ok(preA3.ok);
  assert.equal(preA3.travelerRefundCents, 2500, "2000 + 20% of 25.00");
});

test("SP6 — HISTORICAL SNAPSHOT: a later catalog price is not an input, so nothing moves", () => {
  const before = deriveBundlePartialSettlement({ ...BASE, components: THREE() });
  // The seller reprices every component tenfold afterwards — the CATALOG fact changes …
  const repriced = THREE().map((c) => ({ ...c, snapshotPriceCents: (c.snapshotPriceCents ?? 0) * 10 }));
  const after = deriveBundlePartialSettlement({ ...BASE, components: repriced });
  // … and the CONTRACT fact (the allocation) drives every figure, so the settlement is identical.
  assert.deepEqual(after, before);
});

test("SP7 — CUSTODY: no PaymentIntent ⇒ UNKNOWN ⇒ refused, never assumed; explicit foreign custody ⇒ refused", () => {
  const none = deriveBundlePartialSettlement({ ...BASE, parentHasPaymentIntent: false, components: THREE() });
  assert.deepEqual(none, { ok: false, reason: "custody_unknown" });
  const partner = deriveBundlePartialSettlement({
    ...BASE,
    components: [
      view("a", BUNDLE_COMPONENT_STATUS.completed, 4000, 4000),
      view("b", BUNDLE_COMPONENT_STATUS.failed, 6000, 6000, { custody: "affiliate" }),
    ],
  });
  assert.equal(partner.ok, false);
  assert.equal((partner as any).reason, "component_custody_not_traveloure");
  assert.equal((partner as any).detail, "b:affiliate");
  // An explicit Traveloure marker is accepted like an absent one.
  const marked = deriveBundlePartialSettlement({
    ...BASE,
    components: THREE().map((c) => ({ ...c, custody: COMPONENT_CUSTODY.traveloure })),
  });
  assert.ok(marked.ok);
});

test("SP8 — FAILED refunds its FULL allocation regardless of policy; a CANCELLED row without its pinned policy outcome is refused; every refusal is NAMED", () => {
  // Seller nonperformance: no policy input exists for a FAILED component — there is no way to pass a
  // non-refundable tier in for it, which is the point. The failed component refunds 100% of its allocation,
  // and states NO policy percent (none was applied).
  const failed = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.failed) });
  assert.ok(failed.ok);
  assert.equal(failed.componentOutcomes[2].refundCents, 2000);
  assert.equal(failed.componentOutcomes[2].refundPercent, null);

  // A CANCELLED row with no pinned `cancelRefundPercent` (a row no writer of the rail produced) is refused
  // by name — never settled under a guessed tier (LD 50 second half; the pin is migration 308's column).
  const cancelled = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.cancelled) });
  assert.equal(cancelled.ok, false);
  assert.equal((cancelled as any).reason, "cancel_terms_missing");
  assert.equal((cancelled as any).detail, "c");

  const refunded = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.refunded) });
  assert.equal((refunded as any).reason, "component_already_refunded");

  const pending = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.pending) });
  assert.equal((pending as any).reason, "component_pending");
  const unknownStatus = deriveBundlePartialSettlement({ ...BASE, components: THREE("mystery") });
  assert.equal((unknownStatus as any).reason, "component_pending", "an unknown value is never conclusive");

  const allDone = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.completed) });
  assert.equal((allDone as any).reason, "nothing_undelivered");
  const noneDone = deriveBundlePartialSettlement({
    ...BASE,
    components: THREE().map((c) => ({ ...c, status: BUNDLE_COMPONENT_STATUS.failed })),
  });
  assert.equal((noneDone as any).reason, "nothing_delivered", "the whole-row rail's case, never this one");

  const legacy = deriveBundlePartialSettlement({ ...BASE, components: THREE().map((c) => ({ ...c, allocationCents: null })) });
  assert.equal((legacy as any).reason, "allocation_missing", "a pre-307 row cannot settle and says so");
  const drift = deriveBundlePartialSettlement({ ...BASE, totalAmount: "101.00", components: THREE() });
  assert.equal((drift as any).reason, "allocation_missing", "allocations that no longer sum to the price are not the contract");
  const noPrice = deriveBundlePartialSettlement({ ...BASE, totalAmount: null, components: THREE() });
  assert.equal((noPrice as any).reason, "price_unknown");
  // Custody is checked BEFORE the allocation: a partner bundle is refused for custody, not for a missing column.
  const custodyFirst = deriveBundlePartialSettlement({
    ...BASE,
    parentHasPaymentIntent: false,
    components: THREE().map((c) => ({ ...c, allocationCents: null })),
  });
  assert.equal((custodyFirst as any).reason, "custody_unknown");
});

test("SP9 — LD 50 second half: a CANCELLED component follows its PINNED policy percent; the seller retains the rest; a zero-refund settlement is valid; no pin ⇒ refused in mint AND settlement", () => {
  // THE ONE ARITHMETIC: allocation × percent / 100, rounded half-up to a cent — deterministic.
  assert.equal(cancelledComponentRefundCents(2000, 100), 2000);
  assert.equal(cancelledComponentRefundCents(2000, 50), 1000);
  assert.equal(cancelledComponentRefundCents(2000, 0), 0);
  assert.equal(cancelledComponentRefundCents(2001, 50), 1001, "an odd cent under 50% rounds half-up, as the whole-row quote does");
  assert.equal(cancelledComponentRefundCents(2001, 50), cancelledComponentRefundCents(2001, 50), "a re-run reproduces it");
  // THE PIN's validity: an integer in [0, 100] and nothing else.
  for (const ok of [0, 50, 100]) assert.equal(isValidCancelRefundPercent(ok), true);
  for (const bad of [101, -1, 50.5, null, undefined, "50", NaN]) assert.equal(isValidCancelRefundPercent(bad), false, String(bad));

  const cancelledAt = (pct: number | null) =>
    THREE().map((c) => (c.componentServiceId === "c" ? { ...c, status: BUNDLE_COMPONENT_STATUS.cancelled, cancelRefundPercent: pct } : c));

  // THE MINT (reducedBundleFigures): the seller keeps the delivered allocations PLUS the retained half.
  const mint50 = reducedBundleFigures({ totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00", components: cancelledAt(50) });
  assert.ok(mint50.ok);
  assert.equal(mint50.basis, "allocation");
  assert.equal(mint50.grossAmount, "90.00", "80.00 delivered + 10.00 retained under the policy");
  assert.equal(mint50.deductedAmount, "10.00", "only the refunded half leaves the seller");
  assert.equal(mint50.keptFraction, 0.9);
  assert.equal(mint50.platformFee, "22.50", "the row's own 25.00 × 0.9 — the original commission scaled");
  assert.equal(mint50.providerEarnings, "67.50");
  assert.equal(mint50.cancelledRetainedCents, 1000);
  assert.deepEqual(mint50.cancelledComponentIds, ["c"]);
  assert.deepEqual(mint50.undeliveredComponentIds, ["c"], "still NOT delivered — the parent is partial, not complete");
  // A late strict cancel (0%): nothing leaves the seller; the parent is still partially completed.
  const mint0 = reducedBundleFigures({ totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00", components: cancelledAt(0) });
  assert.ok(mint0.ok);
  assert.equal(mint0.grossAmount, "100.00");
  assert.equal(mint0.deductedAmount, "0.00");
  assert.equal(mint0.cancelledRetainedCents, 2000);
  // A full-refund cancel (100%) reduces exactly like a failure — the outcome differs, the money does not.
  const mint100 = reducedBundleFigures({ totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00", components: cancelledAt(100) });
  const mintFailed = reducedBundleFigures({ totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00", components: THREE() });
  assert.ok(mint100.ok && mintFailed.ok);
  assert.equal(mint100.grossAmount, mintFailed.grossAmount);
  assert.equal(mint100.cancelledRetainedCents, 0);
  // NO PIN ⇒ the kept share is unknowable ⇒ REFUSED by name (the flip must roll back, never mint a guess).
  const mintNoPin = reducedBundleFigures({ totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00", components: cancelledAt(null) });
  assert.equal(mintNoPin.ok, false);
  assert.equal((mintNoPin as any).reason, "cancel_terms_missing");
  assert.equal((mintNoPin as any).detail, "c");
  // The snapshot FALLBACK (no allocation, pre-307) predates the rail: cancelled reads as fully undelivered
  // and retains nothing — stated, and unreachable through the writer (it refuses `allocation_missing`).
  const legacy = reducedBundleFigures({
    totalAmount: "100.00", platformFee: "25.00", providerEarnings: "75.00",
    components: cancelledAt(50).map((c) => ({ ...c, allocationCents: null })),
  });
  assert.ok(legacy.ok);
  assert.equal(legacy.basis, "snapshot_pro_rata");
  assert.equal(legacy.cancelledRetainedCents, 0);
  assert.deepEqual(legacy.cancelledComponentIds, ["c"]);

  // THE SETTLEMENT: refund = allocation × pin; fees follow at the REFUNDED fraction (terms §8.1 — the
  // percent applies to the fees too); the seller's figures equal the mint's.
  const d50 = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(50) });
  assert.ok(d50.ok);
  assert.equal(d50.refundedAllocationCents, 1000);
  assert.equal(d50.refundedFraction, 0.1);
  assert.equal(d50.settledAmountCents, 9000, "delivered 8000 + retained 1000");
  assert.equal(d50.feeRefundCents, 50, "10% of the 5.00 concierge fee");
  assert.equal(d50.travelerServiceFeeRefundCents, 100, "10% of the 10.00 traveler service fee");
  assert.equal(d50.travelerRefundCents, 1150);
  assert.equal(d50.sellerEarningCents, 6750);
  assert.equal(d50.platformRevenueCents, 2250);
  assert.deepEqual(
    d50.componentOutcomes.map((o) => [o.componentServiceId, o.outcome, o.refundCents, o.retainedCents, o.refundPercent]),
    [
      ["a", "delivered", 0, 4000, null],
      ["b", "delivered", 0, 4000, null],
      ["c", "cancelled", 1000, 1000, 50],
    ],
  );
  // A zero-refund cancel beside delivered components is a VALID settlement that moves no money.
  const d0 = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(0) });
  assert.ok(d0.ok);
  assert.equal(d0.travelerRefundCents, 0);
  assert.equal(d0.feeRefundCents, 0);
  assert.equal(d0.settledAmountCents, 10000);
  assert.equal(d0.componentOutcomes[2].retainedCents, 2000);
  // 100% under the policy refunds exactly what a failure refunds; the OUTCOME still says which it was.
  const d100 = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(100) });
  const dFailed = deriveBundlePartialSettlement({ ...BASE, components: THREE() });
  assert.ok(d100.ok && dFailed.ok);
  assert.equal(d100.travelerRefundCents, dFailed.travelerRefundCents);
  assert.equal(d100.componentOutcomes[2].outcome, "cancelled");
  assert.equal(d100.componentOutcomes[2].refundPercent, 100);
  // MIXED: B failed (full 4000) + C cancelled at 50% (1000) ⇒ refunded 5000, fees at 50%.
  const mixed = deriveBundlePartialSettlement({
    ...BASE,
    components: cancelledAt(50).map((c) => (c.componentServiceId === "b" ? { ...c, status: BUNDLE_COMPONENT_STATUS.failed } : c)),
  });
  assert.ok(mixed.ok);
  assert.equal(mixed.refundedAllocationCents, 5000);
  assert.equal(mixed.refundedFraction, 0.5);
  assert.equal(mixed.travelerRefundCents, 5000 + 250 + 500);
  assert.equal(mixed.settledAmountCents, 5000);
  assert.equal(mixed.sellerEarningCents, 3750);
  // THE PIN IS THE INPUT, never a re-resolution: a different pin, a different answer, nothing else consulted.
  const d100b = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(100) });
  assert.notEqual(d100b.ok && d100b.travelerRefundCents, d50.ok && d50.travelerRefundCents);
  // A cancelled row with no pin refuses the WHOLE settlement — the same name the mint uses.
  const noPin = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(null) });
  assert.equal(noPin.ok, false);
  assert.equal((noPin as any).reason, "cancel_terms_missing");
  const badPin = deriveBundlePartialSettlement({ ...BASE, components: cancelledAt(150) });
  assert.equal((badPin as any).reason, "cancel_terms_missing", "an out-of-range pin is not a pin");
});
