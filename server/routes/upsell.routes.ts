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

/**
 * Best qualifying covering provider per categoryKey — the real-inventory
 * source for platform-provider candidates (Engine Inventory-Sourcing brief).
 *
 * A provider qualifies for a category when their listing is active, their
 * coverage row matches the target scope, and — mirroring the publish gate in
 * routes.ts — for gated categories (requires_background_check OR
 * insurance_band >= 2) they are verified (and background-check-confirmed
 * where the category requires it). Unverified providers never qualify for a
 * gated category, so a gated offering with no verified covering provider
 * does not surface at all.
 *
 * Target scope tiers (no cascade — chosen by available context):
 *   1. explicit neighborhoodIds  → coverage in those neighborhoods, plus
 *      their adjacent neighborhoods (city_neighborhoods.adjacent_keys, same
 *      city, checked symmetrically) so proximity can rank same > adjacent.
 *      Degrades gracefully to exact-neighborhood while adjacency data is
 *      unpopulated.
 *   2. marketCity                → coverage anywhere in that city
 *   3. neither                   → any coverage (keeps non-located surfaces non-empty)
 */
type CoverageMatch = {
  matchedSlug: string;
  verified: boolean;
  /** best covering provider's listing price (null when column empty) */
  price: number | null;
  /** how the matched neighborhood relates to the target scope */
  matchType: "same" | "adjacent" | "market" | "global";
};

