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
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_COMPONENT_STATUS,
  allocateBundleCents,
  allocationsAreComplete,
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
  assert.equal(d.undeliveredAllocationCents, 2000);
  assert.equal(d.undeliveredFraction, 0.2);
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

test("SP8 — FAILED refunds its FULL allocation regardless of policy; CANCELLED is the unbuilt traveler path and is refused; every refusal is NAMED", () => {
  // Seller nonperformance: no policy input exists on this derivation at all — there is no way to
  // pass a non-refundable tier in, which is the point. The failed component refunds 100% of its allocation.
  const failed = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.failed) });
  assert.ok(failed.ok);
  assert.equal(failed.componentOutcomes[2].refundCents, 2000);

  const cancelled = deriveBundlePartialSettlement({ ...BASE, components: THREE(BUNDLE_COMPONENT_STATUS.cancelled) });
  assert.equal(cancelled.ok, false);
  assert.equal((cancelled as any).reason, "traveler_cancel_path_not_built");
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
