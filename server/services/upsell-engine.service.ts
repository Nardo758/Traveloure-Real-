/**
 * Upsell Engine — Master Integration Brief Phase 5.1 (core; read-only, no surfaces yet).
 *
 * Single ranking authority. Every surface (cart, discover, optimize_gate, ...)
 * calls `rankCandidates(ctx, slotConfig)`; surfaces RENDER, they do NOT RANK.
 *
 * Hard rules (encoded in this file, enforced by tests):
 *   1. Display order ≠ recommendation quality.
 *      Revenue may tie-break and re-order WITHIN a relevance band, never
 *      promote a worse-fitting item above a better-fitting one.
 *   2. No hard-coded fees/weights/matrix cells. All rates come from fee_bands,
 *      all template strengths from template_category_matrix, all per-surface
 *      knobs from upsell_slot_config.
 *
 * The dominance contract (the trust guardrail):
 *   for any two candidates A, B where
 *     A.relevanceScore - B.relevanceScore > policy.bandWidth
 *   then
 *     A.finalScore > B.finalScore
 *   must hold REGARDLESS of revenue. The relevance-dominance test asserts this
 *   property over a sampled grid of scores + policies. If the test fails,
 *   the build is wrong — see §B3 of UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC.
 *
 * This file deliberately separates PURE LOGIC (no DB) from I/O so the
 * dominance test runs without a database connection.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Types (per spec §B1) ────────────────────────────────────────────────────

export type Surface =
  | "discover_location" | "discover_date"
  | "template_builder"  | "cart" | "checkout"
  | "optimize_gate"     | "plancard_pretrip" | "plancard_ontrip"
  | "expert_review"     | "ai_concierge" | "post_booking";

export interface CartItemRef {
  offeringId: string;
  categoryKey: string;
}

export interface UserProfile {
  budgetTier?: "low" | "mid" | "high";
  mobilityLevel?: "low" | "moderate" | "high";
  partySize?: number;
  familyKids?: boolean;
  familyKidsOptIn?: boolean;        // explicit opt-in for high-risk categories with kids
  interests?: string[];
  dietary?: string[];
}

export interface UpsellContext {
  surface: Surface;
  tripId?: string;
  guestSessionId?: string;
  templateKey?: string;
  location?: { lat: number; lng: number; city?: string };
  dateRange?: { start: string; end?: string };
  cartItems: CartItemRef[];
  userProfile?: UserProfile;
  expertEndorsedKeys?: string[];
  /** Neighborhood spine integration (§NEIGHBORHOOD_SPINE.5). */
  neighborhoodId?: string;
  neighborhoodIds?: string[];
  /** Phase 5.5 (step 7): set true on `checkout` to allow transport add-ons
   *  (transfer offerings) after the optimizer has computed transport legs.
   *  Has no effect on other surfaces — transport on pre-optimize surfaces
   *  remains suppressed regardless. */
  tripIsPostOptimize?: boolean;
}

export interface SlotConfig {
  surface: Surface;
  maxItems: number;
  revenueWeight: number;
  revenueCap: number;
  frequencyCapHours: number;
  enabled: boolean;
}

/** What the engine looks at when ranking a single candidate. */
export interface RankInputCandidate {
  offeringId: string;
  categoryKey: string;
  sourceType: "platform_provider" | "affiliate" | "expert_package";
  templateStrength: "REQ" | "REC" | "OPT" | null;
  riskProfile: "low" | "moderate" | "high" | "specialized" | null;
  riskOverride: "low" | "moderate" | "high" | "specialized" | null;
  requiresBackgroundCheck: boolean;
  providerHasVerifiedBadge?: boolean;       // for bg-check gate
  candidateNeighborhoodSlug?: string | null;
  expectedPlatformEarningsRaw: number;       // pre-normalization
  expertEndorsed: boolean;
  profileMatchScore: number;                 // 0..1 — caller computes (interests/dietary/etc. alignment)
  proximityFit: number;                      // 0..1 — caller computes from neighborhood/date alignment
}

export interface UpsellCandidate {
  offeringId: string;
  categoryKey: string;
  sourceType: "platform_provider" | "affiliate" | "expert_package";
  relevanceScore: number;
  revenueScore: number;
  finalScore: number;
  reason: string;
  expertEndorsed: boolean;
  rank: number;                              // 1-indexed slot order
}

