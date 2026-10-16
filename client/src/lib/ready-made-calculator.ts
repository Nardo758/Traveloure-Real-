// LW-1g (ledger `2026-10-16-lw1g-earn-calculator`; hand-off Part A "/earn Ready-Made Trip calculator" and F2 2b):
// the /earn Ready-Made calculator's arithmetic and words. Client-only: nothing is stored or sent.
//
//   - The rate is the platform take the purchase path charges (`readyMadePlatformRate` from
//     /api/fee-policies/keep-rates), never a number typed here (§8). No usable rate ⇒ no calculator.
//   - Both boxes start EMPTY and nothing is suggested; a box that is empty or not a number shows NOTHING —
//     never $0, never a guess.
//   - The words are Marketing's, exact. No "typical", "average", "top experts", "passive income" or "make $X".
import { platformTakePercent } from "./fee-keep-copy";
import { OPERATING_MARKETS } from "@shared/operating-markets";

export const RM_CALC_HEADING = "Write it once, sell it again and again.";
export const RM_CALC_PRICE_LABEL = "Your price (USD)";
export const RM_CALC_SALES_LABEL = "Your guess: sales per month";
export const RM_CALC_ESTIMATE_LABEL = "Your estimate, based on the numbers you entered. Not a prediction.";
export const rmCalcKeepLine = (amount: string) => `You keep ${amount} per sale`;
export const rmCalcMonthLine = (amount: string) => `At your guess: ${amount} a month`;

/** A positive amount in USD from a typed box (digits, one optional decimal point, up to 2 decimals), else null. */
export function parsePrice(input: string): number | null {
  const v = input.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

/** A whole number of sales (0 or more) from a typed box, else null. */
export function parseSales(input: string): number | null {
  const v = input.trim();
  if (!/^\d{1,6}$/.test(v)) return null;
  return Number(v);
}

/** The usable platform take (a fraction in [0, 1)), else null — the same test the keep-N% copy applies. */
export function usableRate(rate: number | null | undefined): number | null {
  return platformTakePercent(rate) === null ? null : Number(rate);
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The two result lines, each present only when its inputs are numbers; cents are rounded once, per sale. */
export function readyMadeEstimate(
  priceInput: string,
  salesInput: string,
  rate: number | null | undefined,
): { keepLine: string | null; monthLine: string | null } {
  const r = usableRate(rate);
  const price = parsePrice(priceInput);
  if (r === null || price === null) return { keepLine: null, monthLine: null };
  const keepCents = Math.round(price * 100 * (1 - r));
  const sales = parseSales(salesInput);
  return {
    keepLine: rmCalcKeepLine(formatUsd(keepCents / 100)),
    monthLine: sales === null ? null : rmCalcMonthLine(formatUsd((keepCents * sales) / 100)),
  };
}

/**
 * True when the launch market has at least one Ready-Made Trip on sale (else the calculator is hidden). A listing's
 * `market` is matched to the launch market's slug or its operating-market city name, case-insensitively; no launch
 * market, no feed or no match ⇒ false.
 */
export function marketHasReadyMade(
  listings: readonly { market?: string | null }[] | null | undefined,
  launchMarketSlug: string | null | undefined,
): boolean {
  if (!listings || !launchMarketSlug) return false;
  const cityName = OPERATING_MARKETS.find((m) => m.marketKey === launchMarketSlug)?.cityName ?? "";
  const names = new Set([launchMarketSlug.toLowerCase(), cityName.toLowerCase()].filter(Boolean));
  return listings.some((l) => typeof l.market === "string" && names.has(l.market.trim().toLowerCase()));
}
