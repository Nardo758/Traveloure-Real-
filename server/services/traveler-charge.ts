/**
 * traveler-charge.ts — THE ONE composition of what the TRAVELER pays.
 *
 * Ruling: `docs/ROADMAP.md` §A A3, accepted — ledger `2026-09-08-cart-fee-line`.
 *
 *   The traveler pays: the PRICE, the ruled TRAVELER SERVICE FEE, the CONCIERGE fee where it
 *   applies, and REAL SURCHARGES. The provider's COMMISSION is a DEDUCTION FROM THE PAYOUT and is
 *   never a line added to the buyer.
 *
 * THE DEFECT THIS CLOSES. `service_bookings.platform_fee` is the provider's WITHHELD share
 * (`platform_fee = price − price × ownerShareRate`, + insurance, + concierge), and the cart charge
 * added that same number to the traveler's bill — so the platform collected the commission TWICE,
 * once withheld from the payout and once billed to the buyer, with the ruled traveler service fee
 * on top. `GET /api/cart` and `GET /api/cart/fee-preview` quoted the same line, so the surfaces
 * agreed with each other and all three were wrong.
 *
 * WHY IT IS ONE MODULE (§18 rule 1). Five places derived "what does/did the traveler pay": the
 * checkout charge, the same-key re-drive, the reconciliation job's expected charge, the refund's
 * charged amount and the cancellation quote — in three DIFFERENT formulas. A second copy of this
 * arithmetic is exactly how a refund starts paying back a commission the traveler never paid.
 *
 * §8: no rate and no cap is resolved here. Every rate still comes from `fee_bands` through
 * `resolveCommissionRates` / `pickOwnerShareRate` / `resolveTravelerServiceFee`; this module only
 * adds up amounts those resolvers already produced.
 * §14: nothing here reads a request. Callers pass server-derived amounts only.
 * §15: this module writes nothing, calls nothing and holds no claim. The idempotency keys, the
 * atomic claim, `promotePaidCheckout`, the TTL sweep and the drift job are untouched by it.
 */

/** Cents-precision rounding — the same `Math.round(x * 100) / 100` every money surface here uses. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The terms of a traveler's total. Every one is server-derived by its own existing resolver;
 * the provider's commission is deliberately NOT a term and has no parameter here — there is no
 * way to pass it in, which is the point.
 */
export interface TravelerChargeParts {
  /** Σ line price. On a CLAIMED row this is `total_amount`, which already folds the surcharge in,
   *  so a caller reading claimed rows passes an EMPTY surcharge term or it would be counted twice. */
  subtotal: number;
  /** Booking-concierge facilitation fee. Charged ON TOP and NOT withheld from the provider
   *  (`netExpertEarnings` never subtracts it), so it is genuinely the buyer's. */
  conciergeFee: number;
  /** Provider pass-through travel surcharge (ruling 81). The provider keeps 100%. */
  surchargeTotal: number;
  /** The ruled traveler service fee ACTUALLY charged — 0 on a covered (rails / Trip Pass) line. */
  travelerFee: number;
}

/** The traveler's total. The one composition; every quote and charge surface calls it. */
export function composeTravelerCharge(parts: TravelerChargeParts): number {
  return round2(
    num(parts.subtotal) + num(parts.conciergeFee) + num(parts.surchargeTotal) + num(parts.travelerFee),
  );
}

/**
 * The booking_details key a checkout claim stamps so a row SAYS which composition priced it.
 * Its PRESENCE is the discriminator (§13): a row without it was charged under the pre-A3
 * composition and must be read back that way, never re-derived as if it had been fixed. There is
 * no backfill — inventing a concierge portion for a historical row would manufacture a fact.
 */
export const TRAVELER_CHARGE_SNAPSHOT_KEY = "travelerCharge";

export type TravelerRowChargeBasis = "a3_snapshot" | "pre_a3_legacy";

export interface TravelerRowChargeFacts {
  /** `service_bookings.total_amount` — price (+ travel surcharge). Provider-facing. */
  totalAmount: string | number | null;
  /** `service_bookings.platform_fee` — the WITHHELD share (commission + insurance + concierge).
   *  Read ONLY on the legacy branch, where it did ride the charge. */
  platformFee: string | number | null;
  /** `booking_details.travelerCharge.conciergeFee` — null ⇒ pre-A3 row (see the key doc). */
  conciergeFeeSnapshot: string | number | null;
  /** `service_bookings.insurance_fee`. Passed ONLY by the callers that historically added it on
   *  top of `platform_fee` (refund / cancellation quote), so their PRE-A3 answer stays
   *  byte-identical. It is never added on the A3 branch: insurance is withheld from the payout,
   *  so the traveler never paid it. */
  insuranceFee?: string | number | null;
}

/**
 * What the traveler was charged for ONE claimed booking row, EXCLUDING the traveler service fee —
 * that lives in `booking_details.travelerServiceFee.charged` and is added by the callers that
 * need it (the reconciliation job and the re-drive) or refunded separately (the refund path).
 */
export function travelerChargeForRow(
  facts: TravelerRowChargeFacts,
): { amount: number; basis: TravelerRowChargeBasis } {
  if (facts.conciergeFeeSnapshot != null) {
    // A3: price (+ surcharge, already in total_amount) + the concierge fee. The commission and the
    // insurance stay where they belong — withheld from the payout, never billed.
    return {
      amount: round2(num(facts.totalAmount) + num(facts.conciergeFeeSnapshot)),
      basis: "a3_snapshot",
    };
  }
  // PRE-A3: this row really was charged its own platform_fee, so that is what it is reconciled and
  // refunded against. Stated, never guessed (§13) — reading a legacy row the new way would
  // manufacture a drift exception on every historical booking and under-refund every one of them.
  return {
    amount: round2(num(facts.totalAmount) + num(facts.platformFee) + num(facts.insuranceFee)),
    basis: "pre_a3_legacy",
  };
}