/**
 * Scoring policy. Encodes the relevance-weight mix + revenue cap + the
 * "bandWidth" used by the dominance contract.
 *
 * `bandWidth` = the relevance-gap above which revenue's reordering authority
 * lapses entirely. If A has +0.20 relevance over B and bandWidth=0.15, then
 * A must finish above B regardless of revenue. Default 0.15 mirrors the
 * default revenueCap so a maximally-rich item still can't jump a full band.
 */
export interface ScoringPolicy {
  relevanceWeights: {
    templateStrength: number;
    profileMatch: number;
    proximity: number;
    expertEndorsement: number;
  };
  revenueWeight: number;
  revenueCap: number;
  bandWidth: number;
}

export const DEFAULT_POLICY: ScoringPolicy = {
  // Relevance weights sum to 1 so relevanceScore stays in [0, 1].
  relevanceWeights: {
    templateStrength: 0.40,   // w1: REQ/REC/OPT → 1.0/0.7/0.4
    profileMatch:     0.25,   // w2
    proximity:        0.20,   // w3
    expertEndorsement: 0.15,  // w4
  },
  revenueWeight: 0.15,
  revenueCap:    0.15,
  bandWidth:     0.15,
};

// ─── PURE HELPERS (no I/O — testable in isolation) ───────────────────────────

/** REQ → 1.0, REC → 0.7, OPT → 0.4, null/'—' → 0 (filtered out earlier). */
export function templateStrengthScore(strength: RankInputCandidate["templateStrength"]): number {
  if (strength === "REQ") return 1.0;
  if (strength === "REC") return 0.7;
  if (strength === "OPT") return 0.4;
  return 0;
}

/**
 * relevance = w1*templateStrength + w2*profileMatch + w3*proximityFit + w4*expertEndorsement.
 * Each weighted component must be ≤ its weight; sum is in [0,1] when weights sum to 1.
 */
export function computeRelevance(
  c: Pick<RankInputCandidate, "templateStrength" | "profileMatchScore" | "proximityFit" | "expertEndorsed">,
  weights: ScoringPolicy["relevanceWeights"],
): number {
  const tpl = templateStrengthScore(c.templateStrength);
  const endorse = c.expertEndorsed ? 1 : 0;
  return (
    weights.templateStrength * tpl +
    weights.profileMatch     * clamp01(c.profileMatchScore) +
    weights.proximity        * clamp01(c.proximityFit) +
    weights.expertEndorsement * endorse
  );
}

/**
 * Normalize platform earnings across a candidate set so revenueScore is in [0,1].
 * Max-normalization: top earner gets 1, others scale proportionally.
 * If all are 0, return 0 across the board (no revenue signal).
 */
export function normalizeRevenue(rawValues: number[]): number[] {
  const max = rawValues.reduce((m, v) => Math.max(m, v), 0);
  if (max <= 0) return rawValues.map(() => 0);
  return rawValues.map(v => Math.max(0, v) / max);
}

/**
 * Blend per the spec formula: finalScore = relevance + min(weight, cap) * revenue.
 * The cap prevents a misconfigured weight from breaking the dominance contract.
 */
export function blendScore(
  relevance: number,
  revenue: number,
  policy: Pick<ScoringPolicy, "revenueWeight" | "revenueCap">,
): number {
  const cappedWeight = Math.min(policy.revenueWeight, policy.revenueCap);
  return relevance + cappedWeight * clamp01(revenue);
}

/**
 * The dominance contract — the trust guardrail expressed as a predicate.
 * Returns true iff the contract HOLDS for the (A, B) pair under this policy.
 *
 *   If relevance(A) - relevance(B) > bandWidth,
 *     finalScore(A) MUST exceed finalScore(B), regardless of revenue.
 *
 * For the contract to hold structurally, the maximum revenue lift
 * (min(weight, cap) * 1.0) must be strictly less than bandWidth. With
 * defaults (cap=0.15, bandWidth=0.15) the lift is exactly the band edge,
 * so any A-B gap > 0.15 strictly dominates. Equal-or-less gaps are NOT
 * in the dominance zone and revenue is free to reorder.
 */
