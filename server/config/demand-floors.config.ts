/**
 * Partner Demand suppression floors — the ONE config home (ledger 2026-08-17-partner-demand-phase0-rulings
 * "suppression floors 5/10/25 in config, only Leon moves them; below-floor cells render explicit
 * no_data"; 2026-08-18-partner-demand-2b). Floors are enforced in the READ path (2B.3): a rollup
 * figure whose `source_row_count` is BELOW its grain's floor renders `no_data`, never an
 * interpolated or partial number (§13). AT the floor it renders.
 *
 * These are NOT rates and NOT fees — they are small-sample suppression thresholds, so they live
 * here (not `fee_bands`) and are exempt from the fee-literal gate. Only the decision-maker moves
 * them; nothing reads a floor from a request body.
 *
 * Grain → floor mapping (the "5/10/25" tiers):
 *   • BASE  (5)  — the universal minimum for ANY demand cell to render. A figure resting on fewer
 *                  than 5 source rows is noise, suppressed everywhere.
 *   • MARKET (10) — a MARKET-level figure needs ≥10 real trips to surface. This is the same
 *                  10-floor Q9 checks and Phase 4's one-pager requires (Kyoto: 29 real, clears).
 *   • PARTNER (25) — a per-PARTNER / per-SERVICE figure needs ≥25 real source rows to render — a
 *                  higher bar, because an individually-attributable number is read as a promise.
 */

export const DEMAND_FLOORS = {
  base: 5,
  market: 10,
  partner: 25,
} as const;

export type DemandGrain = "base" | "market" | "partner";

/**
 * The ±window (in days) of the demand time axis (R20, ledger 2026-08-18-partner-demand-phase3).
 * ONE constant — shared by the read-path default date range, the trend baselines, and the funnel
 * captions — so "requested" (forward) and "missed" (past) are always measured over the same span.
 * Lives here, never as a literal in a demand path (grep-gated like the floors); only the
 * decision-maker moves it. The read defaults to [today − WINDOW, today + WINDOW]; explicit
 * `from`/`to` params narrow it but the past view can never show deeper than the rollup's own
 * history (§13 — "history since <first run>", never a fabricated full band).
 */
export const DEMAND_WINDOW_DAYS = 90;

/**
 * The floor a rollup row must clear to render, chosen by grain. A row scoped to a specific
 * partner/service (partner_id or service_id present) uses the PARTNER floor; a market-only row
 * uses the MARKET floor; anything finer-grained-unknown falls back to BASE.
 */
export function floorFor(grain: DemandGrain): number {
  return DEMAND_FLOORS[grain];
}

/** Grain of a rollup row from its scope columns: any partner/service scope ⇒ partner; else market. */
export function grainOfRow(row: { partnerId?: string | null; serviceId?: string | null }): DemandGrain {
  return row.partnerId != null || row.serviceId != null ? "partner" : "market";
}

/**
 * The READ-path suppression decision (§13). Returns true when the row clears its grain's floor and
 * may render its real value; false ⇒ the read surfaces `no_data` in its place. NEVER mutates or
 * interpolates — suppression is a render decision, the stored row is untouched.
 */
export function clearsFloor(row: {
  sourceRowCount: number;
  partnerId?: string | null;
  serviceId?: string | null;
}): boolean {
  return row.sourceRowCount >= floorFor(grainOfRow(row));
}
