/**
 * Upsell Engine — Phase 5.2 (cart + discover surfaces).
 *
 * Step 4 of the Master Integration Brief §B8. Three surfaces wire to the
 * pure ranking engine from Phase 5.1:
 *   • POST /api/upsell/cart                — highest-intent, revenueCap stays default
 *   • POST /api/upsell/discover-location   — neighborhood-focused browse
 *   • POST /api/upsell/discover-date       — date-range filtered (HARD filter, not weight)
 *
 * All three follow the same shape:
 *   1. Validate input + load slot_config for the surface.
 *   2. Gather candidates from service_offering_types × service_categories ×
 *      template_category_matrix × neighborhood coverage / expert endorsement.
 *   3. Pass through rankCandidates() — the pure pipeline applies the hard
 *      filters (transport pre-optimize, risk × mobility, bg-check, in-plan,
 *      not-in-template) and the scoring/blend/cap.
 *   4. Log impressions for whatever made it to the rendered slate.
 *
 * Candidate display name comes from service_offering_types.display_name so
 * Discover surfaces render "Tea Ceremony Host," not "activity_provider"
 * (per WAYS_TO_EARN_SERVICE_CATALOG.md placement + the EXPERT_OFFERING
 * mirror catalog rule).
 */

import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  rankCandidates,
  getSlotConfig,
  logImpressions,
  DEFAULT_POLICY,
  type Surface,
  type UpsellContext,
  type CartItemRef,
  type RankInputCandidate,
  type UserProfile,
} from "../services/upsell-engine.service";

const router = Router();

// ─── Input shapes ────────────────────────────────────────────────────────────

const cartItemSchema = z.object({
  offeringId: z.string(),
  categoryKey: z.string(),
});

const userProfileSchema = z.object({
  budgetTier: z.enum(["low", "mid", "high"]).optional(),
  mobilityLevel: z.enum(["low", "moderate", "high"]).optional(),
  partySize: z.number().int().min(1).optional(),
  familyKids: z.boolean().optional(),
  familyKidsOptIn: z.boolean().optional(),
  interests: z.array(z.string()).optional(),
  dietary: z.array(z.string()).optional(),
}).optional();

const cartBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
});

const discoverLocationBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  neighborhoodId: z.string(),                   // required: discover_location is neighborhood-focused
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  expertEndorsedKeys: z.array(z.string()).optional(),
});

const discoverDateBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  city: z.string(),                              // market scope
  dateRange: z.object({
    start: z.string(),                           // ISO date
    end: z.string().optional(),
  }),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  expertEndorsedKeys: z.array(z.string()).optional(),
});

// ─── Candidate gathering ─────────────────────────────────────────────────────

/**
 * Build a RankInputCandidate set from service_offering_types joined to their
 * categoryKey row in service_categories + the template matrix row + the
 * neighborhood/lead endorsement signal.
 *
 * This is intentionally conservative for Phase 5.2 — it gathers offering-type
 * candidates without requiring a fully booked provider inventory row. Phase
 * 5.3+ surfaces will add provider_services availability gating where it makes
 * sense (e.g., date-range availability on discover_date).
 */
/**
 * Resolve the effective template key for a candidate-gather call.
 * Public discover surfaces pass no template; rather than silently filter
 * everything out (every category lookup would null), we default to 'travel'.
 * This means discover surfaces match against the 14 travel-template
 * categories. Callers that genuinely want a different template (wedding
 * planning discover, etc.) pass it explicitly.
 *
 * Catches null, undefined, and empty-string — `??` alone would let `""`
 * through and produce a zero-row join.
 */
export function resolveTemplateKey(input: string | null | undefined): string {
  if (input === null || input === undefined) return "travel";
  const trimmed = input.trim();
  return trimmed.length === 0 ? "travel" : trimmed;
}

