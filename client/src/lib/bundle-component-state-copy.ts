/**
 * BUNDLE COMPONENT + SETTLEMENT COPY — the ONE place a purchased bundle's per-component rows and
 * its partial settlement become words, for BOTH audiences.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`; the rulings are Locked Decision 48 (a bundle's
 * components are rows; `partially_completed` is its own state) and Locked Decision 50 (a partially
 * fulfilled bundle settles once by its purchase-time allocation), plus §13.
 *
 * DISTINCT FROM `bundle-component-display.ts`, which words a bundle LISTING's component list on
 * the catalog page. This module words a PURCHASE's component STATE. The two are never merged: one
 * is what is for sale, the other is what happened to what was bought.
 *
 * WHY ONE MODULE (§18 rule 1). The traveler's bookings page and the seller's booking queue read
 * the same `booking_component_states` rows and the same `bundle_partial_settlements` row. A second
 * status→label table is how "cancelled" starts meaning "refunded" on one surface and not the
 * other — which is precisely the lie ledger `2026-09-17-ld50-remainder-and-artifact-refund` gave
 * `refunded` its own value to prevent.
 *
 * WHAT IT REFUSES TO AUTHOR:
 *  · ANY AMOUNT IT WAS NOT HANDED. Every cent figure comes from the row (`allocation_cents`,
 *    `refund_amount_cents`, the settlement's pinned totals). Nothing is summed into a new claim,
 *    no percentage is applied, no fee or rate appears (§8/§14).
 *  · A CAPACITY CLAIM. Both component writers answer `componentCapacity: { released: 0, reason:
 *    "no_component_capacity_reserved" }` — the code STATING that nothing per-component was ever
 *    reserved. "0 released" is not a release, so the surface renders NO capacity sentence at all
 *    rather than "0 slots returned", which would describe a release that did not happen.
 *  · A REFUND THAT HAS NOT HAPPENED. "prepared, awaiting" and "refunded" are different facts and
 *    are never collapsed (LD 44(e)'s rule, one table over): a settlement row with `settledAt` NULL
 *    is CLAIMED, not settled, and a component with no `refundedAt` was not refunded — even when
 *    its allocation is known to the cent.
 *
 * Run: npx tsx --test client/src/lib/__tests__/bundle-component-state-copy.test.ts
 */

/** One row of `booking_component_states`, as the read endpoint projects it. */
export interface BundleComponentStateRow {
  componentServiceId: string;
  serviceName?: string | null;
  position?: number | null;
  status: string;
  /** The CONTRACT fact — this component's share of the pre-fee price. ABSENT = not captured (§13). */
  allocationCents?: number | null;
  /** The CATALOG fact at purchase. ABSENT = not captured; never 0. */
  snapshotPriceCents?: number | null;
  failureReason?: string | null;
  cancelReason?: string | null;
  /** Pinned by the traveler-cancel writer from the SNAPSHOTTED policy. ABSENT = never cancelled here. */
  cancelRefundPercent?: number | null;
  refundedAt?: string | null;
  refundAmountCents?: number | null;
  stripeRefundId?: string | null;
}

/** The `bundle_partial_settlements` row, projected. ABSENT entirely = nothing has settled. */
export interface BundleSettlementRow {
  /** True only when `settled_at` is stamped. A claimed-but-unpromoted row is NOT settled. */
  settled: boolean;
  settledAmountCents: number;
  travelerRefundCents: number;
  stripeRefundId?: string | null;
  claimedAt?: string | null;
  settledAt?: string | null;
}

export type ComponentTone = "waiting" | "good" | "bad" | "money";

export interface ComponentStateCopy {
  label: string;
  tone: ComponentTone;
  /** What this state means to the TRAVELER. */
  traveler: string;
  /** What the SAME row means to the SELLER — a different person's stake in it. */
  seller: string;
}

