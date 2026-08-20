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
 *
 * R29 — the floor also distinguishes METRIC CLASS (ledger 2026-08-20-partner-demand-floor-class).
 *   • DERIVED statistics (funnels, rates, benchmarks, averages) — a small sample makes the STATISTIC
 *     unreliable, so they keep the R27 tiers unchanged: own-book 5 / cross-partner 10 / sold 25.
 *   • ENUMERABLE demand events (unmet COUNTS and SUMS: slip $, stay nights, request counts) shown to a
 *     partner FOR THEIR OWN DECLARED MARKET — three real requests is three real requests, not a shaky
 *     estimate — get a lower own-book display tier of 3, WITH mandatory low-n labeling ("early signal")
 *     so the thinness is stated, never hidden. Below 3 ⇒ existing suppression. Cross-partner and sold
 *     tiers are UNCHANGED for every class (a figure shown to someone other than its subject keeps the
 *     higher bar). The class is chosen by the METRIC; the tier is still chosen by the AUDIENCE — one
 *     implementation, tiers in config, zero literals in the read path.
 */

export const DEMAND_FLOORS = {
  ownBook: 5,             // own-book DERIVED statistics (R27)
  ownBookEnumerable: 3,   // R29 — own-book ENUMERABLE demand events (counts/sums), with low-n labeling
  crossPartner: 10,
  sold: 25,
} as const;

/** Who is reading the figure — the tier selector (R27). */
export type DemandAudience = "own_book" | "cross_partner" | "sold";

/**
 * The metric's CLASS (R29). "enumerable" = a raw demand COUNT or SUM (slip $, stay trips/nights,
 * request counts) — three real events are three real events. "derived" = a STATISTIC computed over the
 * sample (funnel, rate, benchmark, average) — thin samples make the statistic unreliable, so it keeps
 * the higher bar. Default "derived" is the SAFE bar for an unclassified metric.
 */
export type DemandMetricClass = "enumerable" | "derived";

/** metric-name → class (R29). The ONE classification map; extend here, never inline. */
const METRIC_CLASS: Readonly<Record<string, DemandMetricClass>> = {
  unmet_demand_slip: "enumerable",
  unmet_demand_stay: "enumerable",
  slip_funnel: "derived",
};
export function metricClassOf(metric: string): DemandMetricClass {
  return METRIC_CLASS[metric] ?? "derived";
}

const AUDIENCE_TIER: Record<DemandAudience, number> = {
  own_book: DEMAND_FLOORS.ownBook,
  cross_partner: DEMAND_FLOORS.crossPartner,
  sold: DEMAND_FLOORS.sold,
};

/**
 * The floor a figure must clear to render, chosen by the READER's relationship to it (R27) AND the
 * metric's class (R29). Only the own-book ENUMERABLE combination gets the lowered tier; every other
 * (audience, class) pair keeps its R27 tier. Default class "derived" preserves the pre-R29 behavior.
 */
export function floorForScope(audience: DemandAudience, metricClass: DemandMetricClass = "derived"): number {
  if (audience === "own_book" && metricClass === "enumerable") return DEMAND_FLOORS.ownBookEnumerable;
  return AUDIENCE_TIER[audience];
}

/**
 * The READ-path suppression decision (§13). True when the row clears its audience+class floor and may
 * render its real value; false ⇒ the read surfaces `no_data`. NEVER mutates or interpolates —
 * suppression is a render decision, the stored row is untouched. The cell's grain (market vs
 * per-service) is IRRELEVANT to the floor; only the audience (R27) and metric class (R29) are.
 */
export function clearsFloor(
  sourceRowCount: number,
  audience: DemandAudience,
  metricClass: DemandMetricClass = "derived",
): boolean {
  return sourceRowCount >= floorForScope(audience, metricClass);
}

/**
 * R29 low-n band: a figure that CLEARS its (lowered) floor but sits BELOW the standard own-book tier
 * (5) is real-but-thin — it renders WITH an "early signal" label distinct from the standard show-the-N
 * line, never silently as if it were a full sample. Only own-book enumerable figures can be low-n
 * (they are the only ones with a lowered floor); everything else is never low-n by construction.
 */
export function isLowNSignal(
  sourceRowCount: number,
  audience: DemandAudience,
  metricClass: DemandMetricClass,
): boolean {
  return (
    audience === "own_book" &&
    metricClass === "enumerable" &&
    sourceRowCount >= DEMAND_FLOORS.ownBookEnumerable &&
    sourceRowCount < DEMAND_FLOORS.ownBook
  );
}

/**
 * The ±window (in days) of the demand time axis (R20, ledger 2026-08-18-partner-demand-phase3).
 * ONE constant — shared by the read-path default date range, the trend baselines, and the funnel
 * captions — so "requested" (forward) and "missed" (past) are always measured over the same span.
 * Lives here, never as a literal in a demand path (grep-gated like the floors); only the
 * decision-maker moves it.
 */
export const DEMAND_WINDOW_DAYS = 90;

/**
 * R34 (ledger 2026-08-20-partner-demand-onepager-trend-lock) — the minimum weeks of computed daily
 * rollup history a market must have before a "demand trending" visual/claim may join the recruitment
 * one-pager. Below this, there is NO trend block, NO slope language, NO "early trajectory" softening —
 * a slope drawn from a few weeks of data is fabrication in time-series form (the floors' logic applied
 * to trends). The unlock is automatic as history accrues nightly; the threshold moves ONLY by the
 * decision-maker. Lives here (config), never as a literal in a demand/onepager path — grep-gated like
 * the floors and the window.
 */
export const TREND_MIN_WEEKS = 10;
