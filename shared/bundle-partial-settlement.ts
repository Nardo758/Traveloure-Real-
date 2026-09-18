/**
 * BUNDLE PARTIAL SETTLEMENT — the ONE derivation of what a partially fulfilled bundle SETTLES AT:
 * what the seller keeps, what the traveler is refunded, and the immutable per-component outcome set.
 *
 * Decision-maker ruling 2026-09-16 (punchlist D-51; ledger `2026-09-16-bundle-partial-settlement`;
 * migration 307). Verbatim: "A PARTIALLY FULFILLED BUNDLE SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT
 * ALLOCATION. […] The seller earns only the purchase-time allocated value of the delivered components,
 * less the commission applicable to the original purchase. The traveler is refunded the allocated
 * value of the undelivered components plus the same proportional share of traveler-paid Traveloure
 * fees and surcharges. Stripe processing costs are not deducted from the traveler's refund […]."
 *
 * WHY IT IS PURE AND WHY IT IS SHARED. It computes and never writes: no `db`, no `storage`, no Stripe,
 * no request, no clock. A CI test proves it with no database, and the server's settlement service
 * calls THIS and restates nothing — a second "what does this bundle settle at?" beside it is the
 * derivation-drift class §18 rule 1 names, and it is how a refund and a mint start disagreeing about
 * the same booking.
 *
 * NO RATE AND NO AMOUNT LIVES HERE (§8/§14). Every figure is arithmetic over facts the caller read
 * from the ROW and its SNAPSHOTS: the component allocations (the contract fact, migration 307), the
 * row's own `total_amount` / `platform_fee` / `provider_earnings` (the fee resolver's output AT
 * PURCHASE), and the traveler-paid fees as `travelerChargeForRow` composed them — passed IN, never
 * recomposed here. A later catalog price, a later band, a later listing configuration can move
 * nothing, because none of them is an input.
 */
import {
  BUNDLE_COMPONENT_STATUS,
  allocationsAreComplete,
  cancelledComponentRefundCents,
  isValidCancelRefundPercent,
  type BundleComponentView,
} from "./bundle-component-states";

/**
 * Payment custody, per the ruling's last paragraph and `docs/audits/booking-custody-map.md`: the
 * discriminator is TABLE IDENTITY + the row's own Stripe PaymentIntent. Every component of a
 * `service_bookings` bundle is a `provider_services` row bought under that PaymentIntent, so its
 * custody is Traveloure's. A component view MAY carry an explicit custody (a later lane's marker); an
 * explicit non-Traveloure value is refused. When the PARENT has no PaymentIntent, custody is UNKNOWN
 * — refused, never assumed (§13).
 */
export const COMPONENT_CUSTODY = {
  traveloure: "traveloure",
} as const;

export interface SettlementComponentView extends BundleComponentView {
  serviceName?: string | null;
  /** Explicit custody marker where one exists; absent ⇒ derived from the parent's PaymentIntent. */
  custody?: string | null;
}

/** One component's immutable outcome, as the settlement row records it. */
export interface ComponentOutcome {
  componentServiceId: string;
  serviceName: string | null;
  status: string;
  allocationCents: number;
  custody: string;
  /**
   * `delivered` — kept by the seller; `failed` — refunded at full allocation (seller nonperformance,
   * no policy input); `cancelled` — the traveler's voluntary cancel, refunded at the percent the
   * SNAPSHOTTED cancellation policy yielded at the cancel instant (Locked Decision 50, second half;
   * ledger `2026-09-16-bundle-component-traveler-cancel`), the remainder retained by the seller.
   */
  outcome: "delivered" | "failed" | "cancelled";
  /** The cents of this component's allocation the traveler is refunded (0 for a delivered one). */
  refundCents: number;
  /** The cents of this component's allocation the seller keeps (allocation − refundCents). */
  retainedCents: number;
  /**
   * The policy percent applied — ONLY for a `cancelled` outcome (the pinned `cancelRefundPercent`).
   * NULL for `delivered` and `failed`: no policy was applied to either, and stating "100" on a failed
   * component would claim a policy answer nobody resolved (§13).
   */
  refundPercent: number | null;
}

