/**
 * landing-hero.compose.ts — PURE composers for GET /api/landing/hero (landing-build
 * lane Phase 1). No db import — unit-testable without DATABASE_URL (the
 * demand-rollup.compute.ts precedent). The route (landing.routes.ts) resolves the
 * data and delegates every shaping decision here, so tests pin the honest-null
 * contract of docs/design/LANDING_SPEC.md exactly once.
 */

// ── Types ────────────────────────────────────────────────────────────────────────────────

export interface LandingHeroPayload {
  city: string | null;
  /** trend_scores trendingScore; 0 = below confidence floor (no badge), null = no city. */
  trend: number | null;
  crowd: string | null;
  anchorExpert: { name: string; handle: string | null; fromPriceCents: number | null } | null;
  gem: { name: string; score: number | null } | null;
  service: { name: string; priceCents: number | null } | null;
  wanted: { title: string; neighborhood: string } | null;
}

export interface HeroNeighborhood {
  id?: unknown;
  name?: string | null;
  localExpert?: { id: string; firstName: string | null; lastName: string | null } | null;
}

export interface HeroOfferingType {
  offering_type_key: string;
  display_name: string;
}

// ── Pure composers (exported for tests) ─────────────────────────────────────────────────

/** Decimal-dollars string/number ("480.00") → integer cents, or null when unparseable. */
export function dollarsToCents(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** First neighborhood carrying a localExpert (the feed's deterministic order), or null. */
export function pickAnchorExpert(
  neighborhoods: HeroNeighborhood[],
): { id: string; name: string } | null {
  for (const nb of neighborhoods) {
    const e = nb?.localExpert;
    if (e && e.id) {
      const name = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
      if (name.length > 0) return { id: e.id, name };
    }
  }
  return null;
}

/**
 * MIRROR of discover-location.tsx:1881-1906 (do not fork the rule): the wanted pool is the
 * offering types absent from the covered set; when the covered set is empty (slot data
 * unavailable) the FULL list is the pool; slot i pairs neighborhoods[i] with
 * pool[i % pool.length]. The landing hero takes slot 0. Null when there are no
 * neighborhoods or no offering types — never an invented recruitment line.
 */
export function deriveWantedSlot(
  neighborhoods: HeroNeighborhood[],
  coveredOfferingIds: Set<string>,
  offeringTypes: HeroOfferingType[],
): { title: string; neighborhood: string } | null {
  if (neighborhoods.length === 0 || offeringTypes.length === 0) return null;
  const uncovered = offeringTypes.filter((o) => !coveredOfferingIds.has(o.offering_type_key));
  const pool = uncovered.length > 0 ? uncovered : offeringTypes;
  const nb = neighborhoods[0];
  const nbName = (nb?.name ?? "").trim();
  if (!nbName) return null;
  const offering = pool[0];
  return { title: offering.display_name, neighborhood: nbName };
}

/** Assemble the payload from already-resolved legs. Absent legs stay null — no defaults. */
export function composeLandingHero(input: {
  topCity: { cityName: string; trendingScore?: number | null; crowdLevel?: string | null } | null;
  anchorExpert: { name: string; handle: string | null; fromPriceCents: number | null } | null;
  gems: Array<{ placeName?: string | null; gemScore?: unknown }>;
  services: Array<{ serviceName?: string | null; price?: unknown }>;
  wanted: { title: string; neighborhood: string } | null;
}): LandingHeroPayload {
  const { topCity } = input;
  const gemRow = input.gems.find((g) => (g?.placeName ?? "").toString().trim().length > 0) ?? null;
  const gemScore = gemRow ? Number(gemRow.gemScore) : NaN;
  const svcRow =
    input.services.find((s) => (s?.serviceName ?? "").toString().trim().length > 0) ?? null;
  return {
    city: topCity?.cityName ?? null,
    trend: topCity ? Number(topCity.trendingScore ?? 0) : null,
    crowd: topCity?.crowdLevel ?? null,
    anchorExpert: input.anchorExpert,
    gem: gemRow
      ? { name: String(gemRow.placeName), score: Number.isFinite(gemScore) ? gemScore : null }
      : null,
    service: svcRow
      ? { name: String(svcRow.serviceName), priceCents: dollarsToCents(svcRow.price) }
      : null,
    wanted: input.wanted,
  };
}

