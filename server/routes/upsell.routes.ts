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
import {
  loadCoveringInventory,
  gatherOfferingCandidates,
  findDateUnavailableOfferingIds,
  rankAndLog,
  loadEndorsementsForContext,
  requireExpertRole,
  filterByFrequencyCap,
  resolveNeighborhoodCity,
  resolveEndorsedKeysFromProviders,
  derivePlanCardGapData,
  getExpertEndorsements,
  upsertTripEndorsement,
  checkIsNeighborhoodLead,
  upsertNeighborhoodEndorsement,
  deleteTripEndorsement,
  deleteNeighborhoodEndorsement,
  insertImpression,
  markImpressionClicked,
  getFeedCompositionConfig,
  FEED_CONFIG_DEFAULTS,
  resolveTemplateKey,
} from "../services/upsell-query.service";

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
 * Build a RankInputCandidate set (delegated to upsell-query.service.ts).
 * Kept as comment for navigation.
 *
 * This is intentionally conservative for Phase 5.2 — it gathers offering-type
 * candidates without requiring a fully booked provider inventory row. Phase
 * 5.3+ surfaces will add provider_services availability gating where it makes
 * sense (e.g., date-range availability on discover_date).
 */
// ─── Endpoint helper ─────────────────────────────────────────────────────────
// All db-touching helpers (loadCoveringInventory, gatherOfferingCandidates,
// findDateUnavailableOfferingIds, rankAndLog, loadEndorsementsForContext,
// requireExpertRole, filterByFrequencyCap, resolveTemplateKey, etc.) live in
// upsell-query.service.ts and are imported above.

/** "aff_guided_tour" → "Guided Tour". Fallback when the display-name lookup
 *  misses (e.g. lookup query failure): surfaces must NEVER render a raw
 *  offering key (Discover Feed Composition Brief — zero-raw-keys gate). */
export function humanizeOfferingKey(key: string): string {
  return key
    .replace(/^aff_/, "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function decorate(
  candidates: ReturnType<typeof rankCandidates>["candidates"],
  displayLookup: Map<string, { displayName: string; tagline: string | null }>,
) {
  return candidates.map(c => ({
    ...c,
    displayName: displayLookup.get(c.offeringId)?.displayName ?? humanizeOfferingKey(c.offeringId),
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
    const marketCity = await resolveNeighborhoodCity(body.neighborhoodId);

    // Resolve expert user IDs → endorsed offering_type_keys via service.
    let resolvedEndorsedKeys = body.expertEndorsedKeys ?? [];
    if (resolvedEndorsedKeys.length > 0) {
      const fromProviders = await resolveEndorsedKeysFromProviders(resolvedEndorsedKeys);
      if (fromProviders.length > 0) resolvedEndorsedKeys = fromProviders;
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
      includePackages: true, // Shape A: packages ranked in the Discover slate (this surface only)
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
      includePackages: true, // Shape A: packages ranked in the Discover slate (this surface only)
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
 * The user is deciding whether to pay for AI+Expert Review ($49.99 = // fee-literal-ok: comment describing band name, fee resolves from config
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
    const { serverDerivedSlots, cartCategoryKeys } = await derivePlanCardGapData(
      effectiveTemplate,
      body.tripId,
    );

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

    // Frequency cap via service helper.
    const slotConfig = await getSlotConfig("plancard_ontrip");
    raw = await filterByFrequencyCap(raw, body.tripId, "plancard_ontrip", slotConfig?.frequencyCapHours ?? 0);

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

// loadEndorsementsForContext and requireExpertRole are imported from upsell-query.service.ts

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
    const myEndorsements = { rows: await getExpertEndorsements(expertId, body.tripId, body.neighborhoodIds) };

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
      await upsertTripEndorsement(expertId, body.tripId!, body.offeringId, body.categoryKey ?? null, body.notes ?? null);
    } else {
      if (role !== "admin") {
        const isLead = await checkIsNeighborhoodLead(expertId, body.neighborhoodId!);
        if (!isLead) {
          return res.status(403).json({
            error: "not_neighborhood_lead",
            message: "Only the featured lead of this neighborhood may write a neighborhood-scoped endorsement.",
          });
        }
      }
      await upsertNeighborhoodEndorsement(expertId, body.neighborhoodId!, body.offeringId, body.categoryKey ?? null, body.notes ?? null);
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
      await deleteTripEndorsement(expertId, body.tripId, body.offeringId);
    } else if (body.scope === "neighborhood" && body.neighborhoodId) {
      await deleteNeighborhoodEndorsement(expertId, body.neighborhoodId, body.offeringId);
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
// filterByFrequencyCap is imported from upsell-query.service.ts

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
 * §B5 / §B9 NO-DOUBLE-COUNT rule: the concierge per-task fee (the $9.99 / // fee-literal-ok: comment describing band name, fee resolves from config
 * $49.99 ai_concierge_* flat band) is its own revenue stream, billed at // fee-literal-ok: comment describing band name, fee resolves from config
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
      await insertImpression(surface, offeringId, tripId ?? null);
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
    await markImpressionClicked(tripId, surface, offeringId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "validation_failed", details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ─── Feed composition config — public read ────────────────────────────────────

const FEED_CONFIG_DEFAULTS = {
  recCadence: 4,
  wantedSlotMax: 2,
  wantedSlotSpacing: 6,
  recLabel: "Recommended",
  recAffiliateLabel: "Sponsored",
} as const;

// GET /api/feed-composition-config
// Reads the five feed_rec_* keys from platform_settings and returns the
// composition config. No auth required; client uses hardcoded defaults when
// the endpoint fails. Response is intentionally simple for easy caching.
router.get("/api/feed-composition-config", async (_req, res) => {
  try {
    const config = await getFeedCompositionConfig();
    res.json(config);
  } catch {
    res.json(FEED_CONFIG_DEFAULTS);
  }
});

export default router;
