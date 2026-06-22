/**
 * Commission Calculator — pure, synchronous commission math.
 *
 * Resolves the conflict between the flat 30 % checkout code and the
 * 75/25 expert-split / 4-12 % provider-tier business plan by routing each
 * payment surface through a typed BookingType enum.
 *
 * This utility is intentionally DB-free so it can be called in previews,
 * tests, and response enrichment without extra round-trips.  The DB-backed
 * `resolveCommissionRates()` in server/services/commission.ts remains the
 * canonical engine for actual charge computation; this calculator provides
 * the typed breakdown exposed in API responses.
 *
 * Rate reference (business plan §4):
 *   EXPERT_SESSION   — new expert 85/15, established 75/25
 *   PROVIDER_BOOKING — tier 1=12 %, tier 2=8 %, tier 3=6 %, tier 4=4 %
 *   EXPERIENCE_CART  — 30 % platform fee (catalog checkout surface)
 *   CREDIT_PURCHASE  — 100 % platform (deferred revenue; no payout)
 */

export enum BookingType {
  EXPERT_SESSION    = "EXPERT_SESSION",
  PROVIDER_BOOKING  = "PROVIDER_BOOKING",
  EXPERIENCE_CART   = "EXPERIENCE_CART",
  CREDIT_PURCHASE   = "CREDIT_PURCHASE",
}

export interface CommissionResult {
  platformFee: number;
  expertPayout?: number;
  providerPayout?: number;
  bookingType: BookingType;
  /** Effective platform commission rate (fraction, e.g. 0.25 = 25 %). */
  commissionRate: number;
}

/** Tier-to-platform-rate map (platform keeps this fraction; provider keeps the rest). */
const PROVIDER_TIER_RATES: Record<1 | 2 | 3 | 4, number> = {
  1: 0.12,
  2: 0.08,
  3: 0.06,
  4: 0.04,
};

/**
 * Calculate commission split for a given booking surface.
 *
 * @param subtotal    Gross booking amount in dollars.
 * @param bookingType Which payment surface this belongs to.
 * @param options     Optional modifiers (new-expert flag, provider tier).
 * @returns           Commission breakdown; all money values are rounded to cents.
 */
export function calculateCommission(
  subtotal: number,
  bookingType: BookingType,
  options?: {
    isNewExpert?: boolean;
    providerTier?: 1 | 2 | 3 | 4;
  },
): CommissionResult {
  const round = (n: number) => Math.round(n * 100) / 100;

  switch (bookingType) {
    case BookingType.EXPERT_SESSION: {
      // New expert: 85/15 split; established: 75/25 split
      const expertRate   = options?.isNewExpert ? 0.85 : 0.75;
      const platformRate = 1 - expertRate;
      return {
        platformFee:    round(subtotal * platformRate),
        expertPayout:   round(subtotal * expertRate),
        bookingType,
        commissionRate: platformRate,
      };
    }

    case BookingType.PROVIDER_BOOKING: {
      // Tier 1=12 %, Tier 2=8 %, Tier 3=6 %, Tier 4=4 %
      const tier           = options?.providerTier ?? 1;
      const commissionRate = PROVIDER_TIER_RATES[tier];
      return {
        platformFee:    round(subtotal * commissionRate),
        providerPayout: round(subtotal * (1 - commissionRate)),
        bookingType,
        commissionRate,
      };
    }

    case BookingType.EXPERIENCE_CART: {
      // 30 % platform fee — canonical checkout surface rate
      const commissionRate = 0.30;
      return {
        platformFee:   round(subtotal * commissionRate),
        bookingType,
        commissionRate,
      };
    }

    case BookingType.CREDIT_PURCHASE: {
      // Full amount is deferred revenue; no expert/provider payout
      return {
        platformFee:   round(subtotal),
        bookingType,
        commissionRate: 1,
      };
    }
  }
}
