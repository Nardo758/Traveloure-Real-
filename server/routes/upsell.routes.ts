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

/** POST /api/upsell/cart — highest-intent surface; revenueCap stays at default. */
router.post("/api/upsell/cart", isAuthenticated, async (req, res) => {
  try {
    const body = cartBodySchema.parse(req.body);
    const ctx: UpsellContext = {
      surface: "cart",
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

    const ctx: UpsellContext = {
      surface: "discover_location",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodId: body.neighborhoodId,
      expertEndorsedKeys: body.expertEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: marketCity ? marketCity.toLowerCase() : null,
      neighborhoodId: body.neighborhoodId,
      expertEndorsedKeys: body.expertEndorsedKeys,
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

    const ctx: UpsellContext = {
      surface: "discover_date",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      dateRange: body.dateRange,
      expertEndorsedKeys: body.expertEndorsedKeys,
    };

    // Hard date filter: drop offerings whose category requires specific date
    // availability and where no inventory exists for the requested range.
    const unavailable = await findDateUnavailableOfferingIds(body.city, body.dateRange);
    const raw = (await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: body.city.toLowerCase(),
      expertEndorsedKeys: body.expertEndorsedKeys,
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

/**
 * POST /api/upsell/checkout — checkout-step add-on nudges.
 *
 * Shares the cart body schema (same context signals) but is
 * a distinct surface so slot_config can cap it independently
 * (e.g. max 2 candidates at checkout vs 3 in cart).
 * Requires auth — checkout is always a logged-in flow.
 */
router.post("/api/upsell/checkout", isAuthenticated, async (req, res) => {
  try {
    const body = cartBodySchema.parse(req.body);
    const ctx: UpsellContext = {
      surface: "checkout",
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
    // Checkout cap: surface at most 2 candidates regardless of slot_config max.
    const { candidates, suppressed, displayLookup } = await rankAndLog("checkout", ctx, raw, req);
    res.json({ candidates: decorate(candidates.slice(0, 2), displayLookup), suppressed });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upsell/impression — client-side impression logging.
 *
 * UpsellSlot fires this after candidates are rendered. Accepts a batch
 * of offeringIds so one request covers the entire rendered slate.
 * No auth required — discover surfaces are public and still need
 * impression tracking. tripId is optional (cart/checkout have it;
 * discover surfaces may not).
 */
const impressionBodySchema = z.object({
  surface: z.string(),
  offeringIds: z.array(z.string()).min(1),
  tripId: z.string().optional(),
});

router.post("/api/upsell/impression", async (req, res) => {
  try {
    const { surface, offeringIds, tripId } = impressionBodySchema.parse(req.body);
    // Insert one row per offering; ON CONFLICT DO NOTHING avoids duplicate noise
    // from double-renders (StrictMode dev, HMR, etc.).
    for (const offeringId of offeringIds) {
      await db.execute(sql`
        INSERT INTO upsell_impressions (surface, offering_id, trip_id, shown_at, clicked)
        VALUES (${surface}, ${offeringId}, ${tripId ?? null}, NOW(), false)
        ON CONFLICT DO NOTHING
      `);
    }
    res.json({ ok: true, logged: offeringIds.length });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/upsell/click — impression→click attribution (issue #49, gates PR #50).
 *
 * The engine logs impressions on render; upsell_impressions has a `clicked` column
 * the schema reserved for "updated by client/server later". This closes that seam.
 * Marks ONLY the single most-recent matching impression — flipping every row in a
 * window would inflate click-through, the exact metric this instruments.
 */
const clickBodySchema = z.object({
  tripId: z.string(),
  surface: z.string(),
  offeringId: z.string(),
});

router.post("/api/upsell/click", isAuthenticated, async (req, res) => {
  try {
    const { tripId, surface, offeringId } = clickBodySchema.parse(req.body);
    await db.execute(sql`
      UPDATE upsell_impressions SET clicked = true
      WHERE id = (
        SELECT id FROM upsell_impressions
        WHERE trip_id = ${tripId} AND surface = ${surface} AND offering_id = ${offeringId}
        ORDER BY shown_at DESC
        LIMIT 1
      )
    `);
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
