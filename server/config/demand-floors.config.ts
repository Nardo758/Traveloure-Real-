/**
 * Partner Demand suppression floors — the ONE config home (ledger 2026-08-17-partner-demand-phase0-rulings;
 * 2026-08-18-partner-demand-2b; corrected by R27 `2026-08-18-partner-demand-floor-scope`). Floors are
 * enforced in the READ path: a rollup figure whose `source_row_count` is BELOW its tier's floor
 * renders `no_data`, never an interpolated or partial number (§13). AT the floor it renders.
 *
 * R27 — the floor keys on AUDIENCE SCOPE, not cell grain. The three tiers were always:
 *   • OWN-BOOK      (5)  — a figure shown to the party it is ABOUT (a partner viewing their own
 *                          market / their own listing). The lowest bar: it is their own book.
 *   • CROSS-PARTNER (10) — a figure shown to someone OTHER than its subject, or a public/recruitment
 *                          surface (admin cross-partner views; the one-pager). Q9's 10-floor lives here.
 *   • SOLD          (25) — a figure in a SOLD dataset. The highest bar. Nothing renders it today.
 * The tier is chosen by WHO is reading (`floorForScope(audience)`), NEVER by how fine the cell is —
 * a per-service cell shown to its OWNING partner is own-book (5); the SAME cell in an admin
 * cross-partner view is cross-partner (10). ONE implementation; no per-surface floor logic.
 *
 * These are NOT rates and NOT fees — they are small-sample suppression thresholds, so they live here
 * (not `fee_bands`) and are exempt from the fee-literal gate. Only the decision-maker moves them.
 */

export const DEMAND_FLOORS = {
  ownBook: 5,
  crossPartner: 10,
  sold: 25,
} as const;

/** Who is reading the figure — the tier selector (R27). */
export type DemandAudience = "own_book" | "cross_partner" | "sold";

const AUDIENCE_TIER: Record<DemandAudience, number> = {
  own_book: DEMAND_FLOORS.ownBook,
  cross_partner: DEMAND_FLOORS.crossPartner,
  sold: DEMAND_FLOORS.sold,
};

/** The floor a figure must clear to render, chosen by the READER's relationship to it (R27). */
export function floorForScope(audience: DemandAudience): number {
  return AUDIENCE_TIER[audience];
}

/**
 * The READ-path suppression decision (§13). True when the row clears its audience's floor and may
 * render its real value; false ⇒ the read surfaces `no_data`. NEVER mutates or interpolates —
 * suppression is a render decision, the stored row is untouched. The cell's grain (market vs
 * per-service) is IRRELEVANT to the floor; only the audience is (R27).
 */
export function clearsFloor(sourceRowCount: number, audience: DemandAudience): boolean {
  return sourceRowCount >= floorForScope(audience);
}

/**
 * The ±window (in days) of the demand time axis (R20, ledger 2026-08-18-partner-demand-phase3).
 * ONE constant — shared by the read-path default date range, the trend baselines, and the funnel
 * captions — so "requested" (forward) and "missed" (past) are always measured over the same span.
 * Lives here, never as a literal in a demand path (grep-gated like the floors); only the
 * decision-maker moves it.
 */
export const DEMAND_WINDOW_DAYS = 90;
