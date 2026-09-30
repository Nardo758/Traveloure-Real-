/**
 * OPTIMIZER RUN RECORDS — the value sets (Track A step A9; product map §N2; migration 336; ledger
 * `2026-09-30-a9-run-records`). Stated ONCE here (§18 rule 1); the DB carries no CHECK.
 */
export const OPTIMIZER_RUN_BASES = ["paid", "trip_pass", "free_rerun"] as const;
export type OptimizerRunBasis = (typeof OPTIMIZER_RUN_BASES)[number];

/** `booking_created` is ruled (§N2) but has no writer yet: an item does not record which variant item it came from. */
export const RUN_OUTCOME_KINDS = ["adopted_whole", "adopted_part", "option_chosen", "booking_created"] as const;
export type RunOutcomeKind = (typeof RUN_OUTCOME_KINDS)[number];

/** What "Your optimized plans" says paid for a run — the basis, never an amount (§13). */
export function runBasisLabel(basis: string | null | undefined): string | null {
  if (basis === "paid") return "Paid run";
  if (basis === "trip_pass") return "Included in your Trip Pass";
  if (basis === "free_rerun") return "Free re-run";
  return null;
}
