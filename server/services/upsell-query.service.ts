/**
 * upsell-query.service.ts
 * All database-touching helper functions for the upsell engine.
 * Extracted from upsell.routes.ts so that route handlers remain db-free.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  rankCandidates,
  getSlotConfig,
  logImpressions,
  DEFAULT_POLICY,
  type Surface,
  type UpsellContext,
  type RankInputCandidate,
} from "./upsell-engine.service";

// ─── Low-level helpers ────────────────────────────────────────────────────────

/** node-pg binds JS arrays as a single scalar; pass a Postgres array literal. */
export function pgTextArray(values: string[]): string {
  return `{${values.map(v => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;
}

// ─── Covering inventory ───────────────────────────────────────────────────────

export type CoverageMatch = {
  matchedSlug: string;
  verified: boolean;
  price: number | null;
  matchType: "same" | "adjacent" | "market" | "global";
};

export async function loadCoveringInventory(opts: {
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
    -- F2 read-gate (§1/D1a): the engine's inventory is a public surface — only APPROVED
    -- listings count as covering supply. status defaults 'active' while approval_status is
    -- born 'submitted', so without this filter an unapproved listing unlocks recommendations.
    JOIN provider_services ps  ON ps.user_id = c.provider_id AND ps.status = 'active' AND ps.approval_status = 'approved'
    JOIN service_categories sc ON sc.id = ps.category_id AND sc.category_key = c.category_key
    JOIN users u ON u.id = c.provider_id
    WHERE ${scopeFilter}
      AND (
        (sc.requires_background_check = false AND COALESCE(sc.insurance_band, 0) < 2)
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

// ─── Candidate gathering ──────────────────────────────────────────────────────

const PROXIMITY_FIT = { same: 1.0, adjacent: 0.7, market: 0.4, global: 0.4 } as const;
const NOMINAL_BASKET_USD = 100;

function computeEarnings(rateType: string | null, rate: number | null, price: number | null): number {
  if (rate === null || !Number.isFinite(rate)) return 1;
  if (rateType === "flat") return rate;
  return rate * (price ?? NOMINAL_BASKET_USD);
}

function normalizeStrength(v: any): "REQ" | "REC" | "OPT" | null {
  if (v === "REQ" || v === "REC" || v === "OPT") return v;
  return null;
}

function normalizeRisk(v: any): "low" | "moderate" | "high" | "specialized" | null {
  if (v === "low" || v === "moderate" || v === "high" || v === "specialized") return v;
  return null;
}

export async function gatherOfferingCandidates(opts: {
  templateKey?: string;
  marketCity?: string | null;
  neighborhoodIds?: string[];
  expertEndorsedKeys?: string[];
}): Promise<RankInputCandidate[]> {
  const endorsedSet = new Set(opts.expertEndorsedKeys ?? []);
  const effectiveTemplate = resolveTemplateKey(opts.templateKey);

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
      const inv = isAffiliate ? null : inventory.get(String(r.category_key ?? "")) ?? null;
      if (!isAffiliate && !inv) continue;

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
        providerHasVerifiedBadge: isAffiliate ? true : inv!.verified,
        candidateNeighborhoodSlug: isAffiliate ? null : inv!.matchedSlug,
        expectedPlatformEarningsRaw: earnings,
        expertEndorsed: endorsedSet.has(String(r.offering_id)),
        profileMatchScore: 0.5,
        proximityFit: isAffiliate ? PROXIMITY_FIT.market : PROXIMITY_FIT[inv!.matchType],
      });
    }
    return candidates;
  } catch (err) {
    console.error("[upsell] gatherOfferingCandidates failed:", err);
    return [];
  }
}

// ─── Date availability filter ─────────────────────────────────────────────────

export async function findDateUnavailableOfferingIds(
  city: string,
  dateRange: { start: string; end?: string },
): Promise<Set<string>> {
  const drop = new Set<string>();
  try {
    const eventCheck = await db.execute(sql`
      SELECT COUNT(*)::INT AS n
      FROM destination_events
      WHERE LOWER(city) = LOWER(${city})
        AND (event_start_date IS NULL OR event_start_date <= ${dateRange.end ?? dateRange.start}::date)
        AND (event_end_date   IS NULL OR event_end_date   >= ${dateRange.start}::date)
    `);
    const n = Number((eventCheck.rows?.[0] as any)?.n ?? 0);
    if (n === 0) {
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
    console.warn("[upsell] date-availability check skipped:", err);
  }
  return drop;
}

// ─── Rank + log helper ────────────────────────────────────────────────────────

export async function rankAndLog(
  surface: Surface,
  ctx: UpsellContext,
  rawCandidates: RankInputCandidate[],
  _req: any,
): Promise<{
  candidates: ReturnType<typeof rankCandidates>["candidates"];
  suppressed: ReturnType<typeof rankCandidates>["suppressed"];
  displayLookup: Map<string, { displayName: string; tagline: string | null }>;
}> {
  const slotConfig = (await getSlotConfig(surface)) ?? {
    surface, maxItems: 3, revenueWeight: 0.15, revenueCap: 0.15, frequencyCapHours: 0, enabled: true,
  };
  const result = rankCandidates(ctx, rawCandidates, slotConfig, DEFAULT_POLICY);

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

  logImpressions(ctx, result.candidates).catch(() => { /* already logged */ });
  return { ...result, displayLookup };
}

// ─── Endorsement loading ──────────────────────────────────────────────────────

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

// ─── Expert role check ────────────────────────────────────────────────────────

export async function requireExpertRole(
  req: any,
  res: any,
): Promise<{ userId: string; role: string } | null> {
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

// ─── Frequency cap ────────────────────────────────────────────────────────────

export async function filterByFrequencyCap(
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

// ─── Discover-location helpers ────────────────────────────────────────────────

export async function resolveNeighborhoodCity(neighborhoodId: string): Promise<string | null> {
  try {
    const nbh = await db.execute(sql`
      SELECT city, slug FROM city_neighborhoods WHERE id = ${neighborhoodId} LIMIT 1
    `);
    return (nbh.rows?.[0] as any)?.city ?? null;
  } catch {
    return null;
  }
}

export async function resolveEndorsedKeysFromProviders(expertUserIds: string[]): Promise<string[]> {
  if (!expertUserIds.length) return [];
  try {
    const resolved = await db.execute(sql`
      SELECT DISTINCT sot.offering_type_key
      FROM provider_services ps
      JOIN service_categories sc ON sc.id = ps.category_id
      JOIN service_offering_types sot ON sot.category_key = sc.category_key
      WHERE ps.user_id = ANY(ARRAY[${sql.raw(expertUserIds.map(k => `'${k.replace(/'/g, "''")}'`).join(","))}]::text[])
        AND ps.status = 'active'
        -- F2 read-gate: an endorsement is a public ranking boost — only an APPROVED
        -- listing may power it (unapproved services must not influence public ranking).
        AND ps.approval_status = 'approved'
        AND sot.is_active = true
    `);
    return (resolved.rows ?? []).map((r: any) => String(r.offering_type_key));
  } catch (err) {
    console.warn("[upsell] endorsement resolution failed:", err);
    return [];
  }
}

// ─── Plancard-pretrip gap derivation ─────────────────────────────────────────

export async function derivePlanCardGapData(
  effectiveTemplate: string,
  tripId: string | undefined,
): Promise<{ serverDerivedSlots: string[]; cartCategoryKeys: string[] }> {
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

    let cartCategoryKeys: string[] = [];
    if (tripId) {
      const cart = await db.execute(sql`
        SELECT DISTINCT sc.category_key
        FROM cart_items ci
        JOIN provider_services ps ON ps.id = ci.service_id
        JOIN service_categories sc ON sc.id = ps.category_id
        WHERE ci.trip_id = ${tripId}
          AND sc.category_key IS NOT NULL
      `);
      cartCategoryKeys = (cart.rows ?? [])
        .map((r: any) => String(r.category_key))
        .filter(k => k && k !== "null");
    }

    const cart = new Set(cartCategoryKeys);
    const serverDerivedSlots = matrixRows
      .filter(r => (r.strength === "REQ" || r.strength === "REC") && !cart.has(r.categoryKey))
      .map(r => r.categoryKey);

    return { serverDerivedSlots, cartCategoryKeys };
  } catch (err) {
    console.warn("[upsell] plancard-pretrip server-derive failed:", err);
    return { serverDerivedSlots: [], cartCategoryKeys: [] };
  }
}

// ─── Expert endorsements (expert-review surface) ──────────────────────────────

export async function getExpertEndorsements(
  expertId: string,
  tripId: string,
  neighborhoodIds: string[] | undefined,
): Promise<any[]> {
  try {
    const result = await db.execute(sql`
      SELECT id, scope, trip_id, neighborhood_id, offering_id, category_key, notes, created_at
      FROM upsell_expert_endorsements
      WHERE expert_id = ${expertId}
        AND (
          (scope = 'trip' AND trip_id = ${tripId}) OR
          (scope = 'neighborhood' AND neighborhood_id = ANY(${neighborhoodIds ?? []}::TEXT[]))
        )
      ORDER BY created_at DESC
    `);
    return result.rows ?? [];
  } catch {
    return [];
  }
}

// ─── Endorsement write / delete ───────────────────────────────────────────────

export async function upsertTripEndorsement(
  expertId: string,
  tripId: string,
  offeringId: string,
  categoryKey: string | null,
  notes: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO upsell_expert_endorsements
      (expert_id, scope, trip_id, offering_id, category_key, notes)
    VALUES (${expertId}, 'trip', ${tripId}, ${offeringId}, ${categoryKey}, ${notes})
    ON CONFLICT (expert_id, trip_id, offering_id) WHERE scope = 'trip'
    DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
  `);
}