export type BundlePartialSettlementRefusal =
  /** The parent has no Traveloure PaymentIntent — custody UNKNOWN, refused rather than assumed. */
  | "custody_unknown"
  /** A component carries an explicit custody that is not Traveloure's — no Traveloure refund exists for it. */
  | "component_custody_not_traveloure"
  /** Some component has no allocation, or they do not sum to the price: a pre-307 row or an unpriced snapshot (§13). */
  | "allocation_missing"
  /** A component is still `pending` (or in an unknown state) — nothing is conclusive yet. */
  | "component_pending"
  /** Every component was delivered — the FULL mint's case; nothing to settle partially. */
  | "nothing_undelivered"
  /**
   * Nothing was delivered. By DEFAULT this is refused — the caller has not said which rail owns the
   * row, and a settlement over a bundle that delivered nothing is a different money event from a
   * partial one. The ALL-UNDELIVERED parent rail (ledger `2026-09-17-all-undelivered-parent`) opts in
   * explicitly with `allowNothingDelivered`, because by then the parent has already been flipped to
   * `cancelled` by the ONE component writer and this IS the rail that owns it.
   */
  | "nothing_delivered"
  /**
   * A `cancelled` component carries no pinned `cancelRefundPercent` — the snapshotted policy's outcome
   * at the cancel instant was never recorded (a row no writer of this rail produced). Refused by name
   * rather than settled under a guessed tier (§13). The writer that pins it is the traveler's
   * component-cancel rail (ledger `2026-09-16-bundle-component-traveler-cancel`, migration 309).
   */
  | "cancel_terms_missing"
  /** A component already reads `refunded` — no writer exists; a human decides, never a second refund. */
  | "component_already_refunded"
  /** The pre-fee price is not a nonnegative integer number of cents. */
  | "price_unknown";

export type BundlePartialSettlementDerivation =
  | {
      ok: true;
      /**
       * What the sale settled at: Σ allocation of the DELIVERED components + Σ RETAINED cents of the
       * cancelled ones (allocation − policy refund). Equals `totalCents − refundedAllocationCents`.
       */
      settledAmountCents: number;
      /** The allocation cents going back to the traveler: Σ failed allocations + Σ cancelled refunds. */
      refundedAllocationCents: number;
      /** refunded / total — the share every traveler-paid fee is refunded at (terms §8.1: the percent applies to the fees too). */
      refundedFraction: number;
      /** The proportional share of `travelerFeesChargedCents` refunded. */
      feeRefundCents: number;
      /** The proportional share of `travelerServiceFeeChargedCents` refunded. */
      travelerServiceFeeRefundCents: number;
      /** The Stripe refund total: undelivered allocation + both fee shares. No processing cost deducted. */
      travelerRefundCents: number;
      /** The D-35 reduced figures the mint records, restated in cents from the SAME inputs. */
      sellerEarningCents: number;
      platformRevenueCents: number;
      componentOutcomes: ComponentOutcome[];
    }
  | { ok: false; reason: BundlePartialSettlementRefusal; detail?: string };

const toCents = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

/**
 * THE DERIVATION. Inputs are facts already on the row and its snapshots; nothing is re-resolved.
 *
 * - `components` — the `booking_component_states` rows (with `allocationCents`) for the booking.
 * - `totalAmount` / `platformFee` / `providerEarnings` — the ROW's own three figures at purchase.
 * - `parentHasPaymentIntent` — the custody discriminator (the row's `stripe_payment_intent_id`).
 * - `travelerFeesChargedCents` — what the traveler paid ABOVE `total_amount`, i.e.
 *   `travelerChargeForRow(row) − total_amount` composed by the ONE traveler-charge module (A3: the
 *   concierge fee; pre-A3: the platform fee + insurance that row really was charged).
 * - `travelerServiceFeeChargedCents` — `booking_details.travelerServiceFee.charged`, 0 when waived.
 *
 * Seller nonperformance (`failed`) refunds the FULL allocation regardless of the listing's
 * cancellation policy. A `cancelled` (traveler) component refunds `allocation × cancelRefundPercent /
 * 100` — the percent the SNAPSHOTTED policy yielded at the cancel instant, PINNED on the row by the
 * cancel writer and read here, never re-resolved — and the seller retains the remainder. A cancelled
 * row with no pinned percent is REFUSED (`cancel_terms_missing`). A settlement whose every refund is
 * 0 (a late strict cancel beside delivered components) is a VALID settlement that moves no money: the
 * caller records the outcome set and makes no Stripe call.
 */