/**
 * The five app-enforced `booking_component_states.status` values. The column has NO DB CHECK (the
 * publish-trap posture), so an unknown value is genuinely possible and is treated as UNRESOLVED —
 * never as delivered, which is the reading `shared/bundle-component-states.ts` forbids by name.
 */
const COMPONENT_STATE_COPY: Record<string, ComponentStateCopy> = {
  pending: {
    label: "Outstanding",
    tone: "waiting",
    traveler: "Not delivered yet. Nothing has been settled for this part.",
    seller: "Still outstanding. Mark it delivered, or say it will not be delivered.",
  },
  completed: {
    label: "Delivered",
    tone: "good",
    traveler: "Your provider delivered this part.",
    seller: "You delivered this part. Its allocated value is what you earn from it.",
  },
  failed: {
    label: "Not delivered",
    tone: "bad",
    traveler: "Your provider says this part will not be delivered. Its allocated amount comes back to you when the bundle settles.",
    seller: "You recorded that this part will not be delivered. Its allocated amount goes back to the traveler.",
  },
  cancelled: {
    label: "Cancelled by traveler",
    tone: "bad",
    traveler: "You cancelled this part. What comes back follows the cancellation policy this booking was bought under.",
    seller: "The traveler cancelled this part under the policy your listing carried at purchase.",
  },
  refunded: {
    label: "Refunded",
    tone: "money",
    traveler: "This part's money is settled and has gone back to your payment method.",
    seller: "This part's money is settled — the traveler has been refunded for it.",
  },
};

export function componentStateCopy(status: string | null | undefined): ComponentStateCopy {
  const known = status ? COMPONENT_STATE_COPY[status] : undefined;
  if (known) return known;
  const raw = (status ?? "").trim();
  return {
    label: raw.length > 0 ? raw.replace(/_/g, " ") : "Unrecognised",
    tone: "waiting",
    traveler: "This part is in a state this page does not recognise. Nothing is assumed about it.",
    seller: "This part is in a state this page does not recognise. Nothing is assumed about it.",
  };
}

/** The seller's "mark as not delivered" may draw only on an outstanding component. */
export function componentCanBeMarkedFailed(row: BundleComponentStateRow): boolean {
  return row.status === "pending";
}

/** The traveler's "cancel this part" may draw only on an outstanding component. */
export function componentCanBeCancelled(row: BundleComponentStateRow): boolean {
  return row.status === "pending";
}

/** Integer cents to a plain dollar string. No currency symbol is invented; the caller adds one. */
export function centsLine(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const rem = abs % 100;
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${rem < 10 ? "0" : ""}${rem}`;
}

/**
 * §13 — THE ALLOCATION LINE. `allocation_cents` NULL is NOT CAPTURED (a pre-migration-307
 * purchase, or an unpriced snapshot) and is said as that; it is never rendered as 0, which would
 * claim the component was worth nothing.
 */
export function componentAllocationLine(row: BundleComponentStateRow): string {
  const line = centsLine(row.allocationCents);
  return line === null ? "No allocation recorded for this part" : `Allocated ${line}`;
}

/**
 * §13 — THE REFUND LINE, and the distinction the whole ruling turns on. A row is REFUNDED only
 * when `refundedAt` is stamped; a known allocation on a failed part is money PREPARED, not money
 * returned. The Stripe refund id is named when present and invented when absent.
 */
export function componentRefundLine(row: BundleComponentStateRow): string | null {
  if (row.refundedAt) {
    const amount = centsLine(row.refundAmountCents);
    const head = amount === null ? "Refunded" : `Refunded ${amount}`;
    return row.stripeRefundId ? `${head} · refund ${row.stripeRefundId}` : head;
  }
  if (row.status === "failed" || row.status === "cancelled") {
    return "Prepared, awaiting settlement — nothing has been refunded for this part yet";
  }
  return null;
}

/**
 * The pinned cancellation percent, said only when the row carries one. This is the SNAPSHOTTED
 * policy's outcome at the instant of the cancel, pinned by the writer — the surface never
 * re-resolves a policy and never quotes the live listing (LD 50: that is the retroactive
 * tightening the snapshot exists to prevent).
 */
export function componentCancelTermsLine(row: BundleComponentStateRow): string | null {
  if (row.cancelRefundPercent === null || row.cancelRefundPercent === undefined) return null;
  return `Cancellation policy at purchase returned ${row.cancelRefundPercent}% of this part's allocation.`;
}