export async function checkIsNeighborhoodLead(
  expertId: string,
  neighborhoodId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM expert_neighborhoods
    WHERE expert_id = ${expertId}
      AND neighborhood_id = ${neighborhoodId}
      AND is_lead = true
    LIMIT 1
  `);
  return !!(result.rows && result.rows.length > 0);
}

export async function upsertNeighborhoodEndorsement(
  expertId: string,
  neighborhoodId: string,
  offeringId: string,
  categoryKey: string | null,
  notes: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO upsell_expert_endorsements
      (expert_id, scope, neighborhood_id, offering_id, category_key, notes)
    VALUES (${expertId}, 'neighborhood', ${neighborhoodId}, ${offeringId}, ${categoryKey}, ${notes})
    ON CONFLICT (expert_id, neighborhood_id, offering_id) WHERE scope = 'neighborhood'
    DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
  `);
}

export async function deleteTripEndorsement(
  expertId: string,
  tripId: string,
  offeringId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM upsell_expert_endorsements
    WHERE expert_id = ${expertId} AND scope = 'trip'
      AND trip_id = ${tripId} AND offering_id = ${offeringId}
  `);
}

export async function deleteNeighborhoodEndorsement(
  expertId: string,
  neighborhoodId: string,
  offeringId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM upsell_expert_endorsements
    WHERE expert_id = ${expertId} AND scope = 'neighborhood'
      AND neighborhood_id = ${neighborhoodId} AND offering_id = ${offeringId}
  `);
}