export function holdsDominance(
  a: { relevance: number; final: number },
  b: { relevance: number; final: number },
  bandWidth: number,
): boolean {
  if (a.relevance - b.relevance > bandWidth) {
    return a.final > b.final;
  }
  return true; // outside the dominance zone, revenue may reorder
}

// ─── HARD-FILTER HELPERS (also pure) ─────────────────────────────────────────

/**
 * Per §B4 / §B5: transport categories are suppressed on every surface except
 * `plancard_ontrip`. Phase 5.5: `checkout` may surface a transfer add-on if
 * AND ONLY IF the trip is post-optimize (the optimizer has computed transport
 * legs already; we know what's needed). The caller passes the post-optimize
 * flag in `options`. Without the flag, checkout suppresses transport.
 */
export function isTransportSuppressed(
  categoryKey: string,
  surface: Surface,
  options?: { tripIsPostOptimize?: boolean },
): boolean {
  const isTransport = categoryKey === "private_transportation" || categoryKey === "aff_ground_transport";
  if (!isTransport) return false;
  if (surface === "plancard_ontrip") return false;
  if (surface === "checkout" && options?.tripIsPostOptimize === true) return false;
  return true;
}

/**
 * Per §B4: high/specialized risk suppressed for low-mobility OR for family_kids
 * without explicit opt-in. riskOverride (offering-level) supersedes category default.
 */
export function isRiskSuppressed(
  riskProfile: RankInputCandidate["riskProfile"],
  riskOverride: RankInputCandidate["riskOverride"],
  profile?: UserProfile,
): boolean {
  const effective = riskOverride ?? riskProfile;
  if (effective !== "high" && effective !== "specialized") return false;
  if (profile?.mobilityLevel === "low") return true;
  if (profile?.familyKids && !profile.familyKidsOptIn) return true;
  return false;
}

/** Per §B4: bg-check categories only surface providers with verifiedBadge. */
export function isBackgroundCheckGated(
  requiresBg: boolean,
  providerVerified: boolean | undefined,
): boolean {
  return requiresBg && providerVerified !== true;
}

/** Per §B4: an offering already in the plan does not get re-pitched. */
export function isAlreadyInPlan(offeringId: string, categoryKey: string, cart: CartItemRef[]): boolean {
  return cart.some(c => c.offeringId === offeringId || c.categoryKey === categoryKey);
}

