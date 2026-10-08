/**
 * WHAT THE OPTIMIZE STEP SAYS ABOUT PAYING (ledger `2026-10-08-optimize-pay-flow`; decision-maker, Oct 8,
 * 2026 — the f413eda smoke). PURE; spelled once (§18 rule 1).
 *
 * The price is the SERVER's band-resolved quote (`GET /api/optimization-fee`, the one `OptimizerLead`
 * reads) — never a literal (§8). A run the Trip Pass covers names no price and promises no charge; a quote
 * that has not answered names no price either (§13: no number is better than a guessed one).
 */
import { formatMoneyCents, type OptimizationFeeQuote } from "./optimization-preview";

export const OPTIMIZE_PAY_LINE = "You'll pay on the next screen; nothing runs until you do.";
export const OPTIMIZE_COVERED_LINE = "Included in your Trip Pass — nothing is charged.";

/** Is there a real price to pay for this run? */
export function optimizeRunPriced(fee: OptimizationFeeQuote | null | undefined): boolean {
  return !!fee && !fee.aiDisabled && !fee.coveredByTripPass && Number.isFinite(fee.feeCents) && fee.feeCents > 0;
}

/** The dialog's line above the buttons. */
export function optimizePayLine(fee: OptimizationFeeQuote | null | undefined): string {
  return fee?.coveredByTripPass ? OPTIMIZE_COVERED_LINE : OPTIMIZE_PAY_LINE;
}

/** The confirm button: "Continue to pay <the band price>" when priced; "Generate 3 versions" when covered; else "Continue". */
export function optimizeContinueLabel(fee: OptimizationFeeQuote | null | undefined): string {
  if (fee && optimizeRunPriced(fee)) return `Continue to pay ${formatMoneyCents(fee.feeCents, fee.currency)}`;
  if (fee?.coveredByTripPass) return "Generate 3 versions";
  return "Continue";
}