async function gatherOfferingCandidates(opts: {
  templateKey?: string;
  marketCity?: string | null;
  neighborhoodId?: string | null;
  expertEndorsedKeys?: string[];
}): Promise<RankInputCandidate[]> {
  const endorsedSet = new Set(opts.expertEndorsedKeys ?? []);
  const effectiveTemplate = resolveTemplateKey(opts.templateKey);

  // SQL: join offering types → categories → template matrix → neighborhoods.
  // Returns one row per offering with everything the engine needs to score.
  // Filters by isActive + market scope (universal OR matching market).
  try {
    const result = await db.execute(sql`
      SELECT
        sot.offering_type_key                   AS offering_id,
        sot.display_name,
        sot.tagline,
        sot.is_surprising,
        sot.risk_override,
        sot.market_scoped,
        sc.category_key,
        sc.source_type,
        sc.risk_profile,
        sc.requires_background_check,
        sc.commission_band_key,
        tcm.strength                            AS template_strength
      FROM service_offering_types sot
      LEFT JOIN service_categories sc
        ON sc.category_key = sot.category_key
      LEFT JOIN template_category_matrix tcm
        ON tcm.template_key = ${effectiveTemplate}
        AND tcm.category_key = sot.category_key
      WHERE sot.is_active = true
        AND (
          ${opts.marketCity}::text IS NULL
          OR sot.market_scoped IS NULL
          OR ${opts.marketCity}::text = ANY(sot.market_scoped)
        )
    `);

    const rows = (result.rows ?? []) as any[];
    return rows.map((r): RankInputCandidate => {
      // Map raw row → engine input.
      // expectedPlatformEarningsRaw is a Phase 5.2 stub: 1 for all candidates
      // unless we have a richer signal. Step 5.3+ wires actual fee-band rate ×
      // expected booking amount when provider inventory comes online.
      const earnings = 1;
      return {
        offeringId: String(r.offering_id),
        categoryKey: String(r.category_key ?? ""),
        sourceType: (r.source_type === "affiliate" ? "affiliate" : "platform_provider"),
        templateStrength: normalizeStrength(r.template_strength),
        riskProfile: normalizeRisk(r.risk_profile),
        riskOverride: normalizeRisk(r.risk_override),
        requiresBackgroundCheck: Boolean(r.requires_background_check),
        // Phase 5.2 stub: assume verified. Phase 5.3 will look up real provider.
        providerHasVerifiedBadge: true,
        candidateNeighborhoodSlug: null,
        expectedPlatformEarningsRaw: earnings,
        expertEndorsed: endorsedSet.has(String(r.offering_id)),
        profileMatchScore: 0.5,         // Phase 5.2 baseline; Phase 5.3+ refines
        proximityFit: opts.neighborhoodId ? 0.7 : 0.4,  // boost when neighborhood is focused
      };
    });
  } catch (err) {
    console.error("[upsell] gatherOfferingCandidates failed:", err);
    return [];
  }
}

function normalizeStrength(v: any): "REQ" | "REC" | "OPT" | null {
  if (v === "REQ" || v === "REC" || v === "OPT") return v;
  return null;
}

function normalizeRisk(v: any): "low" | "moderate" | "high" | "specialized" | null {
  if (v === "low" || v === "moderate" || v === "high" || v === "specialized") return v;
  return null;
}

/**
 * Discover-by-date hard filter (§B5): "dateRange availability is a hard filter,
 * not a weight." For Phase 5.2 we approximate availability by dropping any
 * offering type whose category is `aff_events` when no event row exists in
 * destination_events overlapping the dateRange. Other categories pass through
 * — most offerings (private chef, photographer, tour guide) aren't bound to
 * specific dates at the offering-type level (provider blackouts are checked
 * later in booking, not here).
 *
 * Returns the offering_ids that should be DROPPED from the candidate set.
 */
async function findDateUnavailableOfferingIds(
  city: string,
  dateRange: { start: string; end?: string },
): Promise<Set<string>> {
  const drop = new Set<string>();
  try {
    // aff_events offerings need at least one event in destination_events
    // matching the city + overlapping the date range.
    const eventCheck = await db.execute(sql`
      SELECT COUNT(*)::INT AS n
      FROM destination_events
      WHERE LOWER(city) = LOWER(${city})
        AND (event_start_date IS NULL OR event_start_date <= ${dateRange.end ?? dateRange.start}::date)
        AND (event_end_date   IS NULL OR event_end_date   >= ${dateRange.start}::date)
    `);
    const n = Number((eventCheck.rows?.[0] as any)?.n ?? 0);
    if (n === 0) {
      // No matching events → drop every aff_events offering.
      const evtOfferings = await db.execute(sql`
        SELECT offering_type_key
        FROM service_offering_types
        WHERE category_key = 'aff_events' AND is_active = true
      `);
      for (const r of (evtOfferings.rows ?? [])) {
        drop.add(String((r as any).offering_type_key));
      }
    }
  } catch (err) {
    // destination_events may not exist in fresh installs; degrade gracefully.
    console.warn("[upsell] date-availability check skipped:", err);
  }
  return drop;
}

// ─── Endpoint helper ─────────────────────────────────────────────────────────