/** Template inclusion (REQ/REC/OPT); '—' (null) means the engine excludes it. */
export function isInTemplate(strength: RankInputCandidate["templateStrength"]): boolean {
  return strength === "REQ" || strength === "REC" || strength === "OPT";
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ─── MAIN PIPELINE (pure given inputs; I/O comes from the caller) ────────────

export interface PipelineResult {
  candidates: UpsellCandidate[];
  /** Anything filtered out, with the reason — useful for debug + impression negatives. */
  suppressed: Array<{ offeringId: string; reason: string }>;
}

/**
 * Run the full pipeline on a prepared candidate set + policy + slot config.
 *
 * This function is PURE: callers (Phase 5.2+ surface integrations) gather the
 * RankInputCandidates from DB (template_category_matrix + service_categories +
 * provider availability + neighborhood coverage + expert endorsement) and pass
 * them in. Keeping it pure means the dominance test runs without a DB.
 */
export function rankCandidates(
  ctx: UpsellContext,
  rawCandidates: RankInputCandidate[],
  slotConfig: SlotConfig,
  policy: ScoringPolicy = DEFAULT_POLICY,
): PipelineResult {
  if (!slotConfig.enabled) {
    return { candidates: [], suppressed: rawCandidates.map(c => ({ offeringId: c.offeringId, reason: "surface_disabled" })) };
  }

  const suppressed: PipelineResult["suppressed"] = [];
  const kept: RankInputCandidate[] = [];

  for (const c of rawCandidates) {
    // Hard filters (run before scoring per §B2).
    if (!isInTemplate(c.templateStrength)) {
      suppressed.push({ offeringId: c.offeringId, reason: "outside_template_matrix" });
      continue;
    }
    if (isAlreadyInPlan(c.offeringId, c.categoryKey, ctx.cartItems)) {
      suppressed.push({ offeringId: c.offeringId, reason: "already_in_plan" });
      continue;
    }
    if (isTransportSuppressed(c.categoryKey, ctx.surface, { tripIsPostOptimize: ctx.tripIsPostOptimize })) {
      suppressed.push({ offeringId: c.offeringId, reason: "transport_pre_optimize" });
      continue;
    }
    if (isRiskSuppressed(c.riskProfile, c.riskOverride, ctx.userProfile)) {
      suppressed.push({ offeringId: c.offeringId, reason: "risk_mobility_mismatch" });
      continue;
    }
    if (isBackgroundCheckGated(c.requiresBackgroundCheck, c.providerHasVerifiedBadge)) {
      suppressed.push({ offeringId: c.offeringId, reason: "background_check_unverified" });
      continue;
    }
    kept.push(c);
  }

  // Score: relevance per candidate, revenue normalized across the kept set.
  const relevanceArr = kept.map(c =>
    computeRelevance(
      { templateStrength: c.templateStrength, profileMatchScore: c.profileMatchScore, proximityFit: c.proximityFit, expertEndorsed: c.expertEndorsed },
      policy.relevanceWeights,
    )
  );
  const revenueArr = normalizeRevenue(kept.map(c => c.expectedPlatformEarningsRaw));

  const blendPolicy = { revenueWeight: slotConfig.revenueWeight, revenueCap: slotConfig.revenueCap };
  const scored = kept.map((c, i): UpsellCandidate => ({
    offeringId: c.offeringId,
    categoryKey: c.categoryKey,
    sourceType: c.sourceType,
    relevanceScore: relevanceArr[i],
    revenueScore: revenueArr[i],
    finalScore: blendScore(relevanceArr[i], revenueArr[i], blendPolicy),
    reason: humanReason(c, relevanceArr[i], revenueArr[i]),
    expertEndorsed: c.expertEndorsed,
    rank: 0, // assigned after sort
  }));

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const capped = scored.slice(0, slotConfig.maxItems).map((c, i) => ({ ...c, rank: i + 1 }));

  return { candidates: capped, suppressed };
}

function humanReason(c: RankInputCandidate, relevance: number, revenue: number): string {
  const bits: string[] = [];
  if (c.templateStrength === "REQ") bits.push("required for this trip type");
  else if (c.templateStrength === "REC") bits.push("recommended for this trip type");
  if (c.expertEndorsed) bits.push("expert-endorsed");
  if (c.proximityFit >= 0.7) bits.push("matches your neighborhood / dates");
  if (revenue > 0.5 && relevance > 0.5) bits.push("popular pick");
  return bits.length > 0 ? bits.join(" · ") : "suggested";
}

// ─── DB I/O (thin wrappers; surfaces in Phase 5.2 wire these up) ─────────────

export async function getSlotConfig(surface: Surface): Promise<SlotConfig | null> {
  try {
    const result = await db.execute(sql`
      SELECT surface, max_items, CAST(revenue_weight AS FLOAT) AS revenue_weight,
             CAST(revenue_cap AS FLOAT) AS revenue_cap,
             frequency_cap_hours, enabled
      FROM upsell_slot_config
      WHERE surface = ${surface}
      LIMIT 1
    `);
    const row = result.rows?.[0] as any;
    if (!row) return null;
    return {
      surface: row.surface,
      maxItems: row.max_items,
      revenueWeight: Number(row.revenue_weight),
      revenueCap: Number(row.revenue_cap),
      frequencyCapHours: row.frequency_cap_hours,
      enabled: row.enabled,
    };
  } catch {
    return null;
  }
}

/**
 * Log impressions for every candidate the engine returned for a render.
 * Fire-and-forget — log failure must not block the render path.
 */
export async function logImpressions(
  ctx: UpsellContext,
  candidates: UpsellCandidate[],
): Promise<void> {
  if (candidates.length === 0) return;
  try {
    for (const c of candidates) {
      await db.execute(sql`
        INSERT INTO upsell_impressions
          (trip_id, guest_session_id, surface, offering_id, category_key, source_type,
           relevance_score, revenue_score, final_score, rank_position)
        VALUES (
          ${ctx.tripId ?? null}, ${ctx.guestSessionId ?? null}, ${ctx.surface},
          ${c.offeringId}, ${c.categoryKey}, ${c.sourceType},
          ${c.relevanceScore}, ${c.revenueScore}, ${c.finalScore}, ${c.rank}
        )
      `);
    }
  } catch (err) {
    console.error("[upsell-engine] impression log failed (non-fatal):", err);
  }
}