// ─── Impression tracking ──────────────────────────────────────────────────────

export async function insertImpression(
  surface: string,
  offeringId: string,
  tripId: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO upsell_impressions (surface, offering_id, trip_id, shown_at, clicked)
    VALUES (${surface}, ${offeringId}, ${tripId}, NOW(), false)
    ON CONFLICT DO NOTHING
  `);
}

export async function markImpressionClicked(
  tripId: string,
  surface: string,
  offeringId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE upsell_impressions SET clicked = true
    WHERE id = (
      SELECT id FROM upsell_impressions
      WHERE trip_id = ${tripId} AND surface = ${surface} AND offering_id = ${offeringId}
      ORDER BY shown_at DESC
      LIMIT 1
    )
  `);
}

// ─── Feed composition config ──────────────────────────────────────────────────

export const FEED_CONFIG_DEFAULTS = {
  recCadence: 4,
  wantedSlotMax: 2,
  wantedSlotSpacing: 6,
  recLabel: "Recommended",
  recAffiliateLabel: "Sponsored",
} as const;

export async function getFeedCompositionConfig(): Promise<typeof FEED_CONFIG_DEFAULTS & Record<string, any>> {
  try {
    const rows = await db.execute(sql`
      SELECT setting_key, setting_value
      FROM platform_settings
      WHERE setting_key IN (
        'feed_rec_cadence',
        'feed_wanted_slot_max',
        'feed_wanted_slot_spacing',
        'feed_rec_label',
        'feed_rec_affiliate_label'
      )
    `);
    const kvMap: Record<string, string> = {};
    for (const r of (rows.rows ?? rows) as Array<{ setting_key: string; setting_value: string }>) {
      kvMap[r.setting_key] = r.setting_value;
    }
    return {
      recCadence: kvMap.feed_rec_cadence != null ? Number(kvMap.feed_rec_cadence) : FEED_CONFIG_DEFAULTS.recCadence,
      wantedSlotMax: kvMap.feed_wanted_slot_max != null ? Number(kvMap.feed_wanted_slot_max) : FEED_CONFIG_DEFAULTS.wantedSlotMax,
      wantedSlotSpacing: kvMap.feed_wanted_slot_spacing != null ? Number(kvMap.feed_wanted_slot_spacing) : FEED_CONFIG_DEFAULTS.wantedSlotSpacing,
      recLabel: kvMap.feed_rec_label ?? FEED_CONFIG_DEFAULTS.recLabel,
      recAffiliateLabel: kvMap.feed_rec_affiliate_label ?? FEED_CONFIG_DEFAULTS.recAffiliateLabel,
    };
  } catch {
    return { ...FEED_CONFIG_DEFAULTS };
  }
}

// ─── Template key resolver (re-exported from route) ──────────────────────────

export function resolveTemplateKey(input: string | null | undefined): string {
  if (input === null || input === undefined) return "travel";
  const trimmed = input.trim();
  return trimmed.length === 0 ? "travel" : trimmed;
}
