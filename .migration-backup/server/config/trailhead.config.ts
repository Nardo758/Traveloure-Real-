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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Operation Trailhead LANE T3 — resolution-waterfall thresholds (R-T3-b: high-confidence ONLY).
//
// R-T3-b is the money-safety ruling of this lane: a wrong match books a traveler into the WRONG
// VENUE. A match therefore requires name similarity AND geo proximity AND category agreement — ALL
// three — every threshold config here (never a bare literal; §8-class discipline, config-file
// excluded from the fee gate by design — these are editorial/geo thresholds, never a money rate).
// Defaults are deliberately CONSERVATIVE (favor a missed match that stays 'external' over a wrong
// match that mis-books). The T3.6 first-pass HARD STOP puts every match past Leon before render
// consumes them (R-T3-e), so these are the STARTING thresholds the sitting tunes, not the last word.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * R-T3-b geo gate: the MAXIMUM straight-line (haversine) distance, in km, between a stub's coordinate
 * and a provider service's confirmed pin for the two to be the same place. 0.75 km ≈ same-venue
 * tolerance that absorbs geocoder drift between two independently-geocoded points, while still
 * rejecting two same-named venues in different neighborhoods (the classic wrong-venue error). A stub
 * OR a service with no coordinate can never clear this gate — geo is a REQUIRED leg, so an unlocated
 * candidate stays 'external' (§13: never guess a location onto the map, never onto a booking path).
 * HUMAN-VERIFY at the T2.4 sitting: too loose books the wrong nearby venue; too tight drops real
 * matches whose two geocodes disagree by a block.
 */
export const PROVIDER_MATCH_MAX_KM = 0.75 as const;

/**
 * R-T3-b name gate: the MINIMUM name-similarity score (0..1) for a stub name and a provider service
 * name to be treated as the same operator. The similarity is a deterministic token-set Jaccard with an
 * exact-normalized shortcut (NO LLM, no fuzzy embedding — R-T3-b bars guess-matching from the
 * resolution path). 0.72 is high on purpose: it clears clear reorderings/possessives
 * ("Kyoto Kimono Tea Ceremony" ~ "Tea Ceremony Kyoto Kimono") but rejects a shared-token coincidence
 * ("Fushimi Inari Shrine" vs "Fushimi Inari Taisha" scores 0.5 → miss → stays external, the safe
 * outcome). HUMAN-VERIFY at the sitting against the real Kyoto name pairs.
 */
export const PROVIDER_MATCH_MIN_NAME_SIMILARITY = 0.72 as const;

/**
 * Composite-confidence WEIGHTS. The stored match_confidence is a transparent weighted mean of the two
 * continuous evidence legs (name similarity + geo closeness, where geo closeness = 1 - dist/maxKm),
 * gated behind the boolean category-agreement leg (which contributes nothing continuous — it is a
 * hard AND, not a soft weight). Name is weighted higher than geo because two distinct venues can sit
 * within 0.75 km but rarely share a ≥0.72-similar name. Weights are a reporting/tuning knob, not a
 * gate — a candidate that fails any of the three hard gates is rejected regardless of composite.
 */
export const PROVIDER_MATCH_CONFIDENCE_WEIGHTS: Readonly<Record<"name" | "geo", number>> = {
  name: 0.65,
  geo: 0.35,
} as const;

/**
 * R-T3-a/T0 affiliate program registry. EVERY program is born `enabled: false` — T0 (the affiliate
 * scope-fill) self-unlocks a program by flipping its flag here, at which point the next resolution
 * pass can produce affiliate resolutions for it (R-T3-c re-runnable). Until then the affiliate matcher
 * returns no resolution and a stub that would have matched stays 'external' (proven by test).
 *   • rung           — 'affiliate_direct' (operator's own program) or 'affiliate_ota' (marketplace).
 *   • hasCatalog     — true when the program exposes a searchable product catalog we can product-match
 *                      against (R-T3-b product-level match); false ⇒ program-level link only
 *                      ("book on <program>"), never a fabricated product deep-link.
 *   • linkBuilderKey — which server-side deep-link builder in affiliate.service.ts mints the URL
 *                      (MIRRORS the existing Travelpayouts/partner builders — no new link mechanics,
 *                      no client-held URL; §16). NULL for a program with no builder wired yet.
 * The Klook/Tiqets/Civitatis rows carry no builder yet (linkBuilderKey null) — wiring them is a T0
 * task, not this inert lane's; they are listed so the registry is complete and disabled-by-default.
 */
export interface AffiliateProgramConfig {
  readonly key: string;
  readonly displayName: string;
  readonly rung: "affiliate_direct" | "affiliate_ota";
  readonly enabled: boolean;
  readonly hasCatalog: boolean;
  readonly linkBuilderKey: string | null;
}

/**
 * Geo-closeness value assigned to an affiliate CATALOG product match whose geo could not be
 * corroborated (the product feed row carries no coordinate). It is deliberately mid-scale so an
 * uncorroborated-geo product can never score as high as a fully name-AND-geo-corroborated one, without
 * dropping the match entirely (a recognized-catalog OTA product matched on a strong name is still a
 * legitimate, non-mis-booking resolution — it lands on that product page, not a wrong venue).
 */
export const AFFILIATE_UNCORROBORATED_GEO_CLOSENESS = 0.5 as const;

export const AFFILIATE_PROGRAMS: Readonly<Record<string, AffiliateProgramConfig>> = {
  viator: { key: "viator", displayName: "Viator", rung: "affiliate_ota", enabled: false, hasCatalog: true, linkBuilderKey: "viator" },
  getyourguide: { key: "getyourguide", displayName: "GetYourGuide", rung: "affiliate_ota", enabled: false, hasCatalog: true, linkBuilderKey: "getyourguide" },
  klook: { key: "klook", displayName: "Klook", rung: "affiliate_ota", enabled: false, hasCatalog: true, linkBuilderKey: null },
  tiqets: { key: "tiqets", displayName: "Tiqets", rung: "affiliate_ota", enabled: false, hasCatalog: true, linkBuilderKey: null },
  civitatis: { key: "civitatis", displayName: "Civitatis", rung: "affiliate_ota", enabled: false, hasCatalog: false, linkBuilderKey: null },
} as const;