export function deriveBundlePartialSettlement(input: {
  components: readonly SettlementComponentView[];
  totalAmount: string | number | null | undefined;
  platformFee: string | number | null | undefined;
  providerEarnings: string | number | null | undefined;
  parentHasPaymentIntent: boolean;
  travelerFeesChargedCents: number;
  travelerServiceFeeChargedCents: number;
  /**
   * OPT-IN, default FALSE (ledger `2026-09-17-all-undelivered-parent`). When true, a bundle with NO
   * delivered component settles here instead of being refused `nothing_delivered`. It is an INPUT
   * rather than a widening so every existing caller keeps its answer byte-for-byte: only the caller
   * that has established the parent is an all-undelivered CANCELLED row may pass it, and the
   * arithmetic below needs no special case — `keptFraction` simply falls to the retained share of the
   * traveller-cancelled components (0 when every component failed), so the seller's side is 0 without
   * anything being invented.
   */
  allowNothingDelivered?: boolean;
}): BundlePartialSettlementDerivation {
  if (!input.parentHasPaymentIntent) return { ok: false, reason: "custody_unknown" };
  const foreign = input.components.find(
    (c) => c.custody != null && c.custody !== COMPONENT_CUSTODY.traveloure,
  );
  if (foreign) {
    return {
      ok: false,
      reason: "component_custody_not_traveloure",
      detail: `${foreign.componentServiceId}:${foreign.custody}`,
    };
  }
  const totalCents = toCents(input.totalAmount);
  if (totalCents == null || totalCents < 0) return { ok: false, reason: "price_unknown" };
  if (!allocationsAreComplete(input.components, totalCents)) return { ok: false, reason: "allocation_missing" };

  const delivered: SettlementComponentView[] = [];
  const failed: SettlementComponentView[] = [];
  const cancelled: SettlementComponentView[] = [];
  for (const c of input.components) {
    if (c.status === BUNDLE_COMPONENT_STATUS.completed) delivered.push(c);
    else if (c.status === BUNDLE_COMPONENT_STATUS.failed) failed.push(c);
    else if (c.status === BUNDLE_COMPONENT_STATUS.cancelled) {
      if (!isValidCancelRefundPercent(c.cancelRefundPercent)) {
        return { ok: false, reason: "cancel_terms_missing", detail: c.componentServiceId };
      }
      cancelled.push(c);
    } else if (c.status === BUNDLE_COMPONENT_STATUS.refunded) {
      return { ok: false, reason: "component_already_refunded", detail: c.componentServiceId };
    } else {
      // `pending` and any unknown value — never conclusive by default.
      return { ok: false, reason: "component_pending", detail: c.componentServiceId };
    }
  }
  if (failed.length === 0 && cancelled.length === 0) return { ok: false, reason: "nothing_undelivered" };
  if (delivered.length === 0 && input.allowNothingDelivered !== true) {
    return { ok: false, reason: "nothing_delivered" };
  }

  // Per-component refund: the whole allocation for nonperformance; the pinned percent of it for a cancel.
  const refundOf = (c: SettlementComponentView): number =>
    c.status === BUNDLE_COMPONENT_STATUS.cancelled
      ? cancelledComponentRefundCents(c.allocationCents as number, c.cancelRefundPercent as number)
      : c.status === BUNDLE_COMPONENT_STATUS.failed
        ? (c.allocationCents as number)
        : 0;
  const refundedAllocationCents = input.components.reduce((s, c) => s + refundOf(c), 0);
  const settledAmountCents = totalCents - refundedAllocationCents;
  const refundedFraction = totalCents > 0 ? refundedAllocationCents / totalCents : 0;
  const keptFraction = 1 - refundedFraction;

  const fees = Math.max(0, Math.trunc(input.travelerFeesChargedCents || 0));
  const tsf = Math.max(0, Math.trunc(input.travelerServiceFeeChargedCents || 0));
  const feeRefundCents = Math.round(fees * refundedFraction);
  const travelerServiceFeeRefundCents = Math.round(tsf * refundedFraction);
  const travelerRefundCents = refundedAllocationCents + feeRefundCents + travelerServiceFeeRefundCents;

  // The seller's side is the D-35 mint's arithmetic over the SAME kept share: the row's own purchase-
  // time `provider_earnings` and `platform_fee` scaled — the ORIGINAL commission, never re-resolved.
  const earningsCents = toCents(input.providerEarnings) ?? 0;
  const feeCents = toCents(input.platformFee) ?? 0;
  const sellerEarningCents = Math.round(Math.max(earningsCents, 0) * keptFraction);
  const platformRevenueCents = Math.round(Math.max(feeCents, 0) * keptFraction);

  const componentOutcomes: ComponentOutcome[] = input.components.map((c) => {
    const alloc = c.allocationCents as number;
    const refundCents = refundOf(c);
    const isCancelled = c.status === BUNDLE_COMPONENT_STATUS.cancelled;
    return {
      componentServiceId: c.componentServiceId,
      serviceName: c.serviceName ?? null,
      status: c.status,
      allocationCents: alloc,
      custody: c.custody ?? COMPONENT_CUSTODY.traveloure,
      outcome: isCancelled ? "cancelled" : c.status === BUNDLE_COMPONENT_STATUS.failed ? "failed" : "delivered",
      refundCents,
      retainedCents: alloc - refundCents,
      refundPercent: isCancelled ? (c.cancelRefundPercent as number) : null,
    };
  });

  return {
    ok: true,
    settledAmountCents,
    refundedAllocationCents,
    refundedFraction,
    feeRefundCents,
    travelerServiceFeeRefundCents,
    travelerRefundCents,
    sellerEarningCents,
    platformRevenueCents,
    componentOutcomes,
  };
}
