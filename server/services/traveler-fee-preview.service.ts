/**
 * THE TRAVELER SERVICE FEE, SHOWN BEFORE CHECKOUT (ledger `2026-09-27-service-fee-before-checkout`,
 * R144; decision-maker ruled Sep 27, 2026).
 *
 * A READ-ONLY, LIST-TIME preview of the ruled traveler service fee over the caller's OWN cart
 * lines. It is the `2026-09-20-quote-fee-preaccept` shape applied to the cart:
 *
 *   - ONE FEE COMPUTATION (§18 rule 1). Every line goes through the SAME
 *     `resolveTravelerServiceFeeSnapshot` the checkout charge loop calls (`payments.routes.ts`) and
 *     the quote-born arm calls — never a second formula, never a rate or cap literal (§8). The band's
 *     per-booking cap is applied by that resolver, per line, exactly as the charge applies it.
 *   - AMOUNTS ARE THE SERVER'S (§14). The caller hands in each line's subtotal as the SERVER resolved
 *     it off its own cart row (`resolveItemBaseAmount`, the same helper the charge prices with); no
 *     client number reaches this module.
 *   - NOTHING IS WRITTEN. The charge-time snapshot `POST /api/checkout` stamps on each booking row
 *     stays the record; if `fee_bands` moves between this read and the charge, the CHARGE wins and
 *     this preview never claimed otherwise — which is why every surface words it as an estimate.
 *   - §13 — NO ANSWER IS NOT "$0". When the band cannot be resolved (no active `traveler_service_fee`
 *     row, or a malformed one — `requireBand` throws), or there is no line to fee, this returns
 *     `null` and the caller OMITS the block. A waived line is stated as waived with the amount it
 *     would have been; a zero `charged` on a waived line is never presented as the fee.
 *
 * THE WAIVER BASIS IS THE CALLER'S, AND IT MUST BE THE ONE THE CHARGE WILL USE. This module takes a
 * per-line `waiverBasis` rather than deciding one, because the decision depends on what the
 * CHECKOUT that surface leads to will be told. See `GET /api/cart` for the one caller's reasoning.
 */
import {
  requireBand,
  resolveTravelerServiceFeeSnapshot,
  round2,
  type TravelerServiceFeeWaiverBasis,
} from "./fee-resolution.service";
import { TRAVELER_SERVICE_FEE_BAND } from "./fee-band-requirements";
import { logger } from "../infrastructure/logger";

export interface TravelerFeePreviewInputLine {
  /** The cart row's id. */
  cartItemId: string;
  /** The cart row's own `trip_id` (NULL = a line on no plan). Used only to group, never to price. */
  tripId: string | null;
  /** The line's base price in DOLLARS, server-resolved from the row (§14). */
  subtotal: number;
  /** What suppresses the fee on this line at the charge, or null when nothing does. */
  waiverBasis: TravelerServiceFeeWaiverBasis;
}

export interface TravelerFeePreviewLine {
  cartItemId: string;
  tripId: string | null;
  /** What the checkout will add for this line (0 when waived). */
  charged: number;
  /** The band-priced fee, resolved unconditionally — the real amount even on a waived line. */
  wouldHaveBeen: number;
  capApplied: boolean;
  waived: boolean;
  waiverBasis: TravelerServiceFeeWaiverBasis;
}

/** Totals over a set of lines — the whole cart, or one plan's lines. */
export interface TravelerFeePreviewTotals {
  chargedTotal: number;
  wouldHaveBeenTotal: number;
  lineCount: number;
  waivedLineCount: number;
  capAppliedLineCount: number;
}

export interface TravelerFeePreview extends TravelerFeePreviewTotals {
  /** Always "estimate": the charge-time snapshot is the record (see header). */
  basis: "estimate";
  /** The band's rate, as the resolver read it — for "N% of each booking" copy, never a literal. */
  rate: number;
  /** The band's per-booking cap in dollars, or null when the band sets none. */
  capPerBooking: number | null;
  lines: TravelerFeePreviewLine[];
  /**
   * The same totals grouped by the line's OWN plan (`cart_items.trip_id`), so the slip can state its
   * plan's share without summing fees on the client. A line on no plan is in no group.
   */
  byTrip: Record<string, TravelerFeePreviewTotals>;
}

function emptyTotals(): TravelerFeePreviewTotals {
  return { chargedTotal: 0, wouldHaveBeenTotal: 0, lineCount: 0, waivedLineCount: 0, capAppliedLineCount: 0 };
}

function addLine(t: TravelerFeePreviewTotals, l: TravelerFeePreviewLine): void {
  t.chargedTotal = round2(t.chargedTotal + l.charged);
  t.wouldHaveBeenTotal = round2(t.wouldHaveBeenTotal + l.wouldHaveBeen);
  t.lineCount += 1;
  if (l.waived) t.waivedLineCount += 1;
  if (l.capApplied) t.capAppliedLineCount += 1;
}

/**
 * Build the preview, or `null` when there is nothing honest to say (no lines, or the band has no
 * answer). Never throws: a preview must not fail the cart read that carries it.
 */
export async function buildTravelerFeePreview(
  lines: readonly TravelerFeePreviewInputLine[],
): Promise<TravelerFeePreview | null> {
  if (lines.length === 0) return null;
  try {
    const band = await requireBand(TRAVELER_SERVICE_FEE_BAND);
    const out: TravelerFeePreviewLine[] = [];
    for (const line of lines) {
      const snap = await resolveTravelerServiceFeeSnapshot(line.subtotal, line.waiverBasis);
      out.push({
        cartItemId: line.cartItemId,
        tripId: line.tripId,
        charged: snap.charged,
        wouldHaveBeen: snap.wouldHaveBeen,
        capApplied: snap.capApplied,
        waived: snap.waived,
        waiverBasis: snap.waiverBasis,
      });
    }
    const totals = emptyTotals();
    const byTrip: Record<string, TravelerFeePreviewTotals> = {};
    for (const l of out) {
      addLine(totals, l);
      if (l.tripId) {
        byTrip[l.tripId] ??= emptyTotals();
        addLine(byTrip[l.tripId], l);
      }
    }
    return {
      basis: "estimate",
      rate: band.rate,
      capPerBooking: band.maxAmount,
      ...totals,
      lines: out,
      byTrip,
    };
  } catch (err: any) {
    // §13: an unresolvable band is "no answer", and the block is omitted — never a $0 fee.
    logger.warn(
      { err: err?.message ?? err, band: TRAVELER_SERVICE_FEE_BAND },
      "traveler-fee-preview: band unresolvable — preview omitted",
    );
    return null;
  }
}
