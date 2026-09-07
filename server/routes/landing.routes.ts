/**
 * landing.routes.ts — GET /api/landing/hero (landing-build lane, Phase 1).
 *
 * Server-composed hero bento for the public landing page (docs/design/LANDING_SPEC.md).
 * Every leg is NULLABLE and the hero collapses honestly (§13): a missing anchor expert,
 * gem, service or wanted slot is null — never a fabricated name, price or badge.
 *
 * Composition delegates to the EXISTING derivation sites (never a second rule):
 *   - top city: travelPulseService.getTrendingCities (trend_scores resolver; trendingScore 0
 *     = below confidence floor → the client renders no "hot" badge).
 *   - anchor / gems / services: locationViewService.getLocationView — the same payload the
 *     city feed renders, so the landing can never disagree with /discover/location/:city.
 *   - wanted slot: MIRRORS discover-location.tsx:1881-1906 (neighborhoods × offering types
 *     the engine found no coverage for; "covered" = the gather step's ranked pool), with
 *     the same full-list fallback. The landing takes slot 0 of the same rule.
 *
 * anchorExpert additions the feed shape lacks (Phase 0 finding): users.handle and a
 * server-derived fromPrice = MIN across the expert's approved+active provider_services,
 * converted to integer cents. Null when the expert has no priced public offering.
 * (The `expert_templates` half of that MIN retired with that lane — ledger
 * 2026-09-03-expert-templates-consumer-sunset; a price for an unbuyable product is §13.)
 *
 * Pure composers are exported for tests (the getPricingHandler precedent).
 */
import { Router } from "express";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, landingMomentEvents } from "@shared/schema";
import {
  resolveLandingMoments,
  MOMENTS,
  MOMENT_KEYS,
  MOMENT_EVENT_KINDS,
} from "../services/landing-moments";
import { getUserId } from "../utils/auth";
import {
  composeLandingHero,
  deriveWantedSlot,
  dollarsToCents,
  pickAnchorExpert,
  type HeroNeighborhood,
  type HeroOfferingType,
  type LandingHeroPayload,
} from "../services/landing-hero.compose";
export * from "../services/landing-hero.compose";

const router = Router();

// ── DB enrichment for the picked anchor (handle + fromPrice) ────────────────────────────

async function enrichAnchor(anchor: { id: string; name: string }): Promise<{
  name: string;
  handle: string | null;
  fromPriceCents: number | null;
  imageUrl?: string;
}> {
  const [userRow] = await db
    .select({ handle: users.handle, profileImageUrl: users.profileImageUrl })
    .from(users)
    .where(eq(users.id, anchor.id))
    .limit(1);

  // MIN price across the expert's public offerings — the same public-read predicate the
  // feed uses: provider_services approved+active.
  const [svcMin] = await db
    .select({ min: sql<string | null>`min(${providerServices.price})` })
    .from(providerServices)
    .where(
      and(
        eq(providerServices.userId, anchor.id),
        eq(providerServices.approvalStatus, "approved"),
        eq(providerServices.status, "active"),
      ),
    );
  const candidates = [dollarsToCents(svcMin?.min)].filter(
    (c): c is number => c !== null,
  );
  const result: {
    name: string;
    handle: string | null;
    fromPriceCents: number | null;
    imageUrl?: string;
  } = {
    name: anchor.name,
    handle: userRow?.handle ?? null,
    fromPriceCents: candidates.length > 0 ? Math.min(...candidates) : null,
  };
  const imageUrl = userRow?.profileImageUrl?.trim();
  if (imageUrl) result.imageUrl = imageUrl;
  return result;
}

// ── Route ───────────────────────────────────────────────────────────────────────────────

const EMPTY: LandingHeroPayload = {
  city: null,
  trend: null,
  crowd: null,
  anchorExpert: null,
  gem: null,
  service: null,
  wanted: null,
};

