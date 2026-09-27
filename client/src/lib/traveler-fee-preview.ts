/**
 * THE TRAVELER SERVICE FEE, SHOWN BEFORE CHECKOUT — the ONE wording/omission rule both surfaces read
 * (ledger `2026-09-27-service-fee-before-checkout`, R144; §18 rule 1).
 *
 * The figure is the SERVER's (`GET /api/cart` → `travelerFeePreview`, resolved through the same
 * `resolveTravelerServiceFeeSnapshot` the charge calls). Nothing here computes a fee, a rate or a
 * cap; this module only decides WHETHER a line is drawn and WHAT it says:
 *
 *   - no block, an empty block, or a zero fee that nothing waived ⇒ NO LINE (§13 — "we have no
 *     answer" and "$0" are different facts, and only the band can say the second).
 *   - every line waived ⇒ the fee is stated as COVERED, naming what it would have been — never "$0"
 *     presented as the fee.
 *   - otherwise ⇒ the amount, worded as an ESTIMATE finalized at checkout (the checkout's own
 *     snapshot is what is billed, and a referral-link waiver can only lower it).
 */

/** The shape of the server's totals (the whole cart, or one plan's `byTrip` entry). */
export interface TravelerFeePreviewTotals {
  chargedTotal: number;
  wouldHaveBeenTotal: number;
  lineCount: number;
  waivedLineCount: number;
  capAppliedLineCount: number;
}

/** The `travelerFeePreview` block `GET /api/cart` carries (omitted when the server has no answer). */
export interface TravelerFeePreviewBlock extends TravelerFeePreviewTotals {
  basis: "estimate";
  rate: number;
  capPerBooking: number | null;
  byTrip: Record<string, TravelerFeePreviewTotals>;
}

export const TRAVELER_FEE_PREVIEW_LABEL = "Service fee (estimate)";
export const TRAVELER_FEE_PREVIEW_FINAL_NOTE = "Finalized at checkout.";
export const TRAVELER_FEE_PREVIEW_COVERED_NOTE = "Covered by Trip Pass.";

export type TravelerFeePreviewDisplay =
  | {
      kind: "charged";
      label: string;
      /** Dollars — what the checkout will add, per the server. */
      amount: number;
      /** A sentence under the amount (estimate wording; cap / partial-cover notes when true). */
      note: string;
    }
  | {
      kind: "covered";
      label: string;
      /** Dollars — the fee the pass covers; shown struck through, never as the fee charged. */
      wouldHaveBeen: number;
      note: string;
    };

/**
 * Decide the fee line for a set of server totals. `null` ⇒ draw nothing.
 * `formatMoney` is the surface's own formatter (the cart converts currency; the slip does not).
 */
export function travelerFeePreviewDisplay(
  totals: TravelerFeePreviewTotals | null | undefined,
  formatMoney: (usd: number) => string = (usd) => `$${usd.toFixed(2)}`,
): TravelerFeePreviewDisplay | null {
  if (!totals || !(totals.lineCount > 0)) return null;
  const charged = Number(totals.chargedTotal);
  const would = Number(totals.wouldHaveBeenTotal);
  if (!Number.isFinite(charged) || !Number.isFinite(would)) return null;

  const allWaived = totals.waivedLineCount === totals.lineCount;
  if (allWaived) {
    // A covered fee of nothing is still nothing to say.
    if (!(would > 0)) return null;
    return {
      kind: "covered",
      label: TRAVELER_FEE_PREVIEW_LABEL,
      wouldHaveBeen: would,
      note: TRAVELER_FEE_PREVIEW_COVERED_NOTE,
    };
  }

  if (!(charged > 0)) return null;
  const parts: string[] = [];
  if (totals.waivedLineCount > 0) {
    const covered = Math.max(0, would - charged);
    parts.push(`${formatMoney(covered)} covered by Trip Pass.`);
  }
  if (totals.capAppliedLineCount > 0) parts.push("Includes the per-booking cap.");
  parts.push(TRAVELER_FEE_PREVIEW_FINAL_NOTE);
  return { kind: "charged", label: TRAVELER_FEE_PREVIEW_LABEL, amount: charged, note: parts.join(" ") };
}

/** The amount a surface adds to its displayed total for this line (0 when none is drawn / covered). */
export function travelerFeePreviewAddend(display: TravelerFeePreviewDisplay | null): number {
  return display && display.kind === "charged" ? display.amount : 0;
}