async function rankAndLog(
  surface: Surface,
  ctx: UpsellContext,
  rawCandidates: RankInputCandidate[],
  req: any,
): Promise<{
  candidates: ReturnType<typeof rankCandidates>["candidates"];
  suppressed: ReturnType<typeof rankCandidates>["suppressed"];
  displayLookup: Map<string, { displayName: string; tagline: string | null }>;
}> {
  const slotConfig = (await getSlotConfig(surface)) ?? {
    surface, maxItems: 3, revenueWeight: 0.15, revenueCap: 0.15, frequencyCapHours: 0, enabled: true,
  };
  const result = rankCandidates(ctx, rawCandidates, slotConfig, DEFAULT_POLICY);

  // Resolve display names from service_offering_types so the surface renders
  // human-language (per the catalog brief: "Photography wanted in Gion,"
  // not 'photography'/'aff_activities').
  const displayLookup = new Map<string, { displayName: string; tagline: string | null }>();
  if (result.candidates.length > 0) {
    try {
      const ids = result.candidates.map(c => c.offeringId);
      const lookup = await db.execute(sql`
        SELECT offering_type_key, display_name, tagline
        FROM service_offering_types
        WHERE offering_type_key = ANY(${ids})
      `);
      for (const r of (lookup.rows ?? [])) {
        const row = r as any;
        displayLookup.set(String(row.offering_type_key), {
          displayName: String(row.display_name),
          tagline: row.tagline ?? null,
        });
      }
    } catch (err) {
      console.warn("[upsell] display-name lookup failed:", err);
    }
  }

  // Log impressions fire-and-forget (the engine's logger swallows failures).
  logImpressions(ctx, result.candidates).catch(() => { /* already logged */ });

  return { ...result, displayLookup };
}

function decorate(
  candidates: ReturnType<typeof rankCandidates>["candidates"],
  displayLookup: Map<string, { displayName: string; tagline: string | null }>,
) {
  return candidates.map(c => ({
    ...c,
    displayName: displayLookup.get(c.offeringId)?.displayName ?? c.offeringId,
    tagline: displayLookup.get(c.offeringId)?.tagline ?? null,
  }));
}

// ─── Surface endpoints ───────────────────────────────────────────────────────

/** POST /api/upsell/cart — highest-intent surface; revenueCap stays at default.
 *  Phase 5.4: merges persisted expert endorsements with any caller-provided keys.
 */
router.post("/api/upsell/cart", isAuthenticated, async (req, res) => {
  try {
    const body = cartBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));
    const ctx: UpsellContext = {
      surface: "cart",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: mergedEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: mergedEndorsedKeys,
    });
    const { candidates, suppressed, displayLookup } = await rankAndLog("cart", ctx, raw, req);
    res.json({ candidates: decorate(candidates, displayLookup), suppressed });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/upsell/discover-location — neighborhood-focused browse. Public; no auth required. */
router.post("/api/upsell/discover-location", async (req, res) => {
  try {
    const body = discoverLocationBodySchema.parse(req.body);

    // Look up the neighborhood's city for market scoping.
    const nbh = await db.execute(sql`
      SELECT city, slug FROM city_neighborhoods WHERE id = ${body.neighborhoodId} LIMIT 1
    `);
    const nbhRow = nbh.rows?.[0] as any;
    const marketCity = nbhRow?.city ?? null;

    // Phase 5.4: merge persisted endorsements (trip- and neighborhood-scoped).
    // Discover-by-location reads neighborhood endorsements regardless of trip.
    const fetched = await loadEndorsementsForContext(body.tripId, [body.neighborhoodId]);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "discover_location",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodId: body.neighborhoodId,
      expertEndorsedKeys: mergedEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: marketCity ? marketCity.toLowerCase() : null,
      neighborhoodId: body.neighborhoodId,
      expertEndorsedKeys: mergedEndorsedKeys,
    });
    const { candidates, suppressed, displayLookup } = await rankAndLog("discover_location", ctx, raw, req);
    res.json({ candidates: decorate(candidates, displayLookup), suppressed });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/upsell/discover-date — dateRange is a HARD FILTER, not a weight. */
router.post("/api/upsell/discover-date", async (req, res) => {
  try {
    const body = discoverDateBodySchema.parse(req.body);

    // Phase 5.4: merge persisted endorsements before scoring.
    const fetched = await loadEndorsementsForContext(body.tripId, undefined);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "discover_date",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      dateRange: body.dateRange,
      expertEndorsedKeys: mergedEndorsedKeys,
    };

    // Hard date filter: drop offerings whose category requires specific date
    // availability and where no inventory exists for the requested range.
    const unavailable = await findDateUnavailableOfferingIds(body.city, body.dateRange);
    const raw = (await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: body.city.toLowerCase(),
      expertEndorsedKeys: mergedEndorsedKeys,
    })).filter(c => !unavailable.has(c.offeringId));

    const { candidates, suppressed, displayLookup } = await rankAndLog("discover_date", ctx, raw, req);

    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      hardFilteredByDate: unavailable.size,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 5 surfaces: optimize_gate · plancard_pretrip · plancard_ontrip ─────

const optimizeGateBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
  /** Optional delta the optimizer already computed (savings %, time-savings, etc.).
   *  Passed through to the response unchanged — engine does not derive deltas. */
  optimizationDelta: z.object({
    savingsPercent: z.number().optional(),
    savingsAmount: z.number().optional(),
    timeSavedMinutes: z.number().optional(),
  }).optional(),
});

