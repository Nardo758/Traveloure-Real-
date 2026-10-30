/**
 * Row 292b. The provider payout block sentence.
 *
 * The amounts and the rate are the server's payout block (the admin fee band,
 * a provider override, or a stored split). This module substitutes them into
 * the approved sentence. It does not multiply a rate of its own.
 *
 * Wording approved by Leon, Oct 30, 2026, 5:54 PM ET.
 */

/** The approved sentence. Placeholders are filled from the server block. */
export const PROVIDER_PAYOUT_BLOCK_SENTENCE =
  "Traveler pays {gross} · Traveloure fee {fee} ({rate}%) · You receive {earnings} · Paid to your connected Stripe account.";

export interface ProviderPayoutBlockValues {
  gross: number;
  fee: number;
  /** What the provider keeps. The sentence calls this earnings. */
  keep: number;
  /** Platform fee as a fraction from 0 through 1. */
  rate: number;
  currency: string;
}

function money(amount: number, currency: string): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (!code) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    return null;
  }
}

/** The fraction as a percent label. 0.15 → "15", 0.085 → "8.5". Null outside 0–1. */
export function payoutBlockPercentLabel(rate: number): string | null {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  const pct = Math.round(rate * 10000) / 100;
  return Number.isFinite(pct) ? String(pct) : null;
}

/**
 * The sentence for one block, or null when any value cannot be shown.
 * Fee, earnings and the percent are the given values, never recomputed.
 */
export function providerPayoutBlockLine(
  block: ProviderPayoutBlockValues | null | undefined,
): string | null {
  if (!block) return null;
  const gross = money(block.gross, block.currency);
  const fee = money(block.fee, block.currency);
  const earnings = money(block.keep, block.currency);
  const rate = payoutBlockPercentLabel(block.rate);
  if (gross == null || fee == null || earnings == null || rate == null) return null;
  return PROVIDER_PAYOUT_BLOCK_SENTENCE
    .replace("{gross}", gross)
    .replace("{fee}", fee)
    .replace("{rate}", rate)
    .replace("{earnings}", earnings);
}

/**
 * The sentence on a banked booking only. A provisional or closed row says
 * nothing here, even when a block was resolved for it.
 */
export function providerPayoutBlockForState(
  payoutState: string,
  block: ProviderPayoutBlockValues | null | undefined,
): string | null {
  if (payoutState !== "banked") return null;
  return providerPayoutBlockLine(block);
}
