/**
 * Operation Trailhead — config home for the ignition numbers (Kyoto-first DMO content build).
 *
 * §8-class discipline extended to discovery/API cost AND editorial target magnitudes: NO cap or
 * target lives as a bare literal in logic; every one lives HERE and the derivation/pre-flight read
 * it. Ratified rulings (docs/DECISIONS.md):
 *   - R-T1-b `2026-08-21-trailhead-kyoto-alone`  — Tier-2 browsable-minimum profile is config.
 *   - R-T1-c `2026-08-21-trailhead-tavily-cap`   — Tavily discovery ceiling is a HARD config cap.
 *
 * Only the decision-maker (Leon) moves these. Config-file path is excluded from the fee-literal gate
 * by design (the numbers are editorial/cost thresholds, not fee/commission rates — they never enter a
 * money decision), so they live here rather than in `fee_bands`.
 */

/**
 * R-T1-c — Tavily discovery-spend ceiling, USD per month. HARD cap, Leon-only. The T2.3 pre-flight
 * pastes actual per-query pricing arithmetic against this number before the first run; the Kyoto
 * batch is expected well under a third of it. Never read a discovery-cost threshold from anywhere else.
 */
export const TAVILY_MONTHLY_CAP_USD = 150 as const;

/**
 * Tavily per-call price assumptions used ONLY by the T2.3 pre-flight arithmetic (documentation), so the
 * dispatch cites a config number rather than a literal pasted into prose. Basic-depth search is one
 * API credit; Tavily's published list price is $0.008 / credit on the pay-as-you-go tier (1000 credits
 * = $8). Verify against the live Tavily dashboard at pre-flight time — these are the committed estimate,
 * the dashboard is the authority.
 */
export const TAVILY_PRICE_PER_SEARCH_USD = 0.008 as const;

/**
 * R-T1-b — Tier-2 browsable-minimum content profile (~26 items/market). The editorial target MAGNITUDE
 * per DMO content type for a market that has ignited to browsable-minimum. Keyed by `dmoContentTypeEnum`
 * member. Kyoto (the wedge) carries a DEEPER hand-set plan (see KYOTO_CONTENT_PLAN, ~57 items) and is
 * NOT bound by these minimums; these govern the seven staged markets. Editable here, never inline.
 *
 * Shape: attraction 8, venue 4, restaurant 6, event 4, destination 4 = 26.
 */
export const TIER2_BROWSABLE_MINIMUM: Readonly<Record<string, number>> = {
  attraction: 8,
  venue: 4,
  restaurant: 6,
  event: 4,
  destination: 4,
} as const;

/**
 * Slot-derivation strength weights — how much a template's REQ/REC/OPT requirement on a service
 * category contributes to the derived demand for the DMO content type that category crosswalks to.
 * A required slot pulls harder than an optional one. These order the browsable-minimum content types
 * by demand and surface which service categories drive each; they do NOT set target magnitudes (that
 * is TIER2_BROWSABLE_MINIMUM). Config so the weighting is tunable without touching the pure derivation.
 */
export const STRENGTH_WEIGHTS: Readonly<Record<"REQ" | "REC" | "OPT", number>> = {
  REQ: 3,
  REC: 2,
  OPT: 1,
} as const;