const plancardBodySchema = z.object({
  tripId: z.string(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
  /** Per §B5: PlanCard pretrip uses the optimizer's empty-slot output as
   *  candidate slots. The optimizer flags categoryKeys it identified as gaps
   *  (REQ/REC categories the trip lacks). The engine ranks only those.
   *  When omitted, the surface falls back to general template gap-filling. */
  emptySlotCategoryKeys: z.array(z.string()).optional(),
});

const plancardOntripBodySchema = z.object({
  tripId: z.string(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
  /** Current location during the trip — drives "near you tomorrow" gap-fill.
   *  Optional; absence falls back to trip neighborhoods. */
  currentNeighborhoodId: z.string().optional(),
});

/**
 * POST /api/upsell/optimize-gate — DELTA-ONLY response (§B4 + §B9).
 *
 * The user is deciding whether to pay for AI+Expert Review ($49.99 =
 * optimize_expert_review band). Showing the specific optimized arrangement
 * here gives away the paid product. So this endpoint runs the engine
 * INTERNALLY, then REDACTS the candidate detail before responding:
 *   - returns COUNT of add-ons available
 *   - returns CATEGORY HINTS (de-duped categoryKey set)
 *   - DOES NOT return offering IDs, display names, prices, or any detail
 *     that would let a non-paying user reconstruct the plan
 *
 * Impressions are still logged (the engine ran; that's tracking-side data,
 * not user-facing).
 */
router.post("/api/upsell/optimize-gate", isAuthenticated, async (req, res) => {
  try {
    const body = optimizeGateBodySchema.parse(req.body);
    const ctx: UpsellContext = {
      surface: "optimize_gate",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: body.expertEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: body.expertEndorsedKeys,
    });

    const slotConfig = (await getSlotConfig("optimize_gate")) ?? {
      surface: "optimize_gate" as Surface,
      maxItems: 3,
      revenueWeight: 0.10,
      revenueCap: 0.15,
      frequencyCapHours: 0,
      enabled: true,
    };
    const { candidates } = rankCandidates(ctx, raw, slotConfig, DEFAULT_POLICY);

    // Log impressions for engine-side tracking (the candidates DID rank;
    // we just don't reveal them to the user).
    logImpressions(ctx, candidates).catch(() => { /* fire-and-forget */ });

    // REDACT before responding. Categories teaser only — never offering IDs.
    const categoryHints = Array.from(new Set(candidates.map(c => c.categoryKey))).filter(Boolean);

    res.json({
      delta: body.optimizationDelta ?? null,
      addOnsAvailable: candidates.length,
      categoryHints,
      teaser: candidates.length > 0
        ? `${candidates.length} add-on${candidates.length === 1 ? "" : "s"} could improve this plan`
        : null,
      // EXPLICITLY no candidates / displayName / tagline / price field — see §B4.
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upsell/plancard-pretrip — gap-fill against the optimizer's empty slots.
 *
 * Per §B5: "uses optimizer's empty-slot output as candidate slots." The
 * client passes emptySlotCategoryKeys (the optimizer's flagged gaps). The
 * engine restricts gathering to those categories, then ranks normally.
 * Transport remains suppressed (this is pre-trip).
 */
router.post("/api/upsell/plancard-pretrip", isAuthenticated, async (req, res) => {
  try {
    const body = plancardBodySchema.parse(req.body);
    const ctx: UpsellContext = {
      surface: "plancard_pretrip",
      tripId: body.tripId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: body.expertEndorsedKeys,
    };
    let raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: body.expertEndorsedKeys,
    });

    // Optimizer-driven gap-fill: when emptySlotCategoryKeys is provided,
    // restrict candidates to those categories. Otherwise general gap-fill.
    if (body.emptySlotCategoryKeys && body.emptySlotCategoryKeys.length > 0) {
      const slotSet = new Set(body.emptySlotCategoryKeys);
      raw = raw.filter(c => slotSet.has(c.categoryKey));
    }

    const { candidates, suppressed, displayLookup } = await rankAndLog("plancard_pretrip", ctx, raw, req);
    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      gapDriven: !!(body.emptySlotCategoryKeys && body.emptySlotCategoryKeys.length > 0),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upsell/plancard-ontrip — live nudges; the ONE surface that
 * allows transport upsells (per §B4 carry-in). Frequency-capped at 24 h
 * via slot_config; surface-level history check would normally exclude
 * recently-shown offerings, but Phase 5.2 left that seam at the surface
 * layer — wiring it requires the trip's impression history fetch which
 * is fine to lean on here.
 */
router.post("/api/upsell/plancard-ontrip", isAuthenticated, async (req, res) => {
  try {
    const body = plancardOntripBodySchema.parse(req.body);
    const ctx: UpsellContext = {
      surface: "plancard_ontrip",
      tripId: body.tripId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodId: body.currentNeighborhoodId,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: body.expertEndorsedKeys,
    };
    let raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.currentNeighborhoodId ?? body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: body.expertEndorsedKeys,
    });

    // Frequency cap: exclude offerings shown to this trip in the last
    // slot_config.frequencyCapHours window. This is the surface-seam
    // implementation of the cap; pure engine doesn't enforce.
    try {
      const slotConfig = await getSlotConfig("plancard_ontrip");
      if (slotConfig && slotConfig.frequencyCapHours > 0) {
        const recent = await db.execute(sql`
          SELECT DISTINCT offering_id
          FROM upsell_impressions
          WHERE trip_id = ${body.tripId}
            AND surface = 'plancard_ontrip'
            AND shown_at > NOW() - (${slotConfig.frequencyCapHours} || ' hours')::INTERVAL
        `);
        const recentSet = new Set((recent.rows ?? []).map((r: any) => String(r.offering_id)));
        if (recentSet.size > 0) raw = raw.filter(c => !recentSet.has(c.offeringId));
      }
    } catch (err) {
      console.warn("[upsell] plancard-ontrip frequency-cap check skipped:", err);
    }

    const { candidates, suppressed, displayLookup } = await rankAndLog("plancard_ontrip", ctx, raw, req);
    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 6 — expert_review channel + endorsement write-back ─────────────────
// Endorsements raise RELEVANCE only (never revenue). Read by every other
// surface via loadEndorsementsForContext so a lead's pick compounds.

/**
 * Load persisted endorsements for a context (trip-scoped + neighborhood-scoped).
 * Used by every surface endpoint to merge with caller-provided expertEndorsedKeys.
 */
export async function loadEndorsementsForContext(
  tripId: string | undefined,
  neighborhoodIds: string[] | undefined,
): Promise<string[]> {
  const ids = new Set<string>();
  try {
    if (tripId) {
      const result = await db.execute(sql`
        SELECT offering_id FROM upsell_expert_endorsements
        WHERE scope = 'trip' AND trip_id = ${tripId}
      `);
      for (const r of (result.rows ?? [])) ids.add(String((r as any).offering_id));
    }
    if (neighborhoodIds && neighborhoodIds.length > 0) {
      // Phase 5.6 (Commit A): lead-gated. Only the FEATURED LEAD's endorsement
      // for a neighborhood compounds — the structural authority is the local
      // lead, not any expert who happens to have an endorsement row. JOIN
      // expert_neighborhoods on (expert_id, neighborhood_id) WHERE is_lead = true.
      // See filterLeadEndorsements() pure helper for the equivalent JS contract.
      const result = await db.execute(sql`
        SELECT e.offering_id
        FROM upsell_expert_endorsements e
        JOIN expert_neighborhoods en
          ON en.expert_id = e.expert_id
         AND en.neighborhood_id = e.neighborhood_id
        WHERE e.scope = 'neighborhood'
          AND e.neighborhood_id = ANY(${neighborhoodIds})
          AND en.is_lead = true
      `);
      for (const r of (result.rows ?? [])) ids.add(String((r as any).offering_id));
    }
  } catch (err) {
    console.warn("[upsell] endorsement lookup failed (non-fatal):", err);
  }
  return Array.from(ids);
}

async function requireExpertRole(req: any, res: any): Promise<{ userId: string; role: string } | null> {
  const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const userRow = await db.execute(sql`SELECT role FROM users WHERE id = ${userId} LIMIT 1`);
  const role = (userRow.rows?.[0] as any)?.role;
  if (role !== "expert" && role !== "local_expert" && role !== "admin") {
    res.status(403).json({ error: "Expert role required" });
    return null;
  }
  return { userId, role };
}

/**
 * Phase 5.6 (Commit A) — pure helper that filters endorsements to those
 * written by the FEATURED LEAD of the neighborhood. Encodes the contract
 * the SQL JOIN implements at runtime; testable in isolation against
 * fixtures.
 *
 * Inputs:
 *   endorsements      — neighborhood-scoped endorsement rows
 *   leadAssignments   — expert_neighborhoods rows with isLead flag
 *   neighborhoodIds   — the set of neighborhoods the surface cares about
 *
 * Returns: distinct offering_ids endorsed by the lead of each requested
 *          neighborhood (and only the lead).
 */
export function filterLeadEndorsements(
  endorsements: Array<{ expertId: string; neighborhoodId: string; offeringId: string }>,
  leadAssignments: Array<{ expertId: string; neighborhoodId: string; isLead: boolean }>,
  neighborhoodIds: string[],
): string[] {
  const requested = new Set(neighborhoodIds);
  // (expertId, neighborhoodId) pairs where isLead = true.
  const leadPairs = new Set(
    leadAssignments
      .filter(la => la.isLead)
      .map(la => `${la.expertId}::${la.neighborhoodId}`),
  );
  const out = new Set<string>();
  for (const e of endorsements) {
    if (!requested.has(e.neighborhoodId)) continue;
    if (!leadPairs.has(`${e.expertId}::${e.neighborhoodId}`)) continue;
    out.add(e.offeringId);
  }
  return Array.from(out);
}

/**
 * Pure helper: is a given expert the featured lead of a neighborhood?
 * Used by the endorse endpoint to gate writes; testable separately from
 * the DB query. Admin bypass is enforced at the call site, not here.
 */
export function expertIsLead(
  leadAssignments: Array<{ expertId: string; neighborhoodId: string; isLead: boolean }>,
  expertId: string,
  neighborhoodId: string,
): boolean {
  return leadAssignments.some(
    la => la.expertId === expertId && la.neighborhoodId === neighborhoodId && la.isLead,
  );
}

const expertReviewBodySchema = z.object({
  tripId: z.string(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
});

/**
 * POST /api/upsell/expert-review
 *
 * The expert's working surface. Returns the engine's full ranked candidate
 * list for a trip plus the expert's existing endorsements so the curation UI
 * can highlight already-curated items. Auto-loads persisted endorsements via
 * loadEndorsementsForContext so scores reflect the lead's prior calls.
 */
router.post("/api/upsell/expert-review", isAuthenticated, async (req, res) => {
  try {
    const auth = await requireExpertRole(req, res);
    if (!auth) return;
    const expertId = auth.userId;

    const body = expertReviewBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);

    const ctx: UpsellContext = {
      surface: "expert_review",
      tripId: body.tripId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: fetched,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: fetched,
    });
    const { candidates, suppressed, displayLookup } = await rankAndLog("expert_review", ctx, raw, req);

    // List THIS expert's own endorsements for the curation UI.
    const myEndorsements = await db.execute(sql`
      SELECT id, scope, trip_id, neighborhood_id, offering_id, category_key, notes, created_at
      FROM upsell_expert_endorsements
      WHERE expert_id = ${expertId}
        AND (
          (scope = 'trip' AND trip_id = ${body.tripId}) OR
          (scope = 'neighborhood' AND neighborhood_id = ANY(${body.neighborhoodIds ?? []}::TEXT[]))
        )
      ORDER BY created_at DESC
    `);

    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      myEndorsements: myEndorsements.rows ?? [],
      contextEndorsements: fetched,    // every offering_id active for this trip
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

const endorseBodySchema = z.object({
  scope: z.enum(["trip", "neighborhood"]),
  tripId: z.string().optional(),
  neighborhoodId: z.string().optional(),
  offeringId: z.string(),
  categoryKey: z.string().optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  (b) => (b.scope === "trip" && !!b.tripId && !b.neighborhoodId) ||
         (b.scope === "neighborhood" && !!b.neighborhoodId && !b.tripId),
  { message: "scope='trip' requires tripId; scope='neighborhood' requires neighborhoodId (mutually exclusive)" },
);

/**
 * POST /api/upsell/expert-review/endorse
 * Upsert via partial-unique-index match. Re-endorsing only updates notes.
 */
router.post("/api/upsell/expert-review/endorse", isAuthenticated, async (req, res) => {
  try {
    const auth = await requireExpertRole(req, res);
    if (!auth) return;
    const { userId: expertId, role } = auth;
    const body = endorseBodySchema.parse(req.body);

    if (body.scope === "trip") {
      await db.execute(sql`
        INSERT INTO upsell_expert_endorsements
          (expert_id, scope, trip_id, offering_id, category_key, notes)
        VALUES (${expertId}, 'trip', ${body.tripId!}, ${body.offeringId}, ${body.categoryKey ?? null}, ${body.notes ?? null})
        ON CONFLICT (expert_id, trip_id, offering_id) WHERE scope = 'trip'
        DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
      `);
    } else {
      // Phase 5.6 (Commit A): lead-gate the write. Only the FEATURED LEAD of
      // a neighborhood may write a neighborhood-scoped endorsement. Admin role
      // bypasses for backfill / curation cases — the READ JOIN still protects
      // the consumer surface (admin endorsement would only compound if admin
      // also held the is_lead row, which isn't a normal state).
      if (role !== "admin") {
        const leadCheck = await db.execute(sql`
          SELECT 1 FROM expert_neighborhoods
          WHERE expert_id = ${expertId}
            AND neighborhood_id = ${body.neighborhoodId!}
            AND is_lead = true
          LIMIT 1
        `);
        if (!leadCheck.rows || leadCheck.rows.length === 0) {
          return res.status(403).json({
            error: "not_neighborhood_lead",
            message: "Only the featured lead of this neighborhood may write a neighborhood-scoped endorsement.",
          });
        }
      }
      await db.execute(sql`
        INSERT INTO upsell_expert_endorsements
          (expert_id, scope, neighborhood_id, offering_id, category_key, notes)
        VALUES (${expertId}, 'neighborhood', ${body.neighborhoodId!}, ${body.offeringId}, ${body.categoryKey ?? null}, ${body.notes ?? null})
        ON CONFLICT (expert_id, neighborhood_id, offering_id) WHERE scope = 'neighborhood'
        DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
      `);
    }

    res.json({ ok: true, scope: body.scope, offeringId: body.offeringId });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

const unendorseBodySchema = z.object({
  scope: z.enum(["trip", "neighborhood"]),
  tripId: z.string().optional(),
  neighborhoodId: z.string().optional(),
  offeringId: z.string(),
});

router.delete("/api/upsell/expert-review/endorse", isAuthenticated, async (req, res) => {
  try {
    const auth = await requireExpertRole(req, res);
    if (!auth) return;
    const expertId = auth.userId;
    const body = unendorseBodySchema.parse(req.body);

    if (body.scope === "trip" && body.tripId) {
      await db.execute(sql`
        DELETE FROM upsell_expert_endorsements
        WHERE expert_id = ${expertId} AND scope = 'trip'
          AND trip_id = ${body.tripId} AND offering_id = ${body.offeringId}
      `);
    } else if (body.scope === "neighborhood" && body.neighborhoodId) {
      await db.execute(sql`
        DELETE FROM upsell_expert_endorsements
        WHERE expert_id = ${expertId} AND scope = 'neighborhood'
          AND neighborhood_id = ${body.neighborhoodId} AND offering_id = ${body.offeringId}
      `);
    } else {
      return res.status(400).json({ error: "scope_key_required" });
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 7 surfaces: checkout · post_booking · ai_concierge ─────────────────

/**
 * Shared frequency-cap helper. Excludes offerings already shown to this trip
 * on this surface within the last `windowHours`. Returns the input array
 * unchanged when tripId is missing or windowHours <= 0.
 *
 * Plancard-ontrip (step 5) had this logic inline; reusing here for
 * post_booking's 48h cap. Pure engine never queries impressions — that
 * stays at the surface seam.
 */
async function filterByFrequencyCap(
  raw: RankInputCandidate[],
  tripId: string | undefined,
  surface: Surface,
  windowHours: number,
): Promise<RankInputCandidate[]> {
  if (!tripId || windowHours <= 0) return raw;
  try {
    const recent = await db.execute(sql`
      SELECT DISTINCT offering_id
      FROM upsell_impressions
      WHERE trip_id = ${tripId}
        AND surface = ${surface}
        AND shown_at > NOW() - (${windowHours} || ' hours')::INTERVAL
    `);
    const seen = new Set((recent.rows ?? []).map((r: any) => String(r.offering_id)));
    if (seen.size === 0) return raw;
    return raw.filter(c => !seen.has(c.offeringId));
  } catch (err) {
    console.warn(`[upsell] frequency-cap check skipped for ${surface}:`, err);
    return raw;
  }
}

const checkoutBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
  /** §B5 carry-in: transport (`private_transportation` / `aff_ground_transport`)
   *  appears on checkout ONLY when the optimizer has computed transport legs.
   *  Default false → transport stays suppressed. */
  tripIsPostOptimize: z.boolean().default(false),
});

/**
 * POST /api/upsell/checkout — last-mile add-ons.
 *
 * §B5 rules:
 *   - Single row, ≤2 items (slotConfig.maxItems = 2 from migration 049).
 *   - NEVER blocks completion — any internal failure returns an empty
 *     candidate set with 200, not 5xx. Checkout cannot break because the
 *     engine had a bad day.
 *   - Transfer offerings (private_transportation, aff_ground_transport)
 *     surface ONLY when tripIsPostOptimize = true.
 */
router.post("/api/upsell/checkout", isAuthenticated, async (req, res) => {
  try {
    const body = checkoutBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "checkout",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: mergedEndorsedKeys,
      tripIsPostOptimize: body.tripIsPostOptimize,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: mergedEndorsedKeys,
    });
    const { candidates, suppressed, displayLookup } = await rankAndLog("checkout", ctx, raw, req);
    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      tripIsPostOptimize: body.tripIsPostOptimize,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    // §B5 "never blocks completion": engine failures return a benign empty result,
    // not a 5xx that would crash the checkout flow.
    console.error("[upsell] checkout engine error (returning empty):", err);
    res.json({ candidates: [], suppressed: [], error: "engine_unavailable" });
  }
});

const postBookingBodySchema = z.object({
  tripId: z.string(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
});

/**
 * POST /api/upsell/post-booking — re-engagement / complete-your-plan.
 *
 * §B5: "frequency-capped hard; max 1 nudge per plan per 48h."
 * Surface config (slot_config row, seeded in 049) sets frequencyCapHours = 48.
 * This endpoint applies that cap via filterByFrequencyCap before scoring.
 */
router.post("/api/upsell/post-booking", isAuthenticated, async (req, res) => {
  try {
    const body = postBookingBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "post_booking",
      tripId: body.tripId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: mergedEndorsedKeys,
    };
    const slotConfig = await getSlotConfig("post_booking");
    let raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: mergedEndorsedKeys,
    });
    raw = await filterByFrequencyCap(raw, body.tripId, "post_booking", slotConfig?.frequencyCapHours ?? 48);

    const { candidates, suppressed, displayLookup } = await rankAndLog("post_booking", ctx, raw, req);
    res.json({ candidates: decorate(candidates, displayLookup), suppressed });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

const aiConciergeBodySchema = z.object({
  tripId: z.string().optional(),
  guestSessionId: z.string().optional(),
  templateKey: z.string().optional(),
  cartItems: z.array(cartItemSchema).default([]),
  userProfile: userProfileSchema,
  neighborhoodIds: z.array(z.string()).optional(),
  expertEndorsedKeys: z.array(z.string()).optional(),
  /** Optional concierge task identifier the candidates relate to (for
   *  attribution in upsell_impressions). The concierge's per-task fee is
   *  billed elsewhere — see comment in the handler about double-counting. */
  conciergeTaskId: z.string().optional(),
});

/**
 * POST /api/upsell/ai-concierge — concierge proposes; can fulfill upsells.
 *
 * §B5 / §B9 NO-DOUBLE-COUNT rule: the concierge per-task fee (the $9.99 /
 * $49.99 ai_concierge_* flat band) is its own revenue stream, billed at
 * task creation, NOT at upsell render. Candidate.revenueScore must come
 * from the candidate's own platform earnings only — not augmented by the
 * task fee. Structurally guaranteed here: this endpoint does NOT touch
 * gatherOfferingCandidates' revenue input. The same candidate ranks the
 * same way on ai_concierge as it does on cart.
 */
router.post("/api/upsell/ai-concierge", isAuthenticated, async (req, res) => {
  try {
    const body = aiConciergeBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "ai_concierge",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: mergedEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodId: body.neighborhoodIds?.[0] ?? null,
      expertEndorsedKeys: mergedEndorsedKeys,
    });
    const { candidates, suppressed, displayLookup } = await rankAndLog("ai_concierge", ctx, raw, req);
    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      conciergeTaskId: body.conciergeTaskId ?? null,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