/** node-pg binds JS arrays as a single scalar; pass a Postgres array literal. */
function pgTextArray(values: string[]): string {
  return `{${values.map(v => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;
}

async function loadCoveringInventory(opts: {
  neighborhoodIds?: string[];
  marketCity?: string | null;
}): Promise<Map<string, CoverageMatch>> {
  const ids = (opts.neighborhoodIds ?? []).filter(Boolean);

  let scopeFilter = sql`TRUE`;
  let tier: "neighborhood" | "market" | "global" = "global";
  const targetSlugs = new Set<string>();
  const adjacentSlugs = new Set<string>();

  if (ids.length > 0) {
    tier = "neighborhood";
    // Resolve the targets' slugs + adjacency so the pool can include
    // adjacent-neighborhood coverage (ranked down via proximityFit).
    const targets = await db.execute(sql`
      SELECT slug, LOWER(city) AS city, adjacent_keys
      FROM city_neighborhoods WHERE id = ANY(${pgTextArray(ids)}::text[])
    `);
    const targetCities = new Set<string>();
    for (const t of (targets.rows ?? []) as any[]) {
      targetSlugs.add(String(t.slug));
      targetCities.add(String(t.city));
      for (const a of (t.adjacent_keys ?? []) as string[]) adjacentSlugs.add(String(a));
    }
    const citiesArr = pgTextArray(Array.from(targetCities));
    const adjArr = pgTextArray(Array.from(adjacentSlugs));
    const slugsArr = pgTextArray(Array.from(targetSlugs));
    scopeFilter = sql`(
      c.neighborhood_id = ANY(${pgTextArray(ids)}::text[])
      OR (
        LOWER(cn.city) = ANY(${citiesArr}::text[])
        AND (cn.slug = ANY(${adjArr}::text[]) OR cn.adjacent_keys && ${slugsArr}::text[])
      )
    )`;
  } else if (opts.marketCity) {
    tier = "market";
    scopeFilter = sql`LOWER(cn.city) = ${opts.marketCity}`;
  }

  const inv = await db.execute(sql`
    SELECT DISTINCT ON (c.category_key)
      c.category_key,
      cn.slug AS matched_slug,
      ps.price AS listing_price,
      (u.provider_verification_status = 'verified'
        AND (sc.requires_background_check = false OR u.background_check_confirmed = true)
      ) AS provider_verified
    FROM provider_neighborhood_coverage c
    JOIN city_neighborhoods cn ON cn.id = c.neighborhood_id
    JOIN provider_services ps  ON ps.user_id = c.provider_id AND ps.status = 'active'
    JOIN service_categories sc ON sc.id = ps.category_id AND sc.category_key = c.category_key
    JOIN users u ON u.id = c.provider_id
    WHERE ${scopeFilter}
      AND (
        -- non-gated categories: any covering provider counts (badge stays honest)
        (sc.requires_background_check = false AND COALESCE(sc.insurance_band, 0) < 2)
        -- gated categories: only verified covering providers count
        OR (u.provider_verification_status = 'verified'
            AND (sc.requires_background_check = false OR u.background_check_confirmed = true))
      )
    ORDER BY c.category_key,
      (u.provider_verification_status = 'verified'
        AND (sc.requires_background_check = false OR u.background_check_confirmed = true)) DESC,
      (cn.slug = ANY(${pgTextArray(Array.from(targetSlugs))}::text[])) DESC,
      c.is_primary DESC,
      c.sort_order ASC
  `);

  const map = new Map<string, CoverageMatch>();
  for (const r of (inv.rows ?? []) as any[]) {
    const slug = String(r.matched_slug);
    const matchType: CoverageMatch["matchType"] =
      tier === "neighborhood"
        ? (targetSlugs.has(slug) ? "same" : "adjacent")
        : tier === "market" ? "market" : "global";
    const priceNum = r.listing_price === null || r.listing_price === undefined
      ? null : Number(r.listing_price);
    map.set(String(r.category_key), {
      matchedSlug: slug,
      verified: Boolean(r.provider_verified),
      price: Number.isFinite(priceNum as number) ? priceNum : null,
      matchType,
    });
  }
  return map;
}

/**
 * Proximity tiers per the Inventory-Sourcing brief: same neighborhood >
 * adjacent > same market > elsewhere. Surfaces without neighborhood context
 * (market or global pools) get the neutral market level — proximity is then
 * uniform within the set and never reorders it.
 */
const PROXIMITY_FIT = { same: 1.0, adjacent: 0.7, market: 0.4, global: 0.4 } as const;

/**
 * Nominal affiliate basket (USD) for earnings comparability: affiliate
 * inventory has no listing price, so margin-band rates are applied to this
 * constant until real affiliate basket telemetry exists. Platform candidates
 * use the covering provider's actual listing price (same fallback when a
 * listing has no price).
 */
const NOMINAL_BASKET_USD = 100;

function computeEarnings(
  rateType: string | null,
  rate: number | null,
  price: number | null,
): number {
  if (rate === null || !Number.isFinite(rate)) return 1; // band unresolved → pre-brief neutral
  if (rateType === "flat") return rate;
  return rate * (price ?? NOMINAL_BASKET_USD);
}

async function gatherOfferingCandidates(opts: {
  templateKey?: string;
  marketCity?: string | null;
  neighborhoodIds?: string[];
  expertEndorsedKeys?: string[];
}): Promise<RankInputCandidate[]> {
  const endorsedSet = new Set(opts.expertEndorsedKeys ?? []);
  const effectiveTemplate = resolveTemplateKey(opts.templateKey);

  // SQL: join offering types → categories → template matrix → neighborhoods.
  // Returns one row per offering with everything the engine needs to score.
  // Filters by isActive + market scope (universal OR matching market).
  try {
    const [result, inventory] = await Promise.all([
      db.execute(sql`
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
          tcm.strength                            AS template_strength,
          fb.rate_type                            AS band_rate_type,
          fb.default_rate                         AS band_rate,
          fba.rate_type                           AS aff_band_rate_type,
          fba.default_rate                        AS aff_band_rate
        FROM service_offering_types sot
        LEFT JOIN service_categories sc
          ON sc.category_key = sot.category_key
        LEFT JOIN template_category_matrix tcm
          ON tcm.template_key = ${effectiveTemplate}
          AND tcm.category_key = sot.category_key
        LEFT JOIN fee_bands fb
          ON fb.band_key = sc.commission_band_key AND fb.is_active = true
        LEFT JOIN fee_bands fba
          ON fba.band_key = 'affiliate:' || sc.affiliate_partner_key AND fba.is_active = true
        WHERE sot.is_active = true
          AND (
            ${opts.marketCity}::text IS NULL
            OR sot.market_scoped IS NULL
            OR ${opts.marketCity}::text = ANY(sot.market_scoped)
          )
      `),
      loadCoveringInventory(opts),
    ]);

    const rows = (result.rows ?? []) as any[];
    const candidates: RankInputCandidate[] = [];
    for (const r of rows) {
      const isAffiliate = r.source_type === "affiliate";
      // Platform-provider offerings are inventory-gated: they surface only if
      // a qualifying covering provider exists in the target scope. Affiliate
      // offerings are catalog-sourced (their inventory is broadly available).
      const inv = isAffiliate ? null : inventory.get(String(r.category_key ?? "")) ?? null;
      if (!isAffiliate && !inv) continue;

      // Real per-candidate earnings: category commission band × the covering
      // provider's listing price (platform), or the affiliate-margin band ×
      // the nominal basket (affiliate). normalizeRevenue rescales the set.
      const earnings = isAffiliate
        ? computeEarnings(r.aff_band_rate_type, r.aff_band_rate === null ? null : Number(r.aff_band_rate), null)
        : computeEarnings(r.band_rate_type, r.band_rate === null ? null : Number(r.band_rate), inv!.price);

      candidates.push({
        offeringId: String(r.offering_id),
        categoryKey: String(r.category_key ?? ""),
        sourceType: (isAffiliate ? "affiliate" : "platform_provider"),
        templateStrength: normalizeStrength(r.template_strength),
        riskProfile: normalizeRisk(r.risk_profile),
        riskOverride: normalizeRisk(r.risk_override),
        requiresBackgroundCheck: Boolean(r.requires_background_check),
        // Real verification status of the best covering provider. For gated
        // categories this is guaranteed true (unverified ones never qualify),
        // so the ranker's bg-check hard filter and this source agree.
        providerHasVerifiedBadge: isAffiliate ? true : inv!.verified,
        candidateNeighborhoodSlug: isAffiliate ? null : inv!.matchedSlug,
        expectedPlatformEarningsRaw: earnings,
        expertEndorsed: endorsedSet.has(String(r.offering_id)),
        profileMatchScore: 0.5,         // Phase 5.2 baseline; Phase 5.3+ refines
        // Affiliate inventory is broadly available → market-level proximity.
        proximityFit: isAffiliate ? PROXIMITY_FIT.market : PROXIMITY_FIT[inv!.matchType],
      });
    }
    return candidates;
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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

    // Resolve expert user IDs → endorsed offering_type_keys.
    // The client passes expert user IDs from the location experts query; we resolve
    // them to offering types via provider_services → service_categories → service_offering_types.
    // This is the authoritative endorsement signal: offerings backed by active local providers.
    let resolvedEndorsedKeys = body.expertEndorsedKeys ?? [];
    if (resolvedEndorsedKeys.length > 0) {
      try {
        const resolved = await db.execute(sql`
          SELECT DISTINCT sot.offering_type_key
          FROM provider_services ps
          JOIN service_categories sc ON sc.id = ps.category_id
          JOIN service_offering_types sot ON sot.category_key = sc.category_key
          WHERE ps.user_id = ANY(ARRAY[${sql.raw(resolvedEndorsedKeys.map(k => `'${k.replace(/'/g, "''")}'`).join(","))}]::text[])
            AND ps.status = 'active'
            AND sot.is_active = true
        `);
        const fromProviders = (resolved.rows ?? []).map((r: any) => String(r.offering_type_key));
        if (fromProviders.length > 0) {
          resolvedEndorsedKeys = fromProviders;
        }
        // If no provider_services rows found (e.g. experts with no services yet), keep original list
        // so the ranking gracefully degrades rather than clearing all endorsement signal.
      } catch (resErr) {
        console.warn("[upsell] discover-location endorsement resolution failed, using raw keys:", resErr);
      }
    }

    const ctx: UpsellContext = {
      surface: "discover_location",
      tripId: body.tripId,
      guestSessionId: body.guestSessionId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodId: body.neighborhoodId,
      expertEndorsedKeys: resolvedEndorsedKeys,
    };
    const raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: marketCity ? marketCity.toLowerCase() : null,
      neighborhoodIds: [body.neighborhoodId],
      expertEndorsedKeys: resolvedEndorsedKeys,
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
      neighborhoodIds: [body.currentNeighborhoodId, ...(body.neighborhoodIds ?? [])].filter((x): x is string => Boolean(x)),
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