router.get("/api/landing/hero", async (_req, res) => {
  try {
    const { travelPulseService } = await import("../services/travelpulse.service");
    const [top] = await travelPulseService.getTrendingCities(1);
    if (!top) {
      res.set("Cache-Control", "public, max-age=300");
      return res.json(EMPTY);
    }

    const { locationViewService } = await import("../services/location-view.service");
    const view = await locationViewService.getLocationView(top.cityName, top.country ?? null, {});
    const neighborhoods: HeroNeighborhood[] = view.neighborhoods?.data ?? [];
    const gems = view.gems?.data ?? [];
    const services = view.services?.data ?? [];

    const picked = pickAnchorExpert(neighborhoods);
    const anchorExpert = picked ? await enrichAnchor(picked) : null;

    // Wanted slot: covered set from the SAME gather step the discover upsell slot uses
    // (candidates ∪ suppressed both count as "covered" client-side; the gather pool is
    // their superset and the rule's stated intent — coverage the engine found at all).
    // Best-effort: a gather failure yields an empty covered set, which the mirrored rule
    // already treats as "slot data hasn't loaded" (full-list fallback), same as the client.
    let covered = new Set<string>();
    let offeringTypes: HeroOfferingType[] = [];
    try {
      const { getExpertOfferingTypes } = await import("../services/content-query.service");
      offeringTypes = ((await getExpertOfferingTypes(null)) ?? []).map((r: any) => ({
        offering_type_key: String(r.offering_type_key ?? r.offeringTypeKey ?? ""),
        display_name: String(r.display_name ?? r.displayName ?? ""),
      }));
      const firstNbId = neighborhoods[0]?.id;
      if (firstNbId !== undefined && firstNbId !== null) {
        const { gatherOfferingCandidates } = await import("../services/upsell-query.service");
        const raw = await gatherOfferingCandidates({
          marketCity: top.cityName.toLowerCase(),
          neighborhoodIds: [String(firstNbId)],
          includePackages: true,
        });
        covered = new Set(raw.map((c: any) => String(c.offeringId)));
      }
    } catch (e: any) {
      console.error("[landing-hero] wanted-slot inputs failed (leg stays honest):", e?.message);
    }
    const wanted = deriveWantedSlot(neighborhoods, covered, offeringTypes);

    const payload = composeLandingHero({
      topCity: top,
      anchorExpert,
      gems,
      services,
      wanted,
    });
    res.set("Cache-Control", "public, max-age=300");
    res.json(payload);
  } catch (err: any) {
    console.error("[landing-hero] failed:", err);
    res.status(500).json({ message: "Failed to compose landing hero" });
  }
});

// ── Moments (Landing v2.5 Lane 2) ─────────────────────────────────────────────────────────
// GET returns only moments with ≥1 attributed real photo (the TRUST-surface gate,
// 2026-09-01-photo-tiers). Today []: the client suppresses the section (empty state B). Public,
// cacheable; the section never fabricates a photo, byline or count (§13).
router.get("/api/landing/moments", async (_req, res) => {
  try {
    const moments = await resolveLandingMoments();
    // The full roster drives the tab strip's faint "coming as locals join" pills without the
    // client restating the moment list (§18 rule 1). The client still SUPPRESSES the whole
    // section when moments (the live set) is empty — empty state B.
    const roster = MOMENTS.map((m) => ({ key: m.key, label: m.label }));
    res.set("Cache-Control", "public, max-age=120");
    res.json({ moments, roster });
  } catch (err: any) {
    console.error("[landing-moments] failed:", err);
    res.status(500).json({ message: "Failed to resolve landing moments" });
  }
});

// POST attribution — mirrors the upsell session posture (guest_session_id + nullable user_id, NO
// PII beyond that token, 2026-09-01-landing-moments). ALLOWLIST body (§19): momentKey must be a
// known moment key, kind a known kind — never a createInsertSchema off the body. Fire-and-forget;
// a write failure never breaks the page.
const momentEventBody = z.object({
  momentKey: z.enum(MOMENT_KEYS as [string, ...string[]]),
  kind: z.enum(MOMENT_EVENT_KINDS as unknown as [string, ...string[]]),
  position: z.number().int().min(0).max(50).optional(),
  sessionId: z.string().trim().max(255).optional(),
});
router.post("/api/landing/moments/event", async (req, res) => {
  const parsed = momentEventBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid moment event" });
  }
  const { momentKey, kind, position, sessionId } = parsed.data;
  // Security-audit finding 16 (2026-09-01): `(req.user as any)?.id` attributed every
  // EMAIL-AUTH user as anonymous — that session shape is `{claims:{sub}}` with no top-level
  // `id` (emailAuth.ts). getUserId covers all three auth shapes and is null-safe on this
  // public surface (utils/auth.ts: "always use this helper").
  const userId = getUserId(req); // null when anonymous — best-effort attribution stays honest
  try {
    await db.insert(landingMomentEvents).values({
      momentKey,
      kind,
      position: position ?? null,
      guestSessionId: sessionId ?? null,
      userId,
    });
  } catch (e: any) {
    console.error("[landing-moments] event insert failed (non-fatal):", e?.message);
  }
  // Always 204 — attribution is best-effort and must never surface an error to the page.
  res.status(204).end();
});

export default router;
