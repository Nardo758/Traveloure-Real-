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
      neighborhoodIds: body.neighborhoodIds ?? [],
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

    // Phase 5.4: merge persisted endorsements (trip- and neighborhood-scoped).
    // Discover-by-location reads neighborhood endorsements regardless of trip.
    const fetched = await loadEndorsementsForContext(body.tripId, [body.neighborhoodId]);
    const mergedEndorsedKeys = Array.from(new Set([...resolvedEndorsedKeys, ...fetched]));

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
      neighborhoodIds: [body.neighborhoodId],
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
  /** Phase 5.6 (Commit B): ADVISORY ONLY. The server derives the gap set
   *  itself from (template REQ/REC categories) − (trip's actual cart categories),
   *  ignoring this field. Kept in the schema so existing callers don't 400;
   *  the response includes `clientAdvisoryIgnored` and `serverDerivedGapCategories`
   *  so callers can see what actually drove surfacing. */
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
 * Per §B5: "uses optimizer's empty-slot output as candidate slots." Phase
 * 5.6 (Commit B) closes the audit gap: the gap set is now SERVER-DERIVED
 * from the trip's actual cart × the template's REQ/REC categories. The
 * client may still pass emptySlotCategoryKeys for transparency, but it's
 * ADVISORY ONLY — the server ignores it and reports back what it actually used.
 * Transport remains suppressed (this is pre-trip).
 */
router.post("/api/upsell/plancard-pretrip", isAuthenticated, async (req, res) => {
  try {
    const body = plancardBodySchema.parse(req.body);
    const fetched = await loadEndorsementsForContext(body.tripId, body.neighborhoodIds);
    const mergedEndorsedKeys = Array.from(new Set([...(body.expertEndorsedKeys ?? []), ...fetched]));

    const ctx: UpsellContext = {
      surface: "plancard_pretrip",
      tripId: body.tripId,
      templateKey: body.templateKey,
      cartItems: body.cartItems as CartItemRef[],
      userProfile: body.userProfile as UserProfile | undefined,
      neighborhoodIds: body.neighborhoodIds,
      expertEndorsedKeys: mergedEndorsedKeys,
    };
    let raw = await gatherOfferingCandidates({
      templateKey: body.templateKey,
      marketCity: null,
      neighborhoodIds: body.neighborhoodIds ?? [],
      expertEndorsedKeys: mergedEndorsedKeys,
    });

    // ── Server-derive the empty-slot category set ───────────────────────────
    // Phase 5.6 (Commit B): replace client-trusted emptySlotCategoryKeys with
    // a server computation. Gap = (template REQ/REC categories) − (categories
    // already in the trip's cart). The optimizer's "this trip needs more of X"
    // signal is reconstructed server-side from authoritative DB state.
    const effectiveTemplate = resolveTemplateKey(body.templateKey);
    let serverDerivedSlots: string[] = [];
    let cartCategoryKeys: string[] = [];
    try {
      const matrix = await db.execute(sql`
        SELECT category_key, strength
        FROM template_category_matrix
        WHERE template_key = ${effectiveTemplate}
      `);
      const matrixRows = (matrix.rows ?? []).map((r: any) => ({
        categoryKey: String(r.category_key),
        strength: String(r.strength),
      }));
      const cart = await db.execute(sql`
        SELECT DISTINCT sc.category_key
        FROM cart_items ci
        JOIN provider_services ps ON ps.id = ci.service_id
        JOIN service_categories sc ON sc.id = ps.category_id
        WHERE ci.trip_id = ${body.tripId}
          AND sc.category_key IS NOT NULL
      `);
      cartCategoryKeys = (cart.rows ?? [])
        .map((r: any) => String(r.category_key))
        .filter(k => k && k !== "null");
      serverDerivedSlots = computeEmptySlots(matrixRows, cartCategoryKeys);
    } catch (err) {
      console.warn("[upsell] plancard-pretrip server-derive failed (falling back to no filter):", err);
    }

    // Apply the server-derived filter. The client param is NEVER used to steer.
    if (serverDerivedSlots.length > 0) {
      const slotSet = new Set(serverDerivedSlots);
      raw = raw.filter(c => slotSet.has(c.categoryKey));
    }

    const { candidates, suppressed, displayLookup } = await rankAndLog("plancard_pretrip", ctx, raw, req);

    // Transparency: tell the client what was actually used + whether the
    // advisory param (if any) was ignored.
    const clientAdvisoryIgnored = !!(body.emptySlotCategoryKeys && body.emptySlotCategoryKeys.length > 0);
    res.json({
      candidates: decorate(candidates, displayLookup),
      suppressed,
      gapDriven: serverDerivedSlots.length > 0,
      serverDerivedGapCategories: serverDerivedSlots,
      cartCategoryKeys,
      clientAdvisoryIgnored,
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

/**
 * Phase 5.6 (Commit B) — pure helper that derives the empty-slot category
 * set on the server side. Inputs from queries are JS-typed; the helper is
 * the documented contract.
 *
 * Inputs:
 *   matrixRows         — template_category_matrix rows for the chosen templateKey
 *   cartCategoryKeys   — distinct category_keys present in the trip's cart
 *
 * Returns: REQ/REC categoryKeys from the template that are NOT in the cart.
 *          OPT categories are excluded — gap-fill targets the optimizer's
 *          "this trip needs more of X" slots, not the long tail.
 */
export function computeEmptySlots(
  matrixRows: Array<{ categoryKey: string; strength: string }>,
  cartCategoryKeys: string[],
): string[] {
  const cart = new Set(cartCategoryKeys);
  const out = new Set<string>();
  for (const row of matrixRows) {
    if (row.strength !== "REQ" && row.strength !== "REC") continue;
    if (cart.has(row.categoryKey)) continue;
    out.add(row.categoryKey);
  }
  return Array.from(out);
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
      contextEndorsements: fetched,
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
      neighborhoodIds: body.neighborhoodIds ?? [],
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