/**
 * THERE IS NO PREVIEW BEFORE THE ACT, AND THE SURFACE SAYS SO RATHER THAN GUESSING ONE.
 *
 * The traveler-cancel rail (`POST /api/bookings/:id/components/:componentServiceId/cancel`) is the
 * ONLY thing that resolves the snapshotted policy against the booking's start, and it does so in
 * the same atomic statement as the flip. No server preview endpoint exists, so no number can be
 * shown beforehand that is guaranteed to be the one applied — and a number shown and then not
 * honoured is worse than no number (§13). The terms are rendered from the row AFTER the act, from
 * the percent the writer pinned.
 */
export const COMPONENT_CANCEL_NO_PREVIEW_NOTE =
  "What comes back is decided by the cancellation policy this booking was bought under, measured against its start date at the moment you cancel. The exact amount is shown here once the cancellation is recorded — this page will not estimate it first.";

export interface SettlementReadout {
  /** The headline: settled, or claimed-and-not-yet-settled. Never both. */
  state: "settled" | "in_progress";
  headline: string;
  /** The refund line, with the Stripe refund id when the row carries one. */
  refund: string;
  /**
   * §13 — the remainder sentence is emitted ONLY when the settlement row itself says the seller
   * kept something (`settled_amount_cents > 0`). A settlement that returned everything keeps
   * silent rather than asserting a remainder that is not there.
   */
  remainder: string | null;
}

/**
 * THE SETTLEMENT READ-OUT. Every figure is the settlement row's own PINNED amount — the ruling's
 * immutability clause: a promoted settlement is answered from its settled row and never
 * re-derived, so this module sums nothing and re-derives nothing.
 */
export function settlementReadout(row: BundleSettlementRow | null | undefined): SettlementReadout | null {
  if (!row) return null;
  const refundAmount = centsLine(row.travelerRefundCents);
  const kept = centsLine(row.settledAmountCents);
  if (!row.settled) {
    return {
      state: "in_progress",
      headline: "Settlement started, not finished",
      refund:
        refundAmount === null
          ? "A refund is being prepared. Nothing has been refunded yet."
          : `A refund of ${refundAmount} is being prepared. Nothing has been refunded yet.`,
      remainder: null,
    };
  }
  const refund =
    row.travelerRefundCents === 0
      ? "No money was refunded on this settlement — the policy this booking was bought under returned nothing for the parts that were not delivered."
      : row.stripeRefundId
        ? `Refunded ${refundAmount} to your original payment method · refund ${row.stripeRefundId}`
        : `Refunded ${refundAmount} to your original payment method`;
  return {
    state: "settled",
    headline: "Settled once, on the shares recorded when this bundle was bought",
    refund,
    remainder:
      row.settledAmountCents > 0 && kept !== null
        ? `The remainder, ${kept}, stays with the provider for the parts that were delivered.`
        : null,
  };
}

/**
 * WHICH RECORD ANSWERED (§13). A bundle bought before per-component rows existed is read from its
 * jsonb, which never held a failure and never held a price — so its components can be listed and
 * nothing else can be said about them, and the surface states that rather than showing controls
 * that the rails will refuse.
 */
export function componentSourceNote(source: string | null | undefined): string | null {
  if (source === "legacy_jsonb") {
    return "This bundle was bought before per-part records existed, so only what was included can be shown — a single part cannot be settled or cancelled here.";
  }
  return null;
}

export function componentsAreActionable(source: string | null | undefined): boolean {
  return source === "rows";
}
